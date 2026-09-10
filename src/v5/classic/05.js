const paletteLabels = {
  slate: 'グレー', indigo: 'インディゴ', emerald: 'グリーン', amber: 'アンバー', rose: 'ローズ', violet: 'バイオレット', cyan: 'シアン', orange: 'オレンジ',
};

const app = document.querySelector('#app');
let saveQueue = Promise.resolve();
let toastTimer = null;
let titleSaveTimer = null;
let resizeTimer = null;

const state = {
  project: null,
  storage: null,
  selectedTaskId: null,
  history: [],
  future: [],
  ui: {
    search: '', searchNotes: false, thisWeek: false, incomplete: false, overdue: false,
    includeHidden: false, categoryIds: new Set(), sort: 'manual', viewNotice: '',
  },
  saveStatus: 'loading',
  saveError: '',
  conflict: false,
  migration: null,
  modal: null,
  editor: null,
  moveDraft: null,
  inputDraft: null,
  outputSession: null,
  importRaw: '',
  importPreview: null,
};

function breakpoint() {
  if (innerWidth <= 767) return 'mobile';
  if (innerWidth <= 1199) return 'tablet';
  return 'desktop';
}

function effectiveMode() {
  const bp = breakpoint();
  const stored = state.project.viewSettings.modeByBreakpoint?.[bp];
  if (bp === 'mobile') return stored === 'gantt' ? 'gantt' : 'list';
  return ['split', 'list', 'gantt'].includes(stored) ? stored : 'split';
}

function setView(patch) {
  Object.assign(state.project.viewSettings, patch);
  state.storage.saveView(state.project.viewSettings);
  renderWorkspace();
  renderToolbarState();
}

function setMode(mode) {
  const bp = breakpoint();
  const allowed = bp === 'mobile' ? ['list', 'gantt'] : ['split', 'list', 'gantt'];
  if (!allowed.includes(mode)) return;
  state.project.viewSettings.modeByBreakpoint = { ...state.project.viewSettings.modeByBreakpoint, [bp]: mode };
  state.project.viewSettings.mode = mode;
  state.storage.saveView(state.project.viewSettings);
  renderWorkspace();
  renderToolbarState();
}

function pushHistory(snapshot) {
  state.history.push(deepCopy(snapshot));
  state.future = [];
  while (state.history.length > 50) state.history.shift();
  let size = 0;
  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    size += JSON.stringify(state.history[index]).length * 2;
    if (size > 20 * 1024 * 1024 && state.history.length > 1) {
      state.history.splice(0, index + 1);
      break;
    }
  }
}

function contentCommit(mutator, { reason = 'change', message = '' } = {}) {
  if (state.conflict) {
    showToast('別のタブで更新されています。保存済み内容を確認してください。', true);
    return false;
  }
  const before = deepCopy(state.project);
  pushHistory(before);
  mutator(state.project);
  state.project.tasks.forEach((task, index) => { task.order = index; });
  state.project.categories.forEach((category, index) => { category.order = index; });
  const expectedRevision = Number(before.revision || 0);
  state.project.revision = expectedRevision + 1;
  state.project.updatedAt = new Date().toISOString();
  queueSave(deepCopy(state.project), expectedRevision);
  renderAll();
  if (message) showToast(message);
  document.dispatchEvent(new CustomEvent('gantt-desk:v5-change', { detail: { reason, revision: state.project.revision } }));
  return true;
}

function queueSave(snapshot, expectedRevision) {
  state.saveStatus = 'saving';
  state.saveError = '';
  renderSaveStatus();
  saveQueue = saveQueue
    .then(async () => {
      if (state.conflict) return;
      await state.storage.save(snapshot, expectedRevision);
      state.saveStatus = 'saved';
      renderSaveStatus();
    })
    .catch((error) => {
      if (error instanceof ConflictError) {
        state.conflict = true;
        state.saveStatus = 'conflict';
        state.saveError = error.message;
        renderAll();
        return;
      }
      state.saveStatus = 'error';
      state.saveError = String(error?.message || error);
      renderSaveStatus();
    });
}

function undo() {
  const previous = state.history.pop();
  if (!previous || state.conflict) return;
  const current = deepCopy(state.project);
  state.future.push(current);
  const viewSettings = deepCopy(state.project.viewSettings);
  const expectedRevision = state.project.revision;
  state.project = deepCopy(previous);
  state.project.viewSettings = viewSettings;
  state.project.revision = expectedRevision + 1;
  state.project.updatedAt = new Date().toISOString();
  state.selectedTaskId = null;
  queueSave(deepCopy(state.project), expectedRevision);
  renderAll();
  showToast('元に戻しました');
}

function redo() {
  const next = state.future.pop();
  if (!next || state.conflict) return;
  state.history.push(deepCopy(state.project));
  const viewSettings = deepCopy(state.project.viewSettings);
  const expectedRevision = state.project.revision;
  state.project = deepCopy(next);
  state.project.viewSettings = viewSettings;
  state.project.revision = expectedRevision + 1;
  state.project.updatedAt = new Date().toISOString();
  state.selectedTaskId = null;
  queueSave(deepCopy(state.project), expectedRevision);
  renderAll();
  showToast('やり直しました');
}

function showToast(message, isError = false) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => { toast.hidden = true; }, 160);
  }, 3000);
}

