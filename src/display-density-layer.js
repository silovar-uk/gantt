(() => {
  const STORAGE_KEY = 'gantt-desk:v4:display-settings';
  const MIN_ROW_HEIGHT = 18;
  const DEFAULTS = {
    density: 'standard',
    rowHeight: 40,
    dayWidth: 24,
    panelWidth: 500,
  };
  const PRESETS = {
    relaxed: { label: 'ゆったり', rowHeight: 52, dayWidth: 28, panelWidth: 560 },
    standard: { label: '標準', rowHeight: 40, dayWidth: 24, panelWidth: 500 },
    compact: { label: '圧縮', rowHeight: 24, dayWidth: 14, panelWidth: 410 },
    ultra: { label: '極小', rowHeight: 18, dayWidth: 10, panelWidth: 360 },
  };
  const $ = (selector) => document.querySelector(selector);
  let settings = loadSettings();
  let applyTimer = null;
  let closeHandlerBound = false;

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
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
  }

  function setStyle(el, prop, value) {
    if (el && el.style[prop] !== value) el.style[prop] = value;
  }

  function addStyles() {
    if ($('#display-density-style')) return;
    const style = document.createElement('style');
    style.id = 'display-density-style';
    style.textContent = `
      .display-toolbar-group { gap:7px; position:relative; }
      .display-density-mini { min-height:32px; padding:6px 9px; border:1px solid #b9c6d4; border-radius:8px; color:#244a8f; background:#fff; font-size:12px; font-weight:850; cursor:pointer; }
      .display-density-mini:hover { background:#eef4ff; border-color:#8ba6d5; }
      .display-density-button { min-height:32px; padding-inline:10px; }
      .display-settings-wrap { position:relative; }
      .display-panel { position:absolute; z-index:80; top:calc(100% + 8px); right:0; width:min(430px, calc(100vw - 24px)); padding:14px; border:1px solid #dbe2ea; border-radius:13px; background:#fff; box-shadow:0 18px 46px rgba(15,23,42,.18); pointer-events:auto; }
      .display-panel[hidden] { display:none !important; pointer-events:none !important; }
      .display-panel__head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; padding-bottom:11px; border-bottom:1px solid #edf1f5; }
      .display-panel__head strong { display:block; color:#172033; font-size:14px; }
      .display-panel__head span { display:block; margin-top:3px; color:#64748b; font-size:11px; line-height:1.45; }
      .display-panel__section { padding:13px 0; border-bottom:1px solid #edf1f5; }
      .display-panel__section:last-child { border-bottom:0; padding-bottom:0; }
      .display-panel__label { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; color:#334155; font-size:12px; font-weight:850; }
      .display-panel__value { color:#64748b; font-size:11px; font-variant-numeric:tabular-nums; }
      .density-preset-row { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:7px; }
      .density-preset { min-height:44px; padding:8px 6px; border:1px solid #d7e0eb; border-radius:9px; color:#475569; background:#fff; font-size:12px; font-weight:850; text-align:center; cursor:pointer; }
      .density-preset small { display:block; margin-top:2px; color:#94a3b8; font-size:10px; font-weight:700; }
      .density-preset.is-active { color:#244a8f; border-color:#87a4d5; background:#eef4ff; box-shadow:inset 0 0 0 1px rgba(36,74,143,.08); }
      .display-range { width:100%; accent-color:#244a8f; }
      .display-range.row-height-range { accent-color:#0f766e; }
      .display-panel__quick { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
      .display-density-toast { position:fixed; z-index:160; left:50%; bottom:18px; max-width:min(420px, calc(100vw - 36px)); padding:9px 12px; transform:translate(-50%,10px); border-radius:9px; color:#fff; background:#22324a; box-shadow:0 12px 36px rgba(15,23,42,.18); font-size:13px; opacity:0; transition:opacity .16s, transform .16s; pointer-events:none; }
      .display-density-toast.is-visible { transform:translate(-50%,0); opacity:1; }

      body.gantt-density-tight .task-panel-head { height:40px; font-size:10px; }
      body.gantt-density-tight .task-cell { padding-inline:6px; font-size:11px; }
      body.gantt-density-tight .task-name-cell { gap:5px; }
      body.gantt-density-tight .task-name { font-size:11px; line-height:1.15; }
      body.gantt-density-tight .task-date { font-size:10px; }
      body.gantt-density-tight .task-category { padding:2px 5px; font-size:10px; }
      body.gantt-density-tight .task-state { width:13px; height:13px; font-size:9px; }
      body.gantt-density-tight .task-bar { min-height:12px; }
      body.gantt-density-tight .task-bar .bar-label { font-size:9px; }
      body.gantt-density-tight .milestone-label { font-size:9px; }
      body.gantt-density-compact .task-panel-head { grid-template-columns:minmax(160px,1.8fr) minmax(68px,.7fr) 66px 66px; }
      body.gantt-density-compact .task-row { grid-template-columns:minmax(160px,1.8fr) minmax(68px,.7fr) 66px 66px; }
      body.gantt-density-compact .day-cell span:first-child { display:none; }
      body.gantt-density-compact .day-cell { height:28px; font-size:9px; }
      body.gantt-density-compact .month-cell { height:23px; font-size:10px; }

      body.gantt-density-ultra .task-panel-head { height:32px; font-size:9px; }
      body.gantt-density-ultra .task-cell { padding-inline:4px; font-size:9px; min-height:18px; }
      body.gantt-density-ultra .task-name { font-size:9.5px; line-height:1.08; }
      body.gantt-density-ultra .task-date { font-size:8.5px; letter-spacing:-.02em; }
      body.gantt-density-ultra .task-category { padding:1px 4px; font-size:8.5px; max-width:64px; overflow:hidden; text-overflow:ellipsis; }
      body.gantt-density-ultra .task-state { width:11px; height:11px; font-size:8px; }
      body.gantt-density-ultra .task-panel-head,
      body.gantt-density-ultra .task-row { grid-template-columns:minmax(145px,1.9fr) minmax(52px,.62fr) 50px 50px; }
      body.gantt-density-ultra .task-bar { min-height:10px; border-radius:3px; }
      body.gantt-density-ultra .task-bar .bar-label { display:none; }
      body.gantt-density-ultra .milestone { width:12px; height:12px; }
      body.gantt-density-ultra .milestone-label { font-size:8px; transform:translateY(-1px); opacity:.78; }
      body.gantt-density-ultra .selected-row-band { opacity:.18; }
      body.gantt-density-ultra .day-cell { height:24px; font-size:8px; }
      body.gantt-density-ultra .month-cell { height:20px; font-size:9px; }
      body.gantt-density-ultra .weekend-band,
      body.gantt-density-ultra .holiday-band { opacity:.86; }

      @media (max-width:860px) {
        .display-toolbar-group { order:4; width:100%; justify-content:space-between; }
        .display-panel { left:0; right:auto; }
      }
      @media (max-width:650px) {
        .display-panel { position:fixed; inset:auto 10px 10px 10px; width:auto; max-height:82vh; overflow:auto; }
        .display-density-mini { flex:1; }
        .density-preset-row { grid-template-columns:repeat(2,minmax(0,1fr)); }
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
      <button id="display-compact-btn" class="display-density-mini" type="button" title="行と日付幅を限界まで縮めます">極小表示</button>
      <div class="menu-wrap display-settings-wrap">
        <button id="display-settings-btn" class="button button-secondary display-density-button" type="button" aria-haspopup="dialog" aria-expanded="false">表示設定</button>
        <section id="display-settings-panel" class="display-panel" hidden aria-label="表示設定">
          <div class="display-panel__head">
            <div><strong>表示設定</strong><span>行を細くして、多数のタスクを一覧できるようにします。右側のバーやラベルは重なってもよい前提で圧縮します。</span></div>
            <button id="display-panel-close" class="icon-button" type="button" aria-label="表示設定を閉じる">×</button>
          </div>
          <div class="display-panel__section">
            <div class="display-panel__label"><span>表示密度</span><span id="display-density-current" class="display-panel__value"></span></div>
            <div class="density-preset-row">
              <button class="density-preset" type="button" data-density-preset="relaxed">ゆったり<small>52px</small></button>
              <button class="density-preset" type="button" data-density-preset="standard">標準<small>40px</small></button>
              <button class="density-preset" type="button" data-density-preset="compact">圧縮<small>24px</small></button>
              <button class="density-preset" type="button" data-density-preset="ultra">極小<small>18px</small></button>
            </div>
          </div>
          <div class="display-panel__section">
            <label class="display-panel__label" for="row-height-slider"><span>行の高さ</span><output id="row-height-output" class="display-panel__value" for="row-height-slider"></output></label>
            <input id="row-height-slider" class="display-range row-height-range" type="range" min="18" max="72" step="1">
          </div>
          <div class="display-panel__section">
            <label class="display-panel__label" for="day-width-slider"><span>日付幅</span><output id="day-width-output" class="display-panel__value" for="day-width-slider"></output></label>
            <input id="day-width-slider" class="display-range" type="range" min="10" max="56" step="1">
          </div>
          <div class="display-panel__section">
            <label class="display-panel__label" for="panel-width-slider"><span>左の一覧幅</span><output id="panel-width-output" class="display-panel__value" for="panel-width-slider"></output></label>
            <input id="panel-width-slider" class="display-range" type="range" min="320" max="720" step="10">
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

  function setBodyDensity() {
    document.body.classList.toggle('gantt-density-relaxed', settings.density === 'relaxed');
    document.body.classList.toggle('gantt-density-standard', settings.density === 'standard');
    document.body.classList.toggle('gantt-density-compact', settings.density === 'compact' || settings.density === 'ultra' || settings.rowHeight <= 28);
    document.body.classList.toggle('gantt-density-tight', settings.rowHeight <= 36);
    document.body.classList.toggle('gantt-density-ultra', settings.density === 'ultra' || settings.rowHeight <= 22);
  }

  function maxPanelWidth() {
    return Math.max(320, Math.min(window.innerWidth * 0.72, 920));
  }

  function updatePanelControls(value) {
    const panel = $('#panel-width-slider');
    const panelOut = $('#panel-width-output');
    if (panel) panel.value = Math.round(value);
    if (panelOut) panelOut.value = `${Math.round(value)}px`;
  }

  function updateRowControls(value) {
    const row = $('#row-height-slider');
    const rowOut = $('#row-height-output');
    if (row) row.value = Math.round(value);
    if (rowOut) rowOut.value = `${Math.round(value)}px`;
  }

  function updateDayControls(value) {
    const day = $('#day-width-slider');
    const dayOut = $('#day-width-output');
    if (day) day.value = Math.round(value);
    if (dayOut) dayOut.value = `${Math.round(value)}px`;
  }

  function updateDensityControls() {
    const current = $('#display-density-current');
    if (current) current.textContent = PRESETS[settings.density]?.label || 'カスタム';
    document.querySelectorAll('[data-density-preset]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.densityPreset === settings.density);
    });
  }

  function syncControls() {
    updateRowControls(settings.rowHeight);
    updateDayControls(settings.dayWidth);
    updatePanelControls(settings.panelWidth);
    updateDensityControls();
  }

  function applyPanelWidth(width, { persist = true } = {}) {
    const panel = $('#task-panel');
    const value = clamp(width, 320, maxPanelWidth());
    settings.panelWidth = value;
    setStyle(panel, 'width', `${value}px`);
    document.documentElement.style.setProperty('--task-panel-width', `${value}px`);
    updatePanelControls(value);
    if (persist) saveSettings();
    window.dispatchEvent(new CustomEvent('gantt-display-updated', { detail: { panelWidth: Math.round(value), source: 'panel-width' } }));
  }

  function updateNativeZoom(dayWidth, { dispatch = true } = {}) {
    const zoom = $('#zoom-range');
    const output = $('#zoom-value');
    const value = clamp(dayWidth, 10, 56);
    if (zoom && String(zoom.value) !== String(value)) {
      zoom.value = String(value);
      if (dispatch) zoom.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (output) output.value = `${value}px`;
  }

  function applyDayWidth(dayWidth, { dispatchZoom = true, persist = true } = {}) {
    const value = clamp(dayWidth, 10, 56);
    settings.dayWidth = value;
    updateNativeZoom(value, { dispatch: dispatchZoom });
    updateDayControls(value);
    updateDensityControls();
    if (persist) saveSettings();
    window.dispatchEvent(new CustomEvent('gantt-display-updated', { detail: { dayWidth: value, source: 'day-width' } }));
  }

  function reflowRows(rowHeight = settings.rowHeight) {
    const value = clamp(rowHeight, MIN_ROW_HEIGHT, 72);
    const rows = [...document.querySelectorAll('#task-list .task-row')];
    const timelineBody = $('.timeline-body');
    document.documentElement.style.setProperty('--row-height', `${value}px`);
    if (!rows.length || !timelineBody) return;
    const bodyHeight = `${Math.max(rows.length * value, 1)}px`;
    setStyle(timelineBody, 'height', bodyHeight);
    document.querySelectorAll('.weekend-band').forEach((band) => setStyle(band, 'height', bodyHeight));
    document.querySelectorAll('.holiday-band').forEach((band) => setStyle(band, 'height', bodyHeight));

    const bars = [...document.querySelectorAll('.task-bar[data-task-id]')];
    const milestones = [...document.querySelectorAll('.milestone[data-task-id]')];
    rows.forEach((row, index) => {
      const taskId = row.dataset.taskId;
      if (!taskId) return;
      const baseTop = index * value;
      const barHeight = Math.max(10, Math.min(value <= 22 ? 12 : 18, value - 4));
      const barTop = baseTop + Math.max(1, Math.round((value - barHeight) / 2));
      const milestoneTop = baseTop + Math.max(1, Math.round((value - Math.min(14, value - 2)) / 2));
      const labelTop = baseTop + Math.max(0, Math.round((value - 14) / 2));
      const bar = bars.find((item) => item.dataset.taskId === taskId);
      if (bar) {
        setStyle(bar, 'top', `${barTop}px`);
        setStyle(bar, 'height', `${barHeight}px`);
      }
      const milestone = milestones.find((item) => item.dataset.taskId === taskId);
      if (milestone) setStyle(milestone, 'top', `${milestoneTop}px`);
      const milestoneLabel = milestone?.nextElementSibling?.classList.contains('milestone-label') ? milestone.nextElementSibling : null;
      if (milestoneLabel) setStyle(milestoneLabel, 'top', `${labelTop}px`);
    });

    const selected = $('.selected-row-band');
    const selectedTaskId = document.querySelector('#task-list .task-row.is-selected')?.dataset.taskId;
    const selectedIndex = selectedTaskId ? rows.findIndex((row) => row.dataset.taskId === selectedTaskId) : -1;
    if (selected && selectedIndex >= 0) {
      setStyle(selected, 'height', `${value}px`);
      setStyle(selected, 'top', `${selectedIndex * value}px`);
    }
  }

  function applyRowHeight(rowHeight, { persist = true, delayedReflow = true } = {}) {
    const value = clamp(rowHeight, MIN_ROW_HEIGHT, 72);
    settings.rowHeight = value;
    settings.density = settings.density === 'relaxed' || settings.density === 'standard' || settings.density === 'compact' || settings.density === 'ultra'
      ? settings.density
      : (value <= 22 ? 'ultra' : 'custom');
    setBodyDensity();
    updateRowControls(value);
    updateDensityControls();
    if (persist) saveSettings();
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => reflowRows(value), delayedReflow ? 80 : 0);
    window.dispatchEvent(new CustomEvent('gantt-display-updated', { detail: { rowHeight: value, source: 'row-height' } }));
  }

  function applySettings({ dispatchZoom = true, persist = true, delayedReflow = true } = {}) {
    settings.rowHeight = clamp(settings.rowHeight, MIN_ROW_HEIGHT, 72);
    settings.dayWidth = clamp(settings.dayWidth, 10, 56);
    settings.panelWidth = clamp(settings.panelWidth, 320, 920);
    setBodyDensity();
    applyPanelWidth(settings.panelWidth, { persist: false });
    applyDayWidth(settings.dayWidth, { dispatchZoom, persist: false });
    syncControls();
    if (persist) saveSettings();
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => reflowRows(settings.rowHeight), delayedReflow ? 80 : 0);
  }

  function applyPreset(name) {
    const preset = PRESETS[name] || PRESETS.standard;
    settings = { ...settings, density: name, rowHeight: preset.rowHeight, dayWidth: preset.dayWidth, panelWidth: preset.panelWidth };
    applySettings({ dispatchZoom: true, persist: true });
    showMiniToast(`${preset.label}表示にしました`);
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
      const project = JSON.parse(localStorage.getItem('gantt-desk:v2:project') || '{}');
      const tasks = Array.isArray(project.tasks) ? project.tasks : [];
      if (!tasks.length) return showMiniToast('タスクがありません');
      const starts = tasks.map((task) => task.start).filter(Boolean).sort();
      const ends = tasks.map((task) => task.end || task.start).filter(Boolean).sort();
      const start = addDays(starts[0], -2);
      const end = addDays(ends[ends.length - 1], 2);
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
    const [year, month, day] = String(iso).split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + amount);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
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
    }, 1300);
  }

  function markCustomDensity() {
    settings.density = settings.rowHeight <= 22 ? 'ultra' : 'custom';
  }

  function bindEvents() {
    $('#display-compact-btn')?.addEventListener('click', () => applyPreset('ultra'));
    $('#display-settings-btn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      togglePanel();
    });
    $('#display-panel-close')?.addEventListener('click', () => togglePanel(false));
    $('#display-settings-panel')?.addEventListener('click', (event) => event.stopPropagation());

    if (!closeHandlerBound) {
      closeHandlerBound = true;
      document.addEventListener('click', (event) => {
        if (!event.target.closest('.display-settings-wrap')) togglePanel(false);
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') togglePanel(false);
      });
    }

    document.querySelectorAll('[data-density-preset]').forEach((button) => {
      button.addEventListener('click', () => applyPreset(button.dataset.densityPreset));
    });

    $('#row-height-slider')?.addEventListener('input', (event) => {
      settings.rowHeight = clamp(event.target.value, MIN_ROW_HEIGHT, 72);
      markCustomDensity();
      applyRowHeight(settings.rowHeight, { persist: true });
    });
    $('#day-width-slider')?.addEventListener('input', (event) => {
      settings.dayWidth = clamp(event.target.value, 10, 56);
      markCustomDensity();
      applyDayWidth(settings.dayWidth, { dispatchZoom: true, persist: true });
    });
    $('#panel-width-slider')?.addEventListener('input', (event) => {
      settings.panelWidth = clamp(event.target.value, 320, 920);
      markCustomDensity();
      applyPanelWidth(settings.panelWidth, { persist: true });
    });
    $('#reset-density-btn')?.addEventListener('click', () => applyPreset('standard'));
    $('#fit-tasks-range-btn')?.addEventListener('click', fitRangeToTasks);
    $('#zoom-range')?.addEventListener('input', (event) => {
      settings.dayWidth = clamp(event.target.value, 10, 56);
      if (settings.density !== 'standard') markCustomDensity();
      saveSettings();
      updateDayControls(settings.dayWidth);
      updateDensityControls();
      window.dispatchEvent(new CustomEvent('gantt-display-updated', { detail: { dayWidth: settings.dayWidth, source: 'native-zoom' } }));
    });
    window.addEventListener('resize', () => applyPanelWidth(settings.panelWidth, { persist: false }));
    document.addEventListener('gantt-desk:rendered', () => reflowRows(settings.rowHeight));
  }

  function initialize() {
    addStyles();
    createUI();
    bindEvents();
    applySettings({ dispatchZoom: false, persist: false, delayedReflow: true });
    setTimeout(() => reflowRows(settings.rowHeight), 360);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
