(() => {
  const UX_VERSION = '20260921-label-clarity1';
  const UX_MIGRATION_KEY = `gantt-desk:${UX_VERSION}:defaults`;
  const multiSelected = new Set();
  let presentMode = false;
  let dragState = null;
  let createState = null;
  const TAP_PX = 6;

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
    syncSelectionCard(true);
  }

  window.taskSelection = { selectOnly, toggle: toggleMulti, ids: () => [...multiSelected], shift: (ids, days) => shiftTasks(ids, days) };

  function applyMultiSelectionStyles() {
    document.querySelectorAll('[data-task-row], [data-timeline-row]').forEach((element) => {
      const id = element.dataset.taskRow || element.dataset.timelineRow;
      element.classList.toggle('is-multi-selected', multiSelected.has(id));
    });
    document.querySelectorAll('[data-timeline-task]').forEach((element) => {
      element.classList.toggle('is-multi-selected', multiSelected.has(element.dataset.timelineTask));
    });
  }

  // 2件以上の選択は、まとめてカード(21-task-card.js)が受け持つ
  function syncSelectionCard(open = false) {
    window.syncMultiCard?.(open);
  }

  // 文字は図形とは別の情報層。日本語・英数字混在でも「実際に入るか」を実測して決める。
  const BAR_PAD = 20;
  const LABEL_GAP = 7;
  const LABEL_GUTTER_MIN = 72;
  const LABEL_GUTTER_MAX = 640;
  const labelMeasureContext = document.createElement('canvas').getContext('2d');
  const labelMeasureCache = new Map();

  function uiFontFamily() {
    return getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim()
      || 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  }

  function measuredTextWidth(text, size = 12, weight = 600) {
    const value = String(text || '');
    const key = `${size}|${weight}|${value}`;
    if (labelMeasureCache.has(key)) return labelMeasureCache.get(key);
    if (!labelMeasureContext) return value.length * size;
    labelMeasureContext.font = `${weight} ${size}px ${uiFontFamily()}`;
    const width = Math.ceil(labelMeasureContext.measureText(value).width);
    labelMeasureCache.set(key, width);
    if (labelMeasureCache.size > 600) labelMeasureCache.clear();
    return width;
  }

  const nameWidth = (name) => measuredTextWidth(name, 12, 600);
  const dateWidth = (dates) => measuredTextWidth(dates, 11, 500);
  const dateText = (task) => (task.milestone ? shortMD(task.start) : `${shortMD(task.start)}–${shortMD(task.end)}`);

  // 1行ぶんの配置。バー・遅れの糸・外に出す名前・••• の位置を、同じ概算で一度に決める
  function rowLayout(task, viewStart, viewEnd, dayWidth, totalWidth) {
    const today = todayISO();
    const status = taskState(task, today);
    const intersects = task.start <= viewEnd && task.end >= viewStart;
    const clippedStart = task.start < viewStart ? viewStart : task.start;
    const clippedEnd = task.end > viewEnd ? viewEnd : task.end;
    const left = intersects ? diffDays(viewStart, clippedStart) * dayWidth : 0;
    const milestone = task.milestone === true;
    const width = milestone ? 0 : Math.max(6, inclusiveDays(clippedStart, clippedEnd) * dayWidth);
    const anchor = milestone ? left + Math.max(3, dayWidth / 2) : left; // ひし形の中心 / バーの左端
    const right = intersects ? (milestone ? anchor + 10 : left + width) : 0;
    const layout = { status, intersects, left, width, anchor, right, milestone, today, dates: dateText(task) };
    let trail = intersects ? right : 0;

    if (status === 'late' && today >= viewStart) {
      const todayX = today > viewEnd ? totalWidth : diffDays(viewStart, today) * dayWidth + dayWidth / 2;
      layout.thread = { left: right, width: Math.max(0, todayX - right), dot: today <= viewEnd };
      if (today <= viewEnd) {
        layout.lateLabel = { left: todayX + 9, text: `${diffDays(milestone ? task.start : task.end, today)}日遅れ` };
        layout.lateLabel.right = layout.lateLabel.left + flagTextWidth(layout.lateLabel.text);
        trail = Math.max(trail, layout.lateLabel.right);
      }
    }

    if (intersects) {
      const namePos = task.displayNamePosition || 'auto';
      const measuredName = nameWidth(task.name);
      const completionPad = task.completed ? 14 : 0;
      const insideBudget = Math.max(0, width - BAR_PAD - completionPad);
      layout.outside = milestone || namePos === 'right' || (namePos !== 'inside' && measuredName > insideBudget);
      layout.insideDates = !layout.outside && measuredName + 8 + dateWidth(layout.dates) <= insideBudget;
      if (layout.outside) {
        const textWidth = measuredName + LABEL_GAP + dateWidth(layout.dates);
        const start = (layout.lateLabel ? layout.lateLabel.right + 8 : right + 6);
        layout.nameSide = 'right';
        layout.nameStart = start;
        layout.labelWidth = textWidth;
        trail = Math.max(trail, start + Math.min(textWidth, LABEL_GUTTER_MAX));
      }
    }
    layout.moreX = trail + 20 <= totalWidth ? trail + 4 : right - 20;
    return layout;
  }

  function labelGutterWidth(tasks, viewStart, viewEnd, dayWidth, totalWidth) {
    let overflow = 0;
    for (const task of tasks) {
      const layout = rowLayout(task, viewStart, viewEnd, dayWidth, totalWidth);
      if (!layout.intersects || !layout.outside) continue;
      const labelRight = layout.nameStart + Math.min(layout.labelWidth || 0, LABEL_GUTTER_MAX) + 28;
      overflow = Math.max(overflow, labelRight - totalWidth);
    }
    if (overflow <= 0) return 0;
    return Math.ceil(clampUx(Math.max(LABEL_GUTTER_MIN, overflow), LABEL_GUTTER_MIN, LABEL_GUTTER_MAX));
  }

  function taskBarHTML(task, viewStart, viewEnd, dayWidth, layout) {
    const selectedClass = multiSelected.has(task.id) ? ' is-multi-selected' : '';
    const color = taskColor(task, state.project.categories);
    if (task.milestone) {
      const kind = layout.status === 'late' ? ' is-late' : layout.status === 'done' ? ' is-completed' : '';
      return `<button tabindex="-1" class="milestone ux-draggable color-${color}${task.isDeadline ? ' is-deadline' : ''}${kind}${selectedClass}" style="left:${layout.anchor}px" data-timeline-task="${task.id}" data-drag-role="move" title="${escapeHTML(task.name)} · ${task.start}" aria-label="${escapeHTML(task.name)} ${task.start} 詳細を開く"></button>`;
    }
    const { left, width } = layout;
    let elapsed = 0;
    if (layout.status === 'late') elapsed = 100;
    else if (layout.status === 'active') elapsed = clampUx(((diffDays(viewStart, layout.today) * dayWidth + dayWidth / 2 - left) / width) * 100, 0, 100);

    const inside = layout.outside
      ? ''
      : `<span class="bar-name">${escapeHTML(task.name)}</span>${layout.insideDates ? `<span class="bar-dates">${layout.dates}</span>` : ''}`;
    return `<button tabindex="-1" class="task-bar ux-draggable color-${color} ${task.completed ? 'is-completed' : ''}${layout.status === 'late' ? ' is-late' : ''}${selectedClass}" style="left:${left}px;width:${width}px;--elapsed:${elapsed.toFixed(1)}%" data-timeline-task="${task.id}" data-drag-role="move" title="${escapeHTML(task.name)} · ${task.start}〜${task.end}" aria-label="${escapeHTML(task.name)} ${task.start.replaceAll('-', '/')}〜${task.end.slice(5).replace('-', '/')} 詳細を開く">
      <i class="ux-resize-handle ux-resize-start" data-resize="start" aria-hidden="true"></i>
      ${inside}
      <i class="ux-resize-handle ux-resize-end" data-resize="end" aria-hidden="true"></i>
    </button>`;
  }

  function taskLabelHTML(task, layout) {
    if (!layout.outside) return '';
    const color = taskColor(task, state.project.categories);
    const milestoneClass = task.milestone ? ' ux-ms-name' : '';
    const maxWidth = Math.max(120, Math.min(LABEL_GUTTER_MAX, Math.ceil(layout.labelWidth || LABEL_GUTTER_MIN)));
    return `<b class="ux-bar-name-out ux-task-label-out color-${color}${milestoneClass}" style="left:${layout.nameStart}px;max-width:${maxWidth}px;margin-left:0"><span>${escapeHTML(task.name)}</span><em>${layout.dates}</em></b>`;
  }

  renderWorkspace = ((baseRenderWorkspace) => function enhancedRenderWorkspace() {
    baseRenderWorkspace();
    const panel = document.querySelector('.task-panel');
    if (panel && breakpoint() !== 'mobile') {
      const width = clampUx(state.project.viewSettings.listWidth || 300, 240, 520);
      panel.style.setProperty('--list-width', `${width}px`);
    }
    // バーの右側を「余り」ではなくラベル領域として確保する。
    const inner = document.querySelector('.timeline-inner');
    const body = document.querySelector('#timeline-body');
    const head = document.querySelector('.timeline-head');
    if (inner && body && head) {
      const view = state.project.viewSettings;
      const viewStart = view.start;
      const viewEnd = view.end;
      const dayWidth = clampUx(view.dayWidth, 2, 32);
      const baseWidth = Number.parseFloat(head.style.width) || inclusiveDays(viewStart, viewEnd) * dayWidth;
      const gutter = labelGutterWidth(filteredTasks(), viewStart, viewEnd, dayWidth, baseWidth);
      const canvasWidth = baseWidth + gutter;
      inner.style.width = `${canvasWidth}px`;
      body.style.width = `${canvasWidth}px`;
      body.style.setProperty('--timeline-base-width', `${baseWidth}px`);
      body.style.setProperty('--label-gutter-width', `${gutter}px`);
      body.classList.toggle('has-label-gutter', gutter > 0);
      document.querySelectorAll('[data-timeline-row]').forEach((row) => { row.style.width = `${canvasWidth}px`; });
    }

    document.querySelector('#workspace')?.classList.toggle('ux-present-workspace', presentMode);
    applyMultiSelectionStyles();
    syncSelectionCard();
  })(renderWorkspace);

  timelineRowHTML = function enhancedTimelineRowHTML(task, viewStart, viewEnd, dayWidth, totalWidth) {
    const layout = rowLayout(task, viewStart, viewEnd, dayWidth, totalWidth);
    let shape = '';
    if (layout.thread) shape += `<i class="ux-late-thread${layout.thread.dot ? '' : ' is-open'}" style="left:${layout.thread.left}px;width:${layout.thread.width}px"></i>`;
    if (layout.lateLabel) shape += `<span class="ux-late-label" style="left:${layout.lateLabel.left}px">${layout.lateLabel.text}</span>`;
    if (layout.intersects) {
      shape += taskBarHTML(task, viewStart, viewEnd, dayWidth, layout);
      shape += taskLabelHTML(task, layout);
      shape += `<button type="button" class="ux-bar-more" style="left:${layout.moreX}px" data-action="details" data-task-id="${task.id}" aria-label="${escapeHTML(task.name)}の詳細">•••</button>`;
    }
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
      present.textContent = 'プレゼンテーション';
      present.setAttribute('aria-label', 'プレゼンテーション表示');
      present.title = 'プレゼンテーション表示';
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
      `;
      toolbar.insertBefore(controls, toolbar.querySelector('#mode-switch'));
    }

    if (!document.querySelector('#ux-more-menu')) {
      const wrap = document.createElement('div');
      wrap.className = 'menu-wrap ux-more-wrap';
      wrap.innerHTML = `<button class="icon-button" type="button" data-toggle-menu="ux-more-menu" aria-expanded="false" aria-label="その他" title="その他">•••</button>
        <div id="ux-more-menu" class="popup-menu popup-menu-right" data-menu-panel hidden>
          <button type="button" class="ux-mobile-only" data-action="fit"><span>全体を表示</span><small>プロジェクト全体に合わせる</small></button>
          <button type="button" class="ux-mobile-only" data-menu-do="zoom-in"><span>拡大</span><small>日付の幅を広げる</small></button>
          <button type="button" class="ux-mobile-only" data-menu-do="zoom-out"><span>縮小</span><small>日付の幅を狭める</small></button>
          <button type="button" class="ux-mobile-only" data-menu-do="copy-ai-json"><span>AI用JSONをコピー</span><small>外部AIへ渡す入力データ</small></button>
          <button type="button" data-palette-open><span>予定・操作を探す</span><small>Ctrl+K</small></button>
          <button type="button" data-action="today"><span>今日へ移動</span><small>今日の位置を表示</small></button>
          <button type="button" data-action="display-settings"><span>表示設定</span><small>期間・行高・文字サイズ</small></button>
          <button type="button" data-ux-action="download-ai-json"><span>AI用JSONを保存</span><small>外部AIへ渡す入力データ</small></button>
          <button type="button" data-action="project-settings"><span>プロジェクト設定</span><small>名称・メモ・カテゴリー</small></button>
        </div>`;
      toolbar.append(wrap);
    }

    const modeSwitch = document.querySelector('#mode-switch');
    const moreWrap = document.querySelector('.ux-more-wrap');
    if (modeSwitch && moreWrap && modeSwitch.nextElementSibling !== moreWrap) toolbar.insertBefore(modeSwitch, moreWrap);

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
    // 凡例: 表示中の予定が使うカテゴリーだけ。期間の span より後ろに置く(19-ui-polish.js が最初の span を期間として読む)
    const usedIds = new Set(tasks.map((task) => task.categoryId));
    const legend = state.project.categories.filter((category) => usedIds.has(category.id))
      .map((category) => `<span class="cat-${category.color}"><i></i>${escapeHTML(category.name)}</span>`).join('');
    bar.innerHTML = `
      <div class="ux-present-title"><strong>${escapeHTML(state.project.title)}</strong><span>${period.start || '—'} 〜 ${period.end || '—'}</span>${legend ? `<span class="ux-present-legend">${legend}</span>` : ''}</div>
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

  // ドラッグ中の予定の、置いた後の期間
  function draggedRange(d, original) {
    if (d.role === 'move') return { start: addDays(original.start, d.delta), end: addDays(original.end, d.delta) };
    if (d.role === 'start') { const start = addDays(original.start, d.delta); return { start: start <= original.end ? start : original.end, end: original.end }; }
    const end = addDays(original.end, d.delta);
    return { start: original.start, end: end >= original.start ? end : original.start };
  }

  // 同じカテゴリーの締切マイルストーンを、この移動で新たに越えるか(最も近い1件)
  function deadlineOverrun(d) {
    if (d.role === 'start') return null;
    const deadlines = state.project.tasks.filter((task) => task.milestone && task.isDeadline);
    let hit = null;
    d.snapshot.forEach((original) => {
      const task = state.project.tasks.find((item) => item.id === original.id);
      if (!task || task.milestone) return;
      const end = draggedRange(d, original).end;
      deadlines.forEach((deadline) => {
        if (deadline.categoryId !== task.categoryId || original.end > deadline.start || end <= deadline.start) return;
        if (!hit || deadline.start < hit.deadline.start) hit = { deadline, days: diffDays(deadline.start, end) };
      });
    });
    return hit;
  }

  function positionDragReadout(event) {
    const box = dragState?.readout;
    if (!box) return;
    box.style.left = `${Math.min(event.clientX + 14, innerWidth - box.offsetWidth - 8)}px`;
    box.style.top = `${Math.max(8, event.clientY - box.offsetHeight - 14)}px`;
  }

  function updateDragReadout(event) {
    const d = dragState;
    if (!d.readout) {
      d.readout = document.createElement('div');
      d.readout.className = 'ux-drag-readout';
      d.readout.setAttribute('aria-hidden', 'true');
      document.body.append(d.readout);
    }
    const first = d.snapshot[0];
    const range = draggedRange(d, first);
    const before = inclusiveDays(first.start, first.end);
    const after = inclusiveDays(range.start, range.end);
    const sign = d.delta > 0 ? '+' : '';
    let line;
    if (d.role === 'move' && d.snapshot.length > 1) line = `${d.snapshot.length}件を ${sign}${d.delta}日  (${shortMD(first.start)} → ${shortMD(range.start)})`;
    else if (d.role === 'move') line = `${shortMD(first.start)} → ${shortMD(range.start)}${first.milestone ? '' : `  (${after}日間)`}  ${sign}${d.delta}日`;
    else if (d.role === 'start') line = `${shortMD(first.start)} → ${shortMD(range.start)}  (${before}日間 → ${after}日間)`;
    else line = `${shortMD(first.end)} → ${shortMD(range.end)}  (${before}日間 → ${after}日間)`;
    const hit = deadlineOverrun(d);
    d.readout.classList.toggle('is-warning', Boolean(hit));
    d.readout.replaceChildren(line);
    if (hit) {
      const warn = document.createElement('div');
      warn.textContent = `締切「${hit.deadline.name}」を${hit.days}日超えます`;
      d.readout.append(warn);
    }
    positionDragReadout(event);
    document.querySelectorAll('.time-compass-milestone.is-alert').forEach((pin) => pin.classList.remove('is-alert'));
    if (hit) {
      document.querySelectorAll('.time-compass-milestone').forEach((pin) => {
        if (pin.dataset.compassDate === hit.deadline.start && pin.dataset.compassName === hit.deadline.name) pin.classList.add('is-alert');
      });
    }
  }

  function clearDragReadout(d) {
    d.readout?.remove();
    document.querySelectorAll('.time-compass-milestone.is-alert').forEach((pin) => pin.classList.remove('is-alert'));
  }

  function dragToast(d, delta) {
    const first = d.snapshot[0];
    const range = draggedRange({ ...d, delta }, first);
    if (d.role === 'move') return `${d.snapshot.length}件を${Math.abs(delta)}日${delta > 0 ? '後ろ' : '前'}へ移動しました(${shortMD(first.start)} → ${shortMD(range.start)})`;
    return `期間を${inclusiveDays(range.start, range.end)}日間にしました(${shortMD(range.start)} → ${shortMD(range.end)})`;
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
      moved: false,
      baseWidth: element.getBoundingClientRect().width,
    };
    element.classList.add('is-dragging');
    element.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  // ドラッグ中は、元の位置に点線の枠を残す(置いた後は 23-afterimage.js の残像が引き継ぐ)
  function placeDragOrigins(d) {
    d.ids.forEach((id) => {
      const bar = document.querySelector(`[data-timeline-task="${CSS.escape(id)}"]`);
      if (!bar?.parentElement) return;
      const origin = document.createElement('i');
      origin.className = 'ux-drag-origin';
      Object.assign(origin.style, { left: `${bar.offsetLeft}px`, width: `${Math.max(bar.offsetWidth, 13)}px` });
      bar.parentElement.append(origin);
    });
  }

  function moveTaskDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    if (!dragState.moved && Math.abs(event.clientX - dragState.startX) < TAP_PX) return;
    if (!dragState.moved) placeDragOrigins(dragState);
    dragState.moved = true;
    const delta = Math.round((event.clientX - dragState.startX) / dragState.dayWidth);
    positionDragReadout(event);
    if (delta === dragState.delta && dragState.readout) return;
    dragState.delta = delta;
    updateDragReadout(event);
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
    document.querySelectorAll('.ux-drag-origin').forEach((el) => el.remove());
    clearDragReadout(d);
    d.element.classList.remove('is-dragging');
    d.element.style.translate = '';
    d.element.style.marginLeft = '';
    d.element.style.width = '';
    if (event.type === 'pointercancel') return;
    if (Math.abs(event.clientX - d.startX) < TAP_PX) {
      if (d.role !== 'move') { renderWorkspace(); return; }
      if (event.shiftKey) return; // 続く click の toggleMulti に任せる
      selectOnly(d.id);
      renderWorkspace();
      // ponytail: pointerup中はブラウザのlight dismissがcardを閉じるため、開くのは1tick遅らせる
      setTimeout(() => openTaskCard(d.id, d.element), 0);
      return;
    }
    const delta = Math.round((event.clientX - d.startX) / d.dayWidth);
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
    }, { reason: `timeline-${d.role}`, message: dragToast(d, delta), undo: true });
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
    if (presentMode || event.button !== 0 || event.target.closest('[data-timeline-task], .today-line, .ux-bar-more')) return;
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

  // 今日の旗の「遅れ N」: 既存の「期限超過」の絞り込みを切り替える
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-now-action]')?.dataset.nowAction !== 'overdue') return;
    event.preventDefault();
    state.ui.overdue = !state.ui.overdue;
    renderToolbarState();
    renderWorkspace();
  });

  // ••• メニューの項目を押したら閉じる(モバイルはここが主要操作の入口になる)
  document.addEventListener('click', (event) => {
    const item = event.target.closest('#ux-more-menu button');
    if (!item) return;
    closeMenus();
    if (item.dataset.menuDo === 'zoom-in') zoomTimeline(1);
    else if (item.dataset.menuDo === 'zoom-out') zoomTimeline(-1);
    else if (item.dataset.menuDo === 'copy-ai-json') copyAiJson();
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
    syncSelectionCard();
  }, true);

  document.addEventListener('dblclick', (event) => {
    const target = event.target.closest('[data-timeline-task]');
    if (!target || presentMode) return;
    event.preventDefault();
    closeTaskCard();
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
    requestAnimationFrame(() => { applyMultiSelectionStyles(); syncSelectionCard(); });
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
    // 今日線・遅れの糸・操作盤は、開いた直後の一度だけ動く
    document.body.classList.add('ux-intro');
    setTimeout(() => document.body.classList.remove('ux-intro'), 1600);
  }

  updateHeaderUX();
  bootUx();
})();
