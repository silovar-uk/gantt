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
    .today-dot,
    .holiday-band {
      pointer-events:none !important;
    }

    /* Header action safety: prevent export controls from being pushed off-screen. */
    .project-bar {
      flex-wrap:wrap;
      align-items:flex-start;
      gap:10px 14px;
    }
    .project-title-wrap {
      flex:1 1 320px;
      max-width:100%;
    }
    .project-title {
      width:100%;
      max-width:min(560px, 100%);
    }
    .project-actions {
      flex:1 1 360px;
      min-width:0;
      display:flex;
      align-items:center;
      justify-content:flex-end;
      flex-wrap:wrap;
      gap:6px;
    }
    .project-actions .menu-wrap {
      flex:0 0 auto;
    }
    #export-json-btn,
    #import-json-btn {
      min-width:92px;
    }
    #export-menu {
      left:auto;
      right:0;
      max-width:calc(100vw - 24px);
    }
    .project-actions .popup-menu {
      z-index:130;
    }
    @media (max-width:860px) {
      .project-bar { padding:10px 12px; }
      .project-title-wrap { flex-basis:100%; }
      .project-actions {
        width:100%;
        flex-basis:100%;
        justify-content:flex-start;
      }
      .save-status {
        order:10;
        flex-basis:100%;
        font-size:11px;
      }
      #import-json-btn,
      #export-json-btn {
        flex:1 1 118px;
        min-width:0;
      }
      .project-actions .menu-wrap:not(:has(#more-btn)) {
        flex:1 1 118px;
      }
      #export-json-btn {
        width:100%;
      }
      #more-btn {
        flex:0 0 34px;
      }
    }
    @media (max-width:480px) {
      .project-actions {
        display:grid;
        grid-template-columns:1fr 1fr 40px;
        gap:6px;
      }
      .project-actions .menu-wrap,
      #import-json-btn,
      #export-json-btn {
        width:100%;
      }
      .save-status {
        grid-column:1 / -1;
      }
      .popup-menu,
      .popup-menu-right {
        position:fixed;
        left:10px !important;
        right:10px !important;
        top:auto !important;
        bottom:12px !important;
        width:auto !important;
        max-width:none;
      }
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

  // Step 1 restore: display density.
  loadScript('src/display-density-layer.js?v=20260709-safe-density-v1');
  // Step 2 restore: category display.
  loadScript('src/category-display-layer.js?v=20260709-safe-category-v1');
  // Step 3 restore: calendar highlights and legend.
  loadScript('src/calendar-highlight-layer.js?v=20260709-safe-calendar-v1');

  window.GANTT_DESK_SAFE_MODE = true;
  window.GANTT_DESK_RESTORED_LAYERS = ['display-density-layer', 'category-display-layer', 'calendar-highlight-layer'];
  window.GANTT_DESK_DISABLED_POLISH_LAYERS = [
    'icon-and-import-quickstart',
    'import-start-chooser-v2',
    'json-modal-close-fix',
    'import-validate-cta',
    'share-density-bridge',
    'header-ux-layer',
    'calendar-output-layer',
    'share-header-polish',
  ];
})();
