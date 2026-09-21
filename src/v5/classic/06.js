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
  const view = state.project.viewSettings;
  const outsideCount = tasks.filter((task) => taskOutsideView(task, view)).length;
  const diff = state.ui.importDiff;
  const diffChip = diff ? `<span class="diff-chip"><b>取り込みの変更</b><span class="n">移動 <strong>${diff.moved.size}</strong> · 追加 <strong>${diff.added.size}</strong> · 削除 <strong>${diff.removedNames.length}</strong></span>${diff.moved.size + diff.added.size ? `<button type="button" data-diff-action="only">${state.ui.changedIds ? '全件を表示' : '変更だけ表示'}</button>` : ''}<button type="button" class="x" data-diff-action="dismiss" aria-label="取り込みの変更を閉じる">✕</button></span>` : '';
  bar.innerHTML = `
    <span class="result-count">表示中 ${tasks.length} / ${state.project.tasks.length}件</span>
    ${chips.join('')}
    ${chips.length ? '<button class="link-button" type="button" data-action="clear-filters">条件解除</button>' : ''}
    ${pending ? `<button class="pending-link" type="button" data-action="pending">保留 ${pending}件</button>` : ''}
    ${outsideCount ? `<span class="view-notice">この期間の外に ${outsideCount}件</span><button class="link-button" type="button" data-action="fit">全体を表示</button>` : ''}
    ${state.ui.viewNotice ? `<span class="view-notice">${escapeHTML(state.ui.viewNotice)}</span>` : ''}
    ${diffChip}
  `;
  // 言うことが無いときは出さない(件数の要素は残す。innerTextは非表示でも読める)
  bar.hidden = !(chips.length || pending || outsideCount || state.ui.viewNotice || diff);
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
  if (state.confirmReloadSaved) {
    banner.innerHTML = `
      <strong>このタブの未保存の変更を破棄します。</strong>
      <span>元に戻せません。必要なら先にダウンロードしてください。</span>
      <button class="button button-secondary" type="button" data-action="cancel-reload-saved">やめる</button>
      <button class="button button-primary" type="button" data-action="confirm-reload-saved">破棄して切り替え</button>
    `;
    return;
  }
  banner.innerHTML = `
    <strong>別のタブで予定が更新されています。</strong>
    <span>このタブの編集は保持したまま止めています。</span>
    <button class="button button-secondary" type="button" data-action="download-current">この内容をダウンロード</button>
    <button class="button button-primary" type="button" data-action="reload-saved">保存済みの内容に切り替え</button>
  `;
}

const shortMD = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

// 一覧の行の小さなガント用: プロジェクト全体の期間(描画のたびに1回だけ求める)
let listSpan = null;
function computeListSpan() {
  const tasks = state.project.tasks;
  if (!tasks.length) return null;
  let start = tasks[0].start;
  let end = tasks[0].end;
  tasks.forEach((task) => { if (task.start < start) start = task.start; if (task.end > end) end = task.end; });
  return { start, end, days: inclusiveDays(start, end), today: todayISO() };
}

function miniSpanHTML(task) {
  if (!listSpan) return '';
  const { start, end, days, today } = listSpan;
  const left = (diffDays(start, task.start) / days) * 100;
  const width = Math.max(1.5, (inclusiveDays(task.start, task.end) / days) * 100);
  const mark = today >= start && today <= end ? `<b style="left:${((diffDays(start, today) + .5) / days * 100).toFixed(2)}%"></b>` : '';
  return `<span class="mini-span"><i style="left:${left.toFixed(2)}%;width:${Math.min(width, 100 - left).toFixed(2)}%"></i>${mark}</span>`;
}

const STATE_LABEL = { done: '完了', active: '進行中', upcoming: '予定' };
function stateCellHTML(task) {
  const status = taskState(task);
  const label = status === 'late' ? `${diffDays(task.milestone ? task.start : task.end, todayISO())}日遅れ` : STATE_LABEL[status];
  return `<span class="state-cell is-${status}" title="${label}">${label}</span>`;
}

