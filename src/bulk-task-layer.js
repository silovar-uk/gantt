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

  function readProject() {
    try { return JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}'); }
    catch { return {}; }
  }

  function writeProject(project) {
    const next = { ...project, updatedAt: new Date().toISOString() };
    localStorage.setItem(PROJECT_KEY, JSON.stringify(next));
    window.dispatchEvent(new StorageEvent('storage', { key: PROJECT_KEY, newValue: JSON.stringify(next) }));
    requestRender();
  }

  function requestRender() {
    window.dispatchEvent(new Event('resize'));
    // app.js keeps its own state, so the most reliable safe-layer refresh is a light reload.
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

  function addStyles() {
    if ($('#bulk-task-style')) return;
    const style = document.createElement('style');
    style.id = 'bulk-task-style';
    style.textContent = `
      .bulk-task-bar {
        display:flex;
        align-items:center;
        flex-wrap:wrap;
        gap:7px;
        padding:8px 12px;
        border-top:1px solid #e7eef6;
        border-bottom:1px solid #dde7f2;
        background:#f8fbff;
      }
      .bulk-task-bar__summary {
        display:inline-flex;
        align-items:center;
        gap:6px;
        min-height:30px;
        margin-right:2px;
        color:#334155;
        font-size:12px;
        font-weight:850;
        white-space:nowrap;
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
      .bulk-task-button,
      .bulk-task-select,
      .bulk-task-input {
        min-height:30px;
        border:1px solid #cbd7e6;
        border-radius:8px;
        background:#fff;
        color:#334155;
        font-size:12px;
        font-weight:800;
      }
      .bulk-task-button {
        padding:5px 9px;
        cursor:pointer;
      }
      .bulk-task-button:hover { background:#eef4ff; border-color:#8aa8dc; color:#244a8f; }
      .bulk-task-button.is-danger { color:#b4232b; border-color:#f0b8bd; background:#fff8f8; }
      .bulk-task-button.is-danger:hover { color:#fff; background:#c3474d; border-color:#c3474d; }
      .bulk-task-select { padding:5px 8px; max-width:150px; }
      .bulk-task-input { padding:5px 8px; width:150px; max-width:42vw; font-weight:700; }
      .bulk-task-separator { width:1px; height:22px; background:#dbe5ef; margin-inline:1px; }
      .bulk-checkbox-wrap {
        display:inline-flex;
        align-items:center;
        justify-content:center;
        flex:0 0 24px;
        width:24px;
        min-width:24px;
        height:100%;
      }
      .bulk-checkbox {
        width:15px;
        height:15px;
        margin:0;
        accent-color:#244a8f;
        cursor:pointer;
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
      .bulk-task-bar[data-empty="true"] .bulk-requires-selection {
        opacity:.45;
        pointer-events:none;
      }
      body.gantt-density-ultra .bulk-task-bar {
        padding:5px 8px;
        gap:5px;
      }
      body.gantt-density-ultra .bulk-task-button,
      body.gantt-density-ultra .bulk-task-select,
      body.gantt-density-ultra .bulk-task-input {
        min-height:26px;
        font-size:11px;
        border-radius:7px;
      }
      body.gantt-density-ultra .bulk-task-bar__summary {
        min-height:26px;
        font-size:11px;
      }
      body.gantt-density-ultra .bulk-checkbox-wrap {
        flex-basis:20px;
        width:20px;
        min-width:20px;
      }
      body.gantt-density-ultra .bulk-checkbox {
        width:13px;
        height:13px;
      }
      @media (max-width:760px) {
        .bulk-task-bar {
          align-items:stretch;
          overflow-x:auto;
          flex-wrap:nowrap;
        }
        .bulk-task-bar__summary,
        .bulk-task-button,
        .bulk-task-select,
        .bulk-task-input {
          flex:0 0 auto;
        }
      }
    `;
    document.head.append(style);
  }

  function ensureBar() {
    if ($('#bulk-task-bar')) return;
    const taskPanel = $('#task-panel');
    const head = taskPanel?.querySelector('.task-panel-head');
    if (!taskPanel || !head) return;
    const bar = document.createElement('div');
    bar.id = 'bulk-task-bar';
    bar.className = 'bulk-task-bar';
    bar.dataset.empty = 'true';
    bar.innerHTML = `
      <span class="bulk-task-bar__summary"><span id="bulk-task-count" class="bulk-task-bar__count">0</span>件選択</span>
      <button id="bulk-select-visible" class="bulk-task-button" type="button">表示中を選択</button>
      <button id="bulk-clear-selection" class="bulk-task-button" type="button">解除</button>
      <span class="bulk-task-separator" aria-hidden="true"></span>
      <input id="bulk-category-input" class="bulk-task-input bulk-requires-selection" type="text" placeholder="カテゴリ名">
      <button id="bulk-apply-category" class="bulk-task-button bulk-requires-selection" type="button">カテゴリ付け</button>
      <select id="bulk-color-select" class="bulk-task-select bulk-requires-selection" aria-label="一括色変更">
        <option value="">色を選択</option>
        ${COLORS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
      </select>
      <button id="bulk-apply-color" class="bulk-task-button bulk-requires-selection" type="button">色付け</button>
      <span class="bulk-task-separator" aria-hidden="true"></span>
      <button id="bulk-complete" class="bulk-task-button bulk-requires-selection" type="button">完了</button>
      <button id="bulk-incomplete" class="bulk-task-button bulk-requires-selection" type="button">未完了</button>
      <button id="bulk-delete" class="bulk-task-button is-danger bulk-requires-selection" type="button">削除</button>
    `;
    head.insertAdjacentElement('afterend', bar);
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

  function syncUI() {
    cleanSelection();
    const count = selectedIds.size;
    const countNode = $('#bulk-task-count');
    if (countNode) countNode.textContent = String(count);
    const bar = $('#bulk-task-bar');
    if (bar) bar.dataset.empty = count ? 'false' : 'true';
    visibleRows().forEach((row) => {
      const selected = selectedIds.has(row.dataset.taskId);
      row.classList.toggle(SELECTED_CLASS, selected);
      const checkbox = row.querySelector('.bulk-checkbox');
      if (checkbox && checkbox.checked !== selected) checkbox.checked = selected;
    });
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

  function collectCategories(project) {
    const base = Array.isArray(project.categories) ? project.categories : [];
    const categories = new Set(base.filter(Boolean));
    (project.tasks || []).forEach((task) => { if (task.category) categories.add(task.category); });
    if (!categories.size) categories.add('未分類');
    return [...categories];
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
      if (target.closest('#bulk-select-visible')) {
        visibleIds().forEach((id) => selectedIds.add(id));
        syncUI();
        return;
      }
      if (target.closest('#bulk-clear-selection')) {
        selectedIds.clear();
        syncUI();
        return;
      }
      if (target.closest('#bulk-apply-category')) {
        const value = $('#bulk-category-input')?.value.trim();
        if (!value) return toast('カテゴリ名を入力してください', true);
        mutateSelected((tasks, ids) => tasks.map((task) => ids.has(String(task.id)) ? { ...task, category: value } : task), `${selectedIds.size}件にカテゴリを付けました`);
        return;
      }
      if (target.closest('#bulk-apply-color')) {
        const value = $('#bulk-color-select')?.value;
        if (!value) return toast('色を選択してください', true);
        mutateSelected((tasks, ids) => tasks.map((task) => ids.has(String(task.id)) ? { ...task, color: value } : task), `${selectedIds.size}件の色を変更しました`);
        return;
      }
      if (target.closest('#bulk-complete')) {
        mutateSelected((tasks, ids) => tasks.map((task) => ids.has(String(task.id)) ? { ...task, completed: true } : task), `${selectedIds.size}件を完了にしました`);
        return;
      }
      if (target.closest('#bulk-incomplete')) {
        mutateSelected((tasks, ids) => tasks.map((task) => ids.has(String(task.id)) ? { ...task, completed: false } : task), `${selectedIds.size}件を未完了にしました`);
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

    document.addEventListener('click', (event) => {
      if (event.target.closest('#add-task-btn, #add-milestone-btn, #apply-json-btn, #load-sample-btn, #reset-project-btn, #toggle-completed-btn')) scheduleAnnotate(600);
    });
    window.addEventListener('resize', () => scheduleAnnotate(180));
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
