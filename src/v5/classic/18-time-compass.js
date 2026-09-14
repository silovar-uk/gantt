(() => {
  const COMPASS_VERSION = '20260914-compass2';
  const FULL_COVERAGE = 0.94;
  const BUSY_BUCKETS = 48;
  const ROW_MIN = 20;
  const ROW_MAX = 56;
  let compassFrame = 0;
  let boundScroller = null;
  let rowBubbleTimer = 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const tasks = () => state?.project?.tasks || [];
  const view = () => state?.project?.viewSettings || null;
  const scroller = () => document.querySelector('#macro-timeline-scroll') || document.querySelector('#timeline-scroll');

  function projectRange() {
    const list = tasks();
    if (!list.length) return null;
    const starts = list.map((task) => task.start).filter(Boolean).sort();
    const ends = list.map((task) => task.end).filter(Boolean).sort();
    if (!starts.length || !ends.length) return null;
    return { start: starts[0], end: ends.at(-1), days: inclusiveDays(starts[0], ends.at(-1)) };
  }

  function shortDate(iso) {
    const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${Number(match[2])}/${Number(match[3])}` : String(iso || '');
  }

  function visibleRange(range) {
    const current = view();
    const active = scroller();
    if (!current || !active) return { start: range.start, end: range.end, leftRatio: 0, rightRatio: 1, widthRatio: 1, centerRatio: .5 };
    const dayWidth = Math.max(.1, Number(current.dayWidth) || 2);
    const startFloat = diffDays(range.start, current.start) + active.scrollLeft / dayWidth;
    const endFloat = startFloat + active.clientWidth / dayWidth;
    const denominator = Math.max(1, range.days);
    const left = clamp(startFloat / denominator, 0, 1);
    const right = clamp(endFloat / denominator, 0, 1);
    const startOffset = clamp(Math.floor(startFloat), 0, Math.max(0, range.days - 1));
    const endOffset = clamp(Math.ceil(endFloat) - 1, 0, Math.max(0, range.days - 1));
    return {
      start: addDays(range.start, startOffset),
      end: addDays(range.start, Math.max(startOffset, endOffset)),
      leftRatio: Math.min(left, right),
      rightRatio: Math.max(left, right),
      widthRatio: Math.max(0, Math.abs(right - left)),
      centerRatio: clamp((left + right) / 2, 0, 1),
    };
  }

  const isWhole = (visible) => visible.widthRatio >= FULL_COVERAGE && visible.leftRatio <= .035 && visible.rightRatio >= .965;

  function visibleRowCapacity(rowHeight) {
    const workspace = document.querySelector('#workspace');
    if (!workspace) return 0;
    const head = workspace.querySelector('.task-head, .macro-label-head');
    const available = Math.max(0, workspace.clientHeight - (head?.offsetHeight || 30));
    return Math.max(1, Math.floor(available / Math.max(1, rowHeight)));
  }

  function showRowBubble() {
    clearTimeout(rowBubbleTimer);
    const bubble = document.querySelector('#ux-row-density-bubble');
    const input = document.querySelector('#ux-row-height');
    if (!bubble || !input) return;
    const value = clamp(input.value, ROW_MIN, ROW_MAX);
    bubble.textContent = `${value}px · 約${visibleRowCapacity(value)}行`;
    bubble.hidden = false;
  }

  function hideRowBubbleSoon() {
    clearTimeout(rowBubbleTimer);
    rowBubbleTimer = setTimeout(() => {
      const bubble = document.querySelector('#ux-row-density-bubble');
      if (bubble) bubble.hidden = true;
    }, 700);
  }

  function bindRowInput(input) {
    if (!input || input.dataset.rowDensityBound === COMPASS_VERSION) return;
    input.dataset.rowDensityBound = COMPASS_VERSION;
    input.addEventListener('pointerdown', showRowBubble);
    input.addEventListener('pointermove', (event) => { if (event.buttons) showRowBubble(); });
    input.addEventListener('pointerup', () => { showRowBubble(); hideRowBubbleSoon(); });
    input.addEventListener('focus', showRowBubble);
    input.addEventListener('blur', hideRowBubbleSoon);
    input.addEventListener('keydown', () => requestAnimationFrame(showRowBubble));
  }

  function ensureRowDock(ribbon) {
    const nav = ribbon.querySelector('.project-ribbon-nav');
    if (!nav) return;
    let dock = nav.querySelector('#ux-row-density-dock');
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'ux-row-density-dock';
      dock.innerHTML = '<div id="ux-row-density-bubble" class="ux-row-density-bubble" hidden></div>';
      nav.prepend(dock);
    }
    const input = document.querySelector('#ux-row-height');
    const control = input?.closest('.ux-density-control');
    if (control && control.parentElement !== dock) {
      control.classList.add('ux-row-density-control');
      dock.append(control);
    }
    bindRowInput(input);
    syncRowDock();
  }

  function syncRowDock() {
    const dock = document.querySelector('#ux-row-density-dock');
    const input = document.querySelector('#ux-row-height');
    const output = document.querySelector('#ux-row-height-value');
    if (!dock || !input) return;
    const rowHeight = clamp(view()?.rowHeight, ROW_MIN, ROW_MAX) || 24;
    input.min = String(ROW_MIN);
    input.max = String(ROW_MAX);
    if (document.activeElement !== input) input.value = String(rowHeight);
    if (output) output.textContent = String(rowHeight);
    const hide = breakpoint() === 'mobile' || document.body.dataset.surfaceLevel === 'shape' || document.body.classList.contains('is-present-mode');
    dock.hidden = hide;
  }

  function ensureCompassDOM() {
    const ribbon = document.querySelector('#project-ribbon');
    const track = document.querySelector('#project-ribbon-track');
    if (!ribbon || !track) return null;
    ribbon.dataset.timeCompass = COMPASS_VERSION;
    document.body.dataset.timeCompassVersion = COMPASS_VERSION;

    if (!track.querySelector('.time-compass-meta')) {
      track.insertAdjacentHTML('beforeend', `
        <div class="time-compass-meta" aria-hidden="true">
          <span class="time-compass-start"></span>
          <span class="time-compass-annotation"></span>
          <span class="time-compass-end"></span>
        </div>
        <div class="time-compass-rail" aria-hidden="true">
          <div class="time-compass-busy"></div>
          <div class="time-compass-markers"></div>
          <div class="time-compass-pointer" hidden></div>
        </div>`);
    }

    const rail = track.querySelector('.time-compass-rail');
    const viewport = document.querySelector('#project-ribbon-viewport');
    const today = track.querySelector('.project-ribbon-today');
    if (rail && viewport && viewport.parentElement !== rail) rail.append(viewport);
    if (rail && today && today.parentElement !== rail) rail.append(today);

    const oldActivity = track.querySelector('.project-ribbon-activity');
    const oldMilestones = track.querySelector('.project-ribbon-milestones');
    if (oldActivity) oldActivity.hidden = true;
    if (oldMilestones) oldMilestones.hidden = true;

    ensureRowDock(ribbon);
    bindRail(rail);
    bindTrack(track);
    bindScroller();
    return { ribbon, track, rail };
  }

  function bucketActivity(range) {
    const count = Math.max(1, Math.min(BUSY_BUCKETS, range.days));
    const values = new Array(count).fill(0);
    tasks().forEach((task) => {
      if (!task.start || !task.end) return;
      const a = clamp(Math.floor((diffDays(range.start, task.start) / Math.max(1, range.days)) * count), 0, count - 1);
      const b = clamp(Math.floor((diffDays(range.start, task.end) / Math.max(1, range.days)) * count), 0, count - 1);
      for (let index = Math.min(a, b); index <= Math.max(a, b); index += 1) values[index] += 1;
    });
    return values;
  }

  function busyGradient(range) {
    const values = bucketActivity(range);
    const max = Math.max(1, ...values);
    const stops = [];
    values.forEach((value, index) => {
      const start = index / values.length * 100;
      const end = (index + 1) / values.length * 100;
      const ratio = value / max;
      const alpha = .025 + ratio * .22;
      const color = `rgba(91,103,216,${alpha.toFixed(3)})`;
      stops.push(`${color} ${start.toFixed(2)}%`, `${color} ${end.toFixed(2)}%`);
    });
    return `linear-gradient(90deg, ${stops.join(',')})`;
  }

  function renderMilestones(track, range) {
    const holder = track.querySelector('.time-compass-markers');
    if (!holder) return;
    holder.innerHTML = tasks().filter((task) => task.milestone && task.start).sort((a, b) => a.start.localeCompare(b.start)).map((task) => {
      const ratio = range.days <= 1 ? .5 : clamp(diffDays(range.start, task.start) / (range.days - 1), 0, 1);
      return `<button type="button" class="time-compass-milestone" data-compass-date="${task.start}" data-compass-name="${escapeHTML(task.name)}" style="left:${(ratio * 100).toFixed(3)}%" title="${escapeHTML(task.name)} · ${task.start}" aria-label="${escapeHTML(task.name)} ${task.start}"><i aria-hidden="true"></i></button>`;
    }).join('');
  }

  function renderStatic(track, range) {
    track.querySelector('.time-compass-start').textContent = shortDate(range.start);
    track.querySelector('.time-compass-end').textContent = shortDate(range.end);
    const busy = track.querySelector('.time-compass-busy');
    if (busy) busy.style.backgroundImage = busyGradient(range);
    renderMilestones(track, range);
  }

  function setAnnotation(track, text) {
    const annotation = track.querySelector('.time-compass-annotation');
    if (annotation) annotation.textContent = text;
  }

  function defaultAnnotation(track, range) {
    const visible = visibleRange(range);
    setAnnotation(track, isWhole(visible) ? '全体表示' : `${shortDate(visible.start)}–${shortDate(visible.end)}`);
  }

  function syncSemantics(track, active, whole, visible) {
    if (whole) {
      track.classList.add('is-whole');
      track.classList.remove('is-navigator');
      ['role','aria-valuemin','aria-valuemax','aria-valuenow','aria-valuetext','aria-orientation','aria-controls'].forEach((name) => track.removeAttribute(name));
      track.tabIndex = -1;
      track.setAttribute('aria-label', `プロジェクト全体 ${visible.start}から${visible.end}。全体表示中`);
    } else {
      track.classList.remove('is-whole');
      track.classList.add('is-navigator');
      track.setAttribute('role', 'scrollbar');
      track.setAttribute('aria-orientation', 'horizontal');
      if (active?.id) track.setAttribute('aria-controls', active.id);
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.setAttribute('aria-valuenow', String(Math.round(visible.centerRatio * 100)));
      track.setAttribute('aria-valuetext', `${visible.start}から${visible.end}を表示中`);
      track.tabIndex = 0;
      track.setAttribute('aria-label', 'プロジェクト全体の中で表示位置を移動');
    }
  }

  function syncCompass() {
    const dom = ensureCompassDOM();
    const range = projectRange();
    if (!dom || !range || dom.ribbon.hidden || breakpoint() === 'mobile') return;
    const { ribbon, track } = dom;
    const active = scroller();
    const visible = visibleRange(range);
    const whole = isWhole(visible);
    const signature = `${state?.project?.revision || 0}:${tasks().length}:${range.start}:${range.end}`;
    if (track.dataset.staticSignature !== signature) {
      track.dataset.staticSignature = signature;
      renderStatic(track, range);
    }
    ribbon.classList.toggle('is-compass-whole', whole);
    ribbon.classList.toggle('is-compass-nav', !whole);
    defaultAnnotation(track, range);
    const viewport = document.querySelector('#project-ribbon-viewport');
    if (viewport) {
      viewport.hidden = whole;
      if (!whole) {
        viewport.style.left = `${(visible.leftRatio * 100).toFixed(3)}%`;
        viewport.style.width = `${(Math.min(1 - visible.leftRatio, visible.widthRatio) * 100).toFixed(3)}%`;
      }
    }
    syncSemantics(track, active, whole, visible);
    syncRowDock();
  }

  function dayAtPointer(rail, clientX) {
    const range = projectRange();
    const rect = rail.getBoundingClientRect();
    if (!range || !rect.width) return null;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const offset = Math.round(ratio * Math.max(0, range.days - 1));
    return { date: addDays(range.start, offset), ratio, range };
  }

  function dayStats(date) {
    const list = tasks();
    const active = list.filter((task) => task.start && task.end && task.start <= date && task.end >= date);
    const starts = list.filter((task) => task.start === date);
    const ends = list.filter((task) => task.end === date);
    return { active, starts, ends };
  }

  function nearestMilestone(rail, clientX) {
    const markers = [...rail.querySelectorAll('.time-compass-milestone')];
    let best = null;
    markers.forEach((marker) => {
      const box = marker.getBoundingClientRect();
      const distance = Math.abs(clientX - (box.left + box.width / 2));
      if (distance <= 9 && (!best || distance < best.distance)) best = { marker, distance };
    });
    return best?.marker || null;
  }

  function updateHover(rail, clientX) {
    const track = rail.closest('#project-ribbon-track');
    const point = dayAtPointer(rail, clientX);
    if (!track || !point) return;
    const pointer = rail.querySelector('.time-compass-pointer');
    if (pointer) {
      pointer.hidden = false;
      pointer.style.left = `${(point.ratio * 100).toFixed(3)}%`;
    }
    const nearest = nearestMilestone(rail, clientX);
    if (nearest) {
      setAnnotation(track, `◆ ${nearest.dataset.compassName}`);
      return;
    }
    const stats = dayStats(point.date);
    setAnnotation(track, `${shortDate(point.date)} · 進行${stats.active.length} · 開始${stats.starts.length} · 終了${stats.ends.length}`);
  }

  function clearHover(rail) {
    const pointer = rail.querySelector('.time-compass-pointer');
    if (pointer) pointer.hidden = true;
    const track = rail.closest('#project-ribbon-track');
    const range = projectRange();
    if (track && range) defaultAnnotation(track, range);
  }

  function centerDate(date, { zoomIfWhole = false } = {}) {
    const current = view();
    const range = projectRange();
    if (!current || !range) return;
    const active = scroller();
    const visible = visibleRange(range);
    if (zoomIfWhole && isWhole(visible) && active) {
      const oldWidth = Math.max(2, Number(current.dayWidth) || 2);
      const nextWidth = Math.min(32, Math.max(oldWidth * 1.7, 10));
      if (nextWidth > oldWidth + .1) {
        current.dayWidth = Math.round(nextWidth * 10) / 10;
        current.preferredDayWidth = current.dayWidth;
        current.scale = current.dayWidth >= 18 ? 'day' : current.dayWidth >= 6 ? 'week' : 'month';
        current.overviewAutoFit = false;
        state.storage.saveView(current);
        renderWorkspace();
        renderToolbarState();
      }
    }
    requestAnimationFrame(() => {
      const next = scroller();
      const nextView = view();
      if (!next || !nextView) return;
      const dayWidth = Math.max(.1, Number(nextView.dayWidth) || 2);
      next.scrollLeft = clamp(diffDays(nextView.start, date) * dayWidth - next.clientWidth / 2, 0, Math.max(0, next.scrollWidth - next.clientWidth));
      syncCompass();
    });
  }

  function zoomAtDate(date, direction) {
    const current = view();
    if (!current) return;
    const oldWidth = clamp(current.dayWidth || 2, 2, 32);
    const nextWidth = Math.round(clamp(oldWidth * (direction > 0 ? 1.18 : .85), 2, 32) * 10) / 10;
    if (Math.abs(nextWidth - oldWidth) < .05) return;
    current.dayWidth = nextWidth;
    current.preferredDayWidth = nextWidth;
    current.scale = nextWidth >= 18 ? 'day' : nextWidth >= 6 ? 'week' : 'month';
    current.overviewAutoFit = false;
    state.storage.saveView(current);
    renderWorkspace();
    renderToolbarState();
    centerDate(date);
  }

  function bindRail(rail) {
    if (!rail || rail.dataset.timeCompassRailBound === COMPASS_VERSION) return;
    rail.dataset.timeCompassRailBound = COMPASS_VERSION;
    rail.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      updateHover(rail, event.clientX);
    });
    rail.addEventListener('pointerleave', () => clearHover(rail));
  }

  function bindTrack(track) {
    if (track.dataset.timeCompassBound === COMPASS_VERSION) return;
    track.dataset.timeCompassBound = COMPASS_VERSION;
    track.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.time-compass-meta')) {
        event.stopImmediatePropagation();
        event.preventDefault();
        return;
      }
      const milestone = event.target.closest('.time-compass-milestone');
      if (milestone) {
        event.stopImmediatePropagation();
        event.preventDefault();
        centerDate(milestone.dataset.compassDate, { zoomIfWhole: true });
        return;
      }
      if (track.classList.contains('is-whole')) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    }, true);
    track.addEventListener('wheel', (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const rail = event.target.closest('.time-compass-rail') || track.querySelector('.time-compass-rail');
      const point = rail && dayAtPointer(rail, event.clientX);
      if (!point) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      zoomAtDate(point.date, event.deltaY < 0 ? 1 : -1);
    }, { capture: true, passive: false });
  }

  function bindScroller() {
    const active = scroller();
    if (!active || active === boundScroller) return;
    boundScroller = active;
    active.addEventListener('scroll', () => {
      cancelAnimationFrame(compassFrame);
      compassFrame = requestAnimationFrame(syncCompass);
    }, { passive: true });
  }

  const observer = new MutationObserver(() => {
    cancelAnimationFrame(compassFrame);
    compassFrame = requestAnimationFrame(syncCompass);
  });
  observer.observe(document.querySelector('#app') || document.body, { childList: true, subtree: true });

  window.addEventListener('resize', () => {
    cancelAnimationFrame(compassFrame);
    compassFrame = requestAnimationFrame(syncCompass);
  }, { passive: true });

  setTimeout(syncCompass, 0);
  setTimeout(syncCompass, 180);
  setTimeout(syncCompass, 800);
})();