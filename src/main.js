import {
  COLOR_OPTIONS,
  addDays,
  clamp,
  compareISO,
  createProject,
  deepCopy,
  diffDays,
  loadProject,
  normalizeCategory,
  normalizeColor,
  normalizeImportPayload,
  parseISO,
  todayISO,
  uid,
} from './core/project.js';
import { createStore } from './core/store.js';
import { createView } from './core/view.js';

const store = createStore(loadProject());
const view = createView(store);
const { dom } = view;
let lastImport = null;
let syncingScroll = false;

const PRESETS = {
  relaxed: { rowHeight: 52, dayWidth: 28, panelWidth: 560 },
  standard: { rowHeight: 40, dayWidth: 24, panelWidth: 500 },
  compact: { rowHeight: 24, dayWidth: 14, panelWidth: 410 },
  ultra: { rowHeight: 18, dayWidth: 10, panelWidth: 360 },
};

function getTask(taskId) {
  return store.getState().project.tasks.find((task) => task.id === taskId) || null;
}

function extendViewToTasks(project, tasks, padding = 2) {
  const starts = tasks.map((task) => task.start).filter(parseISO).sort();
  const ends = tasks.map((task) => task.end || task.start).filter(parseISO).sort();
  if (!starts.length || !ends.length) return;
  const start = addDays(starts[0], -padding);
  const end = addDays(ends[ends.length - 1], padding);
  if (compareISO(start, project.view.start) < 0) project.view.start = start;
  if (compareISO(end, project.view.end) > 0) project.view.end = end;
}

function addTask(milestone = false) {
  const visible = view.getVisibleTasks();
  const last = visible[visible.length - 1] || store.getState().project.tasks[store.getState().project.tasks.length - 1];
  const start = last ? addDays(last.end, 1) : todayISO();
  const task = {
    id: uid('task'),
    name: milestone ? '新しいマイルストーン' : '新しいタスク',
    start,
    end: milestone ? start : addDays(start, 2),
    category: '未分類',
    color: 'blue',
    completed: false,
    milestone,
    deadline: false,
    note: '',
  };
  store.commit((project) => {
    project.tasks.push(task);
    if (!project.categories.includes('未分類')) project.categories.unshift('未分類');
    extendViewToTasks(project, [task], 3);
  }, { reason: 'add-task' });
  store.setSelectedTask(task.id);
  setTimeout(() => {
    const input = document.querySelector('#drawer-name');
    input?.focus();
    input?.select();
  }, 30);
}

function duplicateTask(taskId) {
  const task = getTask(taskId);
  if (!task) return;
  const copy = { ...deepCopy(task), id: uid('task'), name: `${task.name}（コピー）`, completed: false };
  store.commit((project) => {
    const at = project.tasks.findIndex((item) => item.id === taskId);
    project.tasks.splice(at + 1, 0, copy);
  }, { reason: 'duplicate-task' });
  store.setSelectedTask(copy.id);
  view.showToast('タスクを複製しました');
}

function deleteTask(taskId) {
  const task = getTask(taskId);
  if (!task || !window.confirm(`「${task.name}」を削除しますか？`)) return;
  store.commit((project) => {
    project.tasks = project.tasks.filter((item) => item.id !== taskId);
  }, { reason: 'delete-task' });
  store.setSelectedTask(null);
  view.showToast('タスクを削除しました');
}

function updateTaskFromForm(form) {
  const taskId = form.dataset.taskId;
  const original = getTask(taskId);
  if (!original) return;
  const data = new FormData(form);
  const next = {
    name: String(data.get('name') ?? '').trim() || '名称未設定',
    start: parseISO(String(data.get('start'))) ? String(data.get('start')) : original.start,
    end: parseISO(String(data.get('end'))) ? String(data.get('end')) : original.end,
    category: normalizeCategory(data.get('category')),
    color: normalizeColor(data.get('color')),
    completed: data.get('completed') === 'on',
    milestone: data.get('milestone') === 'on',
    deadline: data.get('deadline') === 'on',
    note: String(data.get('note') ?? ''),
  };
  if (next.milestone) next.end = next.start;
  if (compareISO(next.end, next.start) < 0) next.end = next.start;
  if (!next.milestone) next.deadline = false;
  const changed = Object.keys(next).some((key) => next[key] !== original[key]);
  if (!changed) return;
  store.commit((project) => {
    const task = project.tasks.find((item) => item.id === taskId);
    Object.assign(task, next);
    if (!project.categories.includes(next.category)) project.categories.push(next.category);
    extendViewToTasks(project, [task], 2);
  }, { reason: 'edit-task' });
}

