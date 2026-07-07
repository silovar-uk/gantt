const APP_VERSION = 2;
const STORAGE_KEY = 'gantt-desk:v2:project';
const MAX_HISTORY = 80;
const DEFAULT_DAY_WIDTH = 28;
const DEFAULT_ROW_HEIGHT = 52;
const MIN_DAY_WIDTH = 10;
const MAX_DAY_WIDTH = 56;

const COLOR_OPTIONS = [
  ['gray', 'グレー'],
  ['blue', 'ブルー'],
  ['green', 'グリーン'],
  ['amber', 'アンバー'],
  ['red', 'レッド'],
  ['purple', 'パープル'],
];
const COLOR_ALIASES = {
  sky: 'blue', indigo: 'purple', pink: 'red', yellow: 'amber', orange: 'amber',
  slate: 'gray', grey: 'gray', cyan: 'blue', teal: 'green', violet: 'purple',
};

const $ = (selector) => document.querySelector(selector);

const dom = {
  projectTitle: $('#project-title'), saveStatus: $('#save-status'),
  importButton: $('#import-json-btn'), exportButton: $('#export-json-btn'), exportMenu: $('#export-menu'),
  moreButton: $('#more-btn'), moreMenu: $('#more-menu'), toggleCompleted: $('#toggle-completed-btn'),
  loadSample: $('#load-sample-btn'), resetProject: $('#reset-project-btn'),
  addTask: $('#add-task-btn'), addMilestone: $('#add-milestone-btn'), undo: $('#undo-btn'), redo: $('#redo-btn'),
  today: $('#today-btn'), timelineStart: $('#timeline-start'), timelineEnd: $('#timeline-end'),
  zoomRange: $('#zoom-range'), zoomValue: $('#zoom-value'), zoomOut: $('#zoom-out-btn'), zoomIn: $('#zoom-in-btn'),
  taskPanel: $('#task-panel'), taskScroll: $('#task-scroll'), taskList: $('#task-list'), paneResizer: $('#pane-resizer'),
  timelineScroll: $('#timeline-scroll'), timelineCanvas: $('#timeline-canvas'),
  inspector: $('#inspector'), inspectorContent: $('#inspector-content'), inspectorHeading: $('#inspector-heading'),
  closeInspector: $('#close-inspector-btn'), inspectorBackdrop: $('#inspector-backdrop'),
  jsonModal: $('#json-modal'), jsonInput: $('#json-input'), jsonDropZone: $('#json-drop-zone'), jsonFileInput: $('#json-file-input'),
  validateJSON: $('#validate-json-btn'), importResult: $('#import-result'), applyJSON: $('#apply-json-btn'),
  toast: $('#toast'), emptyTemplate: $('#empty-state-template'),
};

const state = {
  project: null,
  selectedTaskId: null,
  history: [],
  historyIndex: -1,
  lastImport: null,
  saveTimer: null,
  toastTimer: null,
  syncingScroll: false,
  drag: null,
  resizingPane: null,
};