function listRowHTML(task) {
  const category = categoryById(task.categoryId);
  const selected = task.id === state.selectedTaskId;
  const color = taskColor(task, state.project.categories);
  const days = task.milestone ? '◆' : `${inclusiveDays(task.start, task.end)}日`;
  const range = task.milestone ? shortMD(task.start) : `${shortMD(task.start)}–${shortMD(task.end)}`;
  return `<div class="task-row cat-${color} state-${taskState(task)} ${selected ? 'is-selected' : ''} ${task.completed ? 'is-completed' : ''} ${task.isHidden ? 'is-hidden-task' : ''}" data-task-row="${task.id}" tabindex="0" role="row" aria-selected="${selected}">
    <label class="complete-cell"><input type="checkbox" data-task-complete="${task.id}" ${task.completed ? 'checked' : ''} aria-label="${escapeHTML(task.name)}を完了"></label>
    <div class="name-cell"><input class="inline-name" data-inline-name="${task.id}" value="${escapeHTML(task.name)}" aria-label="予定名"></div>
    <div class="category-cell"><span class="category-dot color-${color}"></span><span>${escapeHTML(category.name)}</span></div>
    <div class="span-cell">${miniSpanHTML(task)}</div>
    <div class="date-cell"><input type="date" data-inline-start="${task.id}" value="${task.start}" aria-label="開始日"></div>
    <div class="date-cell end-cell">${task.milestone ? '<span class="single-day">◆</span>' : `<input type="date" data-inline-end="${task.id}" value="${task.end}" aria-label="終了日">`}</div>
    <div class="days-cell"><span class="days-range">${range} · </span>${days}</div>
    ${stateCellHTML(task)}
    <button class="row-menu-button" type="button" data-action="details" data-task-id="${task.id}" aria-label="${escapeHTML(task.name)}の詳細">•••</button>
  </div>`;
}

// 見出しの旗や月の見出しの幅は、全角1.0em/半角0.6emの概算(実測のreflowを避ける)
const flagTextWidth = (text, size = 11) => [...text].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? 1 : 0.6), 0) * size;
const flagWidth = (text) => Math.ceil(flagTextWidth(text) + 20);
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// 「いま」の旗: 今日と、締切のマイルストーン。日数の文言もここで決める
function deadlineFlagText(task, today, withDays = true) {
  const name = [...task.name].length > 12 ? `${[...task.name].slice(0, 12).join('')}…` : task.name;
  const d = diffDays(today, task.start);
  const tail = task.completed ? '済' : d > 0 ? `あと${d}日` : d === 0 ? '今日' : `${-d}日超過`;
  return `締切 ${name}${withDays ? ` · ${tail}` : ''}`;
}

function overdueCount() {
  const today = todayISO();
  return state.project.tasks.filter((task) => !task.isHidden && taskState(task, today) === 'late').length;
}

function deadlineTasks() {
  return state.project.tasks.filter((task) => task.milestone && task.isDeadline && !task.isHidden);
}

