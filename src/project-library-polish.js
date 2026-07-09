(() => {
  const style = document.createElement('style');
  style.textContent = `
    /* Safe mode guard: keep the base app interactive. */
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

  const loadedScripts = new Set();
  const loadScript = (src) => {
    if (loadedScripts.has(src) || document.querySelector(`script[src="${src}"]`)) return;
    loadedScripts.add(src);
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    document.head.append(script);
  };

  // Step 1 restore: display density only. Other polish layers stay disabled.
  loadScript('src/display-density-layer.js?v=20260709-safe-density-v1');

  window.GANTT_DESK_SAFE_MODE = true;
  window.GANTT_DESK_RESTORED_LAYERS = ['display-density-layer'];
  window.GANTT_DESK_DISABLED_POLISH_LAYERS = [
    'icon-and-import-quickstart',
    'import-start-chooser-v2',
    'json-modal-close-fix',
    'import-validate-cta',
    'category-display-layer',
    'share-density-bridge',
    'header-ux-layer',
    'calendar-highlight-layer',
    'calendar-output-layer',
    'share-header-polish',
  ];
})();
