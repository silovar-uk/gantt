(() => {
  const PROJECT_KEY = 'gantt-desk:v2:project';
  const SHARE_SETTINGS_KEY = 'gantt-desk:v2:share-settings';
  const TASK_COLORS = {
    gray: '#cbd5e1', blue: '#bfdbfe', green: '#bbf7d0', amber: '#fde68a', red: '#fecdd3', purple: '#e9d5ff',
  };
  const DEFAULT_SHARE_SETTINGS = {
    preset: 'current', customStart: '', customEnd: '', showTitle: true, showPeriod: true,
    showUpdatedAt: true, showLegend: true, showMemo: false, includeCompleted: true,
  };
  const $ = (selector) => document.querySelector(selector);
  let renderTimer = null;
  let isRendering = false;

  function readProject() {
    try { return JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null'); }
    catch { return null; }
  }
  function readShareSettings() {
    try { return { ...DEFAULT_SHARE_SETTINGS, ...(JSON.parse(localStorage.getItem(SHARE_SETTINGS_KEY)) || {}) }; }
    catch { return { ...DEFAULT_SHARE_SETTINGS }; }
  }
  function parseISO(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }
  function toISO(date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }
  function addDays(iso, days) {
    const date = typeof iso === 'string' ? parseISO(iso) : new Date(iso.getTime());
    date.setUTCDate(date.getUTCDate() + days);
    return typeof iso === 'string' ? toISO(date) : date;
  }
  function todayISO() {
    const now = new Date();
    return toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  }
  function formatDate(iso) {
    const date = parseISO(iso);
    return date ? `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日` : '—';
  }
  function escapeHTML(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }
  function currentRange(project, settings) {
    const inputStart = $('#timeline-start')?.value;
    const inputEnd = $('#timeline-end')?.value;
    const now = todayISO();
    if (settings.preset === 'custom' && parseISO(settings.customStart) && parseISO(settings.customEnd) && settings.customStart <= settings.customEnd) {
      return { start: settings.customStart, end: settings.customEnd };
    }
    if (document.body.classList.contains('gantt-share-mode') && parseISO(inputStart) && parseISO(inputEnd)) return { start: inputStart, end: inputEnd };
    if (settings.preset === 'next4weeks') return { start: now, end: addDays(now, 27) };
    if (settings.preset === 'month') {
      const date = parseISO(now);
      return { start: toISO(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))), end: toISO(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))) };
    }
    if (settings.preset === 'all') {
      const tasks = Array.isArray(project?.tasks) ? project.tasks : [];
      const starts = tasks.map((task) => task.start).filter(parseISO).sort();
      const ends = tasks.map((task) => task.end || task.start).filter(parseISO).sort();
      if (starts.length && ends.length) return { start: addDays(starts[0], -2), end: addDays(ends.at(-1), 2) };
    }
    return {
      start: parseISO(inputStart) ? inputStart : (project?.view?.start || now),
      end: parseISO(inputEnd) ? inputEnd : (project?.view?.end || addDays(now, 28)),
    };
  }
  function taskIntersects(task, range) {
    const start = task.start;
    const end = task.milestone ? task.start : (task.end || task.start);
    return parseISO(start) && parseISO(end) && start <= range.end && end >= range.start;
  }
  function visibleTasks(project, settings, range) {
    return (project?.tasks || [])
      .filter((task) => settings.includeCompleted || !task.completed)
      .filter((task) => taskIntersects(task, range));
  }
  function categoryLegend(tasks) {
    const seen = new Map();
    tasks.forEach((task) => {
      const category = String(task.category || '未分類');
      if (!seen.has(category)) seen.set(category, task.color in TASK_COLORS ? task.color : 'gray');
    });
    return [...seen.entries()].map(([name, color]) => ({ name, color }));
  }

  function addStyles() {
    if ($('#share-header-polish-style')) return;
    const style = document.createElement('style');
    style.id = 'share-header-polish-style';
    style.textContent = `
      .share-header-polished {
        min-height:0 !important;
        padding:0 !important;
        display:none;
        flex-direction:column;
        align-items:stretch !important;
        gap:0 !important;
        border-bottom:1px solid #dbe2ea;
        background:#fff;
      }
      .gantt-share-mode .share-header-polished { display:flex !important; }
      .share-header-polished__top {
        min-height:76px;
        padding:12px 18px 10px;
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        align-items:center;
        gap:16px;
      }
      .share-header-polished__main { min-width:0; }
      .share-header-polished__eyebrow { margin:0 0 3px; color:#94a3b8; font-size:10px; font-weight:900; letter-spacing:.12em; }
      .share-header-polished .share-mode-header__title { margin:0; color:#172033; font-size:21px; line-height:1.2; letter-spacing:-.025em; }
      .share-header-polished .share-mode-header__meta { margin:6px 0 0; display:flex; flex-wrap:wrap; gap:6px 10px; color:#64748b; font-size:12px; }
      .share-header-polished .share-mode-header__meta span { display:inline-flex; align-items:center; }
      .share-task-count-badge { padding:2px 7px; border:1px solid #dbe7f3; border-radius:999px; background:#f8fbff; color:#334155; font-weight:850; }
      .share-header-polished__actions { display:flex; align-items:center; justify-content:flex-end; gap:7px; flex-wrap:wrap; }
      .share-header-polished__actions .button,
      .share-header-action { min-height:32px; padding:6px 10px; border-radius:8px; font-size:12px; font-weight:850; white-space:nowrap; }
      .share-header-action { border:1px solid #b9c6d4; color:#172033; background:#fff; cursor:pointer; }
      .share-header-action:hover { background:#f8fafc; border-color:#8ea2b8; }
      .share-header-action.is-primary { color:#fff; border-color:#244a8f; background:#244a8f; }
      .share-header-action.is-primary:hover { background:#1e3e78; border-color:#1e3e78; }
      .share-header-polished__bottom {
        padding:7px 18px 9px;
        display:grid;
        grid-template-columns:auto minmax(0,1fr);
        gap:10px 18px;
        align-items:center;
        border-top:1px solid #eef2f6;
        background:#fbfdff;
      }
      .share-header-calendar,
      .share-header-categories { display:flex; align-items:center; gap:7px; min-width:0; }
      .share-header-section-label { color:#94a3b8; font-size:10px; font-weight:900; letter-spacing:.08em; white-space:nowrap; }
      .share-calendar-legend { display:flex; align-items:center; gap:9px; min-width:0; }
      .share-calendar-legend__item { display:inline-flex; align-items:center; gap:5px; color:#64748b; font-size:11px; font-weight:850; white-space:nowrap; }
      .share-calendar-legend__swatch { width:16px; height:10px; border-radius:3px; border:1px solid rgba(15,23,42,.10); background:#fff; flex:0 0 auto; }
      .share-calendar-legend__swatch.is-weekend { background:rgba(148,163,184,.08); border-color:rgba(148,163,184,.18); }
      .share-calendar-legend__swatch.is-holiday { background:rgba(214,83,79,.08); border-color:rgba(214,83,79,.18); }
      .share-calendar-legend__swatch.is-today { width:12px; height:16px; border:0; border-radius:0; background:linear-gradient(90deg, transparent 0 5px, #0f1f46 5px 7px, transparent 7px); }
      .share-header-polished .share-mode-header__legend { display:flex; flex-wrap:wrap; justify-content:flex-start; gap:5px 8px; min-width:0; overflow:hidden; }
      .share-header-polished .share-legend-item { color:#526174; font-size:11px; font-weight:800; }
      .share-header-polished .share-legend-swatch { width:10px; height:10px; border-radius:3px; border:1px solid rgba(15,23,42,.12); flex:0 0 auto; }
      @media (max-width:980px) {
        .share-header-polished__top { grid-template-columns:1fr; align-items:start; gap:10px; padding:11px 12px 9px; }
        .share-header-polished__actions { justify-content:flex-start; }
        .share-header-polished__bottom { grid-template-columns:1fr; padding:7px 12px 9px; gap:7px; }
        .share-header-categories { align-items:flex-start; }
      }
      @media (max-width:720px) {
        .share-header-polished .share-mode-header__title { font-size:17px; white-space:normal; }
        .share-header-polished .share-mode-header__meta { font-size:11px; }
        .share-header-polished__actions { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); width:100%; }
        .share-header-polished__actions .button,
        .share-header-action { width:100%; min-height:34px; padding:6px 7px; text-align:center; }
        .share-header-action .long-label,
        #share-settings-btn .long-label { display:none; }
        .share-header-section-label { display:none; }
        .share-calendar-legend { gap:8px; overflow-x:auto; }
        .share-calendar-legend__item { font-size:10px; }
        .share-header-polished .share-mode-header__legend { max-height:26px; overflow:hidden; }
      }
      @media (max-width:430px) {
        .share-header-polished__actions { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .share-calendar-legend__item { font-size:0; gap:0; }
        .share-calendar-legend__item::after { content:attr(data-short); margin-left:4px; color:#64748b; font-size:10px; font-weight:900; }
        .share-calendar-legend__swatch { width:18px; height:12px; }
        .share-calendar-legend__swatch.is-today { height:17px; }
        .share-header-polished .share-mode-header__legend { display:none; }
      }
    `;
    document.head.append(style);
  }

  function ensureStructure() {
    const header = $('#share-mode-header');
    if (!header) return false;
    if (header.classList.contains('share-header-polished')) return true;

    const title = $('#share-header-title');
    const meta = $('#share-header-meta');
    const legend = $('#share-header-legend');
    const settingsButton = $('#share-settings-btn');
    const exitButton = $('#share-exit-btn');
    if (!title || !meta || !legend || !settingsButton || !exitButton) return false;

    header.classList.add('share-header-polished');
    header.innerHTML = '';

    const top = document.createElement('div');
    top.className = 'share-header-polished__top';
    const main = document.createElement('div');
    main.className = 'share-header-polished__main';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'share-header-polished__eyebrow';
    eyebrow.textContent = 'GANTT OVERVIEW';
    main.append(eyebrow, title, meta);

    const actions = document.createElement('div');
    actions.className = 'share-header-polished__actions';
    actions.innerHTML = `
      <button class="share-header-action" type="button" data-share-action="png-wide" title="PNG 16:9を書き出す">PNG</button>
      <button class="share-header-action" type="button" data-share-action="xlsx" title="共有用Excelを書き出す">Excel</button>
      <button class="share-header-action" type="button" data-share-action="clipboard" title="画像をクリップボードへコピー">コピー</button>`;
    settingsButton.innerHTML = '<span class="long-label">共有</span>設定';
    settingsButton.classList.add('share-header-action');
    exitButton.textContent = '編集に戻る';
    exitButton.classList.add('is-primary');
    actions.append(settingsButton, exitButton);
    top.append(main, actions);

    const bottom = document.createElement('div');
    bottom.className = 'share-header-polished__bottom';
    const calendar = document.createElement('div');
    calendar.className = 'share-header-calendar';
    calendar.innerHTML = `
      <span class="share-header-section-label">CALENDAR</span>
      <div class="share-calendar-legend" aria-label="カレンダー凡例">
        <span class="share-calendar-legend__item" data-short="土日"><span class="share-calendar-legend__swatch is-weekend"></span>土日</span>
        <span class="share-calendar-legend__item" data-short="祝"><span class="share-calendar-legend__swatch is-holiday"></span>祝日・休業日</span>
        <span class="share-calendar-legend__item" data-short="今日"><span class="share-calendar-legend__swatch is-today"></span>今日</span>
      </div>`;
    const categories = document.createElement('div');
    categories.className = 'share-header-categories';
    categories.innerHTML = '<span class="share-header-section-label">CATEGORY</span>';
    categories.append(legend);
    bottom.append(calendar, categories);

    header.append(top, bottom);
    return true;
  }

  function renderDerivedHeader() {
    if (isRendering || !ensureStructure()) return;
    isRendering = true;
    try {
      const project = readProject();
      const settings = readShareSettings();
      if (!project) return;
      const range = currentRange(project, settings);
      const tasks = visibleTasks(project, settings, range);
      const title = $('#share-header-title');
      const meta = $('#share-header-meta');
      const legend = $('#share-header-legend');

      if (title && !title.textContent.trim()) title.textContent = settings.showTitle ? project.title || '名称未設定' : 'ガントチャート';
      if (meta) {
        const items = [];
        if (settings.showPeriod) items.push(`${formatDate(range.start)}〜${formatDate(range.end)}`);
        if (settings.showUpdatedAt) items.push(`最終更新：${project.updatedAt ? new Date(project.updatedAt).toLocaleDateString('ja-JP') : '未保存'}`);
        items.push(`${tasks.length}件表示`);
        if (settings.showMemo && project.memo) items.push(project.memo);
        meta.innerHTML = items.map((item, index) => `<span${index === 2 ? ' class="share-task-count-badge"' : ''}>${escapeHTML(item)}</span>`).join('');
      }
      if (legend && settings.showLegend) {
        legend.innerHTML = categoryLegend(tasks).map((item) => `<span class="share-legend-item"><span class="share-legend-swatch" style="background:${TASK_COLORS[item.color] || TASK_COLORS.gray}"></span>${escapeHTML(item.name)}</span>`).join('');
      } else if (legend) {
        legend.innerHTML = '';
      }
    } finally {
      isRendering = false;
    }
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderDerivedHeader, 80);
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const settingsButton = event.target.closest('#share-settings-btn');
      if (settingsButton) {
        const opener = $('#share-open-btn');
        const modal = $('#share-modal');
        if (opener) opener.click();
        else if (modal) modal.hidden = false;
      }
      if (event.target.closest('[data-share-action]')) setTimeout(scheduleRender, 260);
    }, true);
    window.addEventListener('storage', (event) => {
      if (event.key === PROJECT_KEY || event.key === SHARE_SETTINGS_KEY) scheduleRender();
    });
  }

  function startObserver() {
    const observer = new MutationObserver((records) => {
      const shouldRender = records.some((record) => {
        if (record.target?.id === 'share-header-meta' || record.target?.id === 'share-header-legend') return false;
        return true;
      });
      if (shouldRender) scheduleRender();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  }

  function initialize() {
    addStyles();
    bindEvents();
    startObserver();
    scheduleRender();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
