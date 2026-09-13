(() => {
  const UX_VERSION = '20260913-ux1';
  const UX_MIGRATION_KEY = `gantt-desk:${UX_VERSION}:defaults`;
  const multiSelected = new Set();
  let presentMode = false;
  let dragState = null;
  let createState = null;

  function clampUx(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || min));
  }

  function activeTaskIds(primaryId = '') {
    if (multiSelected.size > 1 && multiSelected.has(primaryId)) return [...multiSelected];
    return primaryId ? [primaryId] : (state.selectedTaskId ? [state.selectedTaskId] : []);
  }

  function projectPeriod(tasks = state.project?.tasks || []) {
    if (!tasks.length) return { start: '', end: '' };
    const starts = tasks.map((task) => task.start).filter(Boolean).sort();
    const ends = tasks.map((task) => task.end).filter(Boolean).sort();
    return { start: starts[0] || '', end: ends.at(-1) || '' };
  }

  function aiInputObject() {
    const project = state.project;
    const period = projectPeriod(project.tasks);
    return {
      format: 'gantt-desk-ai-input',
      version: 1,
      generatedAt: new Date().toISOString(),
      project: {
        title: project.title,
        memo: project.memo || '',
        period,
        updatedAt: project.updatedAt,
      },
      categories: project.categories.map((category) => ({
        name: category.name,
        color: category.color,
        order: category.order,
      })),
      tasks: project.tasks.map((task) => ({
        id: task.id,
        name: task.name,
        start: task.start,
        end: task.end,
        categoryName: taskCategoryName(task, project.categories),
        milestone: task.milestone === true,
        completed: task.completed === true,
        deadline: task.isDeadline === true,
        note: task.note || '',
        order: task.order,
      })),
      returnContract: {
        description: '変更後の予定をGantt Deskへ戻す場合は、この形式だけを返す。説明文やMarkdownコードフェンスは付けない。',
        schema: {
          handoffVersion: 1,
          tasks: [
            {
              name: '予定名',
              start: 'YYYY-MM-DD',
              end: 'YYYY-MM-DD',
              categoryName: 'カテゴリー名',
              note: '必要な補足',
              milestone: false,
            },
          ],
          needsReview: [],
        },
        rules: [
          '原データにない日付を推測しない',
          '不確定な予定はneedsReviewへ入れる',
          '未知のフィールドを追加しない',
          '既存予定を変更する場合も、必要な予定をtasksへ完全な形で返す',
        ],
      },
    };
  }

  async function copyAiJson() {
    const text = JSON.stringify(aiInputObject(), null, 2);
    const copied = await copyText(text);
    if (copied) showToast(`AI用JSONをコピーしました（${state.project.tasks.length}件）`);
  }

  function downloadAiJson() {
    const text = JSON.stringify(aiInputObject(), null, 2);
    downloadBlob(new Blob([text], { type: 'application/json;charset=utf-8' }), `${safeFileName(state.project.title)}-${fileStamp()}-ai.json`);
    showToast('AI用JSONを保存しました');
  }

  function inferScale(dayWidth) {
    if (dayWidth >= 22) return 'day';
    if (dayWidth <= 7) return 'month';
    return 'week';
  }

  function zoomTimeline(direction, clientX = null) {
    const scroll = document.querySelector('#timeline-scroll');
    if (!scroll || !state.project) return;
    const oldWidth = clampUx(state.project.viewSettings.dayWidth, 2, 40);
    const factor = direction > 0 ? 1.22 : 0.82;
    const newWidth = Math.round(clampUx(oldWidth * factor, 3, 40) * 10) / 10;
    if (Math.abs(newWidth - oldWidth) < 0.05) return;

    const rect = scroll.getBoundingClientRect();
    const viewportX = clientX == null ? scroll.clientWidth / 2 : clampUx(clientX - rect.left, 0, scroll.clientWidth);
    const anchorDay = (scroll.scrollLeft + viewportX) / oldWidth;
    state.project.viewSettings.dayWidth = newWidth;
    state.project.viewSettings.scale = inferScale(newWidth);
    state.storage.saveView(state.project.viewSettings);
    renderWorkspace();
    renderToolbarState();
    requestAnimationFrame(() => {
      const next = document.querySelector('#timeline-scroll');
      if (next) next.scrollLeft = Math.max(0, anchorDay * newWidth - viewportX);
    });
  }

  function selectOnly(id) {
    multiSelected.clear();
    if (id) multiSelected.add(id);
    state.selectedTaskId = id || null;
  }

  function toggleMulti(id) {
    if (!id) return;
    if (!multiSelected.size && state.selectedTaskId) multiSelected.add(state.selectedTaskId);
    if (multiSelected.has(id)) multiSelected.delete(id);
    else multiSelected.add(id);
    state.selectedTaskId = multiSelected.has(id) ? id : ([...multiSelected].at(-1) || null);
    applyMultiSelectionStyles();
    updateSelectionBadge();
  }

  function applyMultiSelectionStyles() {
    document.querySelectorAll('[data-task-row], [data-timeline-row]').forEach((element) => {
      const id = element.dataset.taskRow || element.dataset.timelineRow;
      element.classList.toggle('is-multi-selected', multiSelected.has(id));
    });
    document.querySelectorAll('[data-timeline-task]').forEach((element) => {
      element.classList.toggle('is-multi-selected', multiSelected.has(element.dataset.timelineTask));
    });
  }

  function updateSelectionBadge() {
    const badge = document.querySelector('#ux-selection-badge');
    if (!badge) return;
    if (multiSelected.size > 1) {
      badge.hidden = false;
      badge.textContent = `${multiSelected.size}件選択`;
    } else {
      badge.hidden = true;
      badge.textContent = '';
    }
  }

  function taskBarHTML(task, viewStart, viewEnd, dayWidth) {
    const clippedStart = task.start < viewStart ? viewStart : task.start;
    const clippedEnd = task.end > viewEnd ? viewEnd : task.end;
    const left = diffDays(viewStart, clippedStart) * dayWidth;
    const selectedClass = multiSelected.has(task.id) ? ' is-multi-selected' : '';
    if (task.milestone) {
      return `<button class="milestone ux-draggable color-${taskColor(task, state.project.categories)}${selectedClass}" style="left:${left + Math.max(3, dayWidth / 2)}px" data-timeline-task="${task.id}" data-drag-role="move" title="${escapeHTML(task.name)} · ${task.start}" aria-label="${escapeHTML(task.name)} ${task.start}"></button>`;
    }
    const width = Math.max(6, inclusiveDays(clippedStart, clippedEnd) * dayWidth);
    return `<button class="task-bar ux-draggable color-${taskColor(task, state.project.categories)} ${task.completed ? 'is-completed' : ''}${selectedClass}" style="left:${left}px;width:${width}px" data-timeline-task="${task.id}" data-drag-role="move" title="${escapeHTML(task.name)} · ${task.start}〜${task.end}">
      <i class="ux-resize-handle ux-resize-start" data-resize="start" aria-hidden="true"></i>
      <span>${escapeHTML(task.name)}</span>
      <i class="ux-resize-handle ux-resize-end" data-resize="end" aria-hidden="true"></i>
    </button>`;
  }

  renderWorkspace = ((baseRenderWorkspace) => function enhancedRenderWorkspace() {
    baseRenderWorkspace();
    const panel = document.querySelector('.task-panel');
    if (panel && breakpoint() !== 'mobile') {
      const width = clampUx(state.project.viewSettings.listWidth || 300, 240, 520);
      panel.style.setProperty('--list-width', `${width}px`);
    }
    document.querySelector('#workspace')?.classList.toggle('ux-present-workspace', presentMode);
    applyMultiSelectionStyles();
    updateSelectionBadge();
  })(renderWorkspace);

  timelineRowHTML = function enhancedTimelineRowHTML(task, viewStart, viewEnd, dayWidth, totalWidth) {
    const intersects = task.start <= viewEnd && task.end >= viewStart;
    const shape = intersects ? taskBarHTML(task, viewStart, viewEnd, dayWidth) : '';
    const selected = task.id === state.selectedTaskId || multiSelected.has(task.id);
    return `<div class="timeline-row ${selected ? 'is-selected' : ''}" data-timeline-row="${task.id}" style="width:${totalWidth}px">${shape}</div>`;
  };

  beginPaneResize = function enhancedPaneResize(event) {
    if (breakpoint() === 'mobile') return;
    event.preventDefault();
    const initial = clampUx(state.project.viewSettings.listWidth || 300, 240, 520);
    const startX = event.clientX;
    const move = (moveEvent) => {
      const next = clampUx(initial + moveEvent.clientX - startX, 240, 520);
      document.querySelector('.task-panel')?.style.setProperty('--list-width', `${next}px`);
    };
    const end = (upEvent) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', end);
      const next = Math.round(clampUx(initial + upEvent.clientX - startX, 240, 520));
      state.project.viewSettings.listWidth = next;
      state.storage.saveView(state.project.viewSettings);
      renderWorkspace();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', end, { once: true });
  };

  function updateHeaderUX() {
    const topActions = document.querySelector('.top-actions');
    const toolbar = document.querySelector('.toolbar');
    if (!topActions || !toolbar) return;

    const ioToggle = topActions.querySelector('[data-toggle-menu="io-menu"]');
    if (ioToggle) ioToggle.innerHTML = 'JSON <span aria-hidden="true">⌄</span>';
    document.querySelectorAll('#io-menu [data-action="chat-input"], #io-menu [data-action="chat-output"]').forEach((el) => { el.hidden = true; });

    if (!document.querySelector('#ux-ai-json')) {
      const aiButton = document.createElement('button');
      aiButton.id = 'ux-ai-json';
      aiButton.className = 'button button-secondary ux-ai-json';
      aiButton.type = 'button';
      aiButton.dataset.uxAction = 'copy-ai-json';
      aiButton.textContent = 'AI用JSON';
      topActions.insertBefore(aiButton, ioToggle?.closest('.menu-wrap') || null);

      const present = document.createElement('button');
      present.id = 'ux-present';
      present.className = 'button button-primary ux-present-button';
      present.type = 'button';
      present.dataset.uxAction = 'present';
      present.textContent = 'Present';
      topActions.append(present);
    }

    if (!document.querySelector('#ux-view-controls')) {
      const controls = document.createElement('div');
      controls.id = 'ux-view-controls';
      controls.className = 'ux-view-controls';
      controls.innerHTML = `
        <button class="button button-quiet" type="button" data-action="fit" title="プロジェクト全体を表示">全体</button>
        <div class="ux-zoom" aria-label="表示倍率">
          <button type="button" data-ux-action="zoom-out" aria-label="縮小" title="縮小">−</button>
          <button type="button" data-ux-action="zoom-in" aria-label="拡大" title="拡大">＋</button>
        </div>
        <span id="ux-selection-badge" class="ux-selection-badge" hidden></span>
      `;
      const spacer = toolbar.querySelector('.toolbar-spacer');
      toolbar.insertBefore(controls, spacer?.nextSibling || null);
    }

    if (!document.querySelector('#ux-more-menu')) {
      const wrap = document.createElement('div');
      wrap.className = 'menu-wrap ux-more-wrap';
      wrap.innerHTML = `<button class="icon-button" type="button" data-toggle-menu="ux-more-menu" aria-expanded="false" aria-label="その他" title="その他">•••</button>
        <div id="ux-more-menu" class="popup-menu popup-menu-right" data-menu-panel hidden>
          <button type="button" data-action="today"><span>今日へ移動</span><small>今日の位置を表示</small></button>
          <button type="button" data-action="display-settings"><span>表示設定</span><small>期間・行高・文字サイズ</small></button>
          <button type="button" data-ux-action="download-ai-json"><span>AI用JSONを保存</span><small>外部AIへ渡す入力データ</small></button>
          <button type="button" data-action="project-settings"><span>プロジェクト設定</span><small>名称・メモ・カテゴリー</small></button>
        </div>`;
      toolbar.append(wrap);
    }

    ensurePresentBar();
  }

  function ensurePresentBar() {
    const header = document.querySelector('.app-header');
    if (!header || document.querySelector('#ux-present-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'ux-present-bar';
    bar.className = 'ux-present-bar';
    bar.hidden = true;
    header.append(bar);
  }

  function renderPresentBar() {
    const bar = document.querySelector('#ux-present-bar');
    if (!bar || !state.project) return;
    const tasks = filteredTasks();
    const period = projectPeriod(tasks.length ? tasks : state.project.tasks);
    const date = new Date(state.project.updatedAt || Date.now());
    const updated = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    bar.innerHTML = `
      <div class="ux-present-title"><strong>${escapeHTML(state.project.title)}</strong><span>${period.start || '—'} 〜 ${period.end || '—'}</span></div>
      <div class="ux-present-meta"><span>${tasks.length}件</span><span>更新 ${updated}</span></div>
      <div class="ux-present-actions"><button class="button button-secondary" type="button" data-action="export">書き出し</button><button class="button button-primary" type="button" data-ux-action="exit-present">編集に戻る</button></div>`;
  }

  function setPresent(next) {
    presentMode = Boolean(next);
    document.body.classList.toggle('is-present-mode', presentMode);
    const bar = document.querySelector('#ux-present-bar');
    if (bar) bar.hidden = !presentMode;
    if (presentMode) {
      multiSelected.clear();
      renderPresentBar();
      fitAll();
      requestAnimationFrame(renderPresentBar);
    } else {
      renderWorkspace();
      renderToolbarState();
    }
  }

  function shiftTasks(ids, deltaDays) {
    if (!ids.length || !deltaDays) return;
    const idSet = new Set(ids);
    contentCommit((project) => {
      project.tasks.forEach((task) => {
        if (!idSet.has(task.id)) return;
        task.start = addDays(task.start, deltaDays);
        task.end = addDays(task.end, deltaDays);
      });
    }, { reason: 'keyboard-shift', message: `${ids.length}件を${Math.abs(deltaDays)}日${deltaDays > 0 ? '後ろ' : '前'}へ移動しました` });
  }

  function beginTaskDrag(event, element) {
    if (presentMode || event.button !== 0) return;
    const id = element.dataset.timelineTask;
    const task = state.project.tasks.find((item) => item.id === id);
    if (!task) return;
    const resize = event.target.closest('[data-resize]')?.dataset.resize || '';
    const role = resize || 'move';
    const ids = role === 'move' ? activeTaskIds(id) : [id];
    const snapshot = ids.map((taskId) => {
      const item = state.project.tasks.find((t) => t.id === taskId);
      return item ? { id: taskId, start: item.start, end: item.end, milestone: item.milestone } : null;
    }).filter(Boolean);
    dragState = {
      pointerId: event.pointerId,
      element,
      id,
      ids,
      role,
      startX: event.clientX,
      dayWidth: clampUx(state.project.viewSettings.dayWidth, 2, 40),
      snapshot,
      delta: 0,
      baseWidth: element.getBoundingClientRect().width,
    };
    element.classList.add('is-dragging');
    element.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function moveTaskDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const delta = Math.round((event.clientX - dragState.startX) / dragState.dayWidth);
    if (delta === dragState.delta) return;
    dragState.delta = delta;
    const px = delta * dragState.dayWidth;
    if (dragState.role === 'move') dragState.element.style.translate = `${px}px 0`;
    else if (dragState.role === 'start') {
      dragState.element.style.marginLeft = `${px}px`;
      dragState.element.style.width = `${Math.max(6, dragState.baseWidth - px)}px`;
    } else if (dragState.role === 'end') {
      dragState.element.style.width = `${Math.max(6, dragState.baseWidth + px)}px`;
    }
    event.preventDefault();
  }

  function endTaskDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const d = dragState;
    dragState = null;
    d.element.classList.remove('is-dragging');
    d.element.style.translate = '';
    d.element.style.marginLeft = '';
    d.element.style.width = '';
    const delta = Math.round((event.clientX - d.startX) / d.dayWidth);
    if (!delta && d.role === 'move') {
      selectOnly(d.id);
      renderWorkspace();
      return;
    }
    if (!delta) { renderWorkspace(); return; }

    contentCommit((project) => {
      d.snapshot.forEach((original) => {
        const task = project.tasks.find((item) => item.id === original.id);
        if (!task) return;
        if (d.role === 'move') {
          task.start = addDays(original.start, delta);
          task.end = addDays(original.end, delta);
        } else if (d.role === 'start' && !task.milestone) {
          const candidate = addDays(original.start, delta);
          task.start = candidate <= original.end ? candidate : original.end;
        } else if (d.role === 'end' && !task.milestone) {
          const candidate = addDays(original.end, delta);
          task.end = candidate >= original.start ? candidate : original.start;
        }
      });
    }, { reason: `timeline-${d.role}`, message: d.role === 'move' ? `${d.snapshot.length}件の日程を移動しました` : '期間を変更しました' });
  }

  function timelineDateFromPointer(event, row) {
    const scroll = row.closest('#timeline-scroll');
    if (!scroll) return null;
    const rect = row.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const dayWidth = clampUx(state.project.viewSettings.dayWidth, 2, 40);
    const index = Math.max(0, Math.floor(localX / dayWidth));
    return addDays(state.project.viewSettings.start, index);
  }

  function beginBlankCreate(event, row) {
    if (presentMode || event.button !== 0 || event.target.closest('[data-timeline-task], .today-line')) return;
    const date = timelineDateFromPointer(event, row);
    if (!date) return;
    createState = { pointerId: event.pointerId, row, startX: event.clientX, startDate: date, endDate: date, ghost: null };
  }

  function moveBlankCreate(event) {
    if (!createState || event.pointerId !== createState.pointerId) return;
    if (Math.abs(event.clientX - createState.startX) < 6 && !createState.ghost) return;
    const end = timelineDateFromPointer(event, createState.row);
    if (!end) return;
    createState.endDate = end;
    if (!createState.ghost) {
      const ghost = document.createElement('div');
      ghost.className = 'ux-create-ghost';
      createState.row.append(ghost);
      createState.ghost = ghost;
    }
    const dayWidth = clampUx(state.project.viewSettings.dayWidth, 2, 40);
    const a = createState.startDate <= end ? createState.startDate : end;
    const b = createState.startDate <= end ? end : createState.startDate;
    const left = diffDays(state.project.viewSettings.start, a) * dayWidth;
    const width = inclusiveDays(a, b) * dayWidth;
    Object.assign(createState.ghost.style, { left: `${left}px`, width: `${Math.max(6, width)}px` });
    event.preventDefault();
  }

  function endBlankCreate(event) {
    if (!createState || event.pointerId !== createState.pointerId) return;
    const draft = createState;
    createState = null;
    draft.ghost?.remove();
    if (Math.abs(event.clientX - draft.startX) < 6) return;
    const a = draft.startDate <= draft.endDate ? draft.startDate : draft.endDate;
    const b = draft.startDate <= draft.endDate ? draft.endDate : draft.startDate;
    openModal('details');
    if (state.editor?.task) {
      state.editor.task.start = a;
      state.editor.task.end = b;
      state.editor.dirty = false;
      renderModal();
    }
  }

  function migrateUxDefaults() {
    if (!state.project || localStorage.getItem(UX_MIGRATION_KEY)) return;
    const view = state.project.viewSettings;
    if (breakpoint() !== 'mobile') {
      view.listWidth = clampUx(view.listWidth || 300, 280, 340);
      view.rowHeight = Math.min(view.rowHeight || 44, 44);
      view.modeByBreakpoint = { ...view.modeByBreakpoint, desktop: 'split', tablet: 'split' };
      view.mode = 'split';
      state.storage.saveView(view);
    }
    localStorage.setItem(UX_MIGRATION_KEY, '1');
  }

  document.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-ux-action]')?.dataset.uxAction;
    if (!action) return;
    event.preventDefault();
    if (action === 'copy-ai-json') await copyAiJson();
    else if (action === 'download-ai-json') downloadAiJson();
    else if (action === 'zoom-in') zoomTimeline(1);
    else if (action === 'zoom-out') zoomTimeline(-1);
    else if (action === 'present') setPresent(true);
    else if (action === 'exit-present') setPresent(false);
  });

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-timeline-task], [data-task-row]');
    const id = target?.dataset.timelineTask || target?.dataset.taskRow;
    if (!id) return;
    if (event.shiftKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleMulti(id);
      return;
    }
    multiSelected.clear();
    updateSelectionBadge();
  }, true);

  document.addEventListener('dblclick', (event) => {
    const target = event.target.closest('[data-timeline-task]');
    if (!target || presentMode) return;
    event.preventDefault();
    state.selectedTaskId = target.dataset.timelineTask;
    openModal('details', { task: selectedTask() });
  });

  document.addEventListener('pointerdown', (event) => {
    const bar = event.target.closest('[data-timeline-task]');
    if (bar) { beginTaskDrag(event, bar); return; }
    const row = event.target.closest('[data-timeline-row]');
    if (row) beginBlankCreate(event, row);
  }, true);
  document.addEventListener('pointermove', (event) => { moveTaskDrag(event); moveBlankCreate(event); }, true);
  document.addEventListener('pointerup', (event) => { endTaskDrag(event); endBlankCreate(event); }, true);
  document.addEventListener('pointercancel', (event) => { endTaskDrag(event); endBlankCreate(event); }, true);

  document.addEventListener('wheel', (event) => {
    if (!(event.ctrlKey || event.metaKey) || !event.target.closest('#timeline-scroll')) return;
    event.preventDefault();
    zoomTimeline(event.deltaY < 0 ? 1 : -1, event.clientX);
  }, { passive: false });

  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'Escape' && presentMode) { event.preventDefault(); setPresent(false); return; }
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      const ids = activeTaskIds(state.selectedTaskId);
      if (!ids.length) return;
      event.preventDefault();
      shiftTasks(ids, event.key === 'ArrowRight' ? 1 : -1);
    }
    if ((event.key === '+' || event.key === '=') && !event.metaKey && !event.ctrlKey) { event.preventDefault(); zoomTimeline(1); }
    if (event.key === '-' && !event.metaKey && !event.ctrlKey) { event.preventDefault(); zoomTimeline(-1); }
    if (event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); fitAll(); }
  }, true);

  document.addEventListener('gantt-desk:v5-change', () => {
    if (presentMode) renderPresentBar();
    requestAnimationFrame(() => { applyMultiSelectionStyles(); updateSelectionBadge(); });
  });

  function bootUx() {
    if (!state?.project || !state.storage) {
      setTimeout(bootUx, 30);
      return;
    }
    migrateUxDefaults();
    updateHeaderUX();
    renderWorkspace();
    renderToolbarState();
    document.body.dataset.uxVersion = UX_VERSION;
  }

  updateHeaderUX();
  bootUx();
})();