function closeMenus() {
  document.querySelectorAll('[data-menu-panel]').forEach((panel) => { panel.hidden = true; });
  document.querySelectorAll('[aria-expanded="true"]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
}

function filteredTasks() {
  return sortAndFilterTasks(state.project, state.ui);
}

function selectedTask() {
  return state.project.tasks.find((task) => task.id === state.selectedTaskId) || null;
}

function categoryById(id) {
  return state.project.categories.find((category) => category.id === id) || state.project.categories[0];
}

function statusText() {
  if (state.saveStatus === 'loading') return '読み込み中';
  if (state.saveStatus === 'saving') return '保存中';
  if (state.saveStatus === 'error') return '未保存の変更があります';
  if (state.saveStatus === 'conflict') return '別のタブで更新されています';
  const date = new Date(state.project.updatedAt || Date.now());
  return `このブラウザに保存済み · ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function shellHTML() {
  return `
    <div class="app-shell">
      <header class="app-header">
        <div class="topbar">
          <div class="brand-area">
            <button class="app-mark" type="button" data-action="project-settings" aria-label="プロジェクト設定">G</button>
            <button id="project-title-button" class="project-title-button" type="button" data-action="project-settings"></button>
          </div>
          <div class="top-actions">
            <button id="save-status" class="save-pill" type="button" data-action="save-status"></button>
            <button class="icon-button" type="button" data-action="undo" aria-label="元に戻す" title="元に戻す (Ctrl/⌘+Z)">↶</button>
            <button class="icon-button" type="button" data-action="redo" aria-label="やり直す" title="やり直す (Ctrl/⌘+Shift+Z)">↷</button>
            <div class="menu-wrap">
              <button class="button button-secondary" type="button" data-toggle-menu="io-menu" aria-expanded="false">入出力 <span aria-hidden="true">⌄</span></button>
              <div id="io-menu" class="popup-menu popup-menu-right" data-menu-panel hidden>
                <button type="button" data-action="chat-input"><span>文章 → 予定</span><small>ChatGPTで整理</small></button>
                <button type="button" data-action="chat-output"><span>予定 → 文章</span><small>報告・TSVなど</small></button>
                <button type="button" data-action="import"><span>JSON／回答を取り込む</span><small>検証してから反映</small></button>
                <button type="button" data-action="export"><span>書き出し・復元</span><small>JSON・TSV・XLSX</small></button>
              </div>
            </div>
          </div>
        </div>
        <div class="toolbar">
          <button class="button button-primary add-button" type="button" data-action="add">＋ 予定を追加</button>
          <label class="search-box"><span aria-hidden="true">⌕</span><input id="search-input" type="search" placeholder="予定・カテゴリーを検索" autocomplete="off"></label>
          <button class="button button-secondary" type="button" data-action="filter">絞り込み <span id="filter-count" class="count-badge" hidden></span></button>
          <span class="toolbar-spacer"></span>
          <button class="button button-quiet" type="button" data-action="today">今日</button>
          <button class="button button-quiet" type="button" data-action="fit">全体</button>
          <div id="scale-switch" class="segmented" aria-label="表示倍率">
            <button type="button" data-scale="day">日</button><button type="button" data-scale="week">週</button><button type="button" data-scale="month">月</button>
          </div>
          <div id="mode-switch" class="segmented" aria-label="表示モード">
            <button type="button" data-mode="list">一覧</button><button type="button" data-mode="split">分割</button><button type="button" data-mode="gantt">ガント</button>
          </div>
          <button class="icon-button" type="button" data-action="display-settings" aria-label="表示設定" title="表示設定">⚙</button>
        </div>
        <div id="condition-bar" class="condition-bar" hidden></div>
        <div id="conflict-banner" class="conflict-banner" hidden></div>
      </header>
      <main id="workspace" class="workspace"></main>
    </div>
    <div id="modal-root"></div>
    <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  `;
}

function renderHeader() {
  const title = document.querySelector('#project-title-button');
  if (title) title.textContent = state.project.title;
  renderSaveStatus();
  const undoButton = document.querySelector('[data-action="undo"]');
  const redoButton = document.querySelector('[data-action="redo"]');
  if (undoButton) undoButton.disabled = !state.history.length || state.conflict;
  if (redoButton) redoButton.disabled = !state.future.length || state.conflict;
  renderConflictBanner();
}

function renderSaveStatus() {
  const button = document.querySelector('#save-status');
  if (!button || !state.project) return;
  button.textContent = statusText();
  button.dataset.state = state.saveStatus;
  button.title = state.saveError || '';
}

function activeFilterCount() {
  return [state.ui.thisWeek, state.ui.incomplete, state.ui.overdue, state.ui.includeHidden, state.ui.searchNotes].filter(Boolean).length + state.ui.categoryIds.size + (state.ui.sort !== 'manual' ? 1 : 0);
}

function renderToolbarState() {
  const search = document.querySelector('#search-input');
  if (search && document.activeElement !== search) search.value = state.ui.search;
  const count = activeFilterCount();
  const badge = document.querySelector('#filter-count');
  if (badge) {
    badge.hidden = count === 0;
    badge.textContent = String(count);
  }
  document.querySelectorAll('[data-scale]').forEach((button) => button.classList.toggle('is-active', button.dataset.scale === state.project.viewSettings.scale));
  const mode = effectiveMode();
  document.querySelectorAll('[data-mode]').forEach((button) => {
    const mobileInvalid = breakpoint() === 'mobile' && button.dataset.mode === 'split';
    button.hidden = mobileInvalid;
    button.classList.toggle('is-active', button.dataset.mode === mode);
  });
  renderConditionBar();
}