// 二段の見出し: 上段=月と旗、下段=日付。必要な文字だけを絶対配置で出す
function timelineHeaderHTML(start, days, dayWidth) {
  const width = days * dayWidth;
  const end = addDays(start, days - 1);
  const today = todayISO();
  const mobile = breakpoint() === 'mobile';
  const rects = [];
  const flags = [];
  const overlaps = (left, right) => rects.some((rect) => left < rect.right + 6 && right > rect.left - 6);
  const place = (center, w) => {
    const left = Math.max(2, Math.min(center - w / 2, width - w - 2));
    return { left, right: left + w };
  };

  if (today >= start && today <= end) {
    const x = diffDays(start, today) * dayWidth + dayWidth / 2;
    const date = parseISO(today);
    const text = mobile ? shortMD(today) : `今日 ${shortMD(today)} ${WEEKDAYS[date.getUTCDay()]}`;
    const pillW = flagWidth(text);
    const late = mobile ? 0 : overdueCount();
    const lateText = late ? `遅れ ${late}${state.ui.overdue ? ' ✕' : ''}` : '';
    const lateW = late ? flagWidth(lateText) + 6 : 0;
    const box = place(x, pillW);
    rects.push({ left: box.left, right: box.right + Math.max(0, lateW - 10) });
    flags.push(`<div class="now-flag" style="left:${box.left}px"><span class="pill" style="width:${pillW}px">${text}</span>${late ? `<button type="button" class="late" data-now-action="overdue" aria-pressed="${state.ui.overdue ? 'true' : 'false'}">${lateText}</button>` : ''}</div>`);
  }

  if (!mobile) {
    deadlineTasks().filter((task) => task.start >= start && task.start <= end).sort((a, b) => a.start.localeCompare(b.start)).forEach((task) => {
      const x = diffDays(start, task.start) * dayWidth + Math.max(3, dayWidth / 2);
      for (const withDays of [true, false]) {
        const text = deadlineFlagText(task, today, withDays);
        const box = place(x, flagWidth(text));
        if (overlaps(box.left, box.right)) continue;
        rects.push(box);
        flags.push(`<div class="deadline-flag ${task.completed ? 'is-done' : task.start < today ? 'is-over' : ''}" style="left:${box.left}px;width:${box.right - box.left}px">${escapeHTML(text)}</div>`);
        break;
      }
    });
  }

  // 月の境目(表示の先頭と毎月1日)
  const marks = [];
  for (let index = 0; index < days; index += 1) {
    const date = parseISO(addDays(start, index));
    if (index === 0 || date.getUTCDate() === 1) marks.push({ index, x: index * dayWidth, month: date.getUTCMonth() + 1, year: date.getUTCFullYear() });
  }
  const cells = [];
  let firstLabel = true; // 年は、最初に出る月と1月にだけ添える
  marks.forEach((mark, i) => {
    if (mark.index > 0) cells.push(`<i class="month-tick" style="left:${mark.x}px"></i>`);
    const withYear = firstLabel || mark.month === 1;
    const labelW = flagTextWidth(`${mark.month}月`, 12) + (withYear ? flagTextWidth(String(mark.year), 10.5) + 4 : 0) + 8;
    let left = mark.x + 6;
    const hit = rects.find((rect) => left < rect.right + 4 && left + labelW > rect.left - 4);
    if (hit) left = hit.right + 8;
    const nextX = i + 1 < marks.length ? marks[i + 1].x : width;
    if (left + labelW > nextX - 4) return;
    firstLabel = false;
    cells.push(`<span class="month-label" style="left:${left}px">${mark.month}月${withYear ? `<small>${mark.year}</small>` : ''}</span>`);
  });

  // 下段: 日付の数字(日幅が広いときだけ)
  if (dayWidth >= 7) {
    for (let index = 0; index < days; index += 1) {
      const iso = addDays(start, index);
      const date = parseISO(iso);
      if (dayWidth < 18 && date.getUTCDay() !== 1) continue;
      cells.push(`<span class="day-tick ${iso === today ? 'is-today' : ''}" style="left:${index * dayWidth + dayWidth / 2}px">${date.getUTCDate()}</span>`);
    }
  }
  return cells.join('') + flags.join('');
}

// 週末の帯の起点(最初の土曜日)までのずれ。日幅が4未満(全体表示)では帯を描かない
function bandVars(start, dayWidth) {
  return dayWidth >= 4 ? `--we-offset:${((6 - parseISO(start).getUTCDay() + 7) % 7) * dayWidth}px;` : '';
}

function monthRulesHTML(start, days, dayWidth) {
  const rules = [];
  for (let index = 1; index < days; index += 1) {
    if (parseISO(addDays(start, index)).getUTCDate() === 1) rules.push(`<i class="month-rule" style="left:${index * dayWidth}px"></i>`);
  }
  return rules.join('');
}

