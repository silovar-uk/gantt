(() => {
  const COMPASS_VERSION = '20260914-compass1';
  const FULL_COVERAGE = 0.94;
  const BUSY_BUCKETS = 48;
  let compassFrame = 0;
  let boundScroller = null;
  let previewPinned = false;

  const clampCompass = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const tasks = () => state?.project?.tasks || [];
  const currentView = () => state?.project?.viewSettings || null;
  const activeScroller = () => document.querySelector('#macro-timeline-scroll') || document.querySelector('#timeline-scroll');

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
    const view = currentView();
    const scroller = activeScroller();
    if (!view || !scroller) {
      return { start: range.start, end: range.end, leftRatio: 0, widthRatio: 1, centerRatio: 0.5, rightRatio: 1 };
    }
    const dayWidth = Math.max(0.1, Number(view.dayWidth) || 2);
    const startFloat = diffDays(range.start, view.start) + scroller.scrollLeft / dayWidth;
    const endFloat = startFloat + scroller.clientWidth / dayWidth;
    const denominator = Math.max(1, range.days);
    const left = clampCompass(startFloat / denominator, 0, 1);
    const right = clampCompass(endFloat / denominator, 0, 1);
    const startOffset = clampCompass(Math.floor(startFloat), 0, Math.max(0, range.days - 1));
    const endOffset = clampCompass(Math.ceil(endFloat) - 1, 0, Math.max(0, range.days - 1));
    return {
      start: addDays(range.start, startOffset),
      end: addDays(range.start, Math.max(startOffset, endOffset)),
      leftRatio: Math.min(left, right),
      rightRatio: Math.max(left, right),
      widthRatio: Math.max(0, Math.abs(right - left)),
      centerRatio: clampCompass((left + right) / 2, 0, 1),
    };
  }

  function isWhole(visible) {
    return visible.widthRatio >= FULL_COVERAGE && visible.leftRatio <= 0.035 && visible.rightRatio >= 0.965;
  }

  function ensureCompassDOM() {
    const ribbon = document.querySelector('#project-ribbon');
    const track = document.querySelector('#project-ribbon-track');
    if (!ribbon || !track) return null;
    ribbon.dataset.timeCompass = COMPASS_VERSION;
    document.body.dataset.timeCompassVersion = COMPASS_VERSION;

    if (!track.querySelector('.time-compass-busy')) {
      track.insertAdjacentHTML('beforeend', `
        <div class="time-compass-busy" aria-hidden="true"></div>
        <div class="time-compass-axis" aria-hidden="true">
          <span class="time-compass-start"></span>
          <span class="time-compass-status"></span>
          <span class="time-compass-end"></span>
        </div>
        <div class="time-compass-milestones"></div>
        <div class="time-compass-hover" aria-hidden="true" hidden></div>`);
    }
    let preview = document.querySelector('#time-compass-preview');
    if (!preview) {
      preview = document.createElement('div');
      preview.id = 'time-compass-preview';
      preview.className = 'time-compass-preview';
      preview.hidden = true;
      preview.setAttribute('role', 'status');
      preview.setAttribute('aria-live', 'polite');
      document.body.append(preview);
    }
    bindTrack(track);
    bindCompassScroller();
    return { ribbon, track, preview };
  }

  function bucketActivity(range) {
    const count = Math.max(1, Math.min(BUSY_BUCKETS, range.days));
    const values = new Array(count).fill(0);
    tasks().forEach((task) => {
      if (!task.start || !task.end) return;
      const a = clampCompass(Math.floor((diffDays(range.start, task.start) / Math.max(1, range.days)) * count), 0, count - 1);
      const b = clampCompass(Math.floor((diffDays(range.start, task.end) / Math.max(1, range.days)) * count), 0, count - 1);
      for (let index = Math.min(a, b); index <= Math.max(a, b); index += 1) values[index] += 1;
    });
    return values;
  }

  function busyGradient(range) {
    const values = bucketActivity(range);
    const max = Math.max(1, ...values);
    const stops = [];
    values.forEach((value, index) => {
      const start = (index / values.length) * 100;
      const end = ((index + 1) / values.length) * 100;
      const ratio = value / max;
      const alpha = 0.05 + ratio * 0.42;
      const color = `rgba(91,103,216,${alpha.toFixed(3)})`;
      stops.push(`${color} ${start.toFixed(2)}%`, `${color} ${end.toFixed(2)}%`);
    });
    return `linear-gradient(90deg, ${stops.join(',')})`;
  }

  function pickLabeledMilestones(list) {
    if (list.length <= 3) return new Set(list.map((_, index) => index));
    return new Set([0, Math.floor((list.length - 1) / 2), list.length - 1]);
  }

  function renderMilestones(track, range) {
    const holder = track.querySelector('.time-compass-milestones');
    if (!holder) return;
    const list = tasks().filter((task) => task.milestone && task.start).sort((a, b) => a.start.localeCompare(b.start));
    const labeled = pickLabeledMilestones(list);
    holder.innerHTML = list.map((task, index) => {
      const ratio = range.days <= 1 ? 0.5 : clampCompass(diffDays(range.start, task.start) / (range.days - 1), 0, 1);
      const edge = ratio < 0.12 ? 'start' : ratio > 0.88 ? 'end' : 'middle';
      const label = labeled.has(index) ? `<span>${escapeHTML(task.name.length > 8 ? `${task.name.slice(0, 8)}…` : task.name)}</span>` : '';
      return `<button type="button" class="time-compass-milestone" data-compass-date="${task.start}" data-compass-name="${escapeHTML(task.name)}" data-edge="${edge}" style="left:${(ratio * 100).toFixed(3)}%" title="${escapeHTML(task.name)} · ${task.start}"><i aria-hidden="true"></i>${label}</button>`;
    }).join('');
  }

  function renderStatic(track, range) {
    track.querySelector('.time-compass-start').textContent = shortDate(range.start);
    track.querySelector('.time-compass-end').textContent = shortDate(range.end);
    const busy = track.querySelector('.time-compass-busy');
    if (busy) busy.style.backgroundImage = busyGradient(range);
    renderMilestones(track, range);
    const oldActivity = track.querySelector('.project-ribbon-activity');
    const oldMilestones = track.querySelector('.project-ribbon-milestones');
    if (oldActivity) oldActivity.hidden = true;
    if (oldMilestones) oldMilestones.hidden = true;
  }

  function syncSemantics(track, scroller, whole, visible) {
    if (whole) {
      track.classList.add('is-whole');
      track.classList.remove('is-navigator');
      track.removeAttribute('role');
      track.removeAttribute('aria-valuemin');
      track.removeAttribute('aria-valuemax');
      track.removeAttribute('aria-valuenow');
      track.removeAttribute('aria-valuetext');
      track.removeAttribute('aria-orientation');
      track.removeAttribute('aria-controls');
      track.tabIndex = -1;
      track.setAttribute('aria-label', `プロジェクト全体 ${visible.start}から${visible.end}。全体表示中`);
    } else {
      track.classList.remove('is-whole');
      track.classList.add('is-navigator');
      track.setAttribute('role', 'scrollbar');
      track.setAttribute('aria-orientation', 'horizontal');
      if (scroller?.id) track.setAttribute('aria-controls', scroller.id);
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
    const scroller = activeScroller();
    const visible = visibleRange(range);
    const whole = isWhole(visible);

    if (track.dataset.staticSignature !== `${state?.project?.revision || 0}:${tasks().length}:${range.start}:${range.end}`) {
      track.dataset.staticSignature = `${state?.project?.revision || 0}:${tasks().length}:${range.start}:${range.end}`;
      renderStatic(track, range);
    }

    ribbon.classList.toggle('is-compass-whole', whole);
    ribbon.classList.toggle('is-compass-nav', !whole);
    track.querySelector('.time-compass-status').textContent = whole ? '全体表示' : `${shortDate(visible.start)}–${shortDate(visible.end)}`;

    const viewport = document.querySelector('#project-ribbon-viewport');
    if (viewport) {
      viewport.hidden = whole;
      if (!whole) {
        viewport.style.left = `${(visible.leftRatio * 100).toFixed(3)}%`;
        viewport.style.width = `${(Math.min(1 - visible.leftRatio, visible.widthRatio) * 100).toFixed(3)}%`;
      }
    }

    syncSemantics(track, scroller, whole, visible);
    track.title = whole
      ? `${range.start}〜${range.end} · 全体表示中\nポイントに触れるとその日の予定を確認できます`
      : `${range.start}〜${range.end} · 表示中 ${visible.start}〜${visible.end}\nクリック/ドラッグで移動 · ダブルクリックで全体表示`;

    const fit = ribbon.querySelector('[data-action="fit"]');
    if (fit) {
      fit.classList.toggle('is-horizontal-whole', whole);
      fit.title = whole ? '横方向は全体表示中。縦方向も含めて全体最適化' : '全体を表示';
    }
  }

  function dayAtPointer(track, clientX) {
    const range = projectRange();
    const rect = track.getBoundingClientRect();
    if (!range || !rect.width) return null;
    const ratio = clampCompass((clientX - rect.left) / rect.width, 0, 1);
    const offset = Math.round(ratio * Math.max(0, range.days - 1));
    return { date: addDays(range.start, offset), ratio, range };
  }

  function dayStats(date) {
    const list = tasks();
    const active = list.filter((task) => task.start && task.end && task.start <= date && task.end >= date);
    const starts = list.filter((task) => task.start === date);
    const ends = list.filter((task) => task.end === date);
    const milestones = list.filter((task) => task.milestone && task.start === date);
    return { active, starts, ends, milestones };
  }

  function showPreview(track, clientX, { forceDate = null, forceName = '' } = {}) {
    const preview = document.querySelector('#time-compass-preview');
    const point = forceDate ? { date: forceDate } : dayAtPointer(track, clientX);
    if (!preview || !point) return;
    const stats = dayStats(point.date);
    const milestone = forceName || stats.milestones[0]?.name || '';
    const more = Math.max(0, stats.milestones.length - (milestone ? 1 : 0));
    preview.innerHTML = `
      <strong>${escapeHTML(shortDate(point.date))}</strong>
      <span>進行中 ${stats.active.length} · 開始 ${stats.starts.length} · 終了 ${stats.ends.length}</span>
      ${milestone ? `<em>◆ ${escapeHTML(milestone)}${more ? ` ＋${more}` : ''}</em>` : ''}`;
    preview.hidden = false;
    const rect = track.getBoundingClientRect();
    const x = forceDate
      ? rect.left + clampCompass(diffDays(projectRange().start, forceDate) / Math.max(1, projectRange().days - 1), 0, 1) * rect.width
      : clientX;
    const box = preview.getBoundingClientRect();
    preview.style.left = `${clampCompass(x - box.width / 2, 8, window.innerWidth - box.width - 8)}px`;
    preview.style.top = `${Math.min(window.innerHeight - box.height - 8, rect.bottom + 8)}px`;
  }

  function hidePreview() {
    if (previewPinned) return;
    const preview = document.querySelector('#time-compass-preview');
    if (preview) preview.hidden = true;
  }

  function centerDate(date, { zoomIfWhole = false } = {}) {
    const view = currentView();
    const range = projectRange();
    if (!view || !range) return;
    const scroller = activeScroller();
    const visible = visibleRange(range);
    if (zoomIfWhole && isWhole(visible) && scroller) {
      const current = Math.max(2, Number(view.dayWidth) || 2);
      const targetWidth = Math.min(32, Math.max(current * 1.7, 10));
      if (targetWidth > current + 0.1) {
        view.dayWidth = Math.round(targetWidth * 10) / 10;
        view.preferredDayWidth = view.dayWidth;
        view.scale = view.dayWidth >= 18 ? 'day' : view.dayWidth >= 6 ? 'week' : 'month';
        view.overviewAutoFit = false;
        state.storage.saveView(view);
        renderWorkspace();
        renderToolbarState();
      }
    }
    requestAnimationFrame(() => {
      const next = activeScroller();
      const current = currentView();
      if (!next || !current) return;
      const dayWidth = Math.max(0.1, Number(current.dayWidth) || 2);
      const desired = diffDays(current.start, date) * dayWidth - next.clientWidth / 2;
      next.scrollLeft = clampCompass(desired, 0, Math.max(0, next.scrollWidth - next.clientWidth));
      syncCompass();
    });
  }

  function zoomAtDate(date, direction) {
    const view = currentView();
    if (!view) return;
    const oldWidth = clampCompass(view.dayWidth || 2, 2, 32);
    const nextWidth = Math.round(clampCompass(oldWidth * (direction > 0 ? 1.18 : 0.85), 2, 32) * 10) / 10;
    if (Math.abs(nextWidth - oldWidth) < 0.05) return;
    view.dayWidth = nextWidth;
    view.preferredDayWidth = nextWidth;
    view.scale = nextWidth >= 18 ? 'day' : nextWidth >= 6 ? 'week' : 'month';
    view.overviewAutoFit = false;
    state.storage.saveView(view);
    renderWorkspace();
    renderToolbarState();
    centerDate(date);
  }

  function bindTrack(track) {
    if (track.dataset.timeCompassBound) return;
    track.dataset.timeCompassBound = '1';

    track.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const hover = track.querySelector('.time-compass-hover');
      const rect = track.getBoundingClientRect();
      if (hover && rect.width) {
        hover.hidden = false;
        hover.style.left = `${clampCompass(((event.clientX - rect.left) / rect.width) * 100, 0, 100)}%`;
      }
      showPreview(track, event.clientX);
    }, true);

    track.addEventListener('pointerleave', () => {
      const hover = track.querySelector('.time-compass-hover');
      if (hover) hover.hidden = true;
      previewPinned = false;
      hidePreview();
    }, true);

    track.addEventListener('pointerdown', (event) => {
      const milestone = event.target.closest('.time-compass-milestone');
      if (milestone) {
        event.stopImmediatePropagation();
        event.preventDefault();
        previewPinned = true;
        showPreview(track, event.clientX, { forceDate: milestone.dataset.compassDate, forceName: milestone.dataset.compassName });
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
      const point = dayAtPointer(track, event.clientX);
      if (!point) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      zoomAtDate(point.date, event.deltaY < 0 ? 1 : -1);
    }, { capture: true, passive: false });
  }

  function bindCompassScroller() {
    const scroller = activeScroller();
    if (!scroller || scroller === boundScroller) return;
    boundScroller = scroller;
    scroller.addEventListener('scroll', () => {
      cancelAnimationFrame(compassFrame);
      compassFrame = requestAnimationFrame(syncCompass);
    }, { passive: true });
  }

  const observer = new MutationObserver(() => {
    cancelAnimationFrame(compassFrame);
    compassFrame = requestAnimationFrame(syncCompass);
  });
  const app = document.querySelector('#app') || document.body;
  observer.observe(app, { childList: true, subtree: true });

  window.addEventListener('resize', () => {
    cancelAnimationFrame(compassFrame);
    compassFrame = requestAnimationFrame(syncCompass);
  }, { passive: true });

  setTimeout(syncCompass, 0);
  setTimeout(syncCompass, 180);
  setTimeout(syncCompass, 800);
})();
