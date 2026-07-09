(() => {
  const style = document.createElement('style');
  style.textContent = `
    /* Emergency safe mode: keep the base app interactive. */
    [hidden],
    .modal[hidden],
    .share-modal[hidden],
    .project-library-modal[hidden],
    #json-modal[hidden],
    #share-modal[hidden] {
      display:none !important;
      pointer-events:none !important;
    }
    body:not(.gantt-share-mode) #share-mode-header {
      display:none !important;
      pointer-events:none !important;
    }
    .weekend-layer,
    .selected-row-band,
    .today-line,
    .today-dot {
      pointer-events:none !important;
    }
  `;
  document.head.append(style);

  window.GANTT_DESK_SAFE_MODE = true;
  window.GANTT_DESK_DISABLED_POLISH_LAYERS = [
    'icon-and-import-quickstart',
    'import-start-chooser-v2',
    'json-modal-close-fix',
    'import-validate-cta',
    'display-density-layer',
    'category-display-layer',
    'share-density-bridge',
    'header-ux-layer',
    'calendar-highlight-layer',
    'calendar-output-layer',
    'share-header-polish',
  ];
})();