function applyProjectTitle() {
  const title = dom.projectTitle.value.trim() || '新しいガント';
  if (title === store.getState().project.title) return;
  store.commit((project) => { project.title = title; }, { reason: 'rename-project' });
}

function applyViewDates() {
  const start = dom.timelineStart.value;
  const end = dom.timelineEnd.value;
  if (!parseISO(start) || !parseISO(end) || compareISO(end, start) < 0) {
    view.showToast('表示期間を正しく入力してください。', true);
    view.renderApp('invalid-view-dates');
    return;
  }
  store.commit((project) => {
    project.view.start = start;
    project.view.end = end;
  }, { reason: 'view-dates' });
}

function setZoom(value) {
  const next = clamp(value, 10, 56);
  if (next === store.getState().project.view.dayWidth) return;
  store.commit((project) => {
    project.view.dayWidth = next;
    project.view.density = 'custom';
  }, { reason: 'zoom' });
}

function scrollToToday() {
  const project = store.getState().project;
  let index = diffDays(project.view.start, todayISO());
  if (index < 0 || index > diffDays(project.view.start, project.view.end)) {
    store.commit((next) => {
      next.view.start = addDays(todayISO(), -7);
      next.view.end = addDays(todayISO(), 42);
    }, { reason: 'today-range' });
    index = diffDays(store.getState().project.view.start, todayISO());
  }
  const target = Math.max(0, index * store.getState().project.view.dayWidth - dom.timelineScroll.clientWidth * .38);
  dom.timelineScroll.scrollTo({ left: target, behavior: 'smooth' });
}

function beginRowResize(event, handle) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const interaction = store.getState().interaction;
  interaction.rowResize = {
    startY: event.clientY,
    initialHeight: store.getState().project.view.rowHeight,
    lastHeight: store.getState().project.view.rowHeight,
    handle,
  };
  document.body.classList.add('is-row-height-dragging');
  handle.classList.add('is-dragging');
  try { handle.setPointerCapture(event.pointerId); } catch {}
  window.addEventListener('pointermove', onRowResizeMove, true);
  window.addEventListener('pointerup', onRowResizeEnd, { once: true, capture: true });
}

function onRowResizeMove(event) {
  const drag = store.getState().interaction.rowResize;
  if (!drag) return;
  event.preventDefault();
  event.stopPropagation();
  const step = event.shiftKey ? 1 : 2;
  const raw = drag.initialHeight + event.clientY - drag.startY;
  const next = clamp(Math.round(raw / step) * step, 18, 72);
  if (next === drag.lastHeight) return;
  drag.lastHeight = next;
  view.applyLiveRowHeight(next);
}

function onRowResizeEnd(event) {
  const interaction = store.getState().interaction;
  const drag = interaction.rowResize;
  if (!drag) return;
  event.preventDefault();
  event.stopPropagation();
  window.removeEventListener('pointermove', onRowResizeMove, true);
  drag.handle?.classList.remove('is-dragging');
  document.body.classList.remove('is-row-height-dragging');
  interaction.rowResize = null;
  interaction.suppressRowClickUntil = performance.now() + 500;
  store.commit((project) => {
    project.view.rowHeight = drag.lastHeight;
    project.view.density = drag.lastHeight <= 22 ? 'ultra' : 'custom';
  }, { reason: 'row-resize' });
  view.showToast(`行高 ${drag.lastHeight}px`);
}

function resetRowHeight(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  store.getState().interaction.suppressRowClickUntil = performance.now() + 400;
  store.commit((project) => {
    project.view.rowHeight = 40;
    project.view.density = 'standard';
  }, { reason: 'row-resize-reset' });
  view.showToast('行高を40pxへ戻しました');
}

function beginPaneResize(event) {
  if (window.innerWidth <= 650) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  store.getState().interaction.paneResize = {
    startX: event.clientX,
    initialWidth: store.getState().project.view.panelWidth,
    lastWidth: store.getState().project.view.panelWidth,
  };
  document.body.classList.add('is-panel-width-dragging');
  dom.paneResizer.classList.add('is-resizing');
  window.addEventListener('pointermove', onPaneResizeMove, true);
  window.addEventListener('pointerup', onPaneResizeEnd, { once: true, capture: true });
}

