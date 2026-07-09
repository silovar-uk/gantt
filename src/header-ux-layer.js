(() => {
  const $ = (selector) => document.querySelector(selector);

  function addStyles() {
    if ($('#header-ux-style')) return;
    const style = document.createElement('style');
    style.id = 'header-ux-style';
    style.textContent = `
      .project-actions { gap:7px; }
      .app-mode-pill { flex:0 0 auto; padding:4px 8px; border:1px solid #dbe2ea; border-radius:999px; color:#526174; background:#f8fafc; font-size:11px; font-weight:850; white-space:nowrap; }
      .project-actions #import-json-btn { order:10; }
      .project-actions #share-open-btn { order:20; color:#fff; border-color:#244a8f; background:#244a8f; box-shadow:0 1px 1px rgba(36,74,143,.16); }
      .project-actions #share-open-btn:hover { background:#1e3e78; border-color:#1e3e78; }
      .project-actions #library-open-btn { order:30; }
      .project-actions #export-json-btn { order:40; color:#64748b; background:#fff; border-color:#dbe2ea; }
      .project-actions #export-json-btn:hover { color:#172033; background:#f8fafc; }
      .project-actions .menu-wrap:has(#more-btn) { order:50; }
      .project-actions #save-status { order:90; padding:4px 7px; border-radius:999px; color:#64748b; background:#f8fafc; font-size:11px; }
      .project-actions #save-status.is-saving { color:#244a8f; background:#eef4ff; }
      .project-actions #save-status.is-error { color:#b42318; background:#fef3f2; }
      .toolbar .display-toolbar-group { margin-left:auto; }
      .toolbar-group-zoom + .display-toolbar-group { margin-left:0; }
      @media (max-width:980px) {
        .project-title { width:min(360px, 36vw); }
        .app-mode-pill { display:none; }
        .project-actions #save-status { display:none; }
      }
      @media (max-width:650px) {
        .project-bar { align-items:flex-start; flex-direction:column; gap:10px; }
        .project-actions { width:100%; flex-wrap:wrap; }
        .project-actions #import-json-btn,
        .project-actions #share-open-btn,
        .project-actions #library-open-btn { flex:1 1 auto; }
        .project-actions #export-json-btn { display:none; }
      }
    `;
    document.head.append(style);
  }

  function ensureModePill() {
    const titleWrap = $('.project-title-wrap');
    if (!titleWrap || $('#app-mode-pill')) return;
    const pill = document.createElement('span');
    pill.id = 'app-mode-pill';
    pill.className = 'app-mode-pill';
    pill.textContent = document.body.classList.contains('gantt-share-mode') ? '共有ビュー' : '編集モード';
    titleWrap.append(pill);
  }

  function updateLabels() {
    const library = $('#library-open-btn');
    if (library) {
      library.textContent = '保存';
      library.title = 'ブラウザ内の保存・管理を開く';
    }
    const exportButton = $('#export-json-btn');
    if (exportButton) exportButton.textContent = '書き出し';
    const share = $('#share-open-btn');
    if (share) share.textContent = '共有・出力';
    const pill = $('#app-mode-pill');
    if (pill) pill.textContent = document.body.classList.contains('gantt-share-mode') ? '共有ビュー' : '編集モード';
  }

  function initialize() {
    addStyles();
    ensureModePill();
    updateLabels();
    const observer = new MutationObserver(() => {
      ensureModePill();
      updateLabels();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const actions = $('.project-actions');
    if (actions) observer.observe(actions, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
