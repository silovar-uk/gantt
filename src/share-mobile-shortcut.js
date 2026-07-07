(() => {
  function addShortcut() {
    const moreMenu = document.querySelector('#more-menu');
    const shareButton = document.querySelector('#share-open-btn');
    if (!moreMenu || !shareButton || document.querySelector('#share-menu-btn')) return;

    const button = document.createElement('button');
    button.id = 'share-menu-btn';
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.textContent = '共有・出力';
    button.addEventListener('click', () => {
      document.querySelector('#more-btn')?.click();
      shareButton.click();
    });
    moreMenu.prepend(button);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addShortcut);
  else addShortcut();
})();
