function renderConditionBar() {
  const bar = document.querySelector('#condition-bar');
  if (!bar) return;
  const tasks = filteredTasks();
  const chips = [];
  if (state.ui.search) chips.push(`<span class="condition-chip">検索: ${escapeHTML(state.ui.search)}</span>`);
  if (state.ui.thisWeek) chips.push('<span class="condition-chip">今週</span>');
  if (state.ui.incomplete) chips.push('<span class="condition-chip">未完了</span>');
  if (state.ui.overdue) chips.push('<span class="condition-chip">期限超過</span>');
  if (state.ui.includeHidden) chips.push('<span class="condition-chip">非表示を含む</span>');
  if (state.ui.categoryIds.size) chips.push(`<span class="condition-chip">カテゴリー ${state.ui.categoryIds.size}</span>`);
  if (state.ui.sort !== 'manual') chips.push(`<span class="condition-chip">並び: ${state.ui.sort === 'start' ? '開始日' : 'カテゴリー'}</span>`);
  const pending = state.project.pendingItems.length;
  bar.innerHTML = `
    <span class="result-count">表示中 ${tasks.length} / ${state.project.tasks.length}件</span>
    ${chips.join('')}
    ${chips.length ? '<button class="link-button" type="button" data-action="clear-filters">条件解除</button>' : ''}
    ${pending ? `<button class="pending-link" type="button" data-action="pending">保留 ${pending}件</button>` : ''}
    ${state.ui.viewNotice ? `<span class="view-notice">${escapeHTML(state.ui.viewNotice)}</span><button class="link-button" type="button" data-shift-range="-1">前の期間</button><button class="link-button" type="button" data-shift-range="1">次の期間</button>` : ''}
  `;
  bar.hidden = !(chips.length || pending || state.ui.viewNotice || state.project.tasks.length);
}

function renderConflictBanner() {
  const banner = document.querySelector('#conflict-banner');
  if (!banner) return;
  if (!state.conflict) {
    banner.hidden = true;
    banner.innerHTML = '';
    return;
  }
  banner.hidden = false;
  banner.innerHTML = `
    <strong>別のタブで予定が更新されています。</strong>
    <span>このタブの編集は保持したまま止めています。</span>
    <button class="button button-secondary" type="button" data-action="download-current">この内容をダウンロード</button>
    <button class="button button-primary" type="button" data-action="reload-saved">保存済みの内容に切り替え</button>
  `;
}

function listRowHTML(task) {
  const category = categoryById(task.categoryId);
  const selected = task.id === state.selectedTaskId;
  return `<div class="task-row ${selected ? 'is-selected' : ''} ${task.completed ? 'is-completed' : ''} ${task.isHidden ? 'is-hidden-task' : ''}" data-task-row="${task.id}" tabindex="0" role="row" aria-selected="${selected}">
    <label class="complete-cell"><input type="checkbox" data-task-complete="${task.id}" ${task.completed ? 'checked' : ''} aria-label="${escapeHTML(task.name)}を完了"></label>
    <div class="name-cell"><input class="inline-name" data-inline-name="${task.id}" value="${escapeHTML(task.name)}" aria-label="予定名"></div>
    <div class="category-cell"><span class="category-dot color-${taskColor(task, state.project.categories)}"></span><span>${escapeHTML(category.name)}</span></div>
    <div class="date-cell"><input type="date" data-inline-start="${task.id}" value="${task.start}" aria-label="開始日"></div>
    <div class="date-cell end-cell">${task.milestone ? '<span class="single-day">◆</span>' : `<input type="date" data-inline-end="${task.id}" value="${task.end}" aria-label="終了日">`}</div>
    <button class="row-menu-button" type="button" data-action="details" data-task-id="${task.id}" aria-label="${escapeHTML(task.name)}の詳細">•••</button>
  </div>`;
}

