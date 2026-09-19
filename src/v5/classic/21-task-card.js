(() => {
  const CARD_VERSION = '20260919-card1';
  const NARROW = '(max-width: 767px)';
  const canPopover = typeof HTMLElement.prototype.showPopover === 'function';
  let card = null;
  let taskId = '';
  let kind = 'bar'; // 'bar' | 'row': カードを寄せる先
  let builtKey = '';
  let closedByKey = false;
  let placeQueued = false;

  const findTask = (id) => state.project?.tasks.find((task) => task.id === id) || null;
  const isOpen = () => Boolean(card) && (canPopover ? card.matches(':popover-open') : !card.hidden);
  const clampPx = (value, min, max) => Math.max(min, Math.min(max, value));

  function anchorEl() {
    const id = CSS.escape(taskId);
    const bar = document.querySelector(`[data-timeline-task="${id}"]`);
    const row = document.querySelector(`[data-task-row="${id}"]`);
    return (kind === 'bar' ? bar || row : row || bar) || null;
  }

  function cardHTML(task) {
    const tasks = filteredTasks();
    const index = tasks.findIndex((item) => item.id === task.id);
    const dates = task.milestone
      ? `<input type="date" data-card-field="start" value="${task.start}" aria-label="日付"><span class="task-card-tag">${task.isDeadline ? '締切' : 'マイルストーン'}</span>`
      : `<input type="date" data-card-field="start" value="${task.start}" aria-label="開始日"><span aria-hidden="true">→</span><input type="date" data-card-field="end" value="${task.end}" aria-label="終了日"><span class="task-card-days">${inclusiveDays(task.start, task.end)}日間</span>`;
    return `<div class="task-card-head">
      <span class="category-dot color-${taskColor(task, state.project.categories)}"></span>
      <input class="task-card-name" data-card-field="name" maxlength="200" value="${escapeHTML(task.name)}" aria-label="予定名">
      <button class="icon-button" type="button" data-card-do="close" aria-label="閉じる">×</button>
    </div>
    <div class="task-card-dates">${dates}</div>
    <label class="task-card-line"><span>カテゴリー</span><select data-card-field="categoryId">${state.project.categories.map((category) => `<option value="${category.id}" ${category.id === task.categoryId ? 'selected' : ''}>${escapeHTML(category.name)}</option>`).join('')}</select></label>
    <label class="task-card-line task-card-check"><input type="checkbox" data-card-field="completed" ${task.completed ? 'checked' : ''}><span>完了</span></label>
    <textarea class="task-card-note" data-card-field="note" rows="1" maxlength="5000" placeholder="メモ" aria-label="メモ">${escapeHTML(task.note || '')}</textarea>
    <p class="task-card-msg" role="alert" hidden></p>
    <footer class="task-card-foot">
      <button class="link-button danger" type="button" data-card-do="delete">削除</button>
      <button class="link-button" type="button" data-card-do="details">すべての項目</button>
      <span class="task-card-nav"><button type="button" data-card-nav="-1" aria-label="前の予定" ${index < 1 ? 'disabled' : ''}>‹</button><span data-card-count>${index + 1}/${tasks.length}</span><button type="button" data-card-nav="1" aria-label="次の予定" ${index < 0 || index >= tasks.length - 1 ? 'disabled' : ''}>›</button></span>
    </footer>`;
  }

  function build(task) {
    card.innerHTML = cardHTML(task);
    card.setAttribute('aria-label', `${task.name} の詳細`);
    builtKey = `${task.id}|${task.milestone}|${task.isDeadline}`;
  }

  // 編集中の欄を壊さないよう、フォーカス中以外の値だけを差し替える
  function patch(task) {
    card.setAttribute('aria-label', `${task.name} の詳細`);
    card.querySelectorAll('[data-card-field]').forEach((el) => {
      if (el === document.activeElement) return;
      const field = el.dataset.cardField;
      if (field === 'completed') el.checked = task.completed === true;
      else el.value = field === 'note' ? task.note || '' : task[field] ?? '';
    });
    card.querySelector('.category-dot').className = `category-dot color-${taskColor(task, state.project.categories)}`;
    const days = card.querySelector('.task-card-days');
    if (days) days.textContent = `${inclusiveDays(task.start, task.end)}日間`;
    const tasks = filteredTasks();
    const index = tasks.findIndex((item) => item.id === task.id);
    card.querySelector('[data-card-count]').textContent = `${index + 1}/${tasks.length}`;
    card.querySelector('[data-card-nav="-1"]').disabled = index < 1;
    card.querySelector('[data-card-nav="1"]').disabled = index < 0 || index >= tasks.length - 1;
  }

  function place() {
    if (!isOpen()) return;
    const narrow = matchMedia(NARROW).matches;
    card.classList.toggle('is-sheet', narrow);
    if (narrow) { card.style.left = ''; card.style.top = ''; return; }
    const anchor = anchorEl();
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    let left = rect.left;
    let top = rect.bottom + 8;
    if (kind === 'row') {
      left = rect.right + 8;
      top = rect.top;
      if (left + width > innerWidth - 8) { left = innerWidth - width - 8; top = rect.bottom + 4; }
      top = clampPx(top, 8, innerHeight - height - 8);
    } else if (top + height > innerHeight - 8) {
      top = Math.max(8, rect.top - height - 8);
    }
    card.style.left = `${clampPx(left, 8, Math.max(8, innerWidth - width - 8))}px`;
    card.style.top = `${top}px`;
  }

  function schedulePlace() {
    if (placeQueued || !isOpen()) return;
    placeQueued = true;
    requestAnimationFrame(() => { placeQueued = false; place(); });
  }

  function warn(message) {
    const box = card.querySelector('.task-card-msg');
    box.textContent = message;
    box.hidden = false;
    showToast(message, true);
  }

  function commitField(el) {
    const task = findTask(taskId);
    if (!task || !el) return;
    const field = el.dataset.cardField;
    const value = field === 'completed' ? el.checked : el.value;
    card.querySelector('.task-card-msg').hidden = true;
    let mutate = null;
    if (field === 'name') {
      const name = value.trim();
      if (!name) { el.value = task.name; warn('予定名を入力してください。'); return; }
      if (name !== task.name) mutate = (target) => { target.name = name.slice(0, 200); };
    } else if (field === 'start' || field === 'end') {
      if (!parseISO(value)) { el.value = task[field]; return; }
      if (!task.milestone && ((field === 'start' && value > task.end) || (field === 'end' && value < task.start))) {
        el.value = task[field];
        warn('終了日は開始日以降にしてください。');
        return;
      }
      if (value !== task[field]) mutate = (target) => { target[field] = value; if (target.milestone) target.end = target.start; };
    } else if (field === 'categoryId') {
      if (value !== task.categoryId) mutate = (target) => { target.categoryId = value; };
    } else if (field === 'completed') {
      if (value !== (task.completed === true)) mutate = (target) => { target.completed = value; };
    } else if (field === 'note') {
      if (value !== (task.note || '')) mutate = (target) => { target.note = value.slice(0, 5000); };
    }
    if (!mutate) return;
    const id = task.id;
    contentCommit((project) => mutate(project.tasks.find((item) => item.id === id)), { reason: `card-${field}` });
  }

  const flushFields = () => card?.querySelectorAll('[data-card-field]').forEach(commitField);

  function show() {
    if (canPopover) card.showPopover();
    else card.hidden = false;
  }

  function hide() {
    if (!isOpen()) return;
    if (canPopover) card.hidePopover();
    else { flushFields(); card.hidden = true; onClosed(); }
  }

  // taskId は消さない: hidePopover の toggle は非同期で、直後の開き直しと前後しうる
  function onClosed() {
    const returnFocus = closedByKey;
    closedByKey = false;
    if (returnFocus) anchorEl()?.focus({ preventScroll: true });
  }

  function ensureCard() {
    if (card) return;
    card = document.createElement('div');
    card.className = `task-card${canPopover ? '' : ' is-fallback'}`;
    card.setAttribute('role', 'dialog');
    card.tabIndex = -1;
    if (canPopover) card.setAttribute('popover', 'auto');
    else card.hidden = true;
    document.body.append(card);

    card.addEventListener('beforetoggle', (event) => { if (event.newState === 'closed') flushFields(); });
    card.addEventListener('toggle', (event) => { if (event.newState === 'closed') onClosed(); });
    card.addEventListener('change', (event) => commitField(event.target.closest('[data-card-field]')));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { closedByKey = true; if (!canPopover) hide(); return; }
      if (event.key === 'Enter' && !event.isComposing && event.target.matches('.task-card-name')) { event.preventDefault(); event.target.blur(); }
    });
    card.addEventListener('click', (event) => {
      const nav = event.target.closest('[data-card-nav]');
      if (nav) { step(Number(nav.dataset.cardNav)); return; }
      const act = event.target.closest('[data-card-do]')?.dataset.cardDo;
      if (!act) return;
      const id = taskId;
      if (act === 'close') { closedByKey = true; hide(); }
      else if (act === 'delete') { hide(); deleteTask(id); }
      else if (act === 'details') { hide(); state.selectedTaskId = id; openModal('details', { task: selectedTask() }); }
    });
  }

  // 前後の予定へ、カードを閉じずに移る
  function step(direction) {
    flushFields();
    const tasks = filteredTasks();
    const next = tasks[tasks.findIndex((item) => item.id === taskId) + direction];
    if (!next) return;
    openTaskCard(next.id);
    revealTask(next.id);
  }

  function openTaskCard(id, source) {
    if (!findTask(id) || document.body.classList.contains('is-present-mode')) return;
    ensureCard();
    if (source) kind = source.closest?.('.ux-bar-more, [data-timeline-task]') ? 'bar' : 'row';
    const wasOpen = isOpen();
    taskId = id;
    taskSelection.selectOnly(id);
    renderWorkspace(); // 開いていれば、この中で refreshCard が中身を差し替える
    if (!wasOpen) {
      build(findTask(id));
      card.classList.toggle('is-sheet', matchMedia(NARROW).matches);
      show();
      if (matchMedia('(pointer: coarse)').matches) card.focus({ preventScroll: true });
      else card.querySelector('.task-card-name').focus({ preventScroll: true });
    }
    place();
  }

  function refreshCard() {
    if (!isOpen()) return;
    const task = findTask(taskId);
    if (!task) { hide(); return; }
    if (builtKey !== `${task.id}|${task.milestone}|${task.isDeadline}`) build(task);
    else patch(task);
    place();
  }

  // 選択中の予定の期間を、時間の窓の上でも光らせる
  function syncRibbonSpan() {
    const track = document.querySelector('#project-ribbon-track');
    if (!track) return;
    let span = track.querySelector('.ribbon-selected-span');
    const task = state.project.tasks.find((item) => item.id === state.selectedTaskId);
    if (!task) { span?.remove(); return; }
    const starts = state.project.tasks.map((item) => item.start).sort();
    const ends = state.project.tasks.map((item) => item.end).sort();
    const days = inclusiveDays(starts[0], ends.at(-1));
    if (!span) { span = document.createElement('i'); span.className = 'ribbon-selected-span'; span.setAttribute('aria-hidden', 'true'); track.append(span); }
    span.style.left = `${(diffDays(starts[0], task.start) / days) * 100}%`;
    span.style.width = `${(inclusiveDays(task.start, task.end) / days) * 100}%`;
  }

  renderWorkspace = ((baseRenderWorkspace) => function cardRenderWorkspace() {
    baseRenderWorkspace();
    refreshCard();
    syncRibbonSpan();
  })(renderWorkspace);

  // キーボードでバーを押した(click detail=0)ときも同じカードを開く。マウス・タッチは pointerup 側で開く
  document.addEventListener('click', (event) => {
    const bar = event.target.closest('[data-timeline-task]');
    if (bar && event.detail === 0 && !event.shiftKey) openTaskCard(bar.dataset.timelineTask, bar);
  });

  document.addEventListener('keydown', (event) => {
    if (!isOpen() || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (event.target.matches('input:not([type="checkbox"]), textarea, select')) return;
    event.preventDefault();
    step(event.key === 'ArrowRight' ? 1 : -1);
  });

  // ガントの操作盤: ↑↓/Home/End で予定を選び、Enter でカード、Delete で削除
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !event.target.closest?.('#timeline-scroll')) return;
    const tasks = filteredTasks();
    if (!tasks.length) return;
    const current = tasks.findIndex((task) => task.id === state.selectedTaskId);
    const last = tasks.length - 1;
    const target = { ArrowDown: Math.min(current + 1, last), ArrowUp: Math.max(current - 1, 0), Home: 0, End: last }[event.key];
    if (target !== undefined) {
      event.preventDefault();
      const id = tasks[target].id;
      taskSelection.selectOnly(id);
      renderWorkspace();
      (document.querySelector(`[data-timeline-task="${CSS.escape(id)}"]`) || document.querySelector('#timeline-scroll')).focus({ preventScroll: true });
      revealTask(id);
    } else if (current >= 0 && event.key === 'Enter') {
      event.preventDefault();
      openTaskCard(state.selectedTaskId, event.target.closest('[data-timeline-task]') || document.querySelector(`[data-timeline-task="${CSS.escape(state.selectedTaskId)}"]`));
    } else if (current >= 0 && event.key === 'Delete') {
      event.preventDefault();
      deleteTask(state.selectedTaskId);
      document.querySelector('#timeline-scroll')?.focus({ preventScroll: true });
    }
  });

  document.addEventListener('scroll', (event) => {
    if (['timeline-scroll', 'task-scroll', 'mobile-label-scroll'].includes(event.target.id)) schedulePlace();
  }, true);
  addEventListener('resize', schedulePlace);

  window.openTaskCard = openTaskCard;
  window.closeTaskCard = hide;
  document.body.dataset.taskCardVersion = CARD_VERSION;
})();
