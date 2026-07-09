(() => {
  const DISPLAY_KEY = 'gantt-desk:v4:display-settings';
  const MIN_ROW_HEIGHT = 18;
  const MAX_ROW_HEIGHT = 72;
  const MIN_PANEL_WIDTH = 320;
  const MAX_PANEL_WIDTH = 920;
  const $ = (selector) => document.querySelector(selector);
  let paneDrag = null;
  let rowDrag = null;
  let toastTimer = null;

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value) || min, min), max);
  }

  function readSettings() {
    try { return JSON.parse(localStorage.getItem(DISPLAY_KEY) || '{}') || {}; }
    catch { return {}; }
  }

  function writeSettings(next) {
    const merged = { ...readSettings(), ...next };
    try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(merged)); } catch {}
    return merged;
  }

  function currentRowHeight() {
    const slider = $('#row-height-slider');
    if (slider) return clamp(slider.value, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
    const settings = readSettings();
    return clamp(settings.rowHeight || getComputedStyle(document.documentElement).getPropertyValue('--row-height') || 40, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
  }

  function currentPanelWidth() {
    const panel = $('#task-panel');
    return clamp(panel?.getBoundingClientRect().width || readSettings().panelWidth || 500, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);
  }

  function setPanelWidth(width, { persist = false } = {}) {
    const panel = $('#task-panel');
    if (!panel) return;
    const max = Math.max(MIN_PANEL_WIDTH, Math.min(window.innerWidth * 0.72, MAX_PANEL_WIDTH));
    const value = clamp(width, MIN_PANEL_WIDTH, max);
    panel.style.width = `${value}px`;
    document.documentElement.style.setProperty('--task-panel-width', `${value}px`);
    const slider = $('#panel-width-slider');
    if (slider && String(slider.value) !== String(Math.round(value))) {
      slider.value = String(Math.round(value));
      const output = $('#panel-width-output');
      if (output) output.value = `${Math.round(value)}px`;
    }
    if (persist) writeSettings({ panelWidth: Math.round(value) });
    window.dispatchEvent(new CustomEvent('gantt-display-updated', { detail: { panelWidth: Math.round(value), source: 'pane-resize' } }));
  }

  function setRowHeight(value, { persist = true, notify = false } = {}) {
    const rowHeight = clamp(value, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
    const slider = $('#row-height-slider');
    if (slider) {
      slider.value = String(rowHeight);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      writeSettings({ rowHeight, density: rowHeight <= 22 ? 'ultra' : 'custom' });
      document.documentElement.style.setProperty('--row-height', `${rowHeight}px`);
    }
    if (persist) writeSettings({ rowHeight, density: rowHeight <= 22 ? 'ultra' : 'custom' });
    const output = $('#row-height-output');
    if (output) output.value = `${rowHeight}px`;
    window.dispatchEvent(new CustomEvent('gantt-display-updated', { detail: { rowHeight, source: 'row-height-drag' } }));
    if (notify) showTinyToast(`行高 ${rowHeight}px`);
  }

  function addStyles() {
    if ($('#display-resize-control-style')) return;
    const style = document.createElement('style');
    style.id = 'display-resize-control-style';
    style.textContent = `
      .pane-resizer.is-resizing-width::after {
        left:3px !important;
        width:4px !important;
        background:#244a8f !important;
      }
      body.is-panel-width-dragging,
      body.is-row-height-dragging {
        user-select:none !important;
        cursor:default;
      }
      body.is-panel-width-dragging * { cursor:col-resize !important; }
      body.is-row-height-dragging * { cursor:ns-resize !important; }
      .task-panel-head { position:relative; }
      .row-height-drag-handle {
        position:absolute;
        z-index:8;
        top:50%;
        right:6px;
        transform:translateY(-50%);
        min-width:54px;
        height:24px;
        padding:0 7px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:3px;
        border:1px solid #cbd7e6;
        border-radius:999px;
        background:rgba(255,255,255,.96);
        color:#334155;
        box-shadow:0 1px 3px rgba(15,23,42,.08);
        font-size:10px;
        font-weight:900;
        cursor:ns-resize;
        white-space:nowrap;
      }
      .row-height-drag-handle:hover,
      .row-height-drag-handle.is-dragging {
        color:#244a8f;
        border-color:#8aa8dc;
        background:#eef4ff;
      }
      .row-height-drag-value {
        font-variant-numeric:tabular-nums;
      }
      body.gantt-density-ultra .row-height-drag-handle {
        height:20px;
        min-width:40px;
        padding-inline:5px;
        font-size:9px;
      }
      body.gantt-density-ultra .row-height-drag-label { display:none; }
      .resize-control-toast {
        position:fixed;
        z-index:180;
        left:50%;
        bottom:54px;
        transform:translate(-50%, 8px);
        padding:7px 10px;
        border-radius:999px;
        color:#fff;
        background:#172033;
        box-shadow:0 10px 28px rgba(15,23,42,.18);
        font-size:12px;
        font-weight:850;
        opacity:0;
        transition:opacity .14s, transform .14s;
        pointer-events:none;
      }
      .resize-control-toast.is-visible {
        opacity:1;
        transform:translate(-50%, 0);
      }
    `;
    document.head.append(style);
  }

  function ensureRowHandle() {
    const head = $('.task-panel-head');
    if (!head || $('#row-height-drag-handle')) return;
    const button = document.createElement('button');
    button.id = 'row-height-drag-handle';
    button.className = 'row-height-drag-handle';
    button.type = 'button';
    button.title = '上下にドラッグして行の高さを変更。ダブルクリックで標準に戻します。';
    button.innerHTML = `<span aria-hidden="true">↕</span><span class="row-height-drag-label">行高</span><span id="row-height-drag-value" class="row-height-drag-value">${currentRowHeight()}</span>`;
    head.append(button);
  }

  function syncHandleLabel() {
    const value = $('#row-height-drag-value');
    if (value) value.textContent = String(currentRowHeight());
  }

  function bindPaneResize() {
    const resizer = $('#pane-resizer');
    if (!resizer || resizer.dataset.safeResizeBound === '1') return;
    resizer.dataset.safeResizeBound = '1';
    resizer.addEventListener('pointerdown', (event) => {
      if (window.innerWidth <= 650) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      paneDrag = {
        startX: event.clientX,
        initialWidth: currentPanelWidth(),
      };
      document.body.classList.add('is-panel-width-dragging');
      resizer.classList.add('is-resizing-width');
      try { resizer.setPointerCapture(event.pointerId); } catch {}
      window.addEventListener('pointermove', onPaneMove, true);
      window.addEventListener('pointerup', onPaneUp, { once: true, capture: true });
    }, true);
  }

  function onPaneMove(event) {
    if (!paneDrag) return;
    event.preventDefault();
    const delta = event.clientX - paneDrag.startX;
    setPanelWidth(paneDrag.initialWidth + delta, { persist: false });
  }

  function onPaneUp(event) {
    if (!paneDrag) return;
    event.preventDefault();
    window.removeEventListener('pointermove', onPaneMove, true);
    paneDrag = null;
    document.body.classList.remove('is-panel-width-dragging');
    $('#pane-resizer')?.classList.remove('is-resizing-width');
    setPanelWidth(currentPanelWidth(), { persist: true });
    syncPanelSlider();
  }

  function bindRowHeightDrag() {
    const handle = $('#row-height-drag-handle');
    if (!handle || handle.dataset.rowDragBound === '1') return;
    handle.dataset.rowDragBound = '1';
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      rowDrag = {
        startY: event.clientY,
        initialHeight: currentRowHeight(),
        lastHeight: currentRowHeight(),
      };
      handle.classList.add('is-dragging');
      document.body.classList.add('is-row-height-dragging');
      try { handle.setPointerCapture(event.pointerId); } catch {}
      window.addEventListener('pointermove', onRowMove, true);
      window.addEventListener('pointerup', onRowUp, { once: true, capture: true });
    }, true);
    handle.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setRowHeight(40, { notify: true });
      syncHandleLabel();
    });
  }

  function onRowMove(event) {
    if (!rowDrag) return;
    event.preventDefault();
    const raw = rowDrag.initialHeight + (event.clientY - rowDrag.startY);
    const step = event.shiftKey ? 1 : 2;
    const next = clamp(Math.round(raw / step) * step, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
    if (next === rowDrag.lastHeight) return;
    rowDrag.lastHeight = next;
    setRowHeight(next, { notify: false });
    syncHandleLabel();
  }

  function onRowUp(event) {
    if (!rowDrag) return;
    event.preventDefault();
    window.removeEventListener('pointermove', onRowMove, true);
    const finalHeight = rowDrag.lastHeight;
    rowDrag = null;
    $('#row-height-drag-handle')?.classList.remove('is-dragging');
    document.body.classList.remove('is-row-height-dragging');
    setRowHeight(finalHeight, { notify: true });
    syncHandleLabel();
  }

  function syncPanelSlider() {
    const slider = $('#panel-width-slider');
    if (!slider) return;
    const width = Math.round(currentPanelWidth());
    slider.value = String(width);
    const output = $('#panel-width-output');
    if (output) output.value = `${width}px`;
  }

  function showTinyToast(message) {
    let node = $('#resize-control-toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'resize-control-toast';
      node.className = 'resize-control-toast';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.append(node);
    }
    node.textContent = message;
    node.hidden = false;
    requestAnimationFrame(() => node.classList.add('is-visible'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      node.classList.remove('is-visible');
      setTimeout(() => { node.hidden = true; }, 160);
    }, 900);
  }

  function init() {
    addStyles();
    ensureRowHandle();
    bindPaneResize();
    bindRowHeightDrag();
    syncHandleLabel();
    setInterval(() => {
      ensureRowHandle();
      bindPaneResize();
      bindRowHeightDrag();
      syncHandleLabel();
    }, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