function timelineHeaderHTML(start, days, dayWidth, scale) {
  const cells = [];
  for (let index = 0; index < days; index += 1) {
    const iso = addDays(start, index);
    const date = parseISO(iso);
    let label = '';
    if (scale === 'day') label = String(date.getUTCDate());
    else if (scale === 'week') {
      if (date.getUTCDay() === 1 || index === 0) label = `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
    } else if (date.getUTCDate() === 1 || index === 0) label = `${date.getUTCMonth() + 1}月`;
    cells.push(`<div class="timeline-head-cell ${[0, 6].includes(date.getUTCDay()) ? 'is-weekend' : ''}" style="width:${dayWidth}px" title="${iso}">${label}</div>`);
  }
  return cells.join('');
}

function timelineRowHTML(task, viewStart, viewEnd, dayWidth, totalWidth) {
  const intersects = task.start <= viewEnd && task.end >= viewStart;
  let shape = '';
  if (intersects) {
    const clippedStart = task.start < viewStart ? viewStart : task.start;
    const clippedEnd = task.end > viewEnd ? viewEnd : task.end;
    const left = diffDays(viewStart, clippedStart) * dayWidth;
    if (task.milestone) {
      shape = `<button class="milestone color-${taskColor(task, state.project.categories)}" style="left:${left + Math.max(3, dayWidth / 2)}px" data-timeline-task="${task.id}" title="${escapeHTML(task.name)} · ${task.start}" aria-label="${escapeHTML(task.name)} ${task.start}"></button>`;
    } else {
      const width = Math.max(6, inclusiveDays(clippedStart, clippedEnd) * dayWidth);
      shape = `<button class="task-bar color-${taskColor(task, state.project.categories)} ${task.completed ? 'is-completed' : ''}" style="left:${left}px;width:${width}px" data-timeline-task="${task.id}" title="${escapeHTML(task.name)} · ${task.start}〜${task.end}"><span>${escapeHTML(task.name)}</span></button>`;
    }
  }
  return `<div class="timeline-row ${task.id === state.selectedTaskId ? 'is-selected' : ''}" data-timeline-row="${task.id}" style="width:${totalWidth}px">${shape}</div>`;
}

function renderWorkspace() {
  const root = document.querySelector('#workspace');
  if (!root || !state.project) return;
  const tasks = filteredTasks();
  const mode = effectiveMode();
  const view = state.project.viewSettings;
  let start = parseISO(view.start) ? view.start : addDays(todayISO(), -7);
  let end = parseISO(view.end) && view.end >= start ? view.end : addDays(start, 42);
  let days = inclusiveDays(start, end);
  if (days > 730) {
    end = addDays(start, 729);
    days = 730;
  }
  const dayWidth = clamp(view.dayWidth, 2, 32);
  const totalWidth = days * dayWidth;
  const today = todayISO();
  const todayLeft = today >= start && today <= end ? diffDays(start, today) * dayWidth + dayWidth / 2 : null;

  const empty = state.project.tasks.length === 0;
  if (empty) {
    root.className = 'workspace is-empty';
    root.innerHTML = `<section class="empty-state">
      <div class="empty-icon" aria-hidden="true">＋</div>
      <h1>最初の予定を入れる</h1>
      <p>手入力でも、文章をChatGPTで整理してから取り込む方法でも始められます。</p>
      <div class="empty-actions"><button class="button button-primary" type="button" data-action="add">予定を追加</button><button class="button button-secondary" type="button" data-action="chat-input">文章から作る</button><button class="link-button" type="button" data-action="sample">サンプルを見る</button></div>
    </section>`;
    return;
  }

  const listPanel = `<section class="task-panel" style="--list-width:${clamp(view.listWidth, 360, 640)}px">
    <div class="task-head" role="row"><span></span><span>予定</span><span>カテゴリー</span><span>開始</span><span>終了</span><span></span></div>
    <div id="task-scroll" class="task-scroll" role="rowgroup">${tasks.length ? tasks.map(listRowHTML).join('') : `<div class="zero-result"><strong>条件に合う予定がありません。</strong><button class="link-button" type="button" data-action="clear-filters">条件を解除</button></div>`}</div>
  </section>`;

  const mobileLabels = `<div id="mobile-timeline-labels" class="mobile-timeline-labels"><div class="mobile-label-head">予定</div><div id="mobile-label-scroll" class="mobile-label-scroll">${tasks.map((task) => `<button type="button" data-task-row="${task.id}" class="mobile-timeline-label ${task.id === state.selectedTaskId ? 'is-selected' : ''}">${escapeHTML(task.name)}</button>`).join('')}</div></div>`;

  const timelinePanel = `<section class="timeline-panel">
    ${mode === 'gantt' && breakpoint() === 'mobile' ? mobileLabels : ''}
    <div id="timeline-scroll" class="timeline-scroll">
      <div class="timeline-inner" style="width:${totalWidth}px;--day-width:${dayWidth}px;--row-height:${clamp(view.rowHeight, 36, 64)}px">
        <div class="timeline-head" style="width:${totalWidth}px">${timelineHeaderHTML(start, days, dayWidth, view.scale)}</div>
        <div id="timeline-body" class="timeline-body" style="width:${totalWidth}px">
          ${todayLeft != null ? `<div class="today-line" style="left:${todayLeft}px"><span>今日</span></div>` : ''}
          ${tasks.map((task) => timelineRowHTML(task, start, end, dayWidth, totalWidth)).join('')}
        </div>
      </div>
    </div>
  </section>`;

  root.className = `workspace mode-${mode} bp-${breakpoint()}`;
  root.style.setProperty('--row-height', `${clamp(view.rowHeight, 36, 64)}px`);
  root.style.setProperty('--text-size', `${clamp(view.textSize, 12, 18)}px`);
  root.innerHTML = `${mode !== 'gantt' ? listPanel : ''}${mode === 'split' ? '<div id="pane-resizer" class="pane-resizer" role="separator" aria-label="一覧の幅を変更"></div>' : ''}${mode !== 'list' ? timelinePanel : ''}`;
  requestAnimationFrame(syncScrollBindings);
}

function syncScrollBindings() {
  const list = document.querySelector('#task-scroll');
  const timeline = document.querySelector('#timeline-scroll');
  const labels = document.querySelector('#mobile-label-scroll');
  let lock = false;
  const sync = (source, target) => {
    if (!target || lock) return;
    lock = true;
    target.scrollTop = source.scrollTop;
    requestAnimationFrame(() => { lock = false; });
  };
  list?.addEventListener('scroll', () => sync(list, timeline));
  timeline?.addEventListener('scroll', () => {
    if (list) sync(timeline, list);
    if (labels) sync(timeline, labels);
  });
  labels?.addEventListener('scroll', () => sync(labels, timeline));
  const resizer = document.querySelector('#pane-resizer');
  resizer?.addEventListener('pointerdown', beginPaneResize);
}

function beginPaneResize(event) {
  if (breakpoint() === 'mobile') return;
  event.preventDefault();
  const initial = state.project.viewSettings.listWidth;
  const startX = event.clientX;
  const move = (moveEvent) => {
    const next = clamp(initial + moveEvent.clientX - startX, 360, 640);
    const panel = document.querySelector('.task-panel');
    if (panel) panel.style.setProperty('--list-width', `${next}px`);
  };
  const end = (upEvent) => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', end);
    const next = clamp(initial + upEvent.clientX - startX, 360, 640);
    setView({ listWidth: Math.round(next) });
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', end, { once: true });
}

function renderAll() {
  if (!state.project) return;
  renderHeader();
  renderToolbarState();
  renderWorkspace();
  if (state.modal) renderModal();
}

function openModal(type, options = {}) {
  closeMenus();
  state.modal = type;
  if (type === 'details') prepareEditor(options.task || null);
  if (type === 'move') state.moveDraft = { taskId: options.task.id, start: options.task.start };
  if (type === 'chat-input') prepareInputDraft();
  if (type === 'chat-output') prepareOutputSession();
  if (type === 'import') {
    state.importRaw = options.prefill ?? state.importRaw ?? '';
    state.importPreview = null;
  }
  renderModal();
}

function closeModal({ force = false } = {}) {
  if (state.modal === 'details' && state.editor?.dirty && !force) {
    if (!confirm('変更を破棄して閉じますか？')) return;
  }
  state.modal = null;
  state.editor = null;
  state.moveDraft = null;
  state.importPreview = null;
  const root = document.querySelector('#modal-root');
  if (root) root.innerHTML = '';
}

function modalFrame(title, eyebrow, body, footer = '', wide = false) {
  return `<div class="modal-layer" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}">
    <div class="modal-backdrop"></div>
    <section class="modal-card ${wide ? 'modal-wide' : ''}">
      <header class="modal-head"><div><p class="eyebrow">${escapeHTML(eyebrow)}</p><h2>${escapeHTML(title)}</h2></div><button class="icon-button" type="button" data-action="close-modal" aria-label="閉じる">×</button></header>
      <div class="modal-body">${body}</div>
      ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
    </section>
  </div>`;
}

function prepareEditor(task) {
  const today = todayISO();
  const source = task ? deepCopy(task) : {
    id: uid('task'), name: '', start: today, end: today, milestone: false, completed: false,
    categoryId: DEFAULT_CATEGORY_ID, note: '', colorOverride: '', isDeadline: false, isHidden: false, displayNamePosition: 'inside', order: state.project.tasks.length,
  };
  state.editor = { isNew: !task, task: source, dirty: false, original: task ? deepCopy(task) : null };
}

function editorFormHTML() {
  const e = state.editor;
  const task = e.task;
  const categories = state.project.categories;
  return `<form id="task-form" data-task-form>
    <label class="field full"><span>予定名 <b>必須</b></span><input name="name" maxlength="200" value="${escapeHTML(task.name)}" autofocus></label>
    <div class="form-grid two">
      <label class="field"><span>種類</span><select name="type"><option value="task" ${!task.milestone ? 'selected' : ''}>タスク</option><option value="milestone" ${task.milestone ? 'selected' : ''}>マイルストーン</option></select></label>
      <label class="field"><span>カテゴリー</span><select name="categoryId">${categories.map((c) => `<option value="${c.id}" ${c.id === task.categoryId ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('')}</select></label>
    </div>
    ${task.milestone
      ? `<label class="field"><span>日付</span><input name="date" type="date" value="${task.start}"></label>`
      : `<div class="form-grid two"><label class="field"><span>開始日</span><input name="start" type="date" value="${task.start}"></label><label class="field"><span>終了日</span><input name="end" type="date" value="${task.end}"></label></div>`}
    <div class="form-grid two">
      <label class="field"><span>個別色</span><select name="colorOverride"><option value="">カテゴリー色を使う</option>${COLOR_PALETTE.map((color) => `<option value="${color}" ${task.colorOverride === color ? 'selected' : ''}>${paletteLabels[color]}</option>`).join('')}</select></label>
      <label class="field checkbox-field"><input type="checkbox" name="completed" ${task.completed ? 'checked' : ''}><span>完了</span></label>
    </div>
    ${task.milestone ? `<label class="field checkbox-field"><input type="checkbox" name="isDeadline" ${task.isDeadline ? 'checked' : ''}><span>締切として表示</span></label>` : ''}
    <label class="field checkbox-field"><input type="checkbox" name="isHidden" ${task.isHidden ? 'checked' : ''}><span>非表示にする</span></label>
    <label class="field full"><span>メモ</span><textarea name="note" maxlength="5000" rows="6">${escapeHTML(task.note)}</textarea></label>
    ${!task.milestone && !e.isNew ? `<button class="button button-secondary" type="button" data-action="move-period" data-task-id="${task.id}">期間を移動</button>` : ''}
    <div id="task-form-error" class="form-error" hidden></div>
  </form>`;
}

function renderDetailsModal() {
  const title = state.editor.isNew ? '予定を追加' : '予定の詳細';
  const footer = `<button class="button button-quiet" type="button" data-action="close-modal">キャンセル</button><button class="button button-primary" type="button" data-action="save-task">保存</button>`;
  return modalFrame(title, 'SCHEDULE DETAILS', editorFormHTML(), footer);
}
