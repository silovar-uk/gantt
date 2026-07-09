(() => {
  function ensureStyle() {
    if (document.querySelector('#json-modal-close-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'json-modal-close-fix-style';
    style.textContent = `
      #json-modal[hidden] { display: none !important; }
      #json-modal.is-force-closed { display: none !important; }
    `;
    document.head.append(style);
  }

  function getModal() {
    return document.querySelector('#json-modal');
  }

  function closeJsonModal() {
    const modal = getModal();
    if (!modal) return;
    modal.hidden = true;
    modal.classList.add('is-force-closed');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('json-import-modal-open');
  }

  function openStateGuard() {
    const modal = getModal();
    if (!modal) return;
    const observer = new MutationObserver(() => {
      if (!modal.hidden) {
        modal.classList.remove('is-force-closed');
        modal.removeAttribute('aria-hidden');
        document.body.classList.add('json-import-modal-open');
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['hidden'] });
  }

  function bindCloseEvents() {
    document.addEventListener('click', (event) => {
      const shouldClose = event.target.closest('[data-close-modal="json"]')
        || event.target.closest('#json-modal .modal-backdrop');
      if (!shouldClose) return;
      event.preventDefault();
      event.stopPropagation();
      closeJsonModal();
    }, true);

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const modal = getModal();
      if (!modal || modal.hidden) return;
      event.preventDefault();
      closeJsonModal();
    }, true);
  }

  function initialize() {
    ensureStyle();
    bindCloseEvents();
    openStateGuard();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
