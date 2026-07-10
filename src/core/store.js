import { STORAGE_KEY, createProject, deepCopy } from './project.js';

const INDEX_KEY = 'gantt-desk:v3:projects';
const ACTIVE_KEY = 'gantt-desk:v3:active-project-id';
const PROJECT_PREFIX = 'gantt-desk:v3:project:';

function readJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function syncProjectLibrary(project) {
  const activeId = localStorage.getItem(ACTIVE_KEY);
  if (!activeId) return;
  const synced = deepCopy(project);
  synced.id = activeId;
  const existing = readJSON(`${PROJECT_PREFIX}${activeId}`, null);
  synced.createdAt = existing?.createdAt || synced.createdAt || synced.updatedAt;
  writeJSON(`${PROJECT_PREFIX}${activeId}`, synced);
  const index = readJSON(INDEX_KEY, []);
  const nextIndex = Array.isArray(index) ? index : [];
  const summary = {
    id: activeId,
    title: synced.title,
    updatedAt: synced.updatedAt,
    createdAt: synced.createdAt,
    taskCount: synced.tasks.length,
  };
  const at = nextIndex.findIndex((item) => item.id === activeId);
  if (at >= 0) nextIndex[at] = summary;
  else nextIndex.unshift(summary);
  nextIndex.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  writeJSON(INDEX_KEY, nextIndex);
}

export function createStore(initialProject) {
  const listeners = new Set();
  const state = {
    project: createProject(initialProject),
    selectedTaskId: null,
    bulkSelected: new Set(),
    history: [],
    future: [],
    interaction: {
      rowResize: null,
      paneResize: null,
      taskDrag: null,
      suppressRowClickUntil: 0,
    },
  };

  function notify(reason = 'update') {
    listeners.forEach((listener) => listener(state, reason));
    document.dispatchEvent(new CustomEvent('gantt-desk:rendered', {
      detail: {
        source: reason,
        taskCount: state.project.tasks.length,
        rowHeight: state.project.view.rowHeight,
        dayWidth: state.project.view.dayWidth,
        panelWidth: state.project.view.panelWidth,
      },
    }));
  }

  function persist() {
    state.project.updatedAt = new Date().toISOString();
    writeJSON(STORAGE_KEY, state.project);
    syncProjectLibrary(state.project);
  }

  function pushHistory() {
    state.history.push(deepCopy(state.project));
    if (state.history.length > 80) state.history.shift();
    state.future = [];
  }

  function commit(mutator, { history = true, persist: shouldPersist = true, notify: shouldNotify = true, reason = 'commit' } = {}) {
    if (history) pushHistory();
    mutator(state.project, state);
    state.project = createProject(state.project);
    if (shouldPersist) persist();
    if (shouldNotify) notify(reason);
  }

  function replaceProject(project, reason = 'replace-project') {
    pushHistory();
    state.project = createProject(project);
    state.selectedTaskId = null;
    state.bulkSelected.clear();
    persist();
    notify(reason);
  }

  function undo() {
    const previous = state.history.pop();
    if (!previous) return false;
    state.future.push(deepCopy(state.project));
    state.project = createProject(previous);
    state.selectedTaskId = null;
    state.bulkSelected.clear();
    persist();
    notify('undo');
    return true;
  }

  function redo() {
    const next = state.future.pop();
    if (!next) return false;
    state.history.push(deepCopy(state.project));
    state.project = createProject(next);
    state.selectedTaskId = null;
    state.bulkSelected.clear();
    persist();
    notify('redo');
    return true;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify,
    persist,
    commit,
    replaceProject,
    undo,
    redo,
    setSelectedTask(taskId, { notify: shouldNotify = true } = {}) {
      state.selectedTaskId = taskId || null;
      if (shouldNotify) notify('select-task');
    },
    setBulkSelected(ids, { notify: shouldNotify = true } = {}) {
      state.bulkSelected = new Set(ids);
      if (shouldNotify) notify('bulk-selection');
    },
    clearBulk({ notify: shouldNotify = true } = {}) {
      state.bulkSelected.clear();
      if (shouldNotify) notify('bulk-clear');
    },
  };
}
