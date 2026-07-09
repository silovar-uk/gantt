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
    .project-actions .button,
    .project-actions .icon-button {
      flex:0 0 auto;
    }
    .project-actions .menu-wrap {
      flex:0 0 auto;
    }
    .project-actions .action-share { order:1; }
    .project-actions .action-import { order:2; }
    .project-actions .action-export-wrap { order:3; }
    .project-actions .action-library { order:4; }
    .project-actions .action-more-wrap { order:5; }
    .project-actions .save-status { order:20; }

    #share-open-btn,
    #export-json-btn,
    #import-json-btn,
    #library-open-btn {
      min-width:84px;
      min-height:36px;
      padding-inline:11px;
      font-weight:850;
    }
    #share-open-btn {
      color:#fff;
      border-color:#244a8f;
      background:#244a8f;
      box-shadow:0 1px 1px rgba(36,74,143,.16);
    }
    #share-open-btn:hover {
      background:#1e3e78;
      border-color:#1e3e78;
    }
    #export-json-btn {
      border-color:#8fa1b7;
      background:#fff;
    }
    #export-json-btn::after {
      content:'▾';
      margin-left:2px;
      color:#64748b;
      font-size:10px;
    }
    #library-open-btn {
      min-width:66px;
      color:#475569;
      background:#f8fafc;
      border-color:#dbe2ea;
    }
    #export-menu {
      left:auto;
      right:0;
      max-width:calc(100vw - 24px);
    }
    .project-actions .popup-menu {
      z-index:130;
    }
    .save-status {
      max-width:180px;
      overflow:hidden;
      text-overflow:ellipsis;
    }

    @media (max-width:1040px) {
      .save-status {
        flex-basis:100%;
        max-width:none;
        text-align:right;
      }
    }
    @media (max-width:860px) {
      .project-bar { padding:10px 12px; }
      .project-title-wrap { flex-basis:100%; }
      .project-actions {
        width:100%;
        flex-basis:100%;
        justify-content:flex-start;
        align-items:stretch;
      }
      .save-status {
        order:30;
        flex-basis:100%;
        font-size:11px;
        text-align:left;
      }
      #share-open-btn,
      #import-json-btn,
      #export-json-btn,
      #library-open-btn {
        min-width:0;
      }
      .project-actions .action-share,
      .project-actions .action-import,
      .project-actions .action-export-wrap,
      .project-actions .action-library {
        flex:1 1 116px;
      }
      #share-open-btn,
      #import-json-btn,
      #export-json-btn,
      #library-open-btn {
        width:100%;
      }
      .project-actions .action-more-wrap {
        flex:0 0 38px;
      }
      #more-btn {
        width:38px;
        height:36px;
      }
    }
    @media (max-width:720px) {
      .library-open-button.action-library {
        display:inline-flex !important;
      }
    }
    @media (max-width:560px) {
      .project-actions {
        display:grid;
        grid-template-columns:1fr 1fr 40px;
        gap:6px;
      }
      .project-actions .action-share,
      .project-actions .action-export-wrap,
      .project-actions .action-import,
      .project-actions .action-library,
      .project-actions .action-more-wrap,
      #share-open-btn,
      #import-json-btn,
      #export-json-btn,
      #library-open-btn {
        width:100%;
      }
      .project-actions .action-share { grid-column:1; grid-row:1; }
      .project-actions .action-export-wrap { grid-column:2; grid-row:1; }
      .project-actions .action-more-wrap { grid-column:3; grid-row:1; }
      .project-actions .action-import { grid-column:1; grid-row:2; }
      .project-actions .action-library { grid-column:2 / 4; grid-row:2; }
      .save-status {
        grid-column:1 / -1;
        grid-row:3;
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

  function polishHeaderActions() {
    const share = document.getElementById('share-open-btn');
    const library = document.getElementById('library-open-btn');
    const importer = document.getElementById('import-json-btn');
    const exporter = document.getElementById('export-json-btn');
    const more = document.getElementById('more-btn');

    if (share) {
      share.textContent = '共有';
      share.title = '共有ビューと画像出力を開く';
      share.classList.add('action-share');
    }
    if (library) {
      library.textContent = '保存';
      library.title = '保存済みガントを管理する';
      library.classList.add('action-library');
    }
    if (importer) {
      importer.textContent = 'JSON読込';
      importer.title = 'JSONを読み込む';
      importer.classList.add('action-import');
    }
    if (exporter) {
      exporter.textContent = '書き出し';
      exporter.title = 'JSONを書き出す';
      exporter.closest('.menu-wrap')?.classList.add('action-export-wrap');
    }
    if (more) {
      more.closest('.menu-wrap')?.classList.add('action-more-wrap');
    }
  }

  // Step 1 restore: display density.
  loadScript('src/display-density-layer.js?v=20260709-safe-density-v1');
  // Step 2 restore: category display.
  loadScript('src/category-display-layer.js?v=20260709-safe-category-v1');
  // Step 3 restore: calendar highlights and legend.
  loadScript('src/calendar-highlight-layer.js?v=20260709-safe-calendar-v1');

  polishHeaderActions();
  setTimeout(polishHeaderActions, 120);
  setTimeout(polishHeaderActions, 520);

  window.GANTT_DESK_SAFE_MODE = true;
  window.GANTT_DESK_RESTORED_LAYERS = ['display-density-layer', 'category-display-layer', 'calendar-highlight-layer', 'header-action-polish'];
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
