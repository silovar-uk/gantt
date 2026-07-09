(() => {
  const style = document.createElement('style');
  style.textContent = `
    .project-card__main { padding:0; border:0; background:transparent; cursor:pointer; }
    .project-card__main:focus-visible { outline:3px solid rgba(36,74,143,.22); outline-offset:3px; border-radius:6px; }
    .project-card__controls .library-mini { white-space:nowrap; }

    /* Safety net: hidden overlays must never intercept pointer events. */
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
    .holiday-band,
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

  loadScript('src/icon-and-import-quickstart.js');
  loadScript('src/import-start-chooser-v2.js');
  loadScript('src/json-modal-close-fix.js');
  loadScript('src/import-validate-cta.js');
  loadScript('src/display-density-layer.js');
  loadScript('src/category-display-layer.js');
  loadScript('src/share-density-bridge.js');
  loadScript('src/header-ux-layer.js');
  loadScript('src/calendar-highlight-layer.js');

  // Disabled for now because these late polish layers caused UI event blocking on some browsers.
  // Re-enable only after they are folded into share-layer.js without capture listeners/observers.
  window.GANTT_DESK_SHARE_POLISH_DISABLED = true;
})();
