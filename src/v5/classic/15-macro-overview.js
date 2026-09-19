(() => {
  const MACRO_VERSION = '20260918-macro4';
  const MACRO_MIN_LANE = 26;
  const MACRO_MAX_LANE = 68;
  const HEADER_HEIGHT = 36;

  function clampMacro(value, min, max, fallback = min) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function currentView() {
    return state?.project?.viewSettings || null;
  }

  function macroEligible() {
    return breakpoint() !== 'mobile' && effectiveMode() !== 'list';
  }

  function visiblePeriod(tasks) {
    const starts = tasks.map((task) => task.start).filter(Boolean).sort();
    const ends = tasks.map((task) => task.end).filter(Boolean).sort();
    return { start: starts[0] || '', end: ends.at(-1) || '' };
  }

  function categoriesForTasks(tasks) {
    const ids = new Set(tasks.map((task) => task.categoryId));
    return state.project.categories.filter((category) => ids.has(category.id));
  }

  function taskGroups(tasks) {
    const categories = categoriesForTasks(tasks);
    return categories.map((category) => ({
      category,
      tasks: tasks.filter((task) => task.categoryId === category.id),
    })).filter((group) => group.tasks.length);
  }

  function assignSlots(tasks) {
    const laneEnds = [];
    const assignments = new Map();
    [...tasks].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end)).forEach((task) => {
      let slot = laneEnds.findIndex((end) => end < task.start);
      if (slot === -1) {
        slot = laneEnds.length;
        laneEnds.push(task.end);
      } else {
        laneEnds[slot] = task.end;
      }
      assignments.set(task.id, slot);
    });
    return { assignments, slotCount: Math.max(1, laneEnds.length) };
  }

  function macroTaskBar(task, start, end, dayWidth, laneHeight, slot, maxSlots) {
    if (task.end < start || task.start > end) return '';
    const clippedStart = task.start < start ? start : task.start;
    const clippedEnd = task.end > end ? end : task.end;
    const left = diffDays(start, clippedStart) * dayWidth;
    const width = Math.max(4, inclusiveDays(clippedStart, clippedEnd) * dayWidth);
    const usableHeight = Math.max(10, laneHeight - 8);
    const barHeight = clampMacro(Math.floor((usableHeight - Math.max(0, maxSlots - 1)) / Math.max(1, maxSlots)), 4, 9, 6);
    const top = 4 + slot * (barHeight + 1);
    const label = `${task.name} · ${task.start}${task.milestone ? '' : `〜${task.end}`}`;
    const selectedClass = task.id === state.selectedTaskId ? 'is-selected' : '';
    if (task.milestone) {
      return `<button class="macro-milestone color-${taskColor(task, state.project.categories)} ${selectedClass}" style="left:${left + Math.max(2, dayWidth / 2)}px;top:${Math.min(laneHeight - 10, top)}px" data-macro-task="${task.id}" title="${escapeHTML(label)}" aria-label="${escapeHTML(label)}"></button>`;
    }
    return `<button class="macro-task-bar color-${taskColor(task, state.project.categories)} ${task.completed ? 'is-completed' : ''} ${selectedClass}" style="left:${left}px;width:${width}px;height:${barHeight}px;top:${Math.min(laneHeight - barHeight - 3, top)}px" data-macro-task="${task.id}" title="${escapeHTML(label)}" aria-label="${escapeHTML(label)}"></button>`;
  }

  function macroGroupRow(group, start, end, dayWidth, totalWidth, laneHeight) {
    const packed = assignSlots(group.tasks);
    const maxSlots = Math.max(1, Math.min(packed.slotCount, Math.floor((laneHeight - 7) / 5)));
    const bars = group.tasks.map((task) => {
      const originalSlot = packed.assignments.get(task.id) || 0;
      return macroTaskBar(task, start, end, dayWidth, laneHeight, Math.min(originalSlot, maxSlots - 1), maxSlots);
    }).join('');
    return `<div class="macro-timeline-row" data-macro-category="${group.category.id}" style="width:${totalWidth}px;height:${laneHeight}px">${bars}</div>`;
  }

  function macroLabelRows(groups, laneHeight) {
    return groups.map(({ category, tasks }) => `<button class="macro-category-row" type="button" data-macro-category-focus="${category.id}" style="height:${laneHeight}px" title="${escapeHTML(category.name)} ${tasks.length}件">
      <span class="category-dot color-${category.color}"></span>
      <span class="macro-category-name">${escapeHTML(category.name)}</span>
      <span class="macro-category-count">${tasks.length}</span>
    </button>`).join('');
  }

  function renderMacroWorkspace() {
    const root = document.querySelector('#workspace');
    const view = currentView();
    const tasks = filteredTasks();
    if (!root || !view || !tasks.length) return false;

    let start = parseISO(view.start) ? view.start : visiblePeriod(tasks).start;
    let end = parseISO(view.end) && view.end >= start ? view.end : visiblePeriod(tasks).end;
    let days = inclusiveDays(start, end);
    if (days > 730) {
      end = addDays(start, 729);
      days = 730;
    }
    const dayWidth = clampMacro(view.dayWidth, 2, 32, 2);
    const totalWidth = days * dayWidth;
    const groups = taskGroups(tasks);
    const availableHeight = Math.max(180, (root.clientHeight || innerHeight * 0.72) - HEADER_HEIGHT);
    const laneHeight = clampMacro(Math.floor(availableHeight / Math.max(1, groups.length)), MACRO_MIN_LANE, MACRO_MAX_LANE, 40);
    const today = todayISO();
    const todayLeft = today >= start && today <= end ? diffDays(start, today) * dayWidth + dayWidth / 2 : null;

    root.className = `workspace mode-macro bp-${breakpoint()}`;
    root.dataset.macroOverview = MACRO_VERSION;
    root.innerHTML = `
      <section class="macro-label-panel">
        <div class="macro-label-head"><strong>全体</strong><span>${tasks.length}件 · ${groups.length}分類</span><button class="link-button" type="button" data-macro-action="exit-shape">1件ずつ見る</button></div>
        <div id="macro-label-scroll" class="macro-label-scroll">${macroLabelRows(groups, laneHeight)}</div>
      </section>
      <section class="macro-timeline-panel">
        <div id="macro-timeline-scroll" class="macro-timeline-scroll">
          <div class="macro-timeline-inner" style="width:${totalWidth}px">
            <div class="macro-time-head" style="width:${totalWidth}px">${timelineHeaderHTML(start, days, dayWidth, view.scale)}</div>
            <div class="macro-timeline-body" style="width:${totalWidth}px">
              ${todayLeft != null ? `<div class="macro-today-line" style="left:${todayLeft}px"><span>今日</span></div>` : ''}
              ${groups.map((group) => macroGroupRow(group, start, end, dayWidth, totalWidth, laneHeight)).join('')}
            </div>
          </div>
        </div>
      </section>`;

    bindMacroScroll();
    return true;
  }

  function bindMacroScroll() {
    const labels = document.querySelector('#macro-label-scroll');
    const timeline = document.querySelector('#macro-timeline-scroll');
    if (!labels || !timeline) return;
    let lock = false;
    const sync = (from, to) => {
      if (lock) return;
      lock = true;
      to.scrollTop = from.scrollTop;
      requestAnimationFrame(() => { lock = false; });
    };
    labels.addEventListener('scroll', () => sync(labels, timeline), { passive: true });
    timeline.addEventListener('scroll', () => sync(timeline, labels), { passive: true });
  }

  function exitMacro({ taskId = '', categoryId = '' } = {}) {
    const view = currentView();
    if (!view) return;
    view.overviewMacroMode = false;
    view.overviewAutoFit = false;
    view.rowHeight = Math.max(24, Number(view.preferredRowHeight) || 24);
    state.storage.saveView(view);
    if (taskId) state.selectedTaskId = taskId;
    renderWorkspace();
    renderToolbarState();
    requestAnimationFrame(() => {
      if (taskId) {
        document.querySelector(`[data-task-row="${CSS.escape(taskId)}"]`)?.scrollIntoView({ block: 'nearest' });
        const task = state.project.tasks.find((item) => item.id === taskId);
        if (task) {
          const scroll = document.querySelector('#timeline-scroll');
          if (scroll) {
            const center = diffDays(view.start, task.start) * view.dayWidth;
            scroll.scrollLeft = Math.max(0, center - scroll.clientWidth * 0.32);
          }
        }
      } else if (categoryId) {
        state.ui.categoryIds = new Set([categoryId]);
        renderToolbarState();
        renderWorkspace();
      }
    });
  }

  const previousRenderWorkspace = renderWorkspace;
  renderWorkspace = function semanticMacroRenderWorkspace() {
    const view = currentView();
    const tasks = state?.project ? filteredTasks() : [];
    if (view?.overviewMacroMode && macroEligible() && tasks.length) {
      if (renderMacroWorkspace()) return;
    }
    previousRenderWorkspace();
  };

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-macro-action="exit-shape"]')) {
      event.preventDefault();
      exitMacro();
      return;
    }
    const task = event.target.closest('[data-macro-task]')?.dataset.macroTask;
    if (task) {
      event.preventDefault();
      exitMacro({ taskId: task });
      return;
    }
    const category = event.target.closest('[data-macro-category-focus]')?.dataset.macroCategoryFocus;
    if (category) {
      event.preventDefault();
      exitMacro({ categoryId: category });
    }
  }, true);

  document.addEventListener('dblclick', (event) => {
    const id = event.target.closest('[data-macro-task]')?.dataset.macroTask;
    if (!id) return;
    event.preventDefault();
    exitMacro({ taskId: id });
    requestAnimationFrame(() => {
      const task = state.project.tasks.find((item) => item.id === id);
      if (task) openModal('details', { task });
    });
  }, true);

  document.addEventListener('keydown', (event) => {
    if (!currentView()?.overviewMacroMode || event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      exitMacro();
    }
  }, true);

  function bootMacro() {
    document.body.dataset.macroOverviewVersion = MACRO_VERSION;
  }

  bootMacro();
})();