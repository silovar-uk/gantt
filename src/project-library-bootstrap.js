(() => {
  const LEGACY_KEY = 'gantt-desk:v2:project';
  const INDEX_KEY = 'gantt-desk:v3:projects';
  const ACTIVE_KEY = 'gantt-desk:v3:active-project-id';
  const PROJECT_PREFIX = 'gantt-desk:v3:project:';

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const uid = () => window.crypto?.randomUUID ? `project-${window.crypto.randomUUID()}` : `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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

  function nowISO() { return new Date().toISOString(); }

  function compactProject(project) {
    return {
      id: project.id,
      title: String(project.title || '新しいガント'),
      updatedAt: project.updatedAt || nowISO(),
      createdAt: project.createdAt || project.updatedAt || nowISO(),
      taskCount: Array.isArray(project.tasks) ? project.tasks.length : 0,
    };
  }

  function ensureProjectShape(project) {
    const next = clone(project || {});
    next.id = String(next.id || uid());
    next.title = String(next.title || '新しいガント');
    next.tasks = Array.isArray(next.tasks) ? next.tasks : [];
    next.categories = Array.isArray(next.categories) ? next.categories : ['未分類'];
    next.view = next.view && typeof next.view === 'object' ? next.view : {};
    next.createdAt = next.createdAt || nowISO();
    next.updatedAt = next.updatedAt || nowISO();
    return next;
  }

  function migrateSingleProject() {
    const index = readJSON(INDEX_KEY, []);
    if (Array.isArray(index) && index.length) return;

    const legacy = readJSON(LEGACY_KEY, null);
    if (!legacy) return;

    const project = ensureProjectShape(legacy);
    writeJSON(`${PROJECT_PREFIX}${project.id}`, project);
    writeJSON(INDEX_KEY, [compactProject(project)]);
    localStorage.setItem(ACTIVE_KEY, project.id);
    writeJSON(LEGACY_KEY, project);
  }

  function loadActiveIntoLegacy() {
    const index = readJSON(INDEX_KEY, []);
    if (!Array.isArray(index) || !index.length) return;
    let activeId = localStorage.getItem(ACTIVE_KEY);
    if (!activeId || !index.some((item) => item.id === activeId)) {
      activeId = index.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0].id;
      localStorage.setItem(ACTIVE_KEY, activeId);
    }
    const active = readJSON(`${PROJECT_PREFIX}${activeId}`, null);
    if (active) writeJSON(LEGACY_KEY, ensureProjectShape(active));
  }

  migrateSingleProject();
  loadActiveIntoLegacy();
})();
