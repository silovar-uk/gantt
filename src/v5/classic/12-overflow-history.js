(() => {
  function installOverflowHistory() {
    const menu = document.querySelector('#ux-more-menu');
    const topActions = document.querySelector('.top-actions');
    if (!menu || !topActions) {
      setTimeout(installOverflowHistory, 40);
      return;
    }
    if (menu.querySelector('[data-ux-history-actions]')) return;

    const group = document.createElement('div');
    group.dataset.uxHistoryActions = 'true';
    group.className = 'ux-history-actions';
    group.innerHTML = `
      <button type="button" data-action="undo"><span>元に戻す</span><small>直前の変更を取り消す</small></button>
      <button type="button" data-action="redo"><span>やり直す</span><small>取り消した変更を戻す</small></button>
    `;
    menu.prepend(group);

    const overflowUndo = group.querySelector('[data-action="undo"]');
    const overflowRedo = group.querySelector('[data-action="redo"]');
    const sourceUndo = topActions.querySelector('[data-action="undo"]');
    const sourceRedo = topActions.querySelector('[data-action="redo"]');

    const sync = () => {
      if (sourceUndo && overflowUndo) overflowUndo.disabled = sourceUndo.disabled;
      if (sourceRedo && overflowRedo) overflowRedo.disabled = sourceRedo.disabled;
    };
    sync();

    const observer = new MutationObserver(sync);
    if (sourceUndo) observer.observe(sourceUndo, { attributes: true, attributeFilter: ['disabled'] });
    if (sourceRedo) observer.observe(sourceRedo, { attributes: true, attributeFilter: ['disabled'] });
    document.addEventListener('gantt-desk:v5-change', sync);
  }

  installOverflowHistory();
})();
