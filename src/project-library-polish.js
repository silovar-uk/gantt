(() => {
  const style = document.createElement('style');
  style.textContent = `
    .project-card__main { padding:0; border:0; background:transparent; cursor:pointer; }
    .project-card__main:focus-visible { outline:3px solid rgba(36,74,143,.22); outline-offset:3px; border-radius:6px; }
    .project-card__controls .library-mini { white-space:nowrap; }
  `;
  document.head.append(style);
})();
