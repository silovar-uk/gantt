(() => {
  const style = document.createElement('style');
  style.textContent = `
    .project-card__main { padding:0; border:0; background:transparent; cursor:pointer; }
    .project-card__main:focus-visible { outline:3px solid rgba(36,74,143,.22); outline-offset:3px; border-radius:6px; }
    .project-card__controls .library-mini { white-space:nowrap; }
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

  const loadSharePolish = () => {
    loadScript('src/calendar-output-layer.js');
    loadScript('src/share-header-polish.js');
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

  document.addEventListener('pointerdown', (event) => {
    if (event.target.closest('#share-open-btn, #share-settings-btn, [data-share-action]')) loadSharePolish();
  }, true);

  const idle = window.requestIdleCallback || ((callback) => setTimeout(callback, 1800));
  idle(loadSharePolish, { timeout: 4200 });
})();
