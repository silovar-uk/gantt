(() => {
  const STORAGE_KEY = 'gantt-desk:v4:display-settings';
  const PROJECT_KEY = 'gantt-desk:v2:project';
  const DEFAULTS = {
    density: 'standard',
    rowHeight: 40,
    dayWidth: 24,
    panelWidth: 500,
  };
  const PRESETS = {
    relaxed: { label: 'ゆったり', rowHeight: 52, dayWidth: 28, panelWidth: 560 },
    standard: { label: '標準', rowHeight: 40, dayWidth: 24, panelWidth: 500 },
    compact: { label: '最小', rowHeight: 28, dayWidth: 16, panelWidth: 420 },
  };
  const $ = (selector) => document.querySelector(selector);
  let settings = loadSettings();
  let renderTimer = null;
  let observerReady = false;

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value) || min, min), max);
  }

  function loadSettings() {
    try {
      return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function tryUpdateProjectView() {
    try {
      const project = JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}');
      project.view = project.view || {};
      project.view.dayWidth = settings.dayWidth;
      project.view.rowHeight = settings.rowHeight;
      project.view.panelWidth = settings.panelWidth;
      project.display = { ...(project.display || {}), density: settings.density };
      localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
    } catch {
      // localStorage persistence is best-effort; visual state still works.
    }
  }

  function setNativeZoom(dayWidth) {
    const zoom = $('#zoom-range');
    const output = $('#zoom-value');
    if (!zoom) return;
    const value = clamp(dayWidth, 10, 56);
    if (String(zoom.value) !== String(value)) {
      zoom.value = String(value);
      zoom.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (output) output.value = `${value}px`;
  }

  function setPanelWidth(width) {
    const panel = $('#task-panel');
    if (!panel) return;
    const value = clamp(width, 340, Math.min(window.innerWidth * 0.72, 920));
    panel.style.width = `${value}px`;
    document.documentElement.style.setProperty('--task-panel-width', `${value}px`);
  }

  function setBodyDensity() {
    document.body.classList.toggle('gantt-density-relaxed', settings.density === 'relaxed');
    document.body.classList.toggle('gantt-density-standard', settings.density === 'standard');
    document.body.classList.toggle('gantt-density-compact', settings.density === 'compact' || settings.rowHeight <= 32);
    document.body.classList.toggle('gantt-density-tight', settings.rowHeight <= 36);
  }

  function reflowTimelineRows() {
    const rowHeight = clamp(settings.rowHeight, 28, 72);
    const rows = [...document.querySelectorAll('#task-list .task-row')];
    const timelineBody = $('.timeline-body');
    if (!rows.length || !timelineBody) {
      document.documentElement.style.setProperty('--row-height', `${rowHeight}px`);
      return;
    }

    document.documentElement.style.setProperty('--row-height', `${rowHeight}px`);
    timelineBody.style.height = `${Math.max(rows.length * rowHeight, 1)}px`;

    document.querySelectorAll('.weekend-band').forEach((band) => {
      band.style.height = `${Math.max(rows.length * rowHeight, 1)}px`;
    });

    const selected = $('.selected-row-band');
    if (selected) {
      const selectedTaskId = document.querySelector('#task-list .task-row.is-selected')?.dataset.taskId;
      const index = selectedTaskId ? rows.findIndex((row) => row.dataset.taskId === selectedTaskId) : -1;
      selected.style.height = `${rowHeight}px`;
      if (index >= 0) selected.style.top = `${index * rowHeight}px`;
    }

    rows.forEach((row, index) => {
      const taskId = row.dataset.taskId;
      if (!taskId) return;
      const baseTop = index * rowHeight;
      const barTop = baseTop + Math.max(3, Math.round((rowHeight - Math.min(26, rowHeight - 4)) / 2));
      const milestoneTop = baseTop + Math.max(4, Math.round((rowHeight - 18) / 2));
      const labelTop = baseTop + Math.max(3, Math.round((rowHeight - 18) / 2));

      const bar = document.querySelector(`.task-bar[data-task-id="${CSS.escape(taskId)}"]`);
      if (bar) {
        bar.style.top = `${barTop}px`;
        bar.style.height = `${Math.max(18, Math.min(26, rowHeight - 6))}px`;
      }

      const milestone = document.querySelector(`.milestone[data-task-id="${CSS.escape(taskId)}"]`);
      if (milestone) milestone.style.top = `${milestoneTop}px`;

      const milestoneLabel = milestone?.nextElementSibling?.classList.contains('milestone-label') ? milestone.nextElementSibling : null;
      if (milestoneLabel) milestoneLabel.style.top = `${labelTop}px`;
    });
  }

  function scheduleVisualApply() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      setBodyDensity();
      setPanelWidth(settings.panelWidth);
      reflowTimelineRows();
      syncControls();
    }, 20);
  }

  function applySettings({ nativeZoom = true, persist = true } = {}) {
    settings.rowHeight = clamp(settings.rowHeight, 28, 72);
    settings.dayWidth = clamp(settings.dayWidth, 10, 56);
    settings.panelWidth = clamp(settings.panelWidth, 340, 920);
    if (nativeZoom) setNativeZoom(settings.dayWidth);
    setBodyDensity();
    setPanelWidth(settings.panelWidth);
    reflowTimelineRows();
    syncControls();
    if (persist) {
      saveSettings();
      tryUpdateProjectView();
    }
  }

  function applyPreset(name) {
    const preset = PRESETS[name] || PRESETS.standard;
    settings = { ...settings, density: name, rowHeight: preset.rowHeight, dayWidth: preset.dayWidth, panelWidth: preset.panelWidth };
    applySettings();
    showMiniToast(`${preset.label}表示にしました`);
  }

  function showMiniToast(message) {
    let toast = $('#display-density-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'display-density-toast';
      toast.className = 'display-density-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.append(toast);
    }
    toast.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => { toast.hidden = true; }, 160);
    }, 1600);
  }

  function addStyles() {
    if ($('#display-density-style')) return;
    const style = document.createElement('style');
    style.id = 'display-density-style';
    style.textContent = `
      .display-toolbar-group { gap:7px; }
      .display-density-button { min-height:32px; padding-inline:10px; }
      .display-density-mini { min-height:32px; padding:6px 9px; border:1px solid #b9c6d4; border-radius:8px; color:#244a8f; background:#fff; font-size:12px; font-weight:850; }
      .display-density-mini:hover { background:#eef4ff; border-color:#8ba6d5; transform:translateY(-1px); }
      .display-panel { position:absolute; z-index:75; top:calc(100% + 8px); right:0; width:min(390px, calc(100vw - 24px)); padding:14px; border:1px solid #dbe2ea; border-radius:13px; background:#fff; box-shadow:0 18px 46px rgba(15,23,42,.18); }
      .display-panel[hidden] { display:none; }
      .display-panel__head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; padding-bottom:11px; border-bottom:1px solid #edf1f5; }
      .display-panel__head strong { display:block; color:#172033; font-size:14px; }
      .display-panel__head span { display:block; margin-top:3px; color:#64748b; font-size:11px; line-height:1.45; }
      .display-panel__section { padding:13px 0; border-bottom:1px solid #edf1f5; }
      .display-panel__section:last-child { border-bottom:0; padding-bottom:0; }
      .display-panel__label { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; color:#334155; font-size:12px; font-weight:850; }
      .display-panel__value { color:#64748b; font-size:11px; font-variant-numeric:tabular-nums; }
      .density-preset-row { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:7px; }
      .density-preset { min-height:44px; padding:8px 7px; border:1px solid #d7e0eb; border-radius:9px; color:#475569; background:#fff; font-size:12px; font-weight:850; text-align:center; }
      .density-preset small { display:block; margin-top:2px; color:#94a3b8; font-size:10px; font-weight:700; }
      .density-preset.is-active { color:#244a8f; border-color:#87a4d5; background:#eef4ff; box-shadow:inset 0 0 0 1px rgba(36,74,143,.08); }
      .display-range { width:100%; accent-color:#244a8f; }
      .display-range.row-height-range { accent-color:#0f766e; }
      .display-panel__quick { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
      .display-density-toast { position:fixed; z-index:160; left:50%; bottom:18px; max-width:min(420px, calc(100vw - 36px)); padding:9px 12px; transform:translate(-50%, 10px); border-radius:9px; color:#fff; background:#22324a; box-shadow:0 12px 36px rgba(15,23,42,.18); font-size:13px; opacity:0; transition:opacity .16s, transform .16s; }
      .display-density-toast.is-visible { transform:translate(-50%,0); opacity:1; }

      body.gantt-density-tight .task-panel-head { height:48px; font-size:10px; }
      body.gantt-density-tight .task-cell { padding-inline:7px; font-size:11px; }
      body.gantt-density-tight .task-name-cell { gap:5px; }
      body.gantt-density-tight .task-name { font-size:11px; }
      body.gantt-density-tight .task-date { font-size:10px; }
      body.gantt-density-tight .task-category { padding:2px 5px; font-size:10px; }
      body.gantt-density-tight .task-state { width:13px; height:13px; font-size:9px; }
      body.gantt-density-tight .task-bar { min-height:18px; }
      body.gantt-density-tight .task-bar .bar-label { font-size:10px; }
      body.gantt-density-tight .milestone-label { font-size:10px; }
      body.gantt-density-compact .task-panel-head { grid-template-columns:minmax(170px,1.9fr) minmax(72px,.72fr) 72px 72px; }
      body.gantt-density-compact .task-row { grid-template-columns:minmax(170px,1.9fr) minmax(72px,.72fr) 72px 72px; }
      body.gantt-density-compact .date-end { display:none; }
      body.gantt-density-compact .task-panel-head > div:nth-child(4) { display:none; }
      body.gantt-density-compact .task-panel-head { grid-template-columns:minmax(170px,1.9fr) minmax(72px,.72fr) 72px; }
      body.gantt-density-compact .task-row { grid-template-columns:minmax(170px,1.9fr) minmax(72px,.72fr) 72px; }
      body.gantt-density-compact .day-cell span:first-child { display:none; }
      body.gantt-density-compact .day-cell { height:28px; font-size:9px; }
      body.gantt-density-compact .month-cell { height:23px; font-size:10px; }
      body.gantt-density-compact .toolbar { gap:7px; }

      @media (max-width:860px) {
        .display-panel { left:0; right:auto; }
        .display-toolbar-group { order:4; width:100%; justify-content:space-between; }
      }
      @media (max-width:650px) {
        .display-panel { position:fixed; inset:auto 10px 10px 10px; width:auto; max-height:82vh; overflow:auto; }
        .display-density-mini { flex:1; }
      }
    `;
    document.head.append(style);
  }

  function createUI() {
    if ($('#display-settings-btn')) return;
    const toolbar = $('.toolbar');
    if (!toolbar) return;

    const group = document.createElement('div');
    group.className = 'toolbar-group display-toolbar-group';
    group.innerHTML = `
      <button id="display-compact-btn" class="display-density-mini" type="button" title="行と日付幅を一気に縮めます">最小表示</button>
      <div class="menu-wrap display-settings-wrap">
        <button id="display-settings-btn" class="button button-secondary display-density-button" type="button" aria-haspopup="dialog" aria-expanded="false">表示設定</button>
        <section id="display-settings-panel" class="display-panel" hidden aria-label="表示設定">
          <div class="display-panel__head">
            <div><strong>表示設定</strong><span>共有しやすい密度へ。行高はつまみで細かく調整できます。</span></div>
            <button id="display-panel-close" class="icon-button" type="button" aria-label="表示設定を閉じる">×</button>
          </div>
          <div class="display-panel__section">
            <div class="display-panel__label"><span>表示密度</span><span id="display-density-current" class="display-panel__value"></span></div>
            <div class="density-preset-row">
              <button class="density-preset" type="button" data-density-preset="relaxed">ゆったり<small>52px</small></button>
              <button class="density-preset" type="button" data-density-preset="standard">標準<small>40px</small></button>
              <button class="density-preset" type="button" data-density-preset="compact">最小<small>28px</small></button>
            </div>
          </div>
          <div class="display-panel__section">
            <label class="display-panel__label" for="row-height-slider"><span>行の高さ</span><output id="row-height-output" class="display-panel__value" for="row-height-slider"></output></label>
            <input id="row-height-slider" class="display-range row-height-range" type="range" min="28" max="72" step="1">
          </div>
          <div class="display-panel__section">
            <label class="display-panel__label" for="day-width-slider"><span>日付幅</span><output id="day-width-output" class="display-panel__value" for="day-width-slider"></output></label>
            <input id="day-width-slider" class="display-range" type="range" min="10" max="56" step="1">
          </div>
          <div class="display-panel__section">
            <label class="display-panel__label" for="panel-width-slider"><span>左の一覧幅</span><output id="panel-width-output" class="display-panel__value" for="panel-width-slider"></output></label>
            <input id="panel-width-slider" class="display-range" type="range" min="340" max="720" step="10">
          </div>
          <div class="display-panel__section display-panel__quick">
            <button id="fit-tasks-range-btn" class="button button-secondary" type="button">期間をタスクに合わせる</button>
            <button id="reset-density-btn" class="button button-quiet" type="button">標準へ戻す</button>
          </div>
        </section>
      </div>`;

    const zoomGroup = $('.toolbar-group-zoom');
    if (zoomGroup) zoomGroup.insertAdjacentElement('afterend', group);
    else toolbar.append(group);
  }

  function syncControls() {
    const row = $('#row-height-slider');
    const day = $('#day-width-slider');
    const panel = $('#panel-width-slider');
    if (row) row.value = settings.rowHeight;
    if (day) day.value = settings.dayWidth;
    if (panel) panel.value = settings.panelWidth;
    const rowOut = $('#row-height-output');
    const dayOut = $('#day-width-output');
    const panelOut = $('#panel-width-output');
    if (rowOut) rowOut.value = `${settings.rowHeight}px`;
    if (dayOut) dayOut.value = `${settings.dayWidth}px`;
    if (panelOut) panelOut.value = `${settings.panelWidth}px`;
    const current = $('#display-density-current');
    if (current) current.textContent = PRESETS[settings.density]?.label || 'カスタム';
    document.querySelectorAll('[data-density-preset]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.densityPreset === settings.density);
    });
  }

  function togglePanel(force) {
    const panel = $('#display-settings-panel');
    const button = $('#display-settings-btn');
    if (!panel || !button) return;
    const willOpen = typeof force === 'boolean' ? force : panel.hidden;
    panel.hidden = !willOpen;
    button.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) syncControls();
  }

  function fitRangeToTasks() {
    try {
      const project = JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}');
      const tasks = Array.isArray(project.tasks) ? project.tasks : [];
      if (!tasks.length) return showMiniToast('タスクがありません');
      const starts = tasks.map((task) => task.start).filter(Boolean).sort();
      const ends = tasks.map((task) => task.end || task.start).filter(Boolean).sort();
      const start = addDays(starts[0], -2);
      const end = addDays(ends.at(-1), 2);
      const startInput = $('#timeline-start');
      const endInput = $('#timeline-end');
      if (startInput && endInput) {
        startInput.value = start;
        endInput.value = end;
        endInput.dispatchEvent(new Event('change', { bubbles: true }));
        showMiniToast('表示期間をタスクに合わせました');
      }
    } catch {
      showMiniToast('表示期間を変更できませんでした');
    }
  }

  function addDays(iso, amount) {
    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + amount);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  function bindEvents() {
    $('#display-compact-btn')?.addEventListener('click', () => applyPreset('compact'));
    $('#display-settings-btn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      togglePanel();
    });
    $('#display-panel-close')?.addEventListener('click', () => togglePanel(false));
    $('#display-settings-panel')?.addEventListener('click', (event) => event.stopPropagation());

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.display-settings-wrap')) togglePanel(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') togglePanel(false);
    });

    document.querySelectorAll('[data-density-preset]').forEach((button) => {
      button.addEventListener('click', () => applyPreset(button.dataset.densityPreset));
    });

    $('#row-height-slider')?.addEventListener('input', (event) => {
      settings.rowHeight = clamp(event.target.value, 28, 72);
      settings.density = 'custom';
      applySettings({ nativeZoom: false });
    });

    $('#day-width-slider')?.addEventListener('input', (event) => {
      settings.dayWidth = clamp(event.target.value, 10, 56);
      settings.density = 'custom';
      applySettings({ nativeZoom: true });
    });

    $('#panel-width-slider')?.addEventListener('input', (event) => {
      settings.panelWidth = clamp(event.target.value, 340, 920);
      settings.density = 'custom';
      applySettings({ nativeZoom: false });
    });

    $('#reset-density-btn')?.addEventListener('click', () => applyPreset('standard'));
    $('#fit-tasks-range-btn')?.addEventListener('click', fitRangeToTasks);

    $('#zoom-range')?.addEventListener('input', (event) => {
      settings.dayWidth = clamp(event.target.value, 10, 56);
      saveSettings();
      syncControls();
    });

    window.addEventListener('resize', () => scheduleVisualApply());
  }

  function startObserver() {
    if (observerReady) return;
    const canvas = $('#timeline-canvas');
    const list = $('#task-list');
    if (!canvas || !list) return;
    observerReady = true;
    const observer = new MutationObserver(scheduleVisualApply);
    observer.observe(canvas, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  }

  function initialize() {
    addStyles();
    createUI();
    bindEvents();
    syncControls();
    startObserver();
    applySettings({ nativeZoom: true, persist: false });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
