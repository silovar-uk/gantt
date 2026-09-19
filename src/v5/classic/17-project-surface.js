(() => {
  const SURFACE_VERSION = '20260918-surface4';
  let ribbonFrame = 0;
  let dragState = null;

  function clampSurface(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function currentView() {
    return state?.project?.viewSettings || null;
  }

  function projectRange() {
    const tasks = state?.project?.tasks || [];
    if (!tasks.length) return null;
    const starts = tasks.map((task) => task.start).filter(Boolean).sort();
    const ends = tasks.map((task) => task.end).filter(Boolean).sort();
    if (!starts.length || !ends.length) return null;
    return { start: starts[0], end: ends.at(-1), days: inclusiveDays(starts[0], ends.at(-1)) };
  }

  function activeScroller() {
    return document.querySelector('#macro-timeline-scroll') || document.querySelector('#timeline-scroll');
  }

  function syncCompass() {
    globalThis.ganttTimeCompassSync?.();
  }

  function scheduleCompassSync() {
    cancelAnimationFrame(ribbonFrame);
    ribbonFrame = requestAnimationFrame(syncCompass);
  }

  function surfaceLevel() {
    if (document.querySelector('.workspace.mode-macro')) return 'shape';
    const dayWidth = Number(currentView()?.dayWidth || 0);
    return dayWidth < 8 ? 'plan' : 'edit';
  }

  function syncSurfaceLevel() {
    document.body.dataset.surfaceLevel = surfaceLevel();
  }

  function ensureRibbon() {
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return null;
    let ribbon = document.querySelector('#project-ribbon');
    if (!ribbon) {
      ribbon = document.createElement('section');
      ribbon.id = 'project-ribbon';
      ribbon.className = 'project-ribbon';
      ribbon.setAttribute('aria-label', 'プロジェクト全体ナビゲーション');
      ribbon.innerHTML = `
        <div id="project-ribbon-track" class="project-ribbon-track" tabindex="-1" aria-label="プロジェクト全体">
          <div class="project-ribbon-today" aria-hidden="true" hidden></div>
          <div id="project-ribbon-viewport" class="project-ribbon-viewport" aria-hidden="true"></div>
        </div>
        <div class="project-ribbon-nav"></div>`;
      const spacer = toolbar.querySelector('.toolbar-spacer');
      toolbar.insertBefore(ribbon, spacer || null);
      bindRibbonEvents(ribbon);
    }
    placeViewControls(ribbon, toolbar);
    return ribbon;
  }

  function placeViewControls(ribbon, toolbar) {
    const controls = document.querySelector('#ux-view-controls');
    if (!controls) return;
    const nav = ribbon.querySelector('.project-ribbon-nav');
    if (breakpoint() === 'mobile') {
      if (controls.parentElement !== toolbar) {
        const more = toolbar.querySelector('.ux-more-wrap');
        toolbar.insertBefore(controls, more || null);
      }
      return;
    }
    if (controls.parentElement !== nav) nav.append(controls);
  }

  function visibleRange(range) {
    const view = currentView();
    const scroller = activeScroller();
    if (!view || !scroller) return { start: view?.start || range.start, end: view?.end || range.end, leftRatio: 0, widthRatio: 1, centerRatio: 0.5 };
    const dayWidth = Math.max(0.1, Number(view.dayWidth) || 2);
    const startFloat = diffDays(range.start, view.start) + scroller.scrollLeft / dayWidth;
    const endFloat = startFloat + scroller.clientWidth / dayWidth;
    const left = clampSurface(startFloat / Math.max(1, range.days), 0, 1);
    const right = clampSurface(endFloat / Math.max(1, range.days), 0, 1);
    const startOffset = clampSurface(Math.floor(startFloat), 0, range.days - 1);
    const endOffset = clampSurface(Math.ceil(endFloat) - 1, 0, range.days - 1);
    return {
      start: addDays(range.start, startOffset),
      end: addDays(range.start, Math.max(startOffset, endOffset)),
      leftRatio: Math.min(left, right),
      widthRatio: Math.max(0, Math.abs(right - left)),
      centerRatio: clampSurface((left + right) / 2, 0, 1),
    };
  }

  function renderRibbon() {
    const ribbon = ensureRibbon();
    const range = projectRange();
    if (!ribbon) return;
    if (!range || !(state.project.tasks || []).length) {
      ribbon.hidden = true;
      syncSurfaceLevel();
      return;
    }
    ribbon.hidden = false;
    syncSurfaceLevel();
    bindScroller();
    syncCompass();
  }

  function bindScroller() {
    const scroller = activeScroller();
    if (!scroller || scroller.dataset.projectRibbonBound === SURFACE_VERSION) return;
    scroller.dataset.projectRibbonBound = SURFACE_VERSION;
    scroller.addEventListener('scroll', scheduleCompassSync, { passive: true });
  }

  function navigateToRatio(ratio, { allowShift = true } = {}) {
    const range = projectRange();
    const view = currentView();
    if (!range || !view) return;
    const normalized = clampSurface(ratio, 0, 1);
    const targetOffset = Math.round(normalized * Math.max(0, range.days - 1));
    const target = addDays(range.start, targetOffset);
    const scroller = activeScroller();
    const dayWidth = Math.max(0.1, Number(view.dayWidth) || 2);

    if (target >= view.start && target <= view.end && scroller) {
      const desired = diffDays(view.start, target) * dayWidth - scroller.clientWidth / 2;
      scroller.scrollLeft = clampSurface(desired, 0, Math.max(0, scroller.scrollWidth - scroller.clientWidth));
      scheduleCompassSync();
      return;
    }

    if (!allowShift) return;
    const span = Math.min(730, Math.max(1, inclusiveDays(view.start, view.end)));
    const maxStartOffset = Math.max(0, range.days - span);
    const nextStartOffset = clampSurface(Math.round(targetOffset - span / 2), 0, maxStartOffset);
    view.start = addDays(range.start, nextStartOffset);
    view.end = addDays(view.start, Math.min(span, range.days) - 1);
    view.overviewAutoFit = false;
    state.storage.saveView(view);
    renderWorkspace();
    renderToolbarState();
    requestAnimationFrame(() => {
      const nextScroller = activeScroller();
      if (!nextScroller) return;
      const desired = diffDays(view.start, target) * dayWidth - nextScroller.clientWidth / 2;
      nextScroller.scrollLeft = clampSurface(desired, 0, Math.max(0, nextScroller.scrollWidth - nextScroller.clientWidth));
      syncCompass();
    });
  }

  function ratioFromPointer(track, clientX, grabOffset = 0) {
    const rect = track.getBoundingClientRect();
    if (!rect.width) return 0.5;
    const viewport = document.querySelector('#project-ribbon-viewport');
    const viewportWidth = viewport?.getBoundingClientRect().width || 0;
    const centerX = clientX - rect.left - grabOffset + viewportWidth / 2;
    return clampSurface(centerX / rect.width, 0, 1);
  }

  function bindRibbonEvents(ribbon) {
    const track = ribbon.querySelector('#project-ribbon-track');
    if (!track || track.dataset.bound) return;
    track.dataset.bound = '1';

    track.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const viewport = document.querySelector('#project-ribbon-viewport');
      const viewportRect = viewport?.getBoundingClientRect();
      const insideViewport = !!viewportRect && !viewport.hidden && event.clientX >= viewportRect.left && event.clientX <= viewportRect.right;
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        moved: false,
        grabOffset: insideViewport ? event.clientX - viewportRect.left : (viewportRect?.width || 0) / 2,
      };
      track.setPointerCapture?.(event.pointerId);
      if (!insideViewport) navigateToRatio(ratioFromPointer(track, event.clientX, dragState.grabOffset), { allowShift: true });
      event.preventDefault();
    });

    track.addEventListener('pointermove', (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      if (Math.abs(event.clientX - dragState.startX) > 3) dragState.moved = true;
      const ratio = ratioFromPointer(track, event.clientX, dragState.grabOffset);
      navigateToRatio(ratio, { allowShift: false });
      event.preventDefault();
    });

    const finishDrag = (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const ratio = ratioFromPointer(track, event.clientX, dragState.grabOffset);
      navigateToRatio(ratio, { allowShift: true });
      track.releasePointerCapture?.(event.pointerId);
      dragState = null;
      event.preventDefault();
    };
    track.addEventListener('pointerup', finishDrag);
    track.addEventListener('pointercancel', () => { dragState = null; });

    track.addEventListener('dblclick', (event) => {
      event.preventDefault();
      fitAll();
    });

    track.addEventListener('keydown', (event) => {
      const range = projectRange();
      if (!range) return;
      const visible = visibleRange(range);
      const step = Math.max(0.02, visible.widthRatio * 0.65);
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigateToRatio(visible.centerRatio - step, { allowShift: true });
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigateToRatio(visible.centerRatio + step, { allowShift: true });
      } else if (event.key === 'Home') {
        event.preventDefault();
        navigateToRatio(0, { allowShift: true });
      } else if (event.key === 'End') {
        event.preventDefault();
        navigateToRatio(1, { allowShift: true });
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fitAll();
      }
    });
  }

  function macroZoom(direction) {
    const view = currentView();
    const scroll = document.querySelector('#macro-timeline-scroll');
    if (!view || !scroll) return false;
    const oldWidth = clampSurface(view.dayWidth || 2, 2, 32);
    const factor = direction > 0 ? 1.22 : 0.82;
    const nextWidth = Math.round(clampSurface(oldWidth * factor, 2, 32) * 10) / 10;
    if (Math.abs(nextWidth - oldWidth) < 0.05) return true;
    const anchorDay = (scroll.scrollLeft + scroll.clientWidth / 2) / oldWidth;
    view.dayWidth = nextWidth;
    view.preferredDayWidth = nextWidth;
    view.scale = nextWidth >= 18 ? 'day' : nextWidth >= 6 ? 'week' : 'month';
    view.overviewAutoFit = false;
    state.storage.saveView(view);
    renderWorkspace();
    renderToolbarState();
    requestAnimationFrame(() => {
      const next = document.querySelector('#macro-timeline-scroll');
      if (next) next.scrollLeft = Math.max(0, anchorDay * nextWidth - next.clientWidth / 2);
      syncCompass();
    });
    return true;
  }

  document.addEventListener('click', (event) => {
    if (!document.querySelector('.workspace.mode-macro')) return;
    const action = event.target.closest('[data-ux-action]')?.dataset.uxAction;
    if (action !== 'zoom-in' && action !== 'zoom-out') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    macroZoom(action === 'zoom-in' ? 1 : -1);
  }, true);

  const previousRenderWorkspace = renderWorkspace;
  renderWorkspace = function projectSurfaceRenderWorkspace() {
    previousRenderWorkspace();
    renderRibbon();
  };

  const previousRenderToolbarState = renderToolbarState;
  renderToolbarState = function projectSurfaceRenderToolbarState() {
    previousRenderToolbarState();
    renderRibbon();
  };

  addEventListener('resize', () => {
    ensureRibbon();
    renderRibbon();
  });

  function bootSurface() {
    if (!state?.project || !state.storage) {
      setTimeout(bootSurface, 30);
      return;
    }
    document.body.dataset.projectSurfaceVersion = SURFACE_VERSION;
    ensureRibbon();
    renderRibbon();
  }

  bootSurface();
})();
