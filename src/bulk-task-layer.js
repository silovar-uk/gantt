(() => {
  const PROJECT_KEY = 'gantt-desk:v2:project';
  const SELECTED_CLASS = 'is-bulk-selected';
  const COLORS = [
    ['gray', 'グレー'],
    ['blue', '青'],
    ['green', '緑'],
    ['amber', '黄'],
    ['red', '赤'],
    ['purple', '紫'],
  ];
  const $ = (selector) => document.querySelector(selector);
  const selectedIds = new Set();
  let annotateTimer = null;
  let knownSignature = '';
  let activePopover = null;

  function readProject() {
    try { return JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}'); }
    catch { return {}; }
  }

  function writeProject(project) {
    const next = { ...project, updatedAt: new Date().toISOString() };
    localStorage.setItem(PROJECT_KEY, JSON.stringify(next));
    try { window.dispatchEvent(new StorageEvent('storage', { key: PROJECT_KEY, newValue: JSON.stringify(next) })); } catch {}
    requestRender();
  }

  function requestRender() {
    window.dispatchEvent(new Event('resize'));
    // app.js keeps its own state, so the safest layer-level refresh remains a light reload for now.
    setTimeout(() => location.reload(), 120);
  }

  function visibleRows() {
    return [...document.querySelectorAll('#task-list .task-row[data-task-id]')];
  }

  function visibleIds() {
    return visibleRows().map((row) => row.dataset.taskId).filter(Boolean);
  }

  function cleanSelection() {
    const ids = new Set((readProject().tasks || []).map((task) => String(task.id)));
    [...selectedIds].forEach((id) => { if (!ids.has(String(id))) selectedIds.delete(id); });
  }

  function collectCategories(project = readProject()) {
    const base = Array.isArray(project.categories) ? project.categories : [];
    const categories = new Set(base.filter(Boolean).map(String));
    (project.tasks || []).forEach((task) => { if (task.category) categories.add(String(task.category)); });
    categories.add('未分類');
    return [...categories].sort((a, b) => {
      if (a === '未分類') return -1;
      if (b === '未分類') return 1;
      return a.localeCompare(b, 'ja');
    });
  }

  function addStyles() {
    if ($('#bulk-task-style')) return;
    const style = document.createElement('style');
    style.id = 'bulk-task-style';
    style.textContent = `
      .task-panel.has-bulk-task-bar {
        grid-template-rows:auto auto minmax(0,1fr) !important;
      }
      .task-panel.has-bulk-task-bar .task-scroll {
        min-height:0 !important;
        grid-row:3 !important;
      }
      .bulk-task-bar {
        position:relative;
        z-index:12;
        display:flex;
        align-items:center;
        flex-wrap:nowrap;
        gap:7px;
        min-height:40px;
        padding:6px 10px;
        border-top:1px solid #e7eef6;
        border-bottom:1px solid #dde7f2;
        background:#f8fbff;
        box-shadow:0 1px 0 rgba(15,23,42,.03);
        overflow-x:auto;
        overflow-y:hidden;
        scrollbar-color:#c9d5e2 transparent;
        isolation:isolate;
      }
      .bulk-task-bar[hidden],
      .bulk-task-bar[data-empty="true"] {
        display:none !important;
      }
      .bulk-task-bar * { box-sizing:border-box; }
      .bulk-task-bar__summary {
        display:inline-flex;
        align-items:center;
        gap:6px;
        min-height:28px;
        margin-right:2px;
        color:#334155;
        font-size:12px;
        font-weight:850;
        white-space:nowrap;
        flex:0 0 auto;
      }
      .bulk-task-bar__count {
        min-width:24px;
        padding:2px 7px;
        border-radius:999px;
        background:#244a8f;
        color:#fff;
        font-size:11px;
        text-align:center;
      }
      .bulk-task-button {
        min-height:28px;
        padding:5px 9px;
        border:1px solid #cbd7e6;
        border-radius:8px;
        background:#fff;
        color:#334155;
        box-shadow:0 1px 0 rgba(15,23,42,.03);
        font-size:12px;
        font-weight:850;
        cursor:pointer;
        flex:0 0 auto;
        white-space:nowrap;
      }
      .bulk-task-button:hover,
      .bulk-task-button[aria-expanded="true"] {
        background:#eef4ff;
        border-color:#8aa8dc;
        color:#244a8f;
      }
      .bulk-task-button.is-danger {
        color:#b4232b;
        border-color:#f0b8bd;
        background:#fff8f8;
      }
      .bulk-task-button.is-danger:hover { color:#fff; background:#c3474d; border-color:#c3474d; }
      .bulk-task-separator { flex:0 0 1px; width:1px; height:20px; background:#dbe5ef; margin-inline:1px; }
      .bulk-checkbox-wrap,
      .bulk-select-all-wrap {
        display:inline-flex;
        align-items:center;
        justify-content:center;
        flex:0 0 24px;
        width:24px;
        min-width:24px;
        height:100%;
      }
      .bulk-checkbox,
      .bulk-select-all {
        width:15px;
        height:15px;
        margin:0;
        accent-color:#244a8f;
        cursor:pointer;
      }
      .bulk-select-all-wrap {
        margin-right:4px;
      }
      .task-row.has-bulk-checkbox .task-name-cell {
        padding-left:2px;
      }
      .task-row.${SELECTED_CLASS} {
        background:rgba(36,74,143,.07);
        box-shadow:inset 3px 0 0 #244a8f;
      }
      .task-row.${SELECTED_CLASS} .task-name {
        color:#172033;
        font-weight:850;
      }
      .bulk-popover {
        position:fixed;
        z-index:180;
        min-width:188px;
        max-width:min(320px, calc(100vw - 24px));
        max-height:min(420px, calc(100vh - 40px));
        overflow:auto;
        padding:7px;
        border:1px solid #d7e0eb;
        border-radius:12px;
        background:#fff;
        box-shadow:0 18px 46px rgba(15,23,42,.18);
      }
      .bulk-popover[hidden] { display:none !important; }
      .bulk-popover__title {
        padding:5px 7px 6px;
        color:#64748b;
        font-size:11px;
        font-weight:850;
      }
      .bulk-popover__item {
        width:100%;
        min-height:31px;
        display:flex;
        align-items:center;
        gap:8px;
        padding:6px 8px;
        border:0;
        border-radius:8px;
        background:transparent;
        color:#334155;
        font-size:12px;
        font-weight:800;
        text-align:left;
        cursor:pointer;
      }
      .bulk-popover__item:hover {
        background:#eef4ff;
        color:#244a8f;
      }
      .bulk-popover__item.is-danger { color:#b4232b; }
      .bulk-popover__item.is-danger:hover { color:#fff; background:#c3474d; }
      .bulk-popover__dot {
        width:12px;
        height:12px;
        border-radius:999px;
        border:1px solid rgba(15,23,42,.14);
        background:#cbd5e1;
        flex:0 0 auto;
      }
      .bulk-popover__divider {
        height:1px;
        margin:6px 4px;
        background:#edf2f7;
      }
      .bulk-new-category {
        display:grid;
        grid-template-columns:1fr auto;
        gap:6px;
        padding:6px 4px 3px;
      }
      .bulk-new-category input {
        min-width:0;
        min-height:30px;
        padding:5px 8px;
        border:1px solid #cbd7e6;
        border-radius:8px;
        font-size:12px;
      }
      .bulk-new-category button {
        min-height:30px;
        padding:5px 9px;
        border:1px solid #244a8f;
        border-radius:8px;
        background:#244a8f;
        color:#fff;
        font-size:12px;
        font-weight:850;
        cursor:pointer;
      }
      body.gantt-density-ultra .bulk-task-bar {
        min-height:30px;
        padding:3px 6px;
        gap:5px;
      }
      body.gantt-density-ultra .bulk-task-button {
        min-height:24px;
        padding:4px 7px;
        border-radius:7px;
        font-size:10.5px;
      }
      body.gantt-density-ultra .bulk-task-bar__summary {
        min-height:24px;
        font-size:10.5px;
      }
      body.gantt-density-ultra .bulk-checkbox-wrap,
      body.gantt-density-ultra .bulk-select-all-wrap {
        flex-basis:20px;
        width:20px;
        min-width:20px;
      }
      body.gantt-density-ultra .bulk-checkbox,
      body.gantt-density-ultra .bulk-select-all {
        width:13px;
        height:13px;
      }
      @media (max-width:760px) {
        .bulk-task-bar {
          align-items:center;
          overflow-x:auto;
          flex-wrap:nowrap;
        }
        .bulk-task-bar__summary,
        .bulk-task-button {
          flex:0 0 auto;
        }
      }
    `;
    document.head.append(style);
  }

  function ensureBar() {
    const taskPanel = $('#task-panel');
    const head = taskPanel?.querySelector('.task-panel-head');
    if (!taskPanel || !head) return;
    taskPanel.classList.add('has-bulk-task-bar');
    ensureHeaderCheckbox(head);
    if ($('#bulk-task-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'bulk-task-bar';
    bar.className = 'bulk-task-bar';
    bar.dataset.empty = 'true';
    bar.hidden = true;
    bar.innerHTML = `
      <span class="bulk-task-bar__summary"><span id="bulk-task-count" class="bulk-task-bar__count">0</span>件選択</span>
      <button id="bulk-clear-selection" class="bulk-task-button" type="button">解除</button>
      <span class="bulk-task-separator" aria-hidden="true"></span>
      <button id="bulk-category-menu-btn" class="bulk-task-button" type="button" aria-haspopup="menu" aria-expanded="false">カテゴリ</button>
      <button id="bulk-color-menu-btn" class="bulk-task-button" type="button" aria-haspopup="menu" aria-expanded="false">色</button>
      <span class="bulk-task-separator" aria-hidden="true"></span>
      <button id="bulk-complete" class="bulk-task-button" type="button">完了</button>
      <button id="bulk-incomplete" class="bulk-task-button" type="button">未完了</button>
      <button id="bulk-delete" class="bulk-task-button is-danger" type="button">削除</button>
    `;
    head.insertAdjacentElement('afterend', bar);
  }

  function ensureHeaderCheckbox(head) {
    const first = head.firstElementChild;
    if (!first || first.querySelector('.bulk-select-all')) return;
    const wrap = document.createElement('label');
    wrap.className = 'bulk-select-all-wrap';
    wrap.title = '表示中のタスクをまとめて選択';
    wrap.innerHTML = `<input id="bulk-select-all" class="bulk-select-all" type="checkbox" aria-label="表示中のタスクをまとめて選択">`;
    first.prepend(wrap);
    const input = wrap.querySelector('input');
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('change', (event) => {
      event.stopPropagation();
      toggleVisibleSelection();
    });
  }

  function ensurePopover() {
    let popover = $('#bulk-popover');
    if (popover) return popover;
    popover = document.createElement('div');
    popover.id = 'bulk-popover';
    popover.className = 'bulk-popover';
    popover.hidden = true;
    popover.setAttribute('role', 'menu');
    document.body.append(popover);
    return popover;
  }

  function positionPopover(button, popover) {
    const rect = button.getBoundingClientRect();
    const width = Math.min(Math.max(188, rect.width + 80), window.innerWidth - 24);
    popover.style.width = `${width}px`;
    popover.hidden = false;
    const menuRect = popover.getBoundingClientRect();
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - menuRect.width - 12);
    const top = Math.min(rect.bottom + 8, window.innerHeight - Math.min(menuRect.height, 420) - 12);
    popover.style.left = `${left}px`;
    popover.style.top = `${Math.max(12, top)}px`;
  }

  function closePopover() {
    const popover = $('#bulk-popover');
    if (popover) popover.hidden = true;
    activePopover = null;
    $('#bulk-category-menu-btn')?.setAttribute('aria-expanded', 'false');
    $('#bulk-color-menu-btn')?.setAttribute('aria-expanded', 'false');
  }

  function openCategoryMenu(button) {
    if (!selectedIds.size) return toast('タスクが選択されていません', true);
    const popover = ensurePopover();
    activePopover = 'category';
    button.setAttribute('aria-expanded', 'true');
    $('#bulk-color-menu-btn')?.setAttribute('aria-expanded', 'false');
    popover.replaceChildren();

    const title = document.createElement('div');
    title.className = 'bulk-popover__title';
    title.textContent = 'カテゴリを付ける';
    popover.append(title);

    collectCategories().forEach((category) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'bulk-popover__item';
      item.textContent = category;
      item.addEventListener('click', () => {
        const count = selectedIds.size;
        mutateSelected((tasks, ids) => tasks.map((task) => ids.has(String(task.id)) ? { ...task, category } : task), `${count}件に「${category}」を付けました`);
        closePopover();
      });
      popover.append(item);
    });

    const divider = document.createElement('div');
    divider.className = 'bulk-popover__divider';
    popover.append(divider);

    const form = document.createElement('div');
    form.className = 'bulk-new-category';
    form.innerHTML = `<input id="bulk-new-category-input" type="text" placeholder="新しいカテゴリ"><button type="button">適用</button>`;
    const input = form.querySelector('input');
    const apply = form.querySelector('button');
    const applyNew = () => {
      const value = input.value.trim();
      if (!value) return toast('カテゴリ名を入力してください', true);
      const count = selectedIds.size;
      mutateSelected((tasks, ids) => tasks.map((task) => ids.has(String(task.id)) ? { ...task, category: value } : task), `${count}件に「${value}」を付けました`);
      closePopover();
    };
    apply.addEventListener('click', applyNew);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyNew();
      }
    });
    popover.append(form);

    positionPopover(button, popover);
    setTimeout(() => input.focus(), 30);
  }

  function openColorMenu(button) {
    if (!selectedIds.size) return toast('タスクが選択されていません', true);
    const popover = ensurePopover();
    activePopover = 'color';
    button.setAttribute('aria-expanded', 'true');
    $('#bulk-category-menu-btn')?.setAttribute('aria-expanded', 'false');
    popover.replaceChildren();

    const title = document.createElement('div');
    title.className = 'bulk-popover__title';
    title.textContent = '色を付ける';
    popover.append(title);

    COLORS.forEach(([value, label]) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'bulk-popover__item';
      const dot = document.createElement('span');
      dot.className = 'bulk-popover__dot';
      dot.style.background = colorToFill(value);
      const text = document.createElement('span');
      text.textContent = label;
      item.append(dot, text);
      item.addEventListener('click', () => {
        const count = selectedIds.size;
        mutateSelected((tasks, ids) => tasks.map((task) => ids.has(String(task.id)) ? { ...task, color: value } : task), `${count}件の色を「${label}」にしました`);
        closePopover();
      });
      popover.append(item);
    });

    positionPopover(button, popover);
  }

  function colorToFill(value) {
    return {
      gray: '#cbd5e1', blue: '#bfdbfe', green: '#bbf7d0', amber: '#fde68a', red: '#fecdd3', purple: '#e9d5ff',
    }[value] || '#cbd5e1';
  }

  function toggleVisibleSelection() {
    const ids = visibleIds();
    if (!ids.length) return;
    const allSelected = ids.every((id) => selectedIds.has(id));
    if (allSelected) ids.forEach((id) => selectedIds.delete(id));
    else ids.forEach((id) => selectedIds.add(id));
    syncUI();
  }

  function annotateRows() {
    ensureBar();
    cleanSelection();
    const rows = visibleRows();
    const signature = rows.map((row) => row.dataset.taskId).join('|');
    if (signature !== knownSignature) knownSignature = signature;
    rows.forEach((row) => {
      const id = row.dataset.taskId;
      row.classList.add('has-bulk-checkbox');
      row.classList.toggle(SELECTED_CLASS, selectedIds.has(id));
      const nameCell = row.querySelector('.task-name-cell');
      if (!nameCell || nameCell.querySelector('.bulk-checkbox')) return;
      const wrap = document.createElement('label');
      wrap.className = 'bulk-checkbox-wrap';
      wrap.title = '一括操作用に選択';
      wrap.innerHTML = `<input class="bulk-checkbox" type="checkbox" aria-label="このタスクを選択">`;
      nameCell.prepend(wrap);
      const input = wrap.querySelector('input');
      input.checked = selectedIds.has(id);
      input.addEventListener('click', (event) => event.stopPropagation());
      input.addEventListener('change', (event) => {
        event.stopPropagation();
        if (input.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        syncUI();
      });
    });
    syncUI();
  }

  function scheduleAnnotate(delay = 140) {
    clearTimeout(annotateTimer);
    annotateTimer = setTimeout(annotateRows, delay);
  }

  function syncHeaderCheckbox() {
    const checkbox = $('#bulk-select-all');
    if (!checkbox) return;
    const ids = visibleIds();
    const checkedCount = ids.filter((id) => selectedIds.has(id)).length;
    checkbox.disabled = !ids.length;
    checkbox.checked = ids.length > 0 && checkedCount === ids.length;
    checkbox.indeterminate = checkedCount > 0 && checkedCount < ids.length;
  }

  function syncUI() {
    cleanSelection();
    const count = selectedIds.size;
    const countNode = $('#bulk-task-count');
    if (countNode) countNode.textContent = String(count);
    const bar = $('#bulk-task-bar');
    if (bar) {
      bar.dataset.empty = count ? 'false' : 'true';
      bar.hidden = count === 0;
    }
    if (!count) closePopover();
    visibleRows().forEach((row) => {
      const selected = selectedIds.has(row.dataset.taskId);
      row.classList.toggle(SELECTED_CLASS, selected);
      const checkbox = row.querySelector('.bulk-checkbox');
      if (checkbox && checkbox.checked !== selected) checkbox.checked = selected;
    });
    syncHeaderCheckbox();
  }

  function mutateSelected(mutator, message) {
    const project = readProject();
    const ids = new Set([...selectedIds].map(String));
    if (!ids.size) return toast('タスクが選択されていません', true);
    const tasks = Array.isArray(project.tasks) ? project.tasks : [];
    const nextTasks = mutator(tasks, ids);
    const nextCategories = collectCategories({ ...project, tasks: nextTasks });
    writeProject({ ...project, tasks: nextTasks, categories: nextCategories });
    selectedIds.clear();
    toast(message);
  }

  function toast(message, isError = false) {
    const node = $('#toast') || $('#share-toast');
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    node.classList.toggle('is-error', isError);
    requestAnimationFrame(() => node.classList.add('is-visible'));
    clearTimeout(node._bulkTimer);
    node._bulkTimer = setTimeout(() => {
      node.classList.remove('is-visible');
      setTimeout(() => { node.hidden = true; }, 180);
    }, 2200);
  }

  function bindActions() {
    if (document.body.dataset.bulkTaskBound === '1') return;
    document.body.dataset.bulkTaskBound = '1';

    document.addEventListener('click', (event) => {
      const target = event.target;
      const categoryButton = target.closest('#bulk-category-menu-btn');
      const colorButton = target.closest('#bulk-color-menu-btn');
      if (categoryButton) {
        event.stopPropagation();
        if (activePopover === 'category' && !$('#bulk-popover')?.hidden) closePopover();
        else openCategoryMenu(categoryButton);
        return;
      }
      if (colorButton) {
        event.stopPropagation();
        if (activePopover === 'color' && !$('#bulk-popover')?.hidden) closePopover();
        else openColorMenu(colorButton);
        return;
      }
      if (target.closest('#bulk-popover')) return;
      closePopover();

      if (target.closest('#bulk-clear-selection')) {
        selectedIds.clear();
        syncUI();
        return;
      }
      if (target.closest('#bulk-complete')) {
        const count = selectedIds.size;
        mutateSelected((tasks, ids) => tasks.map((task) => ids.has(String(task.id)) ? { ...task, completed: true } : task), `${count}件を完了にしました`);
        return;
      }
      if (target.closest('#bulk-incomplete')) {
        const count = selectedIds.size;
        mutateSelected((tasks, ids) => tasks.map((task) => ids.has(String(task.id)) ? { ...task, completed: false } : task), `${count}件を未完了にしました`);
        return;
      }
      if (target.closest('#bulk-delete')) {
        const count = selectedIds.size;
        if (!count) return toast('タスクが選択されていません', true);
        const ok = window.confirm(`${count}件のタスクを削除します。よろしいですか？`);
        if (!ok) return;
        mutateSelected((tasks, ids) => tasks.filter((task) => !ids.has(String(task.id))), `${count}件を削除しました`);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closePopover();
    });

    document.addEventListener('click', (event) => {
      if (event.target.closest('#add-task-btn, #add-milestone-btn, #apply-json-btn, #load-sample-btn, #reset-project-btn, #toggle-completed-btn')) scheduleAnnotate(600);
    });
    window.addEventListener('resize', () => {
      closePopover();
      scheduleAnnotate(180);
    });
    document.addEventListener('gantt-desk:rendered', () => scheduleAnnotate(80));
  }

  function init() {
    addStyles();
    ensureBar();
    bindActions();
    scheduleAnnotate(300);
    setInterval(() => {
      const signature = visibleIds().join('|');
      if (signature !== knownSignature) scheduleAnnotate(80);
    }, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
