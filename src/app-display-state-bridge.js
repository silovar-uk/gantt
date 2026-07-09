(() => {
  const PROJECT_KEY = 'gantt-desk:v2:project';
  const DISPLAY_KEY = 'gantt-desk:v4:display-settings';
  const MIN_ROW_HEIGHT = 18;
  const MAX_ROW_HEIGHT = 72;
  const MIN_DAY_WIDTH = 10;
  const MAX_DAY_WIDTH = 56;
  const MIN_PANEL_WIDTH = 320;
  const MAX_PANEL_WIDTH = 920;
  const $ = (selector) => document.querySelector(selector);
  let renderTimer = null;
  let syncTimer = null;
  let lastRenderSignature = '';

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(Math.max(number, min), max);
  }

  function readJSON(key, fallback = {}) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; }
    catch { return fallback; }
  }

  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function readProject() {
    return readJSON(PROJECT_KEY, {});
  }

  function readSettings() {
    return readJSON(DISPLAY_KEY, {});
  }

  function resolveDisplayState() {
    const project = readProject();
    const settings = readSettings();
    const view = project.view || {};
    const taskPanelWidth = $('#task-panel')?.getBoundingClientRect().width;
    return {
      rowHeight: clamp(settings.rowHeight ?? view.rowHeight ?? 40, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT),
      dayWidth: clamp(settings.dayWidth ?? view.dayWidth ?? 28, MIN_DAY_WIDTH, MAX_DAY_WIDTH),
      panelWidth: clamp(settings.panelWidth ?? view.panelWidth ?? taskPanelWidth ?? 500, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH),
      density: settings.density || (Number(settings.rowHeight ?? view.rowHeight) <= 22 ? 'ultra' : 'standard'),
      categoryMode: settings.categoryMode || 'show',
    };
  }

  function persistDisplayState(partial = {}) {
    const current = resolveDisplayState();
    const next = {
      ...current,
      ...partial,
    };
    next.rowHeight = clamp(next.rowHeight, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
    next.dayWidth = clamp(next.dayWidth, MIN_DAY_WIDTH, MAX_DAY_WIDTH);
    next.panelWidth = clamp(next.panelWidth, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);

    const settings = { ...readSettings(), ...next };
    writeJSON(DISPLAY_KEY, settings);

    const project = readProject();
    if (project && typeof project === 'object') {
      project.view = {
        ...(project.view || {}),
        rowHeight: next.rowHeight,
        dayWidth: next.dayWidth,
        panelWidth: next.panelWidth,
      };
      project.updatedAt = project.updatedAt || new Date().toISOString();
      writeJSON(PROJECT_KEY, project);
    }
    return next;
  }

  function applyDisplayStateToDOM(state) {
    const taskPanel = $('#task-panel');
    if (taskPanel) taskPanel.style.width = `${state.panelWidth}px`;
    document.documentElement.style.setProperty('--task-panel-width', `${state.panelWidth}px`);
    document.documentElement.style.setProperty('--row-height', `${state.rowHeight}px`);

    const zoom = $('#zoom-range');
    const zoomOutput = $('#zoom-value');
    if (zoom && String(zoom.value) !== String(state.dayWidth)) {
      zoom.value = String(state.dayWidth);
      // Let app.js update its internal dayWidth state without forcing a reload.
      zoom.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (zoomOutput) zoomOutput.value = `${state.dayWidth}px`;

    const rowSlider = $('#row-height-slider');
    const rowOutput = $('#row-height-output');
    if (rowSlider && String(rowSlider.value) !== String(state.rowHeight)) rowSlider.value = String(state.rowHeight);
    if (rowOutput) rowOutput.value = `${state.rowHeight}px`;

    const daySlider = $('#day-width-slider');
    const dayOutput = $('#day-width-output');
    if (daySlider && String(daySlider.value) !== String(state.dayWidth)) daySlider.value = String(state.dayWidth);
    if (dayOutput) dayOutput.value = `${state.dayWidth}px`;

    const panelSlider = $('#panel-width-slider');
    const panelOutput = $('#panel-width-output');
    if (panelSlider && String(panelSlider.value) !== String(Math.round(state.panelWidth))) panelSlider.value = String(Math.round(state.panelWidth));
    if (panelOutput) panelOutput.value = `${Math.round(state.panelWidth)}px`;
  }

  function syncFromDisplayEvent(detail = {}) {
    const partial = {};
    if (detail.rowHeight != null) partial.rowHeight = detail.rowHeight;
    if (detail.dayWidth != null) partial.dayWidth = detail.dayWidth;
    if (detail.panelWidth != null) partial.panelWidth = detail.panelWidth;
    if (!Object.keys(partial).length) return;
    const next = persistDisplayState(partial);
    applyDisplayStateToDOM(next);
  }

  function scheduleSync(partial = {}) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      const next = persistDisplayState(partial);
      applyDisplayStateToDOM(next);
      dispatchRendered('display-sync');
    }, 80);
  }

  function dispatchRendered(source = 'observer') {
    const project = readProject();
    const view = project.view || {};
    const tasks = Array.isArray(project.tasks) ? project.tasks : [];
    const signature = `${source}|${tasks.length}|${view.start}|${view.end}|${view.dayWidth}|${view.rowHeight}|${view.panelWidth}|${$('#timeline-canvas')?.childElementCount || 0}`;
    if (signature === lastRenderSignature) return;
    lastRenderSignature = signature;
    document.dispatchEvent(new CustomEvent('gantt-desk:rendered', {
      detail: {
        source,
        taskCount: tasks.length,
        rowHeight: view.rowHeight,
        dayWidth: view.dayWidth,
        panelWidth: view.panelWidth,
      },
    }));
  }

  function scheduleRendered(source = 'observer') {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => dispatchRendered(source), 80);
  }

  function bindEvents() {
    window.addEventListener('gantt-display-updated', (event) => syncFromDisplayEvent(event.detail || {}));

    $('#zoom-range')?.addEventListener('input', (event) => {
      scheduleSync({ dayWidth: clamp(event.target.value, MIN_DAY_WIDTH, MAX_DAY_WIDTH) });
    });

    $('#timeline-start')?.addEventListener('change', () => scheduleRendered('view-dates'));
    $('#timeline-end')?.addEventListener('change', () => scheduleRendered('view-dates'));

    window.addEventListener('resize', () => scheduleRendered('resize'));
    window.addEventListener('beforeunload', () => {
      const taskPanelWidth = $('#task-panel')?.getBoundingClientRect().width;
      if (taskPanelWidth) persistDisplayState({ panelWidth: taskPanelWidth });
    });
  }

  function observeTimeline() {
    const target = $('#timeline-canvas');
    if (!target || target.dataset.displayBridgeObserved === '1') return false;
    target.dataset.displayBridgeObserved = '1';
    const observer = new MutationObserver(() => scheduleRendered('timeline-render'));
    observer.observe(target, { childList: true, subtree: true });
    return true;
  }

  function boot() {
    const next = persistDisplayState();
    applyDisplayStateToDOM(next);
    bindEvents();
    let attempts = 0;
    const wait = () => {
      if (observeTimeline()) {
        scheduleRendered('boot');
        return;
      }
      attempts += 1;
      if (attempts < 30) setTimeout(wait, 120);
    };
    wait();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