function onPaneResizeMove(event) {
  const drag = store.getState().interaction.paneResize;
  if (!drag) return;
  event.preventDefault();
  const max = Math.max(320, Math.min(window.innerWidth * .72, 920));
  drag.lastWidth = clamp(drag.initialWidth + event.clientX - drag.startX, 320, max);
  view.applyLivePanelWidth(drag.lastWidth);
}

function onPaneResizeEnd(event) {
  const interaction = store.getState().interaction;
  const drag = interaction.paneResize;
  if (!drag) return;
  event.preventDefault();
  window.removeEventListener('pointermove', onPaneResizeMove, true);
  interaction.paneResize = null;
  document.body.classList.remove('is-panel-width-dragging');
  dom.paneResizer.classList.remove('is-resizing');
  store.commit((project) => {
    project.view.panelWidth = Math.round(drag.lastWidth);
  }, { reason: 'pane-resize' });
}

function beginTaskDrag(event) {
  const shape = event.target.closest('.task-bar, .milestone');
  if (!shape) return;
  const task = getTask(shape.dataset.taskId);
  if (!task) return;
  if (task.milestone) {
    store.setSelectedTask(task.id);
    return;
  }
  event.preventDefault();
  const mode = event.target.closest('.bar-resize') ? 'resize' : 'move';
  store.setSelectedTask(task.id, { notify: false });
  store.getState().interaction.taskDrag = {
    taskId: task.id,
    mode,
    startX: event.clientX,
    originalStart: task.start,
    originalEnd: task.end,
    lastDelta: 0,
    changed: false,
    historyStarted: false,
  };
  window.addEventListener('pointermove', onTaskDragMove);
  window.addEventListener('pointerup', onTaskDragEnd, { once: true });
}

function onTaskDragMove(event) {
  const drag = store.getState().interaction.taskDrag;
  if (!drag) return;
  const project = store.getState().project;
  const delta = Math.round((event.clientX - drag.startX) / project.view.dayWidth);
  if (delta === drag.lastDelta) return;
  drag.lastDelta = delta;
  const total = diffDays(project.view.start, project.view.end);
  const duration = diffDays(drag.originalStart, drag.originalEnd);
  let nextStart = drag.originalStart;
  let nextEnd = drag.originalEnd;
  if (drag.mode === 'move') {
    const minDelta = -diffDays(project.view.start, drag.originalStart);
    const maxDelta = total - diffDays(project.view.start, drag.originalEnd);
    const actual = clamp(delta, minDelta, maxDelta);
    nextStart = addDays(drag.originalStart, actual);
    nextEnd = addDays(drag.originalEnd, actual);
  } else {
    const minDelta = -duration;
    const maxDelta = total - diffDays(project.view.start, drag.originalEnd);
    nextEnd = addDays(drag.originalEnd, clamp(delta, minDelta, maxDelta));
  }
  const changed = nextStart !== drag.originalStart || nextEnd !== drag.originalEnd;
  if (!changed) return;
  store.commit((nextProject) => {
    const task = nextProject.tasks.find((item) => item.id === drag.taskId);
    task.start = nextStart;
    task.end = nextEnd;
  }, {
    history: !drag.historyStarted,
    persist: false,
    notify: false,
    reason: 'task-drag-live',
  });
  drag.historyStarted = true;
  drag.changed = true;
  view.renderTimeline();
}

function onTaskDragEnd() {
  window.removeEventListener('pointermove', onTaskDragMove);
  const interaction = store.getState().interaction;
  const drag = interaction.taskDrag;
  interaction.taskDrag = null;
  if (!drag) return;
  if (drag.changed) {
    store.persist();
    store.notify('task-drag');
    view.showToast(drag.mode === 'move' ? 'タスクの期間を移動しました' : '終了日を変更しました');
  } else {
    store.setSelectedTask(drag.taskId);
  }
}

function toggleVisibleSelection() {
  const ids = view.getVisibleTasks().map((task) => task.id);
  const selected = store.getState().bulkSelected;
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  store.setBulkSelected(all ? [] : ids);
}

