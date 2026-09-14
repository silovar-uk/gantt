(() => {
  const POLISH_VERSION = '20260914-sage2';
  let frame = 0;
  let quietTimer = 0;

  const paths = {
    undo: '<path d="M9 7 5 3 1 7"/><path d="M5 3v7a6 6 0 0 0 6 6h4"/>',
    redo: '<path d="m7 7 4-4 4 4"/><path d="M11 3v7a6 6 0 0 1-6 6H1"/>',
    search: '<circle cx="7.5" cy="7.5" r="4.75"/><path d="m11 11 4 4"/>',
    settings: '<circle cx="8" cy="8" r="2.25"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"/>',
    chevronDown: '<path d="m4 6 4 4 4-4"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    minus: '<path d="M3 8h10"/>',
    x: '<path d="m3.5 3.5 9 9M12.5 3.5l-9 9"/>',
    ellipsis: '<circle cx="3" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="13" cy="8" r="1" fill="currentColor" stroke="none"/>',
  };

  function icon(name) {
    return `<svg class="ui-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
  }
  globalThis.ganttIcon = icon;

  function replaceExact(element, symbol, name) {
    if (!element || element.querySelector('.ui-icon')) return;
    if (element.textContent.trim() !== symbol) return;
    element.innerHTML = icon(name);
  }

  function iconify() {
    document.querySelectorAll('button, .search-box > span, [aria-hidden="true"]').forEach((element) => {
      replaceExact(element, '↶', 'undo');
      replaceExact(element, '↷', 'redo');
      replaceExact(element, '⌕', 'search');
      replaceExact(element, '⚙', 'settings');
      replaceExact(element, '⌄', 'chevronDown');
      replaceExact(element, '＋', 'plus');
      replaceExact(element, '+', 'plus');
      replaceExact(element, '−', 'minus');
      replaceExact(element, '-', 'minus');
      replaceExact(element, '×', 'x');
      replaceExact(element, '•••', 'ellipsis');
    });

    document.querySelectorAll('.add-button').forEach((button) => {
      if (button.querySelector('.ui-icon')) return;
      const text = button.textContent.trim();
      const label = text.replace(/^[＋+]\s*/, '');
      if (label === text) return;
      button.innerHTML = `${icon('plus')}<span>${escapeHTML(label)}</span>`;
    });
  }

  function compactPeriod(text) {
    const match = String(text || '').match(/^(\d{4})-(\d{2})-(\d{2})\s*[〜~–-]+\s*(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return String(text || '').trim();
    const [, y1, m1, d1, y2, m2, d2] = match;
    if (y1 === y2) return `${Number(m1)}/${Number(d1)}–${Number(m2)}/${Number(d2)}`;
    return `${y1.slice(2)}/${Number(m1)}/${Number(d1)}–${y2.slice(2)}/${Number(m2)}/${Number(d2)}`;
  }

  function polishPresentBar() {
    const bar = document.querySelector('#ux-present-bar');
    if (!bar || bar.hidden) return;
    const title = bar.querySelector('.ux-present-title strong');
    const period = bar.querySelector('.ux-present-title span');
    const meta = [...bar.querySelectorAll('.ux-present-meta span')];
    if (!title || !period) return;
    if (!period.dataset.presentCompact) {
      const original = period.textContent.trim();
      const count = meta[0]?.textContent.trim() || '';
      period.dataset.presentOriginal = original;
      period.dataset.presentCompact = '1';
      period.textContent = [compactPeriod(original), count].filter(Boolean).join(' · ');
    }
    const updated = meta[1]?.textContent.trim() || '';
    const originalPeriod = period.dataset.presentOriginal || period.textContent.trim();
    bar.title = [title.textContent.trim(), originalPeriod, updated].filter(Boolean).join(' · ');
    bar.dataset.presentHud = POLISH_VERSION;
  }

  function recolorCompass() {
    const busy = document.querySelector('.time-compass-busy');
    if (!busy) return;
    const current = busy.style.backgroundImage || '';
    const next = current.replace(/91\s*,\s*103\s*,\s*216/g, '62, 106, 90');
    if (next && next !== current) busy.style.backgroundImage = next;
  }

  function applyPolish() {
    iconify();
    recolorCompass();
    polishPresentBar();
    document.body.dataset.uiPolish = POLISH_VERSION;
  }

  function clearQuiet() {
    clearTimeout(quietTimer);
    document.body.classList.remove('is-present-hud-quiet');
  }

  document.addEventListener('pointermove', (event) => {
    if (!document.body.classList.contains('is-present-mode')) return;
    if (event.target.closest('#ux-present-bar')) {
      clearQuiet();
      return;
    }
    if (event.target.closest('#workspace')) {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => {
        if (document.body.classList.contains('is-present-mode')) document.body.classList.add('is-present-hud-quiet');
      }, 650);
    }
  }, { passive: true });

  document.addEventListener('focusin', (event) => {
    if (event.target.closest('#ux-present-bar')) clearQuiet();
  });

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-ux-action]')?.dataset.uxAction;
    if (action === 'present') {
      clearQuiet();
      setTimeout(applyPolish, 0);
      setTimeout(applyPolish, 60);
    } else if (action === 'exit-present') {
      clearQuiet();
    }
  });

  const appObserver = new MutationObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(applyPolish);
  });
  appObserver.observe(document.querySelector('#app') || document.body, { childList: true, subtree: true });

  applyPolish();
  setTimeout(applyPolish, 120);
  setTimeout(applyPolish, 600);
})();
