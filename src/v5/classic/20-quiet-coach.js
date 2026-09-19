(() => {
  const COACH_VERSION = '20260918-coach3';
  const COACH_KEY = 'gantt-desk:v5:coach';
  const LIMIT = 3;
  const VISIBLE_MS = 1800;

  function readCoach() {
    try {
      const raw = localStorage.getItem(COACH_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const base = { drag: 0, detail: 0, window: 0 };
      return parsed && typeof parsed === 'object' ? { ...base, ...parsed } : base;
    } catch {
      return null;
    }
  }

  function writeCoach(next) {
    try { localStorage.setItem(COACH_KEY, JSON.stringify(next)); } catch { /* private window etc. */ }
  }

  let coach = readCoach();
  const disabled = !coach;
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  let activeBubble = null;
  function showHint(anchor, text) {
    if (disabled || !anchor?.isConnected) return;
    activeBubble?.remove();
    const rect = anchor.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const bubble = document.createElement('div');
    bubble.className = 'quiet-coach-hint';
    bubble.setAttribute('role', 'status');
    bubble.textContent = text;
    document.body.append(bubble);
    bubble.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
    bubble.style.top = `${Math.round(rect.top)}px`;
    activeBubble = bubble;
    const remove = () => { bubble.remove(); if (activeBubble === bubble) activeBubble = null; };
    if (reduceMotion()) {
      bubble.classList.add('is-instant');
      setTimeout(remove, VISIBLE_MS);
      return;
    }
    setTimeout(() => bubble.classList.add('is-visible'), 20);
    setTimeout(() => {
      bubble.classList.remove('is-visible');
      setTimeout(remove, 200);
    }, VISIBLE_MS);
  }

  function trigger(key, anchor, text) {
    if (disabled || coach[key] >= LIMIT) return;
    showHint(anchor, text);
  }

  function commit(key) {
    if (disabled || coach[key] >= LIMIT) return;
    coach[key] += 1;
    writeCoach(coach);
  }

  function resetCoach() {
    if (disabled) return;
    coach = { drag: 0, detail: 0, window: 0 };
    writeCoach(coach);
  }

  // Drag: hovering (or a touch long-press) on a bar shows the hint; an actual drag spends it.
  document.addEventListener('pointerover', (event) => {
    const bar = event.target.closest('[data-timeline-task]');
    if (bar) trigger('drag', bar, 'ドラッグで日付を動かせます');
  });

  let longPressTimer = 0;
  document.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    const bar = event.target.closest('[data-timeline-task]');
    if (!bar) return;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => trigger('drag', bar, 'ドラッグで日付を動かせます'), 450);
  });
  document.addEventListener('pointerup', () => clearTimeout(longPressTimer));
  document.addEventListener('pointercancel', () => clearTimeout(longPressTimer));

  document.addEventListener('gantt-desk:v5-change', (event) => {
    if (/^timeline-(move|start|end)$/.test(event.detail?.reason || '')) commit('drag');
  });

  // Detail: selecting a list row shows the hint; opening details or deleting spends it.
  document.addEventListener('click', (event) => {
    const row = event.target.closest('[data-task-row]');
    if (row && !event.target.closest('input,button,select,textarea')) trigger('detail', row, '•••で詳細、Deleteで削除');
  }, true);

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="details"], [data-action="delete-task"]')) commit('detail');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Delete' && event.target.closest('.task-row')) commit('detail');
  });

  // Window: the first manual pan/resize/zoom both shows the hint and spends it in the same act.
  if (!disabled && typeof ProjectStorage !== 'undefined') {
    let wasAuto = true;
    const originalSaveView = ProjectStorage.prototype.saveView;
    ProjectStorage.prototype.saveView = function patchedSaveView(view) {
      const isAuto = view?.overviewAutoFit !== false;
      if (wasAuto && !isAuto) {
        const anchor = document.querySelector('#project-ribbon-track') || document.querySelector('.toolbar');
        trigger('window', anchor, 'Fで全体に戻ります');
        commit('window');
      }
      wasAuto = isAuto;
      return originalSaveView.call(this, view);
    };
  }

  function ensureMenuEntry() {
    const menu = document.querySelector('#ux-more-menu');
    if (!menu || menu.querySelector('[data-coach-action="reset"]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.coachAction = 'reset';
    button.innerHTML = '<span>操作のヒントを出す</span><small>3回で引っ込んだ案内を戻す</small>';
    menu.append(button);
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-coach-action="reset"]')) resetCoach();
  });

  function bootCoach() {
    ensureMenuEntry();
    document.body.dataset.quietCoachVersion = COACH_VERSION;
    if (!document.querySelector('#ux-more-menu')) setTimeout(bootCoach, 200);
  }

  bootCoach();
})();