function mutateBulk(mutator, message) {
  const ids = new Set(store.getState().bulkSelected);
  if (!ids.size) return;
  store.commit((project) => {
    mutator(project, ids);
    project.categories = [...new Set(['未分類', ...project.categories, ...project.tasks.map((task) => task.category)])];
  }, { reason: 'bulk-action' });
  store.clearBulk({ notify: false });
  view.renderApp('bulk-clear');
  view.showToast(message);
}

function openBulkPopover(button, type) {
  view.closeMenus();
  const selectedCount = store.getState().bulkSelected.size;
  if (!selectedCount) return;
  const popover = document.createElement('div');
  popover.id = 'bulk-popover';
  popover.className = 'bulk-popover';
  if (type === 'category') {
    const categories = [...new Set(['未分類', ...store.getState().project.categories])];
    popover.innerHTML = `<strong>カテゴリを付ける</strong>${categories.map((category) => `<button type="button" data-bulk-category="${category}">${category}</button>`).join('')}<div class="bulk-popover-new"><input id="bulk-new-category" placeholder="新しいカテゴリ"><button type="button" data-bulk-new-category>適用</button></div>`;
  } else {
    popover.innerHTML = `<strong>色を付ける</strong>${COLOR_OPTIONS.map(([value, label]) => `<button type="button" data-bulk-color="${value}"><span class="color-dot color-${value}"></span>${label}</button>`).join('')}`;
  }
  document.body.append(popover);
  const rect = button.getBoundingClientRect();
  const width = Math.min(240, window.innerWidth - 24);
  popover.style.width = `${width}px`;
  popover.style.left = `${Math.min(Math.max(12, rect.left), window.innerWidth - width - 12)}px`;
  popover.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - popover.offsetHeight - 12)}px`;
  button.setAttribute('aria-expanded', 'true');
}

function validateImport() {
  const raw = dom.jsonInput.value.trim();
  if (!raw) {
    dom.importResult.innerHTML = '<div class="import-error">JSONを貼り付けてください。</div>';
    dom.applyJSON.disabled = true;
    return;
  }
  try {
    const payload = JSON.parse(raw);
    lastImport = normalizeImportPayload(payload);
    renderImportResult(lastImport);
    dom.applyJSON.disabled = lastImport.errors.length > 0;
  } catch (error) {
    lastImport = null;
    dom.importResult.innerHTML = `<div class="import-error">JSONを解析できませんでした。${error.message}</div>`;
    dom.applyJSON.disabled = true;
  }
}

function renderImportResult(result) {
  const errors = result.errors.map((item) => `<li>${item}</li>`).join('');
  const warnings = result.warnings.map((item) => `<li>${item}</li>`).join('');
  dom.importResult.innerHTML = `
    ${errors ? `<div class="import-error"><strong>エラー</strong><ul>${errors}</ul></div>` : ''}
    ${warnings ? `<div class="import-warning"><strong>確認</strong><ul>${warnings}</ul></div>` : ''}
    <div class="import-summary"><strong>${result.tasks.length}件</strong>を反映できます。</div>
    ${result.tasks.slice(0, 8).map((task) => `<div class="import-preview-row"><span>${task.name}</span><small>${task.start}〜${task.end}</small></div>`).join('')}`;
}

function applyImport() {
  if (!lastImport || lastImport.errors.length) return;
  const mode = document.querySelector('input[name="import-mode"]:checked')?.value || 'append';
  store.commit((project) => {
    if (mode === 'replace') {
      project.tasks = lastImport.tasks;
      if (lastImport.title) project.title = lastImport.title;
    } else {
      project.tasks.push(...lastImport.tasks.map((task) => ({ ...task, id: uid('task') })));
    }
    project.categories = [...new Set(['未分類', ...project.categories, ...lastImport.categories, ...project.tasks.map((task) => task.category)])];
    extendViewToTasks(project, project.tasks, 2);
  }, { reason: 'import-json' });
  view.closeJSONModal();
  lastImport = null;
  view.showToast(`${mode === 'replace' ? '置き換え' : '追加'}でJSONを反映しました`);
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  view.showToast(message);
}

function buildAIPayload() {
  const project = store.getState().project;
  return {
    title: project.title,
    view: { start: project.view.start, end: project.view.end },
    tasks: project.tasks.map(({ id, ...task }) => task),
  };
}

function exportAction(type) {
  view.closeMenus();
  const project = store.getState().project;
  if (type === 'backup') return copyText(JSON.stringify(project, null, 2), '完全バックアップJSONをコピーしました');
  if (type === 'ai') return copyText(JSON.stringify(buildAIPayload(), null, 2), 'AI連携用JSONをコピーしました');
  const prompt = `以下の情報をガントチャート用JSONに整形してください。説明文やMarkdownは出力せず、JSONのみを返してください。\n\nルール\n- 日付はYYYY-MM-DD\n- colorはgray / blue / green / amber / red / purple\n- milestoneの場合はstartとendを同日にする\n\n現在のデータ\n${JSON.stringify(buildAIPayload(), null, 2)}`;
  return copyText(prompt, 'AI用プロンプトをコピーしました');
}

function fitRangeToTasks() {
  const tasks = store.getState().project.tasks;
  if (!tasks.length) return view.showToast('タスクがありません', true);
  const starts = tasks.map((task) => task.start).sort();
  const ends = tasks.map((task) => task.end || task.start).sort();
  store.commit((project) => {
    project.view.start = addDays(starts[0], -2);
    project.view.end = addDays(ends[ends.length - 1], 2);
  }, { reason: 'fit-range' });
}

function applyPreset(name) {
  const preset = PRESETS[name] || PRESETS.standard;
  store.commit((project) => {
    Object.assign(project.view, preset, { density: name });
  }, { reason: 'density-preset' });
  view.showToast(`${name === 'compact' ? '一覧' : name === 'ultra' ? '極小' : name === 'relaxed' ? 'ゆったり' : '標準'}表示にしました`);
}

function bindEvents() {
  dom.addTask.addEventListener('click', () => addTask(false));
  dom.addMilestone.addEventListener('click', () => addTask(true));
  dom.undo.addEventListener('click', () => { if (!store.undo()) view.showToast('元に戻せる操作がありません', true); });
  dom.redo.addEventListener('click', () => { if (!store.redo()) view.showToast('やり直せる操作がありません', true); });
  dom.today.addEventListener('click', scrollToToday);
  dom.timelineStart.addEventListener('change', applyViewDates);
  dom.timelineEnd.addEventListener('change', applyViewDates);
  dom.zoomRange.addEventListener('input', (event) => setZoom(event.target.value));
  document.querySelector('#zoom-out-btn')?.addEventListener('click', () => setZoom(store.getState().project.view.dayWidth - 2));
  document.querySelector('#zoom-in-btn')?.addEventListener('click', () => setZoom(store.getState().project.view.dayWidth + 2));
  dom.projectTitle.addEventListener('change', applyProjectTitle);
  dom.projectTitle.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); dom.projectTitle.blur(); } });
  dom.importButton.addEventListener('click', view.openJSONModal);
  dom.exportButton.addEventListener('click', () => view.toggleMenu(dom.exportMenu, dom.exportButton));
  dom.moreButton.addEventListener('click', () => view.toggleMenu(dom.moreMenu, dom.moreButton));

  dom.exportMenu.addEventListener('click', (event) => {
    const item = event.target.closest('[data-export]');
    if (item) exportAction(item.dataset.export);
  });
  dom.toggleCompleted.addEventListener('click', () => {
    view.closeMenus();
    store.commit((project) => { project.view.showCompleted = !project.view.showCompleted; }, { reason: 'toggle-completed' });
  });
  dom.resetProject.addEventListener('click', () => {
    view.closeMenus();
    if (!window.confirm('現在のプロジェクトを初期化しますか？')) return;
    const title = store.getState().project.title;
    store.replaceProject(createProject({ title }), 'reset-project');
    view.showToast('プロジェクトを初期化しました');
  });
  dom.loadSample.addEventListener('click', async () => {
    view.closeMenus();
    try {
      const response = await fetch('samples/sample-project.json');
      if (!response.ok) throw new Error('サンプルを読み込めませんでした');
      const sample = await response.json();
      view.openJSONModal();
      dom.jsonInput.value = JSON.stringify(sample, null, 2);
      document.querySelector('input[name="import-mode"][value="replace"]').checked = true;
      validateImport();
    } catch (error) {
      view.showToast(error.message, true);
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.menu-wrap, #bulk-popover')) view.closeMenus();
    const close = event.target.closest('[data-close-modal="json"]');
    if (close) view.closeJSONModal();
  });

  dom.taskList.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-row-resize-handle]');
    if (handle) beginRowResize(event, handle);
  }, true);
  dom.taskList.addEventListener('dblclick', (event) => {
    if (event.target.closest('[data-row-resize-handle]')) resetRowHeight(event);
  }, true);
  dom.taskList.addEventListener('click', (event) => {
    const state = store.getState();
    if (event.target.closest('[data-row-resize-handle]')) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (performance.now() < state.interaction.suppressRowClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const empty = event.target.closest('[data-empty-action]');
    if (empty) {
      empty.dataset.emptyAction === 'task' ? addTask(false) : view.openJSONModal();
      return;
    }
    const checkbox = event.target.closest('.bulk-checkbox');
    if (checkbox) {
      event.stopPropagation();
      const row = checkbox.closest('.task-row');
      const next = new Set(state.bulkSelected);
      checkbox.checked ? next.add(row.dataset.taskId) : next.delete(row.dataset.taskId);
      store.setBulkSelected(next);
      return;
    }
    if (event.target.closest('button, input, select, textarea, a, label')) return;
    const row = event.target.closest('.task-row');
    if (row) store.setSelectedTask(row.dataset.taskId);
  });
  dom.taskList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest('[data-row-resize-handle], input, button')) return;
    const row = event.target.closest('.task-row');
    if (row) {
      event.preventDefault();
      store.setSelectedTask(row.dataset.taskId);
    }
  });

  document.querySelector('#bulk-select-all')?.addEventListener('change', toggleVisibleSelection);
  document.addEventListener('click', (event) => {
    if (event.target.closest('#bulk-clear-selection')) store.clearBulk();
    if (event.target.closest('#bulk-category-menu-btn')) openBulkPopover(event.target.closest('#bulk-category-menu-btn'), 'category');
    if (event.target.closest('#bulk-color-menu-btn')) openBulkPopover(event.target.closest('#bulk-color-menu-btn'), 'color');
    if (event.target.closest('#bulk-complete')) {
      const count = store.getState().bulkSelected.size;
      mutateBulk((project, ids) => project.tasks.forEach((task) => { if (ids.has(task.id)) task.completed = true; }), `${count}件を完了にしました`);
    }
    if (event.target.closest('#bulk-incomplete')) {
      const count = store.getState().bulkSelected.size;
      mutateBulk((project, ids) => project.tasks.forEach((task) => { if (ids.has(task.id)) task.completed = false; }), `${count}件を未完了にしました`);
    }
    if (event.target.closest('#bulk-delete')) {
      const count = store.getState().bulkSelected.size;
      if (count && window.confirm(`${count}件のタスクを削除しますか？`)) mutateBulk((project, ids) => { project.tasks = project.tasks.filter((task) => !ids.has(task.id)); }, `${count}件を削除しました`);
    }
    const category = event.target.closest('[data-bulk-category]');
    if (category) {
      const count = store.getState().bulkSelected.size;
      mutateBulk((project, ids) => project.tasks.forEach((task) => { if (ids.has(task.id)) task.category = category.dataset.bulkCategory; }), `${count}件に「${category.dataset.bulkCategory}」を付けました`);
    }
    const color = event.target.closest('[data-bulk-color]');
    if (color) {
      const count = store.getState().bulkSelected.size;
      mutateBulk((project, ids) => project.tasks.forEach((task) => { if (ids.has(task.id)) task.color = color.dataset.bulkColor; }), `${count}件の色を変更しました`);
    }
    if (event.target.closest('[data-bulk-new-category]')) {
      const input = document.querySelector('#bulk-new-category');
      const value = input?.value.trim();
      if (value) {
        const count = store.getState().bulkSelected.size;
        mutateBulk((project, ids) => project.tasks.forEach((task) => { if (ids.has(task.id)) task.category = value; }), `${count}件に「${value}」を付けました`);
      }
    }
  });

  dom.timelineCanvas.addEventListener('pointerdown', beginTaskDrag);
  dom.paneResizer.addEventListener('pointerdown', beginPaneResize, true);
  dom.closeInspector.addEventListener('click', () => store.setSelectedTask(null));
  dom.inspectorBackdrop.addEventListener('click', () => store.setSelectedTask(null));
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
    if (!file) return;
    dom.jsonInput.value = await file.text();
    validateImport();
  });
  ['dragenter', 'dragover'].forEach((name) => dom.jsonDropZone.addEventListener(name, (event) => { event.preventDefault(); dom.jsonDropZone.classList.add('is-dragging'); }));
  ['dragleave', 'drop'].forEach((name) => dom.jsonDropZone.addEventListener(name, (event) => { event.preventDefault(); dom.jsonDropZone.classList.remove('is-dragging'); }));
  dom.jsonDropZone.addEventListener('drop', async (event) => {
    const [file] = event.dataTransfer.files;
    if (file) {
      dom.jsonInput.value = await file.text();
      validateImport();
    }
  });
  dom.validateJSON.addEventListener('click', validateImport);
  dom.applyJSON.addEventListener('click', applyImport);

  document.querySelector('#display-settings-btn')?.addEventListener('click', () => {
    const panel = document.querySelector('#display-settings-panel');
    panel.hidden = !panel.hidden;
    document.querySelector('#display-settings-btn').setAttribute('aria-expanded', String(!panel.hidden));
  });
  document.querySelector('#display-panel-close')?.addEventListener('click', () => {
    document.querySelector('#display-settings-panel').hidden = true;
    document.querySelector('#display-settings-btn').setAttribute('aria-expanded', 'false');
  });
  document.querySelector('#display-compact-btn')?.addEventListener('click', () => applyPreset('ultra'));
  document.querySelectorAll('[data-density-preset]').forEach((button) => button.addEventListener('click', () => applyPreset(button.dataset.densityPreset)));
  document.querySelector('#row-height-slider')?.addEventListener('input', (event) => view.applyLiveRowHeight(event.target.value));
  document.querySelector('#row-height-slider')?.addEventListener('change', (event) => {
    const value = clamp(event.target.value, 18, 72);
    store.commit((project) => { project.view.rowHeight = value; project.view.density = value <= 22 ? 'ultra' : 'custom'; }, { reason: 'row-height-slider' });
  });
  document.querySelector('#day-width-slider')?.addEventListener('input', (event) => setZoom(event.target.value));
  document.querySelector('#panel-width-slider')?.addEventListener('input', (event) => view.applyLivePanelWidth(event.target.value));
  document.querySelector('#panel-width-slider')?.addEventListener('change', (event) => {
    store.commit((project) => { project.view.panelWidth = clamp(event.target.value, 320, 920); }, { reason: 'panel-width-slider' });
  });
  document.querySelectorAll('[data-category-mode]').forEach((button) => button.addEventListener('click', () => {
    store.commit((project) => { project.view.categoryMode = button.dataset.categoryMode; }, { reason: 'category-mode' });
  }));
  document.querySelector('#fit-tasks-range-btn')?.addEventListener('click', fitRangeToTasks);
  document.querySelector('#reset-density-btn')?.addEventListener('click', () => applyPreset('standard'));

  dom.timelineScroll.addEventListener('scroll', () => {
    if (syncingScroll) return;
    syncingScroll = true;
    dom.taskScroll.scrollTop = dom.timelineScroll.scrollTop;
    requestAnimationFrame(() => { syncingScroll = false; });
  });
  dom.taskScroll.addEventListener('scroll', () => {
    if (syncingScroll) return;
    syncingScroll = true;
    dom.timelineScroll.scrollTop = dom.taskScroll.scrollTop;
    requestAnimationFrame(() => { syncingScroll = false; });
  });

  window.addEventListener('keydown', (event) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if ((event.ctrlKey || event.metaKey) && !typing && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? store.redo() : store.undo();
    }
    if (event.key === 'Escape') {
      view.closeMenus();
      if (!dom.jsonModal.hidden) view.closeJSONModal();
      else if (store.getState().selectedTaskId) store.setSelectedTask(null);
    }
  });
  window.addEventListener('resize', () => {
    view.applyLivePanelWidth(store.getState().project.view.panelWidth);
    view.renderTimeline();
  });
  window.addEventListener('beforeunload', store.persist);
}

store.subscribe((_, reason) => view.renderApp(reason));
bindEvents();
view.renderApp('initialize');
store.persist();
window.GANTT_DESK_STORE = store;
