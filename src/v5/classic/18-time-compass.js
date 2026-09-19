(() => {
  const COMPASS_VERSION = '20260918-window1';
  const RHYTHM_VERSION = '20260914-rhythm3';
  const ECHO_VERSION = '20260914-echo1';
  const FULL_COVERAGE = 0.94;
  const BUSY_BUCKETS = 48;
  const RHYTHM_MAX_WINDOWS = 3;
  const RHYTHM_MIN_TASKS = 8;
  const ROW_MIN = 14;
  const ROW_MAX = 56;
  const WINDOW_MIN_DAYS = 7;
  const WINDOW_MAX_DAYS = 730;
  let rowBubbleTimer = 0;
  let activeEchoKey = '';
  let activeEchoContext = null;
  let windowDrag = null;
  let windowFrame = 0;

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
    const autoChip = document.querySelector('.ux-row-auto-chip');
    if (autoChip && autoChip.parentElement !== dock) dock.append(autoChip);
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
    ribbon.dataset.projectRhythm = RHYTHM_VERSION;
    document.body.dataset.timeCompassVersion = COMPASS_VERSION;
    document.body.dataset.projectRhythmVersion = RHYTHM_VERSION;
    document.body.dataset.rhythmContextEchoVersion = ECHO_VERSION;

    if (!track.querySelector('.time-compass-meta')) {
      track.insertAdjacentHTML('beforeend', `
        <div class="time-compass-meta" aria-hidden="true">
          <span class="time-compass-start"></span>
          <span class="time-compass-annotation"></span>
          <span class="time-compass-end"></span>
        </div>
        <div class="time-compass-rail">
          <div class="time-compass-busy" aria-hidden="true"></div>
          <div class="time-compass-rhythm" aria-label="プロジェクトの集中期間"></div>
          <div class="time-compass-markers"></div>
          <div class="time-compass-pointer" hidden aria-hidden="true"></div>
        </div>`);
    } else if (!track.querySelector('.time-compass-rhythm')) {
      track.querySelector('.time-compass-busy')?.insertAdjacentHTML('afterend', '<div class="time-compass-rhythm" aria-label="プロジェクトの集中期間"></div>');
      track.querySelector('.time-compass-rail')?.removeAttribute('aria-hidden');
    }

    const rail = track.querySelector('.time-compass-rail');
    const viewport = document.querySelector('#project-ribbon-viewport');
    const today = track.querySelector('.project-ribbon-today');
    if (rail && viewport && viewport.parentElement !== rail) rail.append(viewport);
    if (rail && today && today.parentElement !== rail) rail.append(today);
    if (viewport && !viewport.querySelector('[data-window-handle]')) {
      ['start', 'end'].forEach((edge) => {
        const handle = document.createElement('i');
        handle.className = `time-window-handle time-window-handle-${edge}`;
        handle.dataset.windowHandle = edge;
        handle.setAttribute('aria-hidden', 'true');
        viewport.append(handle);
      });
    }
    ensureWindowChip(ribbon);

    ensureRowDock(ribbon);
    bindRail(rail);
    bindTrack(track);
    return { ribbon, track, rail };
  }

  function ensureWindowChip(ribbon) {
    let chip = ribbon.querySelector('.time-window-chip');
    if (chip) return chip;
    chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'revert-chip time-window-chip';
    chip.hidden = true;
    chip.title = '窓を全期間に戻す';
    chip.textContent = '全体';
    ribbon.append(chip);
    return chip;
  }

  function fitDayWidthToAvailable(span) {
    const active = scroller();
    const available = Math.max(120, active?.clientWidth || innerWidth * 0.6);
    return clamp(Math.floor((available / Math.max(1, span)) * 10) / 10, 2, 32);
  }

  function commitWindowRange(start, end) {
    const current = view();
    if (!current) return;
    const dayWidth = fitDayWidthToAvailable(inclusiveDays(start, end));
    Object.assign(current, {
      start, end, dayWidth, preferredDayWidth: dayWidth,
      scale: dayWidth >= 18 ? 'day' : dayWidth >= 6 ? 'week' : 'month',
      overviewAutoFit: false,
    });
    state.storage.saveView(current);
    renderWorkspace();
    renderToolbarState();
    syncCompass();
  }

  function beginWindowResize(event, handle, track) {
    const range = projectRange();
    const current = view();
    const rail = track.querySelector('.time-compass-rail');
    if (!range || !current || !rail) return;
    windowDrag = {
      pointerId: event.pointerId,
      edge: handle.dataset.windowHandle,
      startX: event.clientX,
      railWidth: rail.getBoundingClientRect().width,
      range,
      startView: { start: current.start, end: current.end },
      pendingStart: current.start,
      pendingEnd: current.end,
    };
    try { handle.setPointerCapture?.(event.pointerId); } catch { /* pointer already released */ }
  }

  function previewWindowResize(event) {
    if (!windowDrag || event.pointerId !== windowDrag.pointerId) return;
    const deltaRatio = (event.clientX - windowDrag.startX) / Math.max(1, windowDrag.railWidth);
    const deltaDays = Math.round(deltaRatio * windowDrag.range.days);
    let { start, end } = windowDrag.startView;
    if (windowDrag.edge === 'start') {
      let candidate = addDays(windowDrag.startView.start, deltaDays);
      const minStart = addDays(end, -(WINDOW_MAX_DAYS - 1));
      const maxStart = addDays(end, -(WINDOW_MIN_DAYS - 1));
      if (candidate < minStart) candidate = minStart;
      if (candidate > maxStart) candidate = maxStart;
      if (candidate < DATE_MIN) candidate = DATE_MIN;
      start = candidate;
    } else {
      let candidate = addDays(windowDrag.startView.end, deltaDays);
      const minEnd = addDays(start, WINDOW_MIN_DAYS - 1);
      const maxEnd = addDays(start, WINDOW_MAX_DAYS - 1);
      if (candidate < minEnd) candidate = minEnd;
      if (candidate > maxEnd) candidate = maxEnd;
      if (candidate > DATE_MAX) candidate = DATE_MAX;
      end = candidate;
    }
    windowDrag.pendingStart = start;
    windowDrag.pendingEnd = end;
    cancelAnimationFrame(windowFrame);
    windowFrame = requestAnimationFrame(() => {
      const current = view();
      if (!current || !windowDrag) return;
      current.start = windowDrag.pendingStart;
      current.end = windowDrag.pendingEnd;
      current.overviewAutoFit = false;
      renderWorkspace();
      renderToolbarState();
      syncCompass();
    });
    event.preventDefault();
  }

  function endWindowResize(event) {
    if (!windowDrag || event.pointerId !== windowDrag.pointerId) return;
    const drag = windowDrag;
    windowDrag = null;
    cancelAnimationFrame(windowFrame);
    commitWindowRange(drag.pendingStart, drag.pendingEnd);
  }

  function snapToMonth(date) {
    const parsed = parseISO(date);
    if (!parsed) return;
    const year = parsed.getUTCFullYear();
    const month = parsed.getUTCMonth();
    const start = toISO(new Date(Date.UTC(year, month, 1)));
    const end = toISO(new Date(Date.UTC(year, month + 1, 0)));
    commitWindowRange(start, end);
  }

  function centerOnToday() {
    const current = view();
    if (!current) return;
    const span = clamp(inclusiveDays(current.start, current.end), WINDOW_MIN_DAYS, WINDOW_MAX_DAYS);
    const today = todayISO();
    const start = addDays(today, -Math.floor((span - 1) / 2));
    const end = addDays(start, span - 1);
    commitWindowRange(start, end);
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
      const color = `rgba(62,106,90,${alpha.toFixed(3)})`;
      stops.push(`${color} ${start.toFixed(2)}%`, `${color} ${end.toFixed(2)}%`);
    });
    return `linear-gradient(90deg, ${stops.join(',')})`;
  }

  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function exactPeakForRange(start, end) {
    const deltas = new Map();
    tasks().forEach((task) => {
      if (!task.start || !task.end || task.end < start || task.start > end) return;
      const clippedStart = task.start < start ? start : task.start;
      const clippedEnd = task.end > end ? end : task.end;
      deltas.set(clippedStart, (deltas.get(clippedStart) || 0) + 1);
      const afterEnd = addDays(clippedEnd, 1);
      if (afterEnd) deltas.set(afterEnd, (deltas.get(afterEnd) || 0) - 1);
    });

    let active = 0;
    let peak = 0;
    let peakDate = start;
    [...deltas.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([date, delta]) => {
      active += delta;
      if (date <= end && active > peak) {
        peak = active;
        peakDate = date;
      }
    });
    return { peak, peakDate };
  }

  function deriveRhythmLandmarks(range) {
    const list = tasks();
    if (!range || list.length < RHYTHM_MIN_TASKS) return [];
    const values = bucketActivity(range);
    const max = Math.max(0, ...values);
    const baseline = median(values);
    if (max < 3 || max <= baseline + .5) return [];

    const threshold = Math.max(3, Math.ceil(max * .68), Math.floor(baseline) + 1);
    const segments = [];
    let startIndex = -1;
    for (let index = 0; index <= values.length; index += 1) {
      const active = index < values.length && values[index] >= threshold;
      if (active && startIndex < 0) startIndex = index;
      if ((!active || index === values.length) && startIndex >= 0) {
        const endIndex = index - 1;
        const slice = values.slice(startIndex, endIndex + 1);
        const average = slice.reduce((sum, value) => sum + value, 0) / slice.length;
        const startOffset = Math.floor((startIndex / values.length) * range.days);
        const endOffset = Math.min(range.days - 1, Math.max(startOffset, Math.ceil(((endIndex + 1) / values.length) * range.days) - 1));
        const candidateStart = addDays(range.start, startOffset);
        const candidateEnd = addDays(range.start, endOffset);
        const exact = exactPeakForRange(candidateStart, candidateEnd);
        if (exact.peak >= 3) {
          segments.push({
            start: candidateStart,
            end: candidateEnd,
            peakDate: exact.peakDate,
            peak: exact.peak,
            average,
            score: exact.peak * 100 + average,
          });
        }
        startIndex = -1;
      }
    }

    return segments
      .sort((a, b) => b.score - a.score || a.start.localeCompare(b.start))
      .slice(0, RHYTHM_MAX_WINDOWS)
      .map((item, index) => ({ ...item, primary: index === 0 }));
  }

  function surfaceTasks() {
    try {
      return typeof filteredTasks === 'function' ? filteredTasks() : tasks();
    } catch {
      return tasks();
    }
  }

  function deriveRhythmContext(start, end) {
    const matchingTasks = surfaceTasks().filter((task) => task.start && task.end && task.start <= end && task.end >= start);
    const categoryCounts = new Map();
    matchingTasks.forEach((task) => categoryCounts.set(task.categoryId, (categoryCounts.get(task.categoryId) || 0) + 1));
    const categories = [...categoryCounts.entries()].map(([id, count]) => {
      const category = state.project.categories.find((item) => item.id === id);
      return { id, name: category?.name || '未分類', count };
    }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'));
    return { tasks: matchingTasks, categories };
  }

  function rhythmMeaning(context) {
    if (!context?.tasks.length) return '';
    const categories = context.categories.slice(0, 2).map((item) => `${item.name}${item.count}`).join('・');
    const rest = Math.max(0, context.categories.length - 2);
    return `${categories}${rest ? ` +${rest}分類` : ''} · ${context.tasks.length}件`;
  }

  function rhythmAccessibleMeaning(context) {
    if (!context?.tasks.length) return '';
    const categories = context.categories.slice(0, 3).map((item) => `${item.name}${item.count}件`).join('、');
    const rest = Math.max(0, context.categories.length - 3);
    return `${categories}${rest ? `、ほか${rest}分類` : ''}。期間に関わる予定${context.tasks.length}件`;
  }

  function rhythmAnnotation(element, context = null) {
    if (!element) return '';
    const base = `集中 ${shortDate(element.dataset.rhythmStart)}–${shortDate(element.dataset.rhythmEnd)} · 最大${element.dataset.rhythmPeak}件`;
    const meaning = rhythmMeaning(context || deriveRhythmContext(element.dataset.rhythmStart, element.dataset.rhythmEnd));
    return meaning ? `${base} · ${meaning}` : base;
  }

  function clearRhythmContext() {
    const workspace = document.querySelector('#workspace');
    if (workspace) {
      workspace.classList.remove('is-rhythm-echo');
      delete workspace.dataset.rhythmEchoStart;
      delete workspace.dataset.rhythmEchoEnd;
      delete workspace.dataset.rhythmEchoCount;
      delete workspace.dataset.rhythmEchoKey;
      workspace.querySelectorAll('.is-rhythm-match, .is-rhythm-muted').forEach((element) => {
        element.classList.remove('is-rhythm-match', 'is-rhythm-muted');
      });
    }
    document.querySelectorAll('.time-compass-rhythm-window[data-rhythm-base-label]').forEach((element) => {
      element.setAttribute('aria-label', element.dataset.rhythmBaseLabel);
    });
    activeEchoKey = '';
    activeEchoContext = null;
  }

  function applyRhythmContext(element) {
    const workspace = document.querySelector('#workspace');
    const start = element?.dataset.rhythmStart;
    const end = element?.dataset.rhythmEnd;
    if (!workspace || !start || !end || breakpoint() === 'mobile') return null;
    const key = `${start}:${end}:${state.project.revision || 0}`;
    if (activeEchoKey === key && workspace.dataset.rhythmEchoKey === key && activeEchoContext) return activeEchoContext;

    clearRhythmContext();
    const context = deriveRhythmContext(start, end);
    if (!context.tasks.length) return context;
    const taskIds = new Set(context.tasks.map((task) => task.id));
    const categoryIds = new Set(context.tasks.map((task) => task.categoryId));

    workspace.classList.add('is-rhythm-echo');
    workspace.dataset.rhythmEchoKey = key;
    workspace.dataset.rhythmEchoStart = start;
    workspace.dataset.rhythmEchoEnd = end;
    workspace.dataset.rhythmEchoCount = String(context.tasks.length);

    workspace.querySelectorAll('[data-task-row], [data-timeline-row]').forEach((node) => {
      const id = node.dataset.taskRow || node.dataset.timelineRow;
      const matched = taskIds.has(id);
      node.classList.toggle('is-rhythm-match', matched);
      node.classList.toggle('is-rhythm-muted', !matched);
    });
    workspace.querySelectorAll('[data-macro-task]').forEach((node) => {
      const matched = taskIds.has(node.dataset.macroTask);
      node.classList.toggle('is-rhythm-match', matched);
      node.classList.toggle('is-rhythm-muted', !matched);
    });
    workspace.querySelectorAll('[data-macro-category-focus]').forEach((node) => {
      const matched = categoryIds.has(node.dataset.macroCategoryFocus);
      node.classList.toggle('is-rhythm-match', matched);
      node.classList.toggle('is-rhythm-muted', !matched);
    });

    const accessibleMeaning = rhythmAccessibleMeaning(context);
    if (accessibleMeaning) {
      element.setAttribute('aria-label', `集中期間 ${shortDate(start)}から${shortDate(end)} 最大${element.dataset.rhythmPeak}件進行。${accessibleMeaning}`);
    }

    activeEchoKey = key;
    activeEchoContext = context;
    return context;
  }

  function renderRhythmLandmarks(track, range) {
    const holder = track.querySelector('.time-compass-rhythm');
    if (!holder) return;
    const landmarks = deriveRhythmLandmarks(range);
    ['rhythmPrimaryStart', 'rhythmPrimaryEnd', 'rhythmPrimaryPeak', 'rhythmPrimaryPeakDate'].forEach((key) => delete track.dataset[key]);
    if (!landmarks.length) {
      holder.innerHTML = '';
      return;
    }

    const denominator = Math.max(1, range.days);
    holder.innerHTML = landmarks.map((landmark) => {
      const left = clamp(diffDays(range.start, landmark.start) / denominator, 0, 1);
      const width = clamp(inclusiveDays(landmark.start, landmark.end) / denominator, 0, 1 - left);
      const label = `集中期間 ${shortDate(landmark.start)}から${shortDate(landmark.end)} 最大${landmark.peak}件進行`;
      return `<button type="button" class="time-compass-rhythm-window ${landmark.primary ? 'is-primary' : ''}" data-rhythm-start="${landmark.start}" data-rhythm-end="${landmark.end}" data-rhythm-peak-date="${landmark.peakDate}" data-rhythm-peak="${landmark.peak}" data-rhythm-base-label="${label}" style="left:${(left * 100).toFixed(3)}%;width:${Math.max(.4, width * 100).toFixed(3)}%" title="${label}" aria-label="${label}"></button>`;
    }).join('');

    const primary = landmarks[0];
    track.dataset.rhythmPrimaryStart = primary.start;
    track.dataset.rhythmPrimaryEnd = primary.end;
    track.dataset.rhythmPrimaryPeak = String(primary.peak);
    track.dataset.rhythmPrimaryPeakDate = primary.peakDate;
  }

  function renderMilestones(track, range) {
    const holder = track.querySelector('.time-compass-markers');
    if (!holder) return;
    holder.innerHTML = tasks().filter((task) => task.milestone && task.start).sort((a, b) => a.start.localeCompare(b.start)).map((task) => {
      const ratio = range.days <= 1 ? .5 : clamp(diffDays(range.start, task.start) / (range.days - 1), 0, 1);
      const deadlineClass = task.isDeadline ? 'is-deadline' : '';
      const kind = task.isDeadline ? '締切' : '節目';
      return `<button type="button" class="time-compass-milestone ${deadlineClass}" data-compass-date="${task.start}" data-compass-name="${escapeHTML(task.name)}" style="left:${(ratio * 100).toFixed(3)}%" title="${kind} · ${escapeHTML(task.name)} · ${task.start}" aria-label="${kind} ${escapeHTML(task.name)} ${task.start}"><i aria-hidden="true"></i></button>`;
    }).join('');
  }

  function renderStatic(track, range) {
    track.querySelector('.time-compass-start').textContent = shortDate(range.start);
    track.querySelector('.time-compass-end').textContent = shortDate(range.end);
    const busy = track.querySelector('.time-compass-busy');
    if (busy) busy.style.backgroundImage = busyGradient(range);
    renderRhythmLandmarks(track, range);
    renderMilestones(track, range);
  }

  function syncToday(track, range) {
    const marker = track.querySelector('.project-ribbon-today');
    if (!marker) return;
    const today = todayISO();
    const inside = today >= range.start && today <= range.end;
    marker.hidden = !inside;
    if (!inside) return;
    const ratio = range.days <= 1 ? .5 : clamp(diffDays(range.start, today) / (range.days - 1), 0, 1);
    marker.style.left = `${(ratio * 100).toFixed(3)}%`;
    marker.title = `今日 ${today}`;
  }

  function setAnnotation(track, text) {
    const annotation = track.querySelector('.time-compass-annotation');
    if (annotation) annotation.textContent = text;
  }

  function primaryRhythmAnnotation(track) {
    if (!track?.dataset.rhythmPrimaryStart) return '';
    return `集中 ${shortDate(track.dataset.rhythmPrimaryStart)}–${shortDate(track.dataset.rhythmPrimaryEnd)} · 最大${track.dataset.rhythmPrimaryPeak}件`;
  }

  function defaultAnnotation(track, range) {
    const visible = visibleRange(range);
    if (isWhole(visible)) {
      setAnnotation(track, primaryRhythmAnnotation(track) || '全体表示');
      return;
    }
    setAnnotation(track, `${shortDate(visible.start)}–${shortDate(visible.end)}`);
  }

  function syncSemantics(track, active, whole, visible, range) {
    if (whole) {
      track.classList.add('is-whole');
      track.classList.remove('is-navigator');
      ['role','aria-valuemin','aria-valuemax','aria-valuenow','aria-valuetext','aria-orientation','aria-controls'].forEach((name) => track.removeAttribute(name));
      track.tabIndex = -1;
      track.setAttribute('aria-label', `プロジェクト全体 ${visible.start}から${visible.end}。全体表示中`);
      track.title = `${range.start}〜${range.end} · 全体表示中`;
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
      track.title = `${range.start}〜${range.end} · 表示中 ${visible.start}〜${visible.end}\nクリック/ドラッグで移動 · Enterで全体表示`;
    }
  }

  function syncCompass() {
    const dom = ensureCompassDOM();
    const range = projectRange();
    if (!dom || !range || dom.ribbon.hidden) {
      clearRhythmContext();
      return;
    }
    const { ribbon, track } = dom;
    const active = scroller();
    const visible = visibleRange(range);
    const whole = isWhole(visible);
    const signature = `${state?.project?.revision || 0}:${tasks().length}:${range.start}:${range.end}`;
    if (track.dataset.staticSignature !== signature) {
      track.dataset.staticSignature = signature;
      renderStatic(track, range);
    }
    syncToday(track, range);
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
    syncSemantics(track, active, whole, visible, range);
    syncRowDock();
    const chip = ribbon.querySelector('.time-window-chip');
    if (chip) chip.hidden = whole;
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

  function nearestRhythmWindow(rail, clientX) {
    return [...rail.querySelectorAll('.time-compass-rhythm-window')].find((element) => {
      const box = element.getBoundingClientRect();
      return clientX >= box.left - 2 && clientX <= box.right + 2;
    }) || null;
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
    const nearestMilestoneElement = nearestMilestone(rail, clientX);
    if (nearestMilestoneElement) {
      clearRhythmContext();
      setAnnotation(track, `◆ ${nearestMilestoneElement.dataset.compassName}`);
      return;
    }
    const rhythm = nearestRhythmWindow(rail, clientX);
    if (rhythm) {
      const context = applyRhythmContext(rhythm);
      setAnnotation(track, rhythmAnnotation(rhythm, context));
      return;
    }
    clearRhythmContext();
    const stats = dayStats(point.date);
    setAnnotation(track, `${shortDate(point.date)} · 進行${stats.active.length} · 開始${stats.starts.length} · 終了${stats.ends.length}`);
  }

  function clearHover(rail) {
    const pointer = rail.querySelector('.time-compass-pointer');
    if (pointer) pointer.hidden = true;
    clearRhythmContext();
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

  function focusRhythmRange(start, end, peakDate) {
    const current = view();
    const active = scroller();
    if (!current || !active || !parseISO(start) || !parseISO(end)) return;
    clearRhythmContext();
    const span = Math.max(1, inclusiveDays(start, end));
    const paddedSpan = Math.max(5, span + Math.max(4, Math.ceil(span * .7)));
    const desiredWidth = clamp(Math.floor((active.clientWidth / paddedSpan) * 10) / 10, 2, 32);
    const oldWidth = clamp(current.dayWidth || 2, 2, 32);
    const nextWidth = Math.max(oldWidth, desiredWidth);
    current.dayWidth = nextWidth;
    current.preferredDayWidth = nextWidth;
    current.scale = nextWidth >= 18 ? 'day' : nextWidth >= 6 ? 'week' : 'month';
    current.overviewAutoFit = false;
    state.storage.saveView(current);
    renderWorkspace();
    renderToolbarState();
    const fallbackPeak = addDays(start, Math.floor((span - 1) / 2));
    centerDate(parseISO(peakDate) ? peakDate : fallbackPeak);
  }

  function zoomAtDate(date, direction) {
    const current = view();
    if (!current) return;
    clearRhythmContext();
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
    rail.addEventListener('focusin', (event) => {
      const track = rail.closest('#project-ribbon-track');
      const rhythm = event.target.closest('.time-compass-rhythm-window');
      const milestone = event.target.closest('.time-compass-milestone');
      if (!track) return;
      if (milestone) {
        clearRhythmContext();
        setAnnotation(track, `◆ ${milestone.dataset.compassName}`);
      } else if (rhythm) {
        const context = applyRhythmContext(rhythm);
        setAnnotation(track, rhythmAnnotation(rhythm, context));
      }
    });
    rail.addEventListener('focusout', () => {
      requestAnimationFrame(() => {
        if (rail.contains(document.activeElement)) return;
        clearHover(rail);
      });
    });
  }

  function activateTemporalTarget(target) {
    const rhythm = target?.closest?.('.time-compass-rhythm-window');
    if (rhythm) {
      focusRhythmRange(rhythm.dataset.rhythmStart, rhythm.dataset.rhythmEnd, rhythm.dataset.rhythmPeakDate);
      return true;
    }
    const milestone = target?.closest?.('.time-compass-milestone');
    if (milestone) {
      clearRhythmContext();
      centerDate(milestone.dataset.compassDate, { zoomIfWhole: true });
      return true;
    }
    return false;
  }

  function bindTrack(track) {
    if (track.dataset.timeCompassBound === COMPASS_VERSION) return;
    track.dataset.timeCompassBound = COMPASS_VERSION;
    track.addEventListener('pointerdown', (event) => {
      const handle = event.target.closest('[data-window-handle]');
      if (handle) {
        event.stopImmediatePropagation();
        event.preventDefault();
        beginWindowResize(event, handle, track);
        return;
      }
      if (event.target.closest('.time-compass-meta')) {
        event.stopImmediatePropagation();
        event.preventDefault();
        return;
      }
      if (activateTemporalTarget(event.target)) {
        event.stopImmediatePropagation();
        event.preventDefault();
        return;
      }
      if (track.classList.contains('is-whole')) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    }, true);
    track.addEventListener('dblclick', (event) => {
      if (event.target.closest('.time-compass-milestone, .time-compass-rhythm-window, [data-window-handle]')) return;
      const rail = track.querySelector('.time-compass-rail');
      const point = rail && dayAtPointer(rail, event.clientX);
      if (!point) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      snapToMonth(point.date);
    }, true);
    track.addEventListener('keydown', (event) => {
      if ((event.key !== 'Enter' && event.key !== ' ') || !event.target.matches('.time-compass-rhythm-window, .time-compass-milestone')) return;
      if (activateTemporalTarget(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    track.addEventListener('wheel', (event) => {
      const rail = event.target.closest('.time-compass-rail') || track.querySelector('.time-compass-rail');
      const point = rail && dayAtPointer(rail, event.clientX);
      if (!point) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      zoomAtDate(point.date, event.deltaY < 0 ? 1 : -1);
    }, { capture: true, passive: false });
  }

  document.addEventListener('pointermove', previewWindowResize, true);
  document.addEventListener('pointerup', endWindowResize, true);
  document.addEventListener('pointercancel', endWindowResize, true);

  document.addEventListener('click', (event) => {
    if (event.target.closest('.time-window-chip')) {
      event.preventDefault();
      fitAll({ reason: 'explicit' });
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.key.toLowerCase() !== 't') return;
    if (!view()) return;
    event.preventDefault();
    centerOnToday();
  }, true);

  globalThis.ganttTimeCompassSync = syncCompass;
  globalThis.ganttProjectRhythm = {
    version: RHYTHM_VERSION,
    derive: deriveRhythmLandmarks,
    context: deriveRhythmContext,
  };

  setTimeout(syncCompass, 0);
  setTimeout(syncCompass, 180);
  setTimeout(syncCompass, 800);
})();