function uid(prefix = 'id') {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayString() {
  const now = new Date();
  return dateToISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

function parseISO(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function dateToISO(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addDays(isoOrDate, days) {
  const date = typeof isoOrDate === 'string' ? parseISO(isoOrDate) : new Date(isoOrDate.getTime());
  date.setUTCDate(date.getUTCDate() + days);
  return typeof isoOrDate === 'string' ? dateToISO(date) : date;
}

function diffDays(start, end) {
  const startDate = typeof start === 'string' ? parseISO(start) : start;
  const endDate = typeof end === 'string' ? parseISO(end) : end;
  return Math.round((endDate - startDate) / 86400000);
}

function compareISO(a, b) { return a.localeCompare(b); }
function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
function deepCopy(value) { return JSON.parse(JSON.stringify(value)); }

function formatDate(iso, withWeekday = false) {
  const date = parseISO(iso);
  if (!date) return '—';
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return withWeekday
    ? `${date.getUTCMonth() + 1}/${date.getUTCDate()}(${days[date.getUTCDay()]})`
    : `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function createProject(partial = {}) {
  const base = todayString();
  const start = partial.view?.start && parseISO(partial.view.start) ? partial.view.start : addDays(base, -7);
  const end = partial.view?.end && parseISO(partial.view.end) ? partial.view.end : addDays(base, 42);
  return {
    version: APP_VERSION,
    id: partial.id || uid('project'),
    title: String(partial.title || '新しいガント').trim() || '新しいガント',
    memo: String(partial.memo || ''),
    categories: Array.isArray(partial.categories) ? [...new Set(partial.categories.map(normalizeCategory).filter(Boolean))] : ['未分類'],
    tasks: Array.isArray(partial.tasks) ? partial.tasks.map(normalizeTaskRecord).filter(Boolean) : [],
    view: {
      start,
      end: compareISO(start, end) <= 0 ? end : addDays(start, 42),
      dayWidth: clamp(Number(partial.view?.dayWidth) || DEFAULT_DAY_WIDTH, MIN_DAY_WIDTH, MAX_DAY_WIDTH),
      rowHeight: clamp(Number(partial.view?.rowHeight) || DEFAULT_ROW_HEIGHT, 44, 72),
      showCompleted: partial.view?.showCompleted !== false,
    },
    updatedAt: partial.updatedAt || new Date().toISOString(),
  };
}

function normalizeCategory(value) {
  const text = String(value ?? '').trim();
  return text || '未分類';
}

function normalizeColor(value) {
  const raw = String(value ?? 'gray').toLowerCase().trim();
  if (COLOR_OPTIONS.some(([key]) => key === raw)) return raw;
  return COLOR_ALIASES[raw] || 'gray';
}

function normalizeTaskRecord(task) {
  if (!task || typeof task !== 'object') return null;
  const start = parseISO(task.start) ? task.start : null;
  const end = parseISO(task.end) ? task.end : null;
  if (!start || !end || compareISO(end, start) < 0) return null;
  const milestone = Boolean(task.milestone);
  const normalEnd = milestone ? start : end;
  return {
    id: String(task.id || uid('task')),
    name: String(task.name ?? '').trim() || '名称未設定',
    start,
    end: normalEnd,
    category: normalizeCategory(task.category ?? task.categoryName ?? '未分類'),
    color: normalizeColor(task.color),
    completed: Boolean(task.completed),
    milestone,
    deadline: milestone && Boolean(task.deadline ?? task.isDeadline),
    note: String(task.note ?? ''),
  };
}

function getTask(taskId) {
  return state.project.tasks.find((task) => task.id === taskId);
}

function getVisibleTasks() {
  return state.project.view.showCompleted ? state.project.tasks : state.project.tasks.filter((task) => !task.completed);
}

function resetHistory() {
  state.history = [deepCopy(state.project)];
  state.historyIndex = 0;
}

function pushHistory() {
  state.project.updatedAt = new Date().toISOString();
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(deepCopy(state.project));
  if (state.history.length > MAX_HISTORY) state.history.shift();
  state.historyIndex = state.history.length - 1;
  scheduleSave();
  updateHistoryButtons();
}

function commit(mutator, { render = true } = {}) {
  mutator(state.project);
  syncProjectCategories();
  pushHistory();
  if (render) renderApp();
}

function syncProjectCategories() {
  const categories = new Set((state.project.categories || []).map(normalizeCategory));
  state.project.tasks.forEach((task) => categories.add(normalizeCategory(task.category)));
  state.project.categories = [...categories].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ja'));
  if (!state.project.categories.includes('未分類')) state.project.categories.unshift('未分類');
}

function undo() {
  if (state.historyIndex <= 0) return;
  state.historyIndex -= 1;
  state.project = deepCopy(state.history[state.historyIndex]);
  state.selectedTaskId = state.project.tasks.some((task) => task.id === state.selectedTaskId) ? state.selectedTaskId : null;
  scheduleSave();
  renderApp();
  showToast('ひとつ前の状態に戻しました');
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex += 1;
  state.project = deepCopy(state.history[state.historyIndex]);
  state.selectedTaskId = state.project.tasks.some((task) => task.id === state.selectedTaskId) ? state.selectedTaskId : null;
  scheduleSave();
  renderApp();
  showToast('やり直しました');
}

function updateHistoryButtons() {
  dom.undo.disabled = state.historyIndex <= 0;
  dom.redo.disabled = state.historyIndex >= state.history.length - 1;
}

function setSaveStatus(text, mode = '') {
  dom.saveStatus.textContent = text;
  dom.saveStatus.className = `save-status ${mode ? `is-${mode}` : ''}`;
}

function scheduleSave() {
  clearTimeout(state.saveTimer);
  setSaveStatus('保存中…', 'saving');
  state.saveTimer = setTimeout(persistProject, 360);
}

function persistProject() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project));
    setSaveStatus('この端末に保存済み');
  } catch (error) {
    console.error(error);
    setSaveStatus('保存に失敗しました', 'error');
    showToast('保存に失敗しました。JSONを書き出して退避してください。', true);
  }
}

function loadStoredProject() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return createProject();
    const parsed = JSON.parse(saved);
    return createProject(parsed.project || parsed);
  } catch (error) {
    console.warn('Stored project could not be loaded.', error);
    return createProject();
  }
}

function showToast(message, isError = false) {
  clearTimeout(state.toastTimer);
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  dom.toast.classList.toggle('is-error', isError);
  requestAnimationFrame(() => dom.toast.classList.add('is-visible'));
  state.toastTimer = setTimeout(() => {
    dom.toast.classList.remove('is-visible');
    setTimeout(() => { dom.toast.hidden = true; }, 180);
  }, 2800);
}

function closeMenus() {
  dom.exportMenu.hidden = true;
  dom.moreMenu.hidden = true;
  dom.exportButton.setAttribute('aria-expanded', 'false');
  dom.moreButton.setAttribute('aria-expanded', 'false');
}

function toggleMenu(menu, button) {
  const willOpen = menu.hidden;
  closeMenus();
  menu.hidden = !willOpen;
  button.setAttribute('aria-expanded', String(willOpen));
}

function renderApp({ preserveScroll = true } = {}) {
  const scrollLeft = dom.timelineScroll.scrollLeft;
  const scrollTop = dom.timelineScroll.scrollTop;
  document.documentElement.style.setProperty('--row-height', `${state.project.view.rowHeight}px`);
  document.documentElement.style.setProperty('--task-panel-width', `${dom.taskPanel.getBoundingClientRect().width || 560}px`);

  if (document.activeElement !== dom.projectTitle) dom.projectTitle.value = state.project.title;
  dom.timelineStart.value = state.project.view.start;
  dom.timelineEnd.value = state.project.view.end;
  dom.zoomRange.value = state.project.view.dayWidth;
  dom.zoomValue.value = `${state.project.view.dayWidth}px`;
  dom.toggleCompleted.textContent = state.project.view.showCompleted ? '完了タスクを隠す' : '完了タスクを表示';
  renderTaskList();
  renderTimeline();
  renderInspector();
  updateHistoryButtons();

  if (preserveScroll) {
    dom.timelineScroll.scrollLeft = scrollLeft;
    dom.timelineScroll.scrollTop = scrollTop;
    dom.taskScroll.scrollTop = scrollTop;
  }
}

function renderTaskList() {
  const tasks = getVisibleTasks();
  if (!tasks.length) {
    const fragment = dom.emptyTemplate.content.cloneNode(true);
    dom.taskList.replaceChildren(fragment);
    return;
  }

  dom.taskList.innerHTML = tasks.map((task) => {
    const selected = task.id === state.selectedTaskId;
    const stateMark = task.milestone
      ? '<span class="task-state is-milestone" aria-hidden="true"><span>◆</span></span>'
      : `<span class="task-state ${task.completed ? 'is-done' : ''}" aria-hidden="true">${task.completed ? '✓' : ''}</span>`;
    return `
      <div class="task-row ${selected ? 'is-selected' : ''} ${task.completed ? 'is-done' : ''}" tabindex="0" data-task-id="${escapeAttr(task.id)}" role="button" aria-label="${escapeAttr(task.name)}を編集">
        <div class="task-cell task-name-cell">${stateMark}<span class="task-name">${escapeHTML(task.name)}</span></div>
        <div class="task-cell category-cell"><span class="task-category">${escapeHTML(task.category)}</span></div>
        <div class="task-cell task-date date-start">${formatDate(task.start, true)}</div>
        <div class="task-cell task-date date-end">${formatDate(task.end, true)}</div>
      </div>`;
  }).join('');
}

function renderTimeline() {
  const { start, end, dayWidth, rowHeight } = state.project.view;
  const startDate = parseISO(start);
  const count = diffDays(start, end) + 1;
  const width = Math.max(count * dayWidth, dom.timelineScroll.clientWidth || 0);
  const tasks = getVisibleTasks();
  const height = Math.max(tasks.length * rowHeight, 1);
  const dayDates = Array.from({ length: count }, (_, index) => addDays(startDate, index));

  const monthCells = buildMonthCells(dayDates, dayWidth);
  const dayCells = dayDates.map((date) => {
    const dow = date.getUTCDay();
    const classes = ['day-cell', dow === 0 || dow === 6 ? 'is-weekend' : '', dow === 6 ? 'is-saturday' : '', dow === 0 ? 'is-sunday' : ''].filter(Boolean).join(' ');
    return `<div class="${classes}" style="width:${dayWidth}px" aria-label="${date.getUTCMonth() + 1}月${date.getUTCDate()}日"><span>${['日', '月', '火', '水', '木', '金', '土'][dow]}</span><span>${date.getUTCDate()}</span></div>`;
  }).join('');

  const gridLines = dayDates.map((_, index) => `<div class="day-grid-line" style="left:${index * dayWidth}px"></div>`).join('');
  const weekendBands = buildWeekendBands(dayDates, dayWidth, height);
  const weekLines = dayDates.map((date, index) => date.getUTCDay() === 1 ? `<div class="week-line" style="left:${index * dayWidth}px"></div>` : '').join('');
  const today = todayString();
  const todayIndex = diffDays(start, today);
  const todayLine = todayIndex >= 0 && todayIndex < count
    ? `<div class="today-line" style="left:${todayIndex * dayWidth + Math.floor(dayWidth / 2)}px"></div><div class="today-dot" style="left:${todayIndex * dayWidth + Math.floor(dayWidth / 2)}px"></div>`
    : '';
  const selectedIndex = tasks.findIndex((task) => task.id === state.selectedTaskId);
  const selectedRow = selectedIndex >= 0 ? `<div class="selected-row-band" style="top:${selectedIndex * rowHeight}px;height:${rowHeight}px"></div>` : '';
  const taskBars = tasks.map((task, index) => renderTaskShape(task, index, dayWidth, rowHeight, start, count)).join('');

  dom.timelineCanvas.style.width = `${width}px`;
  dom.timelineCanvas.innerHTML = `
    <div class="timeline-head" style="width:${width}px">
      <div class="month-row">${monthCells}</div>
      <div class="day-row">${dayCells}</div>
    </div>
    <div class="timeline-body" style="width:${width}px;height:${height}px">
      <div class="grid-layer">${gridLines}</div>
      <div class="weekend-layer">${weekendBands}</div>
      <div class="line-layer">${weekLines}${selectedRow}${todayLine}</div>
      <div class="task-layer">${taskBars}</div>
    </div>`;
}

function buildMonthCells(dayDates, dayWidth) {
  const chunks = [];
  let startIndex = 0;
  let active = null;
  dayDates.forEach((date, index) => {
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    if (active === null) active = key;
    if (key !== active) {
      chunks.push({ startIndex, endIndex: index - 1, key: active });
      startIndex = index;
      active = key;
    }
  });
  if (active !== null) chunks.push({ startIndex, endIndex: dayDates.length - 1, key: active });
  return chunks.map((chunk) => {
    const date = dayDates[chunk.startIndex];
    const days = chunk.endIndex - chunk.startIndex + 1;
    return `<div class="month-cell" style="width:${days * dayWidth}px">${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月</div>`;
  }).join('');
}

function buildWeekendBands(dayDates, dayWidth, height) {
  if (dayWidth < 12) {
    return dayDates.map((date, index) => date.getUTCDay() === 6 ? `<div class="weekend-marker" style="left:${index * dayWidth}px"></div>` : '').join('');
  }
  const faint = dayWidth < 18 ? 'is-faint' : '';
  const bands = [];
  for (let index = 0; index < dayDates.length; index += 1) {
    const date = dayDates[index];
    const dow = date.getUTCDay();
    if (dow === 6) {
      const days = Math.min(2, dayDates.length - index);
      bands.push(`<div class="weekend-band ${faint}" style="left:${index * dayWidth}px;width:${days * dayWidth}px;height:${height}px"></div>`);
    } else if (dow === 0 && (index === 0 || dayDates[index - 1].getUTCDay() !== 6)) {
      bands.push(`<div class="weekend-band ${faint}" style="left:${index * dayWidth}px;width:${dayWidth}px;height:${height}px"></div>`);
    }
  }
  return bands.join('');
}

function renderTaskShape(task, rowIndex, dayWidth, rowHeight, viewStart, totalDays) {
  const dayIndex = diffDays(viewStart, task.start);
  const top = rowIndex * rowHeight + Math.round((rowHeight - 30) / 2);
  const selected = task.id === state.selectedTaskId ? 'is-selected' : '';
  const done = task.completed ? 'is-done' : '';
  const left = clamp(dayIndex, 0, totalDays - 1) * dayWidth;
  if (task.milestone) {
    const labelLeft = left + 15;
    return `
      <button type="button" class="milestone color-${task.color} ${selected} ${task.deadline ? 'is-deadline' : ''}" data-task-id="${escapeAttr(task.id)}" style="left:${left - 9}px;top:${top + 4}px" aria-label="${escapeAttr(task.name)}を編集" title="${escapeAttr(task.name)}｜${formatDate(task.start, true)}"></button>
      <div class="milestone-label" style="left:${labelLeft}px;top:${top + 5}px;max-width:${Math.max(86, totalDays * dayWidth - labelLeft - 8)}px">${escapeHTML(task.name)}</div>`;
  }
  const duration = diffDays(task.start, task.end) + 1;
  const width = Math.max(duration * dayWidth, 7);
  return `<button type="button" class="task-bar color-${task.color} ${selected} ${done}" data-task-id="${escapeAttr(task.id)}" style="left:${left}px;top:${top}px;width:${width}px" aria-label="${escapeAttr(task.name)}を編集" title="${escapeAttr(task.name)}｜${formatDate(task.start, true)}〜${formatDate(task.end, true)}">
    <span class="bar-label">${escapeHTML(task.name)}</span><span class="bar-resize" data-resize="end" aria-hidden="true"></span>
  </button>`;
}

function renderInspector() {
  const task = getTask(state.selectedTaskId);
  if (!task) {
    closeInspector(false);
    dom.inspectorContent.innerHTML = '';
    return;
  }
  dom.inspectorHeading.textContent = task.milestone ? 'マイルストーンを編集' : 'タスクを編集';
  const categoryOptions = state.project.categories.map((category) => `<option value="${escapeAttr(category)}"></option>`).join('');
  const colorOptions = COLOR_OPTIONS.map(([value, label]) => `<option value="${value}" ${task.color === value ? 'selected' : ''}>${label}</option>`).join('');
  dom.inspectorContent.innerHTML = `
    <form id="inspector-form" class="form-stack" data-task-id="${escapeAttr(task.id)}">
      <div class="field-group">
        <label class="field-label" for="drawer-name">タスク名</label>
        <input id="drawer-name" class="field-input" name="name" type="text" value="${escapeAttr(task.name)}" autocomplete="off">
      </div>
      <div class="form-row">
        <div class="field-group">
          <label class="field-label" for="drawer-start">開始日</label>
          <input id="drawer-start" class="field-input" name="start" type="date" value="${task.start}">
        </div>
        <div class="field-group">
          <label class="field-label" for="drawer-end">終了日</label>
          <input id="drawer-end" class="field-input" name="end" type="date" value="${task.end}" ${task.milestone ? 'disabled' : ''}>
        </div>
      </div>
      <div class="form-row">
        <div class="field-group">
          <label class="field-label" for="drawer-category">カテゴリ</label>
          <input id="drawer-category" class="field-input" name="category" list="drawer-category-list" value="${escapeAttr(task.category)}" autocomplete="off">
          <datalist id="drawer-category-list">${categoryOptions}</datalist>
        </div>
        <div class="field-group">
          <label class="field-label" for="drawer-color">色</label>
          <select id="drawer-color" class="field-select" name="color">${colorOptions}</select>
        </div>
      </div>
      <div class="toggle-grid">
        <label class="check-card"><input name="completed" type="checkbox" ${task.completed ? 'checked' : ''}><span>完了</span><small>表示を落ち着かせる</small></label>
        <label class="check-card"><input name="milestone" type="checkbox" ${task.milestone ? 'checked' : ''}><span>マイルストーン</span><small>1日の節目にする</small></label>
        <label class="check-card"><input name="deadline" type="checkbox" ${task.deadline ? 'checked' : ''} ${task.milestone ? '' : 'disabled'}><span>締切</span><small>節目を強調する</small></label>
      </div>
      <p class="drawer-hint">カテゴリは新しい名称を入力すると自動で追加されます。編集内容はこの端末に自動保存されます。</p>
      <div class="field-group">
        <label class="field-label" for="drawer-note">メモ</label>
        <textarea id="drawer-note" class="field-textarea" name="note" placeholder="確認事項、リンク、担当者など">${escapeHTML(task.note)}</textarea>
      </div>
      <div class="inspector-actions">
        <button id="delete-task-btn" class="button button-danger" type="button">削除</button>
        <button id="duplicate-task-btn" class="button button-secondary" type="button">複製</button>
      </div>
    </form>`;
}

function openInspector(taskId) {
  state.selectedTaskId = taskId;
  dom.inspector.classList.add('is-open');
  dom.inspector.setAttribute('aria-hidden', 'false');
  if (window.matchMedia('(max-width: 650px)').matches) dom.inspectorBackdrop.hidden = false;
  renderApp();
}

function closeInspector(render = true) {
  state.selectedTaskId = null;
  dom.inspector.classList.remove('is-open');
  dom.inspector.setAttribute('aria-hidden', 'true');
  dom.inspectorBackdrop.hidden = true;
  if (render) renderApp();
}

function openJSONModal() {
  closeMenus();
  state.lastImport = null;
  dom.jsonInput.value = '';
  dom.importResult.innerHTML = '<div class="import-empty">JSONを貼り付けて「検証する」を押すと、反映内容をここで確認できます。</div>';
  dom.applyJSON.disabled = true;
  dom.jsonModal.hidden = false;
  setTimeout(() => dom.jsonInput.focus(), 30);
}

function closeJSONModal() {
  dom.jsonModal.hidden = true;
  state.lastImport = null;
}

function readImportMode() {
  return document.querySelector('input[name="import-mode"]:checked')?.value || 'append';
}

function validateImport() {
  const rawText = dom.jsonInput.value.trim();
  if (!rawText) {
    renderImportResult({ errors: ['JSONを貼り付けるか、ファイルを選択してください。'], warnings: [], tasks: [] });
    dom.applyJSON.disabled = true;
    return;
  }
  try {
    const parsed = JSON.parse(rawText);
    const result = normalizeImportPayload(parsed);
    state.lastImport = result;
    renderImportResult(result);
    dom.applyJSON.disabled = result.errors.length > 0;
  } catch (error) {
    const result = { errors: [`JSONとして読み込めません: ${error.message}`], warnings: [], tasks: [] };
    state.lastImport = result;
    renderImportResult(result);
    dom.applyJSON.disabled = true;
  }
}

function normalizeImportPayload(payload) {
  const errors = [];
  const warnings = [];
  let source = payload;
  if (payload && typeof payload === 'object' && payload.project && typeof payload.project === 'object') source = payload.project;
  if (Array.isArray(source)) source = { tasks: source };
  if (!source || typeof source !== 'object') return { errors: ['JSONの最上位はオブジェクトまたはタスク配列である必要があります。'], warnings, tasks: [] };
  if (!Array.isArray(source.tasks)) return { errors: ['tasks 配列が見つかりません。'], warnings, tasks: [] };

  const legacyCategories = new Map();
  if (Array.isArray(source.categories)) {
    source.categories.forEach((category) => {
      if (typeof category === 'string') legacyCategories.set(category, category);
      if (category && typeof category === 'object' && category.id) legacyCategories.set(String(category.id), normalizeCategory(category.name));
    });
  }

  const tasks = [];
  source.tasks.forEach((rawTask, index) => {
    const label = `タスク${index + 1}`;
    if (!rawTask || typeof rawTask !== 'object') {
      errors.push(`${label}: オブジェクトではありません。`);
      return;
    }
    const name = String(rawTask.name ?? '').trim();
    const start = String(rawTask.start ?? '');
    const inputEnd = String(rawTask.end ?? rawTask.start ?? '');
    if (!name) errors.push(`${label}: name がありません。`);
    if (!parseISO(start)) errors.push(`${label}${name ? `「${name}」` : ''}: start は YYYY-MM-DD 形式で指定してください。`);
    if (!parseISO(inputEnd)) errors.push(`${label}${name ? `「${name}」` : ''}: end は YYYY-MM-DD 形式で指定してください。`);
    if (!name || !parseISO(start) || !parseISO(inputEnd)) return;
    if (compareISO(inputEnd, start) < 0) {
      errors.push(`${label}「${name}」: 終了日が開始日より前です。`);
      return;
    }
    let category = rawTask.category ?? rawTask.categoryName ?? legacyCategories.get(String(rawTask.categoryId)) ?? '未分類';
    category = normalizeCategory(category);
    const rawColor = String(rawTask.color ?? 'gray').toLowerCase();
    const color = normalizeColor(rawColor);
    if (color !== rawColor) warnings.push(`${label}「${name}」: 色「${rawColor}」を「${color}」に補正します。`);
    const milestone = Boolean(rawTask.milestone);
    let deadline = Boolean(rawTask.deadline ?? rawTask.isDeadline);
    let end = inputEnd;
    if (milestone && inputEnd !== start) {
      warnings.push(`${label}「${name}」: マイルストーンの終了日を開始日に揃えます。`);
      end = start;
    }
    if (deadline && !milestone) {
      warnings.push(`${label}「${name}」: 締切はマイルストーンにのみ設定できるため、締切指定を外します。`);
      deadline = false;
    }
    tasks.push({
      id: uid('task'), name, start, end, category, color,
      milestone, deadline, completed: Boolean(rawTask.completed), note: String(rawTask.note ?? ''),
    });
  });
  const categories = new Set(Array.isArray(source.categories)
    ? source.categories.map((category) => typeof category === 'string' ? category : category?.name).filter(Boolean).map(normalizeCategory)
    : []);
  tasks.forEach((task) => categories.add(task.category));
  return {
    errors,
    warnings,
    tasks,
    title: String(source.title ?? source.projectTitle ?? '').trim(),
    memo: String(source.memo ?? source.projectMemo ?? ''),
    categories: [...categories],
    view: {
      start: parseISO(source.view?.start ?? source.viewSettings?.start) ? (source.view?.start ?? source.viewSettings?.start) : null,
      end: parseISO(source.view?.end ?? source.viewSettings?.end) ? (source.view?.end ?? source.viewSettings?.end) : null,
      dayWidth: Number(source.view?.dayWidth ?? source.viewSettings?.dayWidth) || null,
      rowHeight: Number(source.view?.rowHeight ?? source.viewSettings?.rowHeight) || null,
    },
  };
}

function renderImportResult(result) {
  if (!result) return;
  const okay = result.errors.length === 0;
  const preview = result.tasks.slice(0, 6).map((task) => `
    <div class="preview-row"><strong>${escapeHTML(task.name)}</strong><span>${formatDate(task.start, true)}${task.milestone ? '' : `〜${formatDate(task.end, true)}`} ・ ${escapeHTML(task.category)}</span></div>`).join('');
  const remainder = result.tasks.length > 6 ? `<p class="drawer-hint">ほか${result.tasks.length - 6}件</p>` : '';
  dom.importResult.innerHTML = `
    <div class="validation-summary">
      <span class="summary-badge ${okay ? 'ok' : 'error'}">${okay ? `検証OK：${result.tasks.length}件を反映できます` : `エラー：${result.errors.length}件を修正してください`}</span>
      ${result.errors.length ? `<section class="result-block"><h3>反映できない内容</h3><ul class="result-list error-list">${result.errors.map((error) => `<li>${escapeHTML(error)}</li>`).join('')}</ul></section>` : ''}
      ${result.warnings.length ? `<section class="result-block"><h3>反映時に補正する内容</h3><ul class="result-list">${result.warnings.map((warning) => `<li>${escapeHTML(warning)}</li>`).join('')}</ul></section>` : ''}
      ${okay ? `<section class="result-block"><h3>反映プレビュー</h3><div class="preview-list">${preview || '<p class="drawer-hint">タスクは0件です。</p>'}</div>${remainder}</section>` : ''}
    </div>`;
}

function applyImport() {
  const result = state.lastImport;
  if (!result || result.errors.length > 0) return;
  const mode = readImportMode();
  const importStart = result.view.start;
  const importEnd = result.view.end;
  commit((project) => {
    if (mode === 'replace') {
      project.title = result.title || project.title;
      project.memo = result.memo || '';
      project.tasks = result.tasks;
      project.categories = result.categories;
      if (importStart && importEnd && compareISO(importStart, importEnd) <= 0) {
        project.view.start = importStart;
        project.view.end = importEnd;
      } else if (result.tasks.length) {
        fitViewToTasks(project, 5);
      }
      if (result.view.dayWidth) project.view.dayWidth = clamp(result.view.dayWidth, MIN_DAY_WIDTH, MAX_DAY_WIDTH);
      if (result.view.rowHeight) project.view.rowHeight = clamp(result.view.rowHeight, 44, 72);
    } else {
      project.tasks.push(...result.tasks);
      project.categories.push(...result.categories);
      if (result.tasks.length) extendViewToTasks(project, result.tasks, 3);
    }
  });
  closeJSONModal();
  showToast(mode === 'replace' ? `${result.tasks.length}件で置き換えました` : `${result.tasks.length}件を追加しました`);
}

function extendViewToTasks(project, tasks, padding = 3) {
  const starts = tasks.map((task) => task.start);
  const ends = tasks.map((task) => task.end);
  const minStart = starts.sort()[0];
  const maxEnd = ends.sort().at(-1);
  if (compareISO(minStart, project.view.start) < 0) project.view.start = addDays(minStart, -padding);
  if (compareISO(maxEnd, project.view.end) > 0) project.view.end = addDays(maxEnd, padding);
}

function fitViewToTasks(project, padding = 5) {
  if (!project.tasks.length) return;
  const starts = project.tasks.map((task) => task.start).sort();
  const ends = project.tasks.map((task) => task.end).sort();
  project.view.start = addDays(starts[0], -padding);
  project.view.end = addDays(ends.at(-1), padding);
}

function downloadJSON(kind) {
  const payload = kind === 'backup' ? buildBackupPayload() : buildAIPayload();
  const readable = JSON.stringify(payload, null, 2);
  const blob = new Blob([readable], { type: 'application/json;charset=utf-8' });
  const filename = `${safeFilename(state.project.title)}_${kind === 'backup' ? 'backup' : 'ai'}.json`;
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(anchor.href);
  showToast(kind === 'backup' ? '完全バックアップJSONを書き出しました' : 'AI連携用JSONを書き出しました');
}

function buildBackupPayload() {
  return { format: 'gantt-desk-backup', version: APP_VERSION, exportedAt: new Date().toISOString(), project: state.project };
}

function buildAIPayload() {
  return {
    version: 1,
    title: state.project.title,
    memo: state.project.memo,
    view: { start: state.project.view.start, end: state.project.view.end },
    tasks: state.project.tasks.map((task) => ({
      name: task.name, start: task.start, end: task.end, category: task.category, color: task.color,
      milestone: task.milestone, deadline: task.deadline, note: task.note,
    })),
  };
}

async function copyAIPrompt() {
  const prompt = `以下のタスク情報を、指定JSON形式に整形してください。説明文やMarkdownは出力せず、JSONのみを返してください。\n\nルール\n- 日付は YYYY-MM-DD 形式\n- 期間が未指定の場合は開始日と終了日を同じにする\n- 締切は milestone: true と deadline: true を両方設定\n- color は gray / blue / green / amber / red / purple のいずれか\n- category は短い日本語名\n- 日付が曖昧な場合は推測せず、note に「要確認」と残す\n\n現在の表示期間\n${state.project.view.start} 〜 ${state.project.view.end}\n\nJSON形式の例\n${JSON.stringify(buildAIPayload(), null, 2)}`;
  try {
    await navigator.clipboard.writeText(prompt);
    showToast('AI用プロンプトをコピーしました');
  } catch (error) {
    fallbackCopy(prompt);
    showToast('AI用プロンプトをコピーしました');
  }
}

function fallbackCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function safeFilename(value) {
  return String(value || 'gantt').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
}

function addTask(milestone = false) {
  const visible = getVisibleTasks();
  const last = visible.at(-1) || state.project.tasks.at(-1);
  const start = last ? addDays(last.end, 1) : clampDateToView(todayString());
  const end = milestone ? start : addDays(start, 2);
  const task = {
    id: uid('task'),
    name: milestone ? '新しいマイルストーン' : '新しいタスク',
    start: clampDateToView(start),
    end: clampDateToView(end),
    category: '未分類', color: 'blue', completed: false,
    milestone, deadline: false, note: '',
  };
  if (!milestone && compareISO(task.end, task.start) < 0) task.end = task.start;
  commit((project) => { project.tasks.push(task); extendViewToTasks(project, [task], 3); });
  openInspector(task.id);
  const nameInput = $('#drawer-name');
  if (nameInput) { nameInput.focus(); nameInput.select(); }
}

function clampDateToView(iso) {
  if (compareISO(iso, state.project.view.start) < 0) return state.project.view.start;
  if (compareISO(iso, state.project.view.end) > 0) return state.project.view.end;
  return iso;
}

function duplicateTask(taskId) {
  const task = getTask(taskId);
  if (!task) return;
  const copy = { ...deepCopy(task), id: uid('task'), name: `${task.name}（コピー）`, completed: false };
  commit((project) => {
    const index = project.tasks.findIndex((item) => item.id === taskId);
    project.tasks.splice(index + 1, 0, copy);
  });
  openInspector(copy.id);
  showToast('タスクを複製しました');
}

function deleteTask(taskId) {
  const task = getTask(taskId);
  if (!task) return;
  if (!window.confirm(`「${task.name}」を削除しますか？`)) return;
  commit((project) => { project.tasks = project.tasks.filter((item) => item.id !== taskId); });
  closeInspector(false);
  renderApp();
  showToast('タスクを削除しました');
}

function updateTaskFromForm(form) {
  const taskId = form.dataset.taskId;
  const original = getTask(taskId);
  if (!original) return;
  const data = new FormData(form);
  const next = {
    name: String(data.get('name') ?? '').trim() || '名称未設定',
    start: String(data.get('start') ?? original.start),
    end: String(data.get('end') ?? original.end),
    category: normalizeCategory(data.get('category')),
    color: normalizeColor(data.get('color')),
    completed: data.get('completed') === 'on',
    milestone: data.get('milestone') === 'on',
    deadline: data.get('deadline') === 'on',
    note: String(data.get('note') ?? ''),
  };
  if (!parseISO(next.start)) next.start = original.start;
  if (!parseISO(next.end)) next.end = original.end;
  if (next.milestone) next.end = next.start;
  if (compareISO(next.end, next.start) < 0) next.end = next.start;
  if (!next.milestone) next.deadline = false;
  const changed = Object.keys(next).some((key) => next[key] !== original[key]);
  if (!changed) return;
  commit((project) => {
    const task = project.tasks.find((item) => item.id === taskId);
    Object.assign(task, next);
    extendViewToTasks(project, [task], 2);
  });
}

function applyProjectTitle() {
  const title = dom.projectTitle.value.trim() || '新しいガント';
  if (title === state.project.title) return;
  commit((project) => { project.title = title; }, { render: false });
  document.title = `${title} | Gantt Desk`;
}

function applyViewDates() {
  const start = dom.timelineStart.value;
  const end = dom.timelineEnd.value;
  if (!parseISO(start) || !parseISO(end) || compareISO(end, start) < 0) {
    showToast('表示期間を正しく入力してください。', true);
    renderApp();
    return;
  }
  if (start === state.project.view.start && end === state.project.view.end) return;
  commit((project) => { project.view.start = start; project.view.end = end; });
}

function setZoom(value) {
  const next = clamp(Number(value) || DEFAULT_DAY_WIDTH, MIN_DAY_WIDTH, MAX_DAY_WIDTH);
  if (next === state.project.view.dayWidth) return;
  commit((project) => { project.view.dayWidth = next; });
}

function scrollToToday() {
  const index = diffDays(state.project.view.start, todayString());
  if (index < 0 || index > diffDays(state.project.view.start, state.project.view.end)) {
    commit((project) => {
      project.view.start = addDays(todayString(), -7);
      project.view.end = addDays(todayString(), 42);
    });
  }
  const updatedIndex = diffDays(state.project.view.start, todayString());
  const target = Math.max(0, updatedIndex * state.project.view.dayWidth - dom.timelineScroll.clientWidth * .38);
  dom.timelineScroll.scrollTo({ left: target, behavior: 'smooth' });
}

function handleTimelinePointerDown(event) {
  const shape = event.target.closest('.task-bar, .milestone');
  if (!shape) return;
  const taskId = shape.dataset.taskId;
  const task = getTask(taskId);
  if (!task) return;
  const mode = event.target.closest('.bar-resize') ? 'resize' : 'move';
  openInspector(taskId);
  if (task.milestone) return;
  event.preventDefault();
  state.drag = {
    taskId,
    mode,
    startX: event.clientX,
    originalStart: task.start,
    originalEnd: task.end,
    before: deepCopy(state.project),
    changed: false,
    lastDelta: 0,
  };
  window.addEventListener('pointermove', handleTimelinePointerMove);
  window.addEventListener('pointerup', handleTimelinePointerUp, { once: true });
}

function handleTimelinePointerMove(event) {
  const drag = state.drag;
  if (!drag) return;
  const delta = Math.round((event.clientX - drag.startX) / state.project.view.dayWidth);
  if (delta === drag.lastDelta) return;
  drag.lastDelta = delta;
  const task = getTask(drag.taskId);
  if (!task) return;
  const total = diffDays(state.project.view.start, state.project.view.end);
  const duration = diffDays(drag.originalStart, drag.originalEnd);
  if (drag.mode === 'move') {
    const minDelta = -diffDays(state.project.view.start, drag.originalStart);
    const maxDelta = total - diffDays(state.project.view.start, drag.originalEnd);
    const actual = clamp(delta, minDelta, maxDelta);
    task.start = addDays(drag.originalStart, actual);
    task.end = addDays(drag.originalEnd, actual);
  } else {
    const minDelta = -duration;
    const maxDelta = total - diffDays(state.project.view.start, drag.originalEnd);
    const actual = clamp(delta, minDelta, maxDelta);
    task.end = addDays(drag.originalEnd, actual);
  }
  drag.changed = task.start !== drag.originalStart || task.end !== drag.originalEnd;
  renderApp();
}

function handleTimelinePointerUp() {
  window.removeEventListener('pointermove', handleTimelinePointerMove);
  const drag = state.drag;
  state.drag = null;
  if (!drag) return;
  if (!drag.changed) {
    state.project = drag.before;
    renderApp();
    return;
  }
  syncProjectCategories();
  pushHistory();
  renderApp();
  showToast(drag.mode === 'move' ? 'タスクの期間を移動しました' : '終了日を変更しました');
}

function beginPaneResize(event) {
  event.preventDefault();
  const initialWidth = dom.taskPanel.getBoundingClientRect().width;
  state.resizingPane = { startX: event.clientX, initialWidth };
  dom.paneResizer.classList.add('is-resizing');
  window.addEventListener('pointermove', resizePane);
  window.addEventListener('pointerup', endPaneResize, { once: true });
}

function resizePane(event) {
  if (!state.resizingPane) return;
  const delta = event.clientX - state.resizingPane.startX;
  const max = Math.min(window.innerWidth * .7, 920);
  const width = clamp(state.resizingPane.initialWidth + delta, 320, max);
  dom.taskPanel.style.width = `${width}px`;
  document.documentElement.style.setProperty('--task-panel-width', `${width}px`);
}

function endPaneResize() {
  window.removeEventListener('pointermove', resizePane);
  state.resizingPane = null;
  dom.paneResizer.classList.remove('is-resizing');
  renderApp();
}

function escapeHTML(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function escapeAttr(value) { return escapeHTML(value); }

function bindEvents() {
  dom.addTask.addEventListener('click', () => addTask(false));
  dom.addMilestone.addEventListener('click', () => addTask(true));
  dom.undo.addEventListener('click', undo);
  dom.redo.addEventListener('click', redo);
  dom.today.addEventListener('click', scrollToToday);
  dom.timelineStart.addEventListener('change', applyViewDates);
  dom.timelineEnd.addEventListener('change', applyViewDates);
  dom.zoomRange.addEventListener('input', (event) => setZoom(event.target.value));
  dom.zoomOut.addEventListener('click', () => setZoom(state.project.view.dayWidth - 2));
  dom.zoomIn.addEventListener('click', () => setZoom(state.project.view.dayWidth + 2));

  dom.projectTitle.addEventListener('change', applyProjectTitle);
  dom.projectTitle.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); dom.projectTitle.blur(); } });
  dom.importButton.addEventListener('click', openJSONModal);
  dom.exportButton.addEventListener('click', () => toggleMenu(dom.exportMenu, dom.exportButton));
  dom.moreButton.addEventListener('click', () => toggleMenu(dom.moreMenu, dom.moreButton));
  dom.exportMenu.addEventListener('click', (event) => {
    const item = event.target.closest('[data-export]');
    if (!item) return;
    closeMenus();
    const type = item.dataset.export;
    if (type === 'prompt') copyAIPrompt(); else downloadJSON(type);
  });
  dom.toggleCompleted.addEventListener('click', () => {
    closeMenus();
    commit((project) => { project.view.showCompleted = !project.view.showCompleted; });
  });
  dom.resetProject.addEventListener('click', () => {
    closeMenus();
    if (!window.confirm('現在のプロジェクトを初期化しますか？この操作はUndoで戻せます。')) return;
    commit((project) => {
      const fresh = createProject({ title: project.title });
      Object.assign(project, fresh);
    });
    closeInspector(false);
    renderApp();
    showToast('プロジェクトを初期化しました');
  });
  dom.loadSample.addEventListener('click', async () => {
    closeMenus();
    try {
      const response = await fetch('samples/sample-project.json');
      if (!response.ok) throw new Error('サンプルを読み込めませんでした');
      const sample = await response.json();
      const result = normalizeImportPayload(sample);
      if (result.errors.length) throw new Error(result.errors.join(' '));
      openJSONModal();
      state.lastImport = result;
      dom.jsonInput.value = JSON.stringify(sample, null, 2);
      renderImportResult(result);
      dom.applyJSON.disabled = false;
      document.querySelector('input[name="import-mode"][value="replace"]').checked = true;
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.menu-wrap')) closeMenus();
    const closeButton = event.target.closest('[data-close-modal="json"]');
    if (closeButton) closeJSONModal();
  });

  dom.taskList.addEventListener('click', (event) => {
    const action = event.target.closest('[data-empty-action]');
    if (action) { action.dataset.emptyAction === 'task' ? addTask(false) : openJSONModal(); return; }
    const row = event.target.closest('.task-row');
    if (row) openInspector(row.dataset.taskId);
  });
  dom.taskList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('.task-row');
    if (row) { event.preventDefault(); openInspector(row.dataset.taskId); }
  });
  dom.timelineCanvas.addEventListener('pointerdown', handleTimelinePointerDown);
  dom.closeInspector.addEventListener('click', () => closeInspector());
  dom.inspectorBackdrop.addEventListener('click', () => closeInspector());
  dom.inspectorContent.addEventListener('change', (event) => {
    const form = event.target.closest('#inspector-form');
    if (form) updateTaskFromForm(form);
  });
  dom.inspectorContent.addEventListener('click', (event) => {
    const form = event.target.closest('#inspector-form');
    if (!form) return;
    if (event.target.closest('#delete-task-btn')) deleteTask(form.dataset.taskId);
    if (event.target.closest('#duplicate-task-btn')) duplicateTask(form.dataset.taskId);
  });

  dom.jsonDropZone.addEventListener('click', () => dom.jsonFileInput.click());
  dom.jsonDropZone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); dom.jsonFileInput.click(); } });
  dom.jsonFileInput.addEventListener('change', async (event) => {
    const [file] = event.target.files;
    if (file) await readJSONFile(file);
  });
  ['dragenter', 'dragover'].forEach((name) => dom.jsonDropZone.addEventListener(name, (event) => { event.preventDefault(); dom.jsonDropZone.classList.add('is-dragging'); }));
  ['dragleave', 'drop'].forEach((name) => dom.jsonDropZone.addEventListener(name, (event) => { event.preventDefault(); dom.jsonDropZone.classList.remove('is-dragging'); }));
  dom.jsonDropZone.addEventListener('drop', async (event) => {
    const [file] = event.dataTransfer.files;
    if (file) await readJSONFile(file);
  });
  dom.validateJSON.addEventListener('click', validateImport);
  dom.applyJSON.addEventListener('click', applyImport);

  dom.paneResizer.addEventListener('pointerdown', beginPaneResize);
  dom.timelineScroll.addEventListener('scroll', () => {
    if (state.syncingScroll) return;
    state.syncingScroll = true;
    dom.taskScroll.scrollTop = dom.timelineScroll.scrollTop;
    requestAnimationFrame(() => { state.syncingScroll = false; });
  });
  dom.taskScroll.addEventListener('scroll', () => {
    if (state.syncingScroll) return;
    state.syncingScroll = true;
    dom.timelineScroll.scrollTop = dom.taskScroll.scrollTop;
    requestAnimationFrame(() => { state.syncingScroll = false; });
  });

  window.addEventListener('keydown', (event) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if ((event.ctrlKey || event.metaKey) && !typing && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    }
    if (event.key === 'Escape') {
      closeMenus();
      if (!dom.jsonModal.hidden) closeJSONModal();
      else if (state.selectedTaskId) closeInspector();
    }
  });
  window.addEventListener('beforeunload', persistProject);
  window.addEventListener('resize', () => renderApp());
}

async function readJSONFile(file) {
  try {
    const text = await file.text();
    dom.jsonInput.value = text;
    validateImport();
  } catch (error) {
    showToast('ファイルを読み込めませんでした。', true);
  }
}

function initialize() {
  state.project = loadStoredProject();
  syncProjectCategories();
  resetHistory();
  document.title = `${state.project.title} | Gantt Desk`;
  bindEvents();
  renderApp({ preserveScroll: false });
  persistProject();
}

initialize();
