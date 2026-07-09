(() => {
  const DISPLAY_KEY = 'gantt-desk:v4:display-settings';
  const PROJECT_KEY = 'gantt-desk:v2:project';
  const COLORS = {
    gray: '#cbd5e1', blue: '#bfdbfe', green: '#bbf7d0', amber: '#fde68a', red: '#fecdd3', purple: '#e9d5ff',
  };
  const $ = (selector) => document.querySelector(selector);
  const readSettings = () => {
    try { return { categoryMode: 'show', ...(JSON.parse(localStorage.getItem(DISPLAY_KEY)) || {}) }; }
    catch { return { categoryMode: 'show' }; }
  };
  const writeSettings = (settings) => localStorage.setItem(DISPLAY_KEY, JSON.stringify(settings));
  let settings = readSettings();

  function getProject() {
    try { return JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}'); }
    catch { return {}; }
  }

  function addStyles() {
    if ($('#category-display-style')) return;
    const style = document.createElement('style');
    style.id = 'category-display-style';
    style.textContent = `
      .category-mode-row { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
      .category-mode-button { min-height:38px; padding:7px 8px; border:1px solid #d7e0eb; border-radius:9px; color:#475569; background:#fff; font-size:12px; font-weight:850; }
      .category-mode-button.is-active { color:#244a8f; border-color:#87a4d5; background:#eef4ff; box-shadow:inset 0 0 0 1px rgba(36,74,143,.08); }
      .category-mode-help { margin:8px 0 0; color:#64748b; font-size:11px; line-height:1.45; }

      body.gantt-category-color .category-cell { justify-content:center; }
      body.gantt-category-color .task-category {
        width:14px;
        height:14px;
        min-width:14px;
        padding:0;
        overflow:hidden;
        border:1px solid rgba(15,23,42,.12);
        border-radius:999px;
        background:var(--task-color-fill, #cbd5e1) !important;
        color:transparent;
        font-size:0;
      }
      body.gantt-category-color .task-panel-head > div:nth-child(2) { justify-content:center; font-size:0; }
      body.gantt-category-color .task-panel-head > div:nth-child(2)::after { content:'色'; color:#64748b; font-size:10px; font-weight:800; }

      body.gantt-category-hide .category-cell,
      body.gantt-category-hide .task-panel-head > div:nth-child(2) { display:none; }
      body.gantt-category-hide .task-panel-head,
      body.gantt-category-hide .task-row { grid-template-columns:minmax(190px, 1.9fr) 88px 88px; }
      body.gantt-category-hide.gantt-density-compact .task-panel-head,
      body.gantt-category-hide.gantt-density-compact .task-row { grid-template-columns:minmax(170px, 1.9fr) 72px; }
    `;
    document.head.append(style);
  }

  function setBodyClass() {
    document.body.classList.toggle('gantt-category-show', settings.categoryMode === 'show');
    document.body.classList.toggle('gantt-category-color', settings.categoryMode === 'color');
    document.body.classList.toggle('gantt-category-hide', settings.categoryMode === 'hide');
  }

  function annotateRows() {
    const project = getProject();
    const tasks = new Map((project.tasks || []).map((task) => [String(task.id), task]));
    document.querySelectorAll('#task-list .task-row').forEach((row) => {
      const task = tasks.get(row.dataset.taskId);
      if (!task) return;
      const color = COLORS[task.color] || COLORS.gray;
      row.style.setProperty('--task-color-fill', color);
      row.querySelector('.task-category')?.setAttribute('title', String(task.category || '未分類'));
    });
  }

  function injectControls() {
    const panel = $('#display-settings-panel');
    if (!panel || $('#category-mode-controls')) return;
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
      <p class="category-mode-help">最小表示や共有前は「色だけ」「非表示」にすると、縦横どちらも詰めやすくなります。</p>`;
    const quick = panel.querySelector('.display-panel__quick');
    if (quick) quick.insertAdjacentElement('beforebegin', section);
    else panel.append(section);

    section.querySelectorAll('[data-category-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        settings = { ...readSettings(), categoryMode: button.dataset.categoryMode };
        writeSettings(settings);
        apply();
      });
    });
    syncControls();
  }

  function syncControls() {
    const labels = { show: '表示', color: '色だけ', hide: '非表示' };
    document.querySelectorAll('[data-category-mode]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.categoryMode === settings.categoryMode);
    });
    const current = $('#category-mode-current');
    if (current) current.textContent = labels[settings.categoryMode] || '表示';
  }

  function apply() {
    settings = { categoryMode: 'show', ...readSettings() };
    setBodyClass();
    annotateRows();
    syncControls();
  }

  function initialize() {
    addStyles();
    const waitPanel = () => {
      injectControls();
      apply();
      if (!$('#display-settings-panel')) setTimeout(waitPanel, 80);
    };
    waitPanel();
    const observer = new MutationObserver(() => apply());
    const start = () => {
      const list = $('#task-list');
      if (!list) return setTimeout(start, 80);
      observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    };
    start();
    window.addEventListener('storage', (event) => { if (event.key === DISPLAY_KEY || event.key === PROJECT_KEY) apply(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
