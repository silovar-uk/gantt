(() => {
  const install = () => {
    const card = document.querySelector('#json-modal .modal-card');
    if (!card) return setTimeout(install, 40);
    card.classList.add('json-modal-card--guided');

    const style = document.createElement('style');
    style.textContent = `
      .modal-card.json-modal-card--guided { display:flex; flex-direction:column; }
      .modal-card.json-modal-card--guided .modal-head,
      .modal-card.json-modal-card--guided .modal-foot,
      .modal-card.json-modal-card--guided .json-import-workspace-head { flex:0 0 auto; }
      .modal-card.json-modal-card--guided .json-start-choice,
      .modal-card.json-modal-card--guided .import-layout { min-height:0; overflow:auto; }
      .modal-card.json-modal-card--guided .json-start-choice { flex:1 1 auto; }
      .modal-card.json-modal-card--guided .import-layout { flex:1 1 auto; }
    `;
    document.head.append(style);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
