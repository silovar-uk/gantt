(() => {
  const style = document.createElement('style');
  style.textContent = `
    .project-card__main { padding:0; border:0; background:transparent; cursor:pointer; }
    .project-card__main:focus-visible { outline:3px solid rgba(36,74,143,.22); outline-offset:3px; border-radius:6px; }
    .project-card__controls .library-mini { white-space:nowrap; }
  `;
  document.head.append(style);

  const loadScript = (src) => {
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
  loadScript('src/calendar-output-layer.js');
})();