// 今日線より左を沈める過去の地、締切の柱。いずれも操作を邪魔しない
function nowLayersHTML(start, end, dayWidth, todayLeft, totalWidth) {
  const today = todayISO();
  const past = today > end ? totalWidth : todayLeft;
  const layers = [];
  if (past) layers.push(`<div class="ux-past" style="width:${past}px"></div>`);
  deadlineTasks().filter((task) => task.start >= start && task.start <= end).forEach((task) => {
    layers.push(`<i class="ux-deadline-pillar" style="left:${diffDays(start, task.start) * dayWidth + Math.max(3, dayWidth / 2)}px"></i>`);
  });
  return layers.join('');
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

  listSpan = computeListSpan();
  const listPanel = `<section class="task-panel" style="--list-width:${clamp(view.listWidth, 360, 640)}px">
    <div class="task-head" role="row"><span></span><span class="h-name">予定 <b>${tasks.length}</b></span><span class="h-cat">カテゴリー</span><span class="h-span">期間</span><span class="h-start">開始</span><span class="h-end">終了</span><span class="h-days">日数</span><span class="h-state">状態</span><span></span></div>
    <div id="task-scroll" class="task-scroll" role="rowgroup">${tasks.length ? tasks.map(listRowHTML).join('') : `<div class="zero-result"><strong>条件に合う予定がありません。</strong><button class="link-button" type="button" data-action="clear-filters">条件を解除</button></div>`}</div>
  </section>`;

  const mobileLabels = `<div id="mobile-timeline-labels" class="mobile-timeline-labels"><div class="mobile-label-head">予定 <b>${tasks.length}</b></div><div id="mobile-label-scroll" class="mobile-label-scroll">${tasks.map((task) => `<div data-task-row="${task.id}" class="mobile-timeline-label cat-${taskColor(task, state.project.categories)} state-${taskState(task)} ${task.id === state.selectedTaskId ? 'is-selected' : ''}"><button type="button" class="mobile-label-name">${escapeHTML(task.name)}</button><button type="button" class="row-menu-button" data-action="details" data-task-id="${task.id}" aria-label="${escapeHTML(task.name)}の詳細">•••</button></div>`).join('')}</div></div>`;

  const timelinePanel = `<section class="timeline-panel">
    ${mode === 'gantt' && breakpoint() === 'mobile' ? mobileLabels : ''}
    <div id="timeline-scroll" class="timeline-scroll" tabindex="0" role="grid" aria-label="ガント。上下キーで予定を選び、Enterで開きます">
      <div class="timeline-inner" style="width:${totalWidth}px;--day-width:${dayWidth}px;${bandVars(start, dayWidth)}--row-height:${clamp(view.rowHeight, 36, 64)}px">
        <div class="timeline-head" style="width:${totalWidth}px">${timelineHeaderHTML(start, days, dayWidth)}</div>
        <div id="timeline-body" class="timeline-body" style="width:${totalWidth}px">
          ${monthRulesHTML(start, days, dayWidth)}${nowLayersHTML(start, end, dayWidth, todayLeft, totalWidth)}
          ${todayLeft != null ? `<div class="today-line" style="left:${todayLeft}px"></div>` : ''}
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
  state.confirmDiscardDraft = false;
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
    categoryId: DEFAULT_CATEGORY_ID, note: '', colorOverride: '', isDeadline: false, isHidden: false, displayNamePosition: 'auto', order: state.project.tasks.length,
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
    ${task.milestone ? '' : `<label class="field"><span>名前の位置</span><select name="displayNamePosition">${[['auto', '自動'], ['inside', '中に入れる'], ['right', '右に出す']].map(([value, label]) => `<option value="${value}" ${(task.displayNamePosition || 'auto') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`}
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
  const deleteButton = state.editor.isNew ? '' : `<button class="link-button danger" type="button" data-action="delete-task" data-task-id="${state.editor.task.id}">削除</button>`;
  const footer = `${deleteButton}<button class="button button-quiet" type="button" data-action="close-modal">キャンセル</button><button class="button button-primary" type="button" data-action="save-task">保存</button>`;
  return modalFrame(title, 'SCHEDULE DETAILS', editorFormHTML(), footer);
}
