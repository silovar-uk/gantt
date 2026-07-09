(() => {
  const DISPLAY_KEY = 'gantt-desk:v4:display-settings';
  const PROJECT_KEY = 'gantt-desk:v2:project';
  const COLORS = {
    gray: '#cbd5e1', blue: '#bfdbfe', green: '#bbf7d0', amber: '#fde68a', red: '#fecdd3', purple: '#e9d5ff',
  };
  const LABELS = { show: '表示', color: '色だけ', hide: '非表示' };
  const $ = (selector) => document.querySelector(selector);
  let retryCount = 0;
  let annotateTimer = null;

  function readSettings() {
    try { return { categoryMode: 'show', ...(JSON.parse(localStorage.getItem(DISPLAY_KEY)) || {}) }; }
    catch { return { categoryMode: 'show' }; }
  }

  function writeSettings(settings) {
    try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(settings)); } catch {}
  }

  function readProject() {
    try { return JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}'); }
    catch { return {}; }
  }

  function mode() {
    const value = readSettings().categoryMode;
    return ['show', 'color', 'hide'].includes(value) ? value : 'show';
  }

  function addStyles() {
    if ($('#category-display-style')) return;
    const style = document.createElement('style');
    style.id = 'category-display-style';
    style.textContent = `
      .category-mode-row { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
      .category-mode-button { min-height:38px; padding:7px 8px; border:1px solid #d7e0eb; border-radius:9px; color:#475569; background:#fff; font-size:12px; font-weight:850; cursor:pointer; }
      .category-mode-button:hover { background:#f8fafc; border-color:#a9b8c9; }
      .category-mode-button.is-active { color:#244a8f; border-color:#87a4d5; background:#eef4ff; box-shadow:inset 0 0 0 1px rgba(36,74,143,.08); }
      .category-mode-help { margin:8px 0 0; color:#64748b; font-size:11px; line-height:1.45; }

      body.gantt-category-color .category-cell { justify-content:center; }
      body.gantt-category-color .task-category {
        width:14px; height:14px; min-width:14px; padding:0; overflow:hidden;
        border:1px solid rgba(15,23,42,.12); border-radius:999px;
        background:var(--task-color-fill, #cbd5e1) !important;
        color:transparent; font-size:0;
      }
      body.gantt-category-color .task-panel-head > div:nth-child(2) { justify-content:center; font-size:0; }
      body.gantt-category-color .task-panel-head > div:nth-child(2)::after { content:'色'; color:#64748b; font-size:10px; font-weight:800; }

      body.gantt-category-hide .category-cell,
      body.gantt-category-hide .task-panel-head > div:nth-child(2) { display:none; }
      body.gantt-category-hide .task-panel-head,
      body.gantt-category-hide .task-row { grid-template-columns:minmax(190px,1.9fr) 88px 88px; }
      body.gantt-category-hide.gantt-density-compact .task-panel-head,
      body.gantt-category-hide.gantt-density-compact .task-row { grid-template-columns:minmax(170px,1.9fr) 72px; }
    `;
    document.head.append(style);
  }

  function injectControls() {
    const panel = $('#display-settings-panel');
    if (!panel) return false;
    if ($('#category-mode-controls')) return true;
    const section = document.createElement('div');
    section.id = 'category-mode-controls';
    section.className = 'display-panel__section';
    section.innerHTML = `
      <div class="display-panel__label"><span>カテゴリ表示</span><span id="category-mode-current" class="display-panel__value"></span></div>
      <div class="category-mode-row">
        <button class="category-mode-button" type="button" data-category-mode="show">表示</button>
        <button class="category-mode-button" type="button" data-category-mode="color">色だけ</button>
        <button class="category-mode-button" type="button" data-category-mode="hide">非表示</button>
      </div>
      <p class="category-mode-help">最小表示や共有前は「色だけ」「非表示」にすると、横幅を詰めやすくなります。</p>`;
    const quick = panel.querySelector('.display-panel__quick');
    if (quick) quick.insertAdjacentElement('beforebegin', section);
    else panel.append(section);
    section.querySelectorAll('[data-category-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const next = { ...readSettings(), categoryMode: button.dataset.categoryMode };
        writeSettings(next);
        apply({ annotate: true });
      });
    });
    return true;
  }

  function setBodyClass(currentMode) {
    document.body.classList.toggle('gantt-category-show', currentMode === 'show');
    document.body.classList.toggle('gantt-category-color', currentMode === 'color');
    document.body.classList.toggle('gantt-category-hide', currentMode === 'hide');
  }

  function syncControls(currentMode) {
    document.querySelectorAll('[data-category-mode]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.categoryMode === currentMode);
    });
    const current = $('#category-mode-current');
    if (current) current.textContent = LABELS[currentMode] || LABELS.show;
  }

  function annotateRows() {
    const project = readProject();
    const tasks = new Map((project.tasks || []).map((task) => [String(task.id), task]));
    document.querySelectorAll('#task-list .task-row').forEach((row) => {
      const task = tasks.get(String(row.dataset.taskId || ''));
      if (!task) return;
      const color = COLORS[task.color] || COLORS.gray;
      const current = row.style.getPropertyValue('--task-color-fill');
      if (current !== color) row.style.setProperty('--task-color-fill', color);
      const category = row.querySelector('.task-category');
      if (category) category.title = String(task.category || '未分類');
    });
  }

  function scheduleAnnotate(delay = 160) {
    clearTimeout(annotateTimer);
    annotateTimer = setTimeout(annotateRows, delay);
  }

  function apply({ annotate = false } = {}) {
    const currentMode = mode();
    setBodyClass(currentMode);
    syncControls(currentMode);
    if (annotate || currentMode === 'color') scheduleAnnotate();
  }

  function waitForPanel() {
    if (injectControls()) {
      apply({ annotate: true });
      scheduleAnnotate(500);
      return;
    }
    if (retryCount < 40) {
      retryCount += 1;
      setTimeout(waitForPanel, 120);
    }
  }

  function bindEvents() {
    window.addEventListener('storage', (event) => {
      if (event.key === DISPLAY_KEY || event.key === PROJECT_KEY) apply({ annotate: true });
    });
    document.addEventListener('click', (event) => {
      if (event.target.closest('#add-task-btn, #add-milestone-btn, #apply-json-btn, #load-sample-btn, #reset-project-btn')) {
        scheduleAnnotate(700);
      }
    });
  }

  function initialize() {
    addStyles();
    waitForPanel();
    bindEvents();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
