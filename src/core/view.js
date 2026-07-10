import {
  COLOR_OPTIONS,
  addDays,
  clamp,
  compareISO,
  diffDays,
  escapeAttr,
  escapeHTML,
  formatDate,
  parseISO,
  todayISO,
} from './project.js';

const COLOR_FILL = {
  gray: '#cbd5e1', blue: '#bfdbfe', green: '#bbf7d0', amber: '#fde68a', red: '#fecdd3', purple: '#e9d5ff',
};

export function createView(store) {
  const $ = (selector) => document.querySelector(selector);
  const dom = {
    projectTitle: $('#project-title'),
    saveStatus: $('#save-status'),
    addTask: $('#add-task-btn'),
    addMilestone: $('#add-milestone-btn'),
    undo: $('#undo-btn'),
    redo: $('#redo-btn'),
    today: $('#today-btn'),
    timelineStart: $('#timeline-start'),
    timelineEnd: $('#timeline-end'),
    zoomRange: $('#zoom-range'),
    zoomValue: $('#zoom-value'),
    importButton: $('#import-json-btn'),
    exportButton: $('#export-json-btn'),
    exportMenu: $('#export-menu'),
    moreButton: $('#more-btn'),
    moreMenu: $('#more-menu'),
    toggleCompleted: $('#toggle-completed-btn'),
    loadSample: $('#load-sample-btn'),
    resetProject: $('#reset-project-btn'),
    taskPanel: $('#task-panel'),
    taskPanelHead: $('.task-panel-head'),
    taskScroll: $('#task-scroll'),
    taskList: $('#task-list'),
    paneResizer: $('#pane-resizer'),
    timelineScroll: $('#timeline-scroll'),
    timelineCanvas: $('#timeline-canvas'),
    inspector: $('#inspector'),
    inspectorHeading: $('#inspector-heading'),
    inspectorContent: $('#inspector-content'),
    closeInspector: $('#close-inspector-btn'),
    inspectorBackdrop: $('#inspector-backdrop'),
    jsonModal: $('#json-modal'),
    jsonInput: $('#json-input'),
    jsonDropZone: $('#json-drop-zone'),
    jsonFileInput: $('#json-file-input'),
    validateJSON: $('#validate-json-btn'),
    applyJSON: $('#apply-json-btn'),
    importResult: $('#import-result'),
    toast: $('#toast'),
  };

  let toastTimer = null;

  function ensureChrome() {
    ensureHeaderActions();
    ensureDisplayControls();
    ensureBulkBar();
    ensureHeaderCheckbox();
  }

  function ensureHeaderActions() {
    dom.importButton.textContent = '読込';
    dom.exportButton.textContent = 'コピー';
    dom.exportButton.title = 'JSONやAI用プロンプトをコピーする';
    dom.importButton.title = 'JSONを読み込む';
    const firstGroup = document.querySelector('.toolbar > .toolbar-group:first-child');
    if (firstGroup && !firstGroup.contains(dom.importButton)) {
      const divider = document.createElement('span');
      divider.className = 'toolbar-divider';
      divider.setAttribute('aria-hidden', 'true');
      firstGroup.append(divider, dom.importButton);
    }
  }

  function ensureDisplayControls() {
    if ($('#display-settings-btn')) return;
    const toolbar = $('.toolbar');
    const group = document.createElement('div');
    group.className = 'toolbar-group display-toolbar-group';
    group.innerHTML = `
      <button id="display-compact-btn" class="button button-secondary" type="button">極小表示</button>
      <button id="display-settings-btn" class="button button-secondary" type="button" aria-expanded="false">表示</button>
      <section id="display-settings-panel" class="display-settings-panel" hidden aria-label="表示">
        <div class="display-settings-head">
          <div><strong>表示</strong><span>見たい粒度に合わせて、行・列・日付幅を調整します。</span></div>
          <button id="display-panel-close" class="icon-button" type="button" aria-label="閉じる">×</button>
        </div>
        <div class="display-settings-grid">
          <section class="display-settings-section">
            <h3>見え方 <small>PRESET</small></h3>
            <div class="density-preset-row">
              <button type="button" data-density-preset="relaxed">ゆったり<small>52px</small></button>
              <button type="button" data-density-preset="standard">標準<small>40px</small></button>
              <button type="button" data-density-preset="compact">一覧<small>24px</small></button>
              <button type="button" data-density-preset="ultra">極小<small>18px</small></button>
            </div>
          </section>
          <section class="display-settings-section">
            <h3>縦方向 <small>ROW</small></h3>
            <label class="display-control-label" for="row-height-slider"><span>行の高さ</span><output id="row-height-output"></output></label>
            <input id="row-height-slider" type="range" min="18" max="72" step="1">
          </section>
          <section class="display-settings-section">
            <h3>横方向 <small>WIDTH</small></h3>
            <label class="display-control-label" for="panel-width-slider"><span>左の一覧幅</span><output id="panel-width-output"></output></label>
            <input id="panel-width-slider" type="range" min="320" max="920" step="10">
            <label class="display-control-label" for="day-width-slider"><span>日付幅</span><output id="day-width-output"></output></label>
            <input id="day-width-slider" type="range" min="10" max="56" step="1">
          </section>
          <section class="display-settings-section">
            <h3>列 <small>COLUMN</small></h3>
            <div class="category-mode-row">
              <button type="button" data-category-mode="show">表示</button>
              <button type="button" data-category-mode="color">色だけ</button>
              <button type="button" data-category-mode="hide">非表示</button>
            </div>
          </section>
          <section class="display-settings-section display-settings-helper">
            <h3>補助 <small>UTILITY</small></h3>
            <button id="fit-tasks-range-btn" class="button button-secondary" type="button">期間をタスクに合わせる</button>
            <button id="reset-density-btn" class="button button-quiet" type="button">表示をリセット</button>
          </section>
        </div>
      </section>`;
    toolbar.append(group);
  }

  function ensureBulkBar() {
    if ($('#bulk-task-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'bulk-task-bar';
    bar.className = 'bulk-task-bar';
    bar.hidden = true;
    bar.innerHTML = `
      <strong><span id="bulk-task-count">0</span>件選択</strong>
      <button id="bulk-clear-selection" type="button">解除</button>
      <span class="bulk-divider"></span>
      <button id="bulk-category-menu-btn" type="button" aria-expanded="false">カテゴリ</button>
      <button id="bulk-color-menu-btn" type="button" aria-expanded="false">色</button>
      <span class="bulk-divider"></span>
      <button id="bulk-complete" type="button">完了</button>
      <button id="bulk-incomplete" type="button">未完了</button>
      <button id="bulk-delete" class="is-danger" type="button">削除</button>`;
    dom.taskPanelHead.insertAdjacentElement('afterend', bar);
    dom.taskPanel.classList.add('has-context-bar');
  }

  function ensureHeaderCheckbox() {
    const first = dom.taskPanelHead.firstElementChild;
    if (!first || $('#bulk-select-all')) return;
    const input = document.createElement('input');
    input.id = 'bulk-select-all';
    input.className = 'bulk-select-all';
    input.type = 'checkbox';
    input.setAttribute('aria-label', '表示中のタスクをまとめて選択');
    first.prepend(input);
  }

  function getVisibleTasks(project = store.getState().project) {
    return project.view.showCompleted ? project.tasks : project.tasks.filter((task) => !task.completed);
  }

  function setBodyModes(project) {
    const { rowHeight, density, categoryMode } = project.view;
    document.body.classList.toggle('gantt-density-tight', rowHeight <= 36);
    document.body.classList.toggle('gantt-density-compact', density === 'compact' || density === 'ultra' || rowHeight <= 28);
    document.body.classList.toggle('gantt-density-ultra', density === 'ultra' || rowHeight <= 22);
    document.body.classList.toggle('gantt-category-color', categoryMode === 'color');
    document.body.classList.toggle('gantt-category-hide', categoryMode === 'hide');
  }

  function renderApp(reason = 'render') {
    ensureChrome();
    const { project } = store.getState();
    const scrollLeft = dom.timelineScroll.scrollLeft;
    const scrollTop = dom.timelineScroll.scrollTop;
    document.documentElement.style.setProperty('--row-height', `${project.view.rowHeight}px`);
    document.documentElement.style.setProperty('--task-panel-width', `${project.view.panelWidth}px`);
    dom.taskPanel.style.width = `${project.view.panelWidth}px`;
    setBodyModes(project);
    if (document.activeElement !== dom.projectTitle) dom.projectTitle.value = project.title;
    dom.timelineStart.value = project.view.start;
    dom.timelineEnd.value = project.view.end;
    dom.zoomRange.value = String(project.view.dayWidth);
    dom.zoomValue.value = `${project.view.dayWidth}px`;
    dom.toggleCompleted.textContent = project.view.showCompleted ? '完了タスクを隠す' : '完了タスクを表示';
    document.title = `${project.title} | Gantt Desk`;
    renderTaskList();
    renderTimeline();
    renderInspector();
    renderBulkBar();
    syncDisplayControls();
    updateHistoryButtons();
    dom.timelineScroll.scrollLeft = scrollLeft;
    dom.timelineScroll.scrollTop = scrollTop;
    dom.taskScroll.scrollTop = scrollTop;
    dom.saveStatus.textContent = 'この端末に保存済み';
    dom.saveStatus.title = `最終更新 ${new Date(project.updatedAt).toLocaleString('ja-JP')}`;
    return reason;
  }

  function renderTaskList() {
    const state = store.getState();
    const tasks = getVisibleTasks();
    if (!tasks.length) {
      const template = $('#empty-state-template');
      dom.taskList.replaceChildren(template.content.cloneNode(true));
      return;
    }
    dom.taskList.innerHTML = tasks.map((task, index) => {
      const selected = state.selectedTaskId === task.id;
      const checked = state.bulkSelected.has(task.id);
      const stateMark = task.milestone
        ? '<span class="task-state is-milestone" aria-hidden="true"><span>◆</span></span>'
        : `<span class="task-state ${task.completed ? 'is-done' : ''}" aria-hidden="true">${task.completed ? '✓' : ''}</span>`;
      return `
        <div class="task-row ${selected ? 'is-selected' : ''} ${checked ? 'is-bulk-selected' : ''} ${task.completed ? 'is-done' : ''}" tabindex="0" data-task-id="${escapeAttr(task.id)}" data-row-index="${index}" role="button" aria-label="${escapeAttr(task.name)}を編集">
          <div class="task-cell task-name-cell">
            <label class="bulk-checkbox-wrap" title="一括操作用に選択"><input class="bulk-checkbox" type="checkbox" ${checked ? 'checked' : ''} aria-label="このタスクを選択"></label>
            ${stateMark}<span class="task-name">${escapeHTML(task.name)}</span>
          </div>
          <div class="task-cell category-cell"><span class="task-category" style="--task-color-fill:${COLOR_FILL[task.color] || COLOR_FILL.gray}" title="${escapeAttr(task.category)}">${escapeHTML(task.category)}</span></div>
          <div class="task-cell task-date date-start">${formatDate(task.start, true)}</div>
          <div class="task-cell task-date date-end">${formatDate(task.end, true)}</div>
          <button class="row-resize-handle" type="button" data-row-resize-handle aria-label="上下にドラッグしてすべての行の高さを変更" title="上下にドラッグして行高を変更。ダブルクリックで40pxへ戻す"></button>
        </div>`;
    }).join('');
  }

  function renderTimeline() {
    const state = store.getState();
    const { project } = state;
    const { start, end, dayWidth, rowHeight } = project.view;
    const count = diffDays(start, end) + 1;
    const width = Math.max(count * dayWidth, dom.timelineScroll.clientWidth || 0);
    const tasks = getVisibleTasks();
    const height = Math.max(tasks.length * rowHeight, 1);
    const startDate = parseISO(start);
    const dayDates = Array.from({ length: count }, (_, index) => addDays(startDate, index));
    const monthCells = buildMonthCells(dayDates, dayWidth);
    const dayCells = dayDates.map((date) => {
      const dow = date.getUTCDay();
      const classes = ['day-cell', dow === 0 || dow === 6 ? 'is-weekend' : '', dow === 6 ? 'is-saturday' : '', dow === 0 ? 'is-sunday' : ''].filter(Boolean).join(' ');
      return `<div class="${classes}" style="width:${dayWidth}px"><span>${['日','月','火','水','木','金','土'][dow]}</span><span>${date.getUTCDate()}</span></div>`;
    }).join('');
    const gridLines = dayDates.map((_, index) => `<div class="day-grid-line" style="left:${index * dayWidth}px"></div>`).join('');
    const weekendBands = buildWeekendBands(dayDates, dayWidth, height);
    const todayIndex = diffDays(start, todayISO());
    const todayLine = todayIndex >= 0 && todayIndex < count
      ? `<div class="today-line" style="left:${todayIndex * dayWidth + Math.floor(dayWidth / 2)}px"></div><div class="today-dot" style="left:${todayIndex * dayWidth + Math.floor(dayWidth / 2)}px"></div>`
      : '';
    const selectedIndex = tasks.findIndex((task) => task.id === state.selectedTaskId);
    const selectedBand = selectedIndex >= 0 ? `<div class="selected-row-band" data-row-index="${selectedIndex}" style="top:${selectedIndex * rowHeight}px;height:${rowHeight}px"></div>` : '';
    const shapes = tasks.map((task, index) => renderTaskShape(task, index, project.view)).join('');
    dom.timelineCanvas.style.width = `${width}px`;
    dom.timelineCanvas.innerHTML = `
      <div class="timeline-head" style="width:${width}px"><div class="month-row">${monthCells}</div><div class="day-row">${dayCells}</div></div>
      <div class="timeline-body" style="width:${width}px;height:${height}px">
        <div class="grid-layer">${gridLines}</div>
        <div class="weekend-layer">${weekendBands}</div>
        <div class="line-layer">${selectedBand}${todayLine}</div>
        <div class="task-layer">${shapes}</div>
      </div>`;
  }

  function renderTaskShape(task, rowIndex, view) {
    const { start: viewStart, dayWidth, rowHeight } = view;
    const totalDays = diffDays(view.start, view.end) + 1;
    const dayIndex = diffDays(viewStart, task.start);
    const left = clamp(dayIndex, 0, totalDays - 1) * dayWidth;
    const barHeight = Math.max(10, Math.min(rowHeight <= 22 ? 12 : 18, rowHeight - 4));
    const top = rowIndex * rowHeight + Math.max(1, Math.round((rowHeight - barHeight) / 2));
    const selected = store.getState().selectedTaskId === task.id ? 'is-selected' : '';
    const done = task.completed ? 'is-done' : '';
    if (task.milestone) {
      return `<button type="button" class="milestone color-${task.color} ${selected} ${task.deadline ? 'is-deadline' : ''}" data-task-id="${escapeAttr(task.id)}" data-row-index="${rowIndex}" style="left:${left - 9}px;top:${top}px" title="${escapeAttr(task.name)}"></button><div class="milestone-label" data-row-index="${rowIndex}" style="left:${left + 15}px;top:${top}px">${escapeHTML(task.name)}</div>`;
    }
    const width = Math.max((diffDays(task.start, task.end) + 1) * dayWidth, 7);
    return `<button type="button" class="task-bar color-${task.color} ${selected} ${done}" data-task-id="${escapeAttr(task.id)}" data-row-index="${rowIndex}" style="left:${left}px;top:${top}px;width:${width}px;height:${barHeight}px" title="${escapeAttr(task.name)}"><span class="bar-label">${escapeHTML(task.name)}</span><span class="bar-resize" data-resize="end" aria-hidden="true"></span></button>`;
  }

  function buildMonthCells(dayDates, dayWidth) {
    const chunks = [];
    let startIndex = 0;
    let active = null;
    dayDates.forEach((date, index) => {
      const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
      if (active === null) active = key;
      if (key !== active) {
        chunks.push({ startIndex, endIndex: index - 1 });
        startIndex = index;
        active = key;
      }
    });
    if (active !== null) chunks.push({ startIndex, endIndex: dayDates.length - 1 });
    return chunks.map((chunk) => {
      const date = dayDates[chunk.startIndex];
      return `<div class="month-cell" style="width:${(chunk.endIndex - chunk.startIndex + 1) * dayWidth}px">${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月</div>`;
    }).join('');
  }

  function buildWeekendBands(dayDates, dayWidth, height) {
    const bands = [];
    dayDates.forEach((date, index) => {
      if (date.getUTCDay() === 6) {
        const days = Math.min(2, dayDates.length - index);
        bands.push(`<div class="weekend-band" style="left:${index * dayWidth}px;width:${days * dayWidth}px;height:${height}px"></div>`);
      }
    });
    return bands.join('');
  }

  function renderInspector() {
    const state = store.getState();
    const task = state.project.tasks.find((item) => item.id === state.selectedTaskId);
    if (!task) {
      dom.inspector.classList.remove('is-open');
      dom.inspector.setAttribute('aria-hidden', 'true');
      dom.inspectorBackdrop.hidden = true;
      dom.inspectorContent.innerHTML = '';
      return;
    }
    dom.inspector.classList.add('is-open');
    dom.inspector.setAttribute('aria-hidden', 'false');
    if (window.matchMedia('(max-width:650px)').matches) dom.inspectorBackdrop.hidden = false;
    dom.inspectorHeading.textContent = task.milestone ? 'マイルストーンを編集' : 'タスクを編集';
    const categories = state.project.categories.map((category) => `<option value="${escapeAttr(category)}"></option>`).join('');
    const colors = COLOR_OPTIONS.map(([value, label]) => `<option value="${value}" ${task.color === value ? 'selected' : ''}>${label}</option>`).join('');
    dom.inspectorContent.innerHTML = `
      <form id="inspector-form" class="form-stack" data-task-id="${escapeAttr(task.id)}">
        <div class="field-group"><label class="field-label" for="drawer-name">タスク名</label><input id="drawer-name" class="field-input" name="name" value="${escapeAttr(task.name)}"></div>
        <div class="form-row"><div class="field-group"><label class="field-label" for="drawer-start">開始日</label><input id="drawer-start" class="field-input" name="start" type="date" value="${task.start}"></div><div class="field-group"><label class="field-label" for="drawer-end">終了日</label><input id="drawer-end" class="field-input" name="end" type="date" value="${task.end}" ${task.milestone ? 'disabled' : ''}></div></div>
        <div class="form-row"><div class="field-group"><label class="field-label" for="drawer-category">カテゴリ</label><input id="drawer-category" class="field-input" name="category" list="drawer-category-list" value="${escapeAttr(task.category)}"><datalist id="drawer-category-list">${categories}</datalist></div><div class="field-group"><label class="field-label" for="drawer-color">色</label><select id="drawer-color" class="field-select" name="color">${colors}</select></div></div>
        <div class="toggle-grid"><label class="check-card"><input name="completed" type="checkbox" ${task.completed ? 'checked' : ''}><span>完了</span><small>表示を落ち着かせる</small></label><label class="check-card"><input name="milestone" type="checkbox" ${task.milestone ? 'checked' : ''}><span>マイルストーン</span><small>1日の節目にする</small></label><label class="check-card"><input name="deadline" type="checkbox" ${task.deadline ? 'checked' : ''} ${task.milestone ? '' : 'disabled'}><span>締切</span><small>節目を強調する</small></label></div>
        <div class="field-group"><label class="field-label" for="drawer-note">メモ</label><textarea id="drawer-note" class="field-textarea" name="note">${escapeHTML(task.note)}</textarea></div>
        <div class="inspector-actions"><button id="delete-task-btn" class="button button-danger" type="button">削除</button><button id="duplicate-task-btn" class="button button-secondary" type="button">複製</button></div>
      </form>`;
  }

  function renderBulkBar() {
    const state = store.getState();
    const bar = $('#bulk-task-bar');
    const count = state.bulkSelected.size;
    bar.hidden = count === 0;
    $('#bulk-task-count').textContent = String(count);
    const ids = getVisibleTasks().map((task) => task.id);
    const selectedCount = ids.filter((id) => state.bulkSelected.has(id)).length;
    const header = $('#bulk-select-all');
    header.checked = ids.length > 0 && selectedCount === ids.length;
    header.indeterminate = selectedCount > 0 && selectedCount < ids.length;
    header.disabled = ids.length === 0;
  }

  function syncDisplayControls() {
    const { view } = store.getState().project;
    const row = $('#row-height-slider');
    const day = $('#day-width-slider');
    const panel = $('#panel-width-slider');
    if (!row) return;
    row.value = String(view.rowHeight);
    day.value = String(view.dayWidth);
    panel.value = String(Math.round(view.panelWidth));
    $('#row-height-output').value = `${view.rowHeight}px`;
    $('#day-width-output').value = `${view.dayWidth}px`;
    $('#panel-width-output').value = `${Math.round(view.panelWidth)}px`;
    document.querySelectorAll('[data-density-preset]').forEach((button) => button.classList.toggle('is-active', button.dataset.densityPreset === view.density));
    document.querySelectorAll('[data-category-mode]').forEach((button) => button.classList.toggle('is-active', button.dataset.categoryMode === view.categoryMode));
  }

  function updateHistoryButtons() {
    const state = store.getState();
    dom.undo.disabled = state.history.length === 0;
    dom.redo.disabled = state.future.length === 0;
  }

  function applyLiveRowHeight(value) {
    const rowHeight = clamp(value, 18, 72);
    document.documentElement.style.setProperty('--row-height', `${rowHeight}px`);
    const rows = [...document.querySelectorAll('#task-list .task-row[data-row-index]')];
    const body = $('.timeline-body');
    if (body) body.style.height = `${Math.max(rows.length * rowHeight, 1)}px`;
    document.querySelectorAll('.weekend-band').forEach((band) => { band.style.height = `${Math.max(rows.length * rowHeight, 1)}px`; });
    document.querySelectorAll('[data-row-index].task-bar, [data-row-index].milestone, [data-row-index].milestone-label').forEach((element) => {
      const index = Number(element.dataset.rowIndex);
      const barHeight = Math.max(10, Math.min(rowHeight <= 22 ? 12 : 18, rowHeight - 4));
      const top = index * rowHeight + Math.max(1, Math.round((rowHeight - barHeight) / 2));
      element.style.top = `${top}px`;
      if (element.classList.contains('task-bar')) element.style.height = `${barHeight}px`;
    });
    const selected = $('.selected-row-band[data-row-index]');
    if (selected) {
      const index = Number(selected.dataset.rowIndex);
      selected.style.top = `${index * rowHeight}px`;
      selected.style.height = `${rowHeight}px`;
    }
    const slider = $('#row-height-slider');
    if (slider) slider.value = String(rowHeight);
    const output = $('#row-height-output');
    if (output) output.value = `${rowHeight}px`;
  }

  function applyLivePanelWidth(value) {
    const max = Math.max(320, Math.min(window.innerWidth * .72, 920));
    const width = clamp(value, 320, max);
    dom.taskPanel.style.width = `${width}px`;
    document.documentElement.style.setProperty('--task-panel-width', `${width}px`);
    const slider = $('#panel-width-slider');
    if (slider) slider.value = String(Math.round(width));
    const output = $('#panel-width-output');
    if (output) output.value = `${Math.round(width)}px`;
  }

  function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    dom.toast.classList.toggle('is-error', isError);
    requestAnimationFrame(() => dom.toast.classList.add('is-visible'));
    toastTimer = setTimeout(() => {
      dom.toast.classList.remove('is-visible');
      setTimeout(() => { dom.toast.hidden = true; }, 180);
    }, 2200);
  }

  function closeMenus() {
    dom.exportMenu.hidden = true;
    dom.moreMenu.hidden = true;
    dom.exportButton.setAttribute('aria-expanded', 'false');
    dom.moreButton.setAttribute('aria-expanded', 'false');
    $('#bulk-popover')?.remove();
    $('#bulk-category-menu-btn')?.setAttribute('aria-expanded', 'false');
    $('#bulk-color-menu-btn')?.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu(menu, button) {
    const open = menu.hidden;
    closeMenus();
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  }

  function openJSONModal() {
    closeMenus();
    dom.jsonInput.value = '';
    dom.importResult.innerHTML = '<div class="import-empty">JSONを貼り付けて「検証する」を押すと、反映内容をここで確認できます。</div>';
    dom.applyJSON.disabled = true;
    dom.jsonModal.hidden = false;
    setTimeout(() => dom.jsonInput.focus(), 30);
  }

  function closeJSONModal() {
    dom.jsonModal.hidden = true;
    dom.applyJSON.disabled = true;
  }

  ensureChrome();
  return {
    dom,
    renderApp,
    renderTimeline,
    applyLiveRowHeight,
    applyLivePanelWidth,
    showToast,
    closeMenus,
    toggleMenu,
    openJSONModal,
    closeJSONModal,
    getVisibleTasks,
  };
}
