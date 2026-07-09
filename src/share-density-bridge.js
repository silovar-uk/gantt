(() => {
  const DISPLAY_KEY = 'gantt-desk:v4:display-settings';
  const PROJECT_KEY = 'gantt-desk:v2:project';
  let beforeShare = null;
  let inShare = false;

  function readSettings() {
    try { return JSON.parse(localStorage.getItem(DISPLAY_KEY) || '{}'); }
    catch { return {}; }
  }
  function writeSettings(value) { localStorage.setItem(DISPLAY_KEY, JSON.stringify(value)); }

  function readProject() {
    try { return JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}'); }
    catch { return {}; }
  }
  function writeProject(project) { localStorage.setItem(PROJECT_KEY, JSON.stringify(project)); }

  function setSlider(selector, value) {
    const input = document.querySelector(selector);
    if (!input) return false;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  function applyDisplayPatch(patch) {
    const next = { ...readSettings(), ...patch };
    writeSettings(next);
    const project = readProject();
    project.view = project.view || {};
    if (patch.rowHeight) project.view.rowHeight = patch.rowHeight;
    if (patch.dayWidth) project.view.dayWidth = patch.dayWidth;
    if (patch.panelWidth) project.view.panelWidth = patch.panelWidth;
    project.display = { ...(project.display || {}), density: patch.density || next.density, categoryMode: next.categoryMode };
    writeProject(project);

    setSlider('#row-height-slider', next.rowHeight || 32);
    setSlider('#day-width-slider', next.dayWidth || 18);
    setSlider('#panel-width-slider', next.panelWidth || 430);
    document.body.classList.toggle('gantt-share-density', true);
  }

  function enterShareDensity() {
    if (inShare) return;
    inShare = true;
    beforeShare = readSettings();
    const current = readSettings();
    const categoryMode = current.categoryMode === 'hide' ? 'hide' : 'color';
    applyDisplayPatch({
      density: 'share',
      rowHeight: Math.min(Number(current.rowHeight) || 40, 32),
      dayWidth: Math.min(Number(current.dayWidth) || 24, 18),
      panelWidth: Math.min(Number(current.panelWidth) || 500, 430),
      categoryMode,
    });
  }

  function exitShareDensity() {
    if (!inShare) return;
    inShare = false;
    document.body.classList.remove('gantt-share-density');
    if (beforeShare) {
      writeSettings(beforeShare);
      setSlider('#row-height-slider', beforeShare.rowHeight || 40);
      setSlider('#day-width-slider', beforeShare.dayWidth || 24);
      setSlider('#panel-width-slider', beforeShare.panelWidth || 500);
    }
    beforeShare = null;
  }

  function syncProjectBeforeExport() {
    const settings = readSettings();
    const project = readProject();
    project.view = project.view || {};
    if (settings.rowHeight) project.view.rowHeight = settings.rowHeight;
    if (settings.dayWidth) project.view.dayWidth = settings.dayWidth;
    if (settings.panelWidth) project.view.panelWidth = settings.panelWidth;
    project.display = { ...(project.display || {}), density: settings.density || 'custom', categoryMode: settings.categoryMode || 'show' };
    writeProject(project);
  }

  function addStyles() {
    if (document.querySelector('#share-density-style')) return;
    const style = document.createElement('style');
    style.id = 'share-density-style';
    style.textContent = `
      .gantt-share-density .share-mode-header { min-height:64px; padding:10px 16px; }
      .gantt-share-density .share-mode-header__title { font-size:18px; }
      .gantt-share-density .share-mode-header__meta { margin-top:3px; font-size:11px; }
      .gantt-share-density .share-legend-item { font-size:10px; }
      .gantt-share-density.gantt-share-mode .task-panel { width:430px !important; }
      .gantt-share-density .task-panel-head { height:48px; }
      .gantt-share-density .task-cell { padding-inline:7px; }
      .gantt-share-density .task-name { font-size:11px; }
      .gantt-share-density .task-date { font-size:10px; }
      .share-density-note { margin-top:9px; padding:8px 9px; border:1px solid #d9e5f6; border-radius:8px; color:#48627e; background:#f4f8ff; font-size:11px; line-height:1.45; }
    `;
    document.head.append(style);
  }

  function addModalNote() {
    const modal = document.querySelector('#share-modal .share-modal__section:last-of-type');
    if (!modal || document.querySelector('.share-density-note')) return;
    const note = document.createElement('p');
    note.className = 'share-density-note';
    note.textContent = '共有ビューでは自動で高密度表示に寄せます。PNG／Excel出力前にも現在の表示密度を反映します。';
    modal.append(note);
  }

  function initialize() {
    addStyles();
    const observer = new MutationObserver(() => {
      addModalNote();
      document.body.classList.contains('gantt-share-mode') ? enterShareDensity() : exitShareDensity();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-share-action]')) syncProjectBeforeExport();
    }, true);
    setTimeout(addModalNote, 600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
