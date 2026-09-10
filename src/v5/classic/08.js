function importModeOptions(preview) {
  if (!preview || preview.errors?.length) return '';
  if (preview.format === 'backup') return `<label><input type="radio" name="import-mode" value="append" checked>予定を追加</label><label><input type="radio" name="import-mode" value="replace">予定を置換</label><label><input type="radio" name="import-mode" value="restore">プロジェクトを復元</label>`;
  return `<label><input type="radio" name="import-mode" value="append" checked>予定を追加</label><label><input type="radio" name="import-mode" value="replace">予定を置換</label>`;
}

function renderImportModal() {
  const p = state.importPreview;
  const result = !p ? `<div class="import-empty">JSONを貼り付けて「検証する」を押すと、反映内容を確認できます。</div>`
    : p.errors?.length ? `<div class="validation-errors"><strong>反映できません</strong>${p.errors.map((error) => `<p>${escapeHTML(error)}</p>`).join('')}</div>`
      : `<div class="validation-ok"><strong>検証OK</strong><dl><div><dt>形式</dt><dd>${p.format}</dd></div><div><dt>予定</dt><dd>${p.tasks.length}件</dd></div><div><dt>保留</dt><dd>${p.pendingItems.length}件</dd></div><div><dt>新規カテゴリー</dt><dd>${p.newCategories.length}件</dd></div></dl>
        ${p.tasks.length || p.pendingItems.length ? `<div class="import-preview-list">${p.tasks.slice(0, 8).map((task) => `<div><strong>${escapeHTML(task.name)}</strong><span>${task.start}〜${task.end}</span></div>`).join('')}${p.tasks.length > 8 ? `<small>ほか${p.tasks.length - 8}件</small>` : ''}${p.pendingItems.slice(0, 4).map((item) => `<div class="pending-preview"><strong>保留: ${escapeHTML(item.name || item.sourceText.slice(0, 30))}</strong><span>${escapeHTML(item.reason)}</span></div>`).join('')}</div>` : '<p>取り込む予定・保留項目がありません。</p>'}
        ${p.duplicate ? `<label class="duplicate-warning"><input id="duplicate-confirm" type="checkbox">同じ内容を取り込み済みです。再度追加する</label>` : ''}
        <fieldset class="choice-group import-mode"><legend>反映方法</legend>${importModeOptions(p)}</fieldset>
      </div>`;
  const body = `<div class="import-layout"><div class="import-main"><label class="field full"><span>JSON／ChatGPTの回答</span><textarea id="import-input" class="code-area" rows="18" spellcheck="false" placeholder='{"handoffVersion":1,"tasks":[],"needsReview":[]}'>${escapeHTML(state.importRaw)}</textarea></label><button class="button button-secondary" type="button" data-action="validate-import">検証する</button></div><aside class="import-result">${result}</aside></div>`;
  const canApply = p && !p.errors?.length && (p.tasks.length || p.pendingItems.length) && (!p.duplicate);
  const footer = `<button class="button button-quiet" type="button" data-action="close-modal">キャンセル</button><button class="button button-primary" type="button" data-action="apply-import" ${canApply ? '' : (p?.duplicate ? '' : 'disabled')}>この内容で反映</button>`;
  return modalFrame('JSON／回答取り込み', 'IMPORT', body, footer, true);
}

function remapIncoming(tasks, categories) {
  const byIncomingId = new Map(categories.map((c) => [c.id, c.name]));
  const projectCategories = state.project.categories;
  const newCategories = [];
  categories.forEach((incoming) => {
    if (incoming.name === '未分類') return;
    if (!projectCategories.some((c) => c.name === incoming.name) && !newCategories.some((c) => c.name === incoming.name)) {
      newCategories.push({ id: uid('cat'), name: incoming.name, color: incoming.color || COLOR_PALETTE[(projectCategories.length + newCategories.length) % COLOR_PALETTE.length], order: projectCategories.length + newCategories.length });
    }
  });
  const allCategories = [...projectCategories, ...newCategories];
  const mappedTasks = tasks.map((task, index) => {
    const name = byIncomingId.get(task.categoryId) || '未分類';
    const cat = allCategories.find((c) => c.name === name) || allCategories[0];
    return { ...deepCopy(task), id: uid('task'), categoryId: cat.id, completed: task.completed === true, isHidden: task.isHidden === true, order: index };
  });
  return { tasks: mappedTasks, newCategories };
}

function applyImport() {
  const p = state.importPreview;
  if (!p || p.errors?.length) return;
  if (p.revision !== state.project.revision) {
    showToast('予定が更新されています。確認内容を更新してください。', true);
    validateImport();
    return;
  }
  if (p.duplicate && !document.querySelector('#duplicate-confirm')?.checked) {
    showToast('同じ内容を取り込み済みです。再度追加する場合はチェックしてください。', true);
    return;
  }
  const mode = document.querySelector('input[name="import-mode"]:checked')?.value || 'append';
  const mapped = remapIncoming(p.tasks, p.categories);
  const pending = p.pendingItems.map((item) => ({ ...deepCopy(item), id: uid('pending') }));
  if (state.project.tasks.length + mapped.tasks.length > MAX_TASKS && mode === 'append') {
    showToast(`予定は${MAX_TASKS}件までです。`, true); return;
  }
  if (state.project.pendingItems.length + pending.length > MAX_PENDING && mode !== 'restore') {
    showToast(`保留項目は${MAX_PENDING}件までです。`, true); return;
  }
  contentCommit((project) => {
    if (mode === 'restore' && p.project) {
      const keepId = project.projectId;
      const restored = deepCopy(p.project);
      Object.assign(project, restored);
      project.projectId = keepId;
      return;
    }
    project.categories.push(...mapped.newCategories);
    if (mode === 'replace') project.tasks = mapped.tasks;
    else project.tasks.push(...mapped.tasks.map((task, i) => ({ ...task, order: project.tasks.length + i })));
    project.pendingItems.push(...pending);
  }, { reason: `import-${mode}`, message: mode === 'restore' ? 'プロジェクトを復元しました' : `${mapped.tasks.length}件を反映しました` });
  state.storage.setLastImportHash(p.hash);
  if (state.inputDraft) {
    state.inputDraft.completed = true;
    persistInputDraft();
  }
  closeModal({ force: true });
}

function renderPendingModal() {
  const items = state.project.pendingItems;
  const body = items.length ? `<div class="pending-list">${items.map((item) => `<form class="pending-card" data-pending-form="${item.id}"><div class="pending-card-head"><div><strong>${escapeHTML(item.name || item.sourceText.slice(0, 50))}</strong><p>${escapeHTML(item.reason)}</p></div><button class="link-button danger" type="button" data-action="delete-pending" data-pending-id="${item.id}">削除</button></div><blockquote>${escapeHTML(item.sourceText)}</blockquote><div class="form-grid two"><label class="field"><span>予定名</span><input name="name" value="${escapeHTML(item.name)}"></label><label class="field"><span>カテゴリー</span><input name="categoryName" value="${escapeHTML(item.categoryName)}"></label><label class="field"><span>開始日</span><input name="start" type="date" value="${item.candidateStart}"></label><label class="field"><span>終了日</span><input name="end" type="date" value="${item.candidateEnd}"></label></div><small>不足: ${item.missingFields.map(escapeHTML).join(' / ')}</small><div class="pending-actions"><button class="button button-primary" type="button" data-action="register-pending" data-pending-id="${item.id}">予定に登録</button></div></form>`).join('')}</div>` : `<div class="import-empty">保留項目はありません。</div>`;
  return modalFrame(`保留項目 ${items.length}件`, 'NEEDS REVIEW', body, `<button class="button button-primary" type="button" data-action="close-modal">閉じる</button>`, true);
}

function registerPending(id) {
  const form = document.querySelector(`[data-pending-form="${CSS.escape(id)}"]`);
  const item = state.project.pendingItems.find((p) => p.id === id);
  if (!form || !item) return;
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  const start = String(data.get('start') || '');
  const end = String(data.get('end') || start);
  const categoryName = String(data.get('categoryName') || '').trim() || '未分類';
  if (!name) { showToast('予定名を入力してください。', true); return; }
  if (!parseISO(start) || !parseISO(end) || end < start) { showToast('開始日・終了日を確認してください。', true); return; }
  contentCommit((project) => {
    let category = project.categories.find((c) => c.name === categoryName);
    if (!category) {
      category = { id: uid('cat'), name: categoryName.slice(0, 60), color: COLOR_PALETTE[project.categories.length % COLOR_PALETTE.length], order: project.categories.length };
      project.categories.push(category);
    }
    project.pendingItems = project.pendingItems.filter((p) => p.id !== id);
    project.tasks.push({ id: uid('task'), name: name.slice(0, 200), start, end, milestone: false, completed: false, categoryId: category.id, note: item.note || '', colorOverride: '', isDeadline: false, isHidden: false, displayNamePosition: 'inside', order: project.tasks.length });
  }, { reason: 'pending-to-task', message: '保留項目を予定に登録しました' });
  if (!state.project.pendingItems.length) closeModal({ force: true });
}

function renderProjectSettingsModal() {
  const body = `<label class="field full"><span>プロジェクト名</span><input id="project-settings-title" maxlength="120" value="${escapeHTML(state.project.title)}"></label><label class="field full"><span>全体メモ</span><textarea id="project-settings-memo" maxlength="10000" rows="5">${escapeHTML(state.project.memo)}</textarea></label>
    <div class="section-head"><h3>カテゴリー</h3><button class="button button-secondary" type="button" data-action="add-category">＋ 追加</button></div><div class="category-settings">${state.project.categories.map((category) => `<div class="category-setting-row" data-category-setting="${category.id}"><span class="category-dot color-${category.color}"></span><input data-category-name="${category.id}" maxlength="60" value="${escapeHTML(category.name)}" ${category.id === DEFAULT_CATEGORY_ID ? 'readonly' : ''}><select data-category-color="${category.id}">${COLOR_PALETTE.map((color) => `<option value="${color}" ${color === category.color ? 'selected' : ''}>${paletteLabels[color]}</option>`).join('')}</select>${category.id === DEFAULT_CATEGORY_ID ? '<span class="fixed-label">固定</span>' : `<button class="link-button danger" type="button" data-action="delete-category" data-category-id="${category.id}">削除</button>`}</div>`).join('')}</div><div id="project-settings-error" class="form-error" hidden></div>`;
  const footer = `<button class="button button-quiet" type="button" data-action="close-modal">キャンセル</button><button class="button button-primary" type="button" data-action="save-project-settings">保存</button>`;
  return modalFrame('プロジェクト設定', 'PROJECT', body, footer, true);
}

function renderExportModal() {
  const selected = selectedTask();
  const body = `<div class="export-grid"><section><h3>バックアップ</h3><p>完了・非表示・保留・表示設定を含む全プロジェクト。ChatGPT下書きとUndo履歴は含みません。</p><div class="button-stack"><button class="button button-primary" type="button" data-action="download-backup">完全バックアップJSON</button><button class="button button-secondary" type="button" data-action="copy-backup">バックアップJSONをコピー</button></div></section><section><h3>一覧データ</h3><fieldset class="choice-group"><legend>対象</legend><label><input type="radio" name="export-target" value="selected" ${selected ? 'checked' : 'disabled'}>選択中の1件</label><label><input type="radio" name="export-target" value="filtered" ${selected ? '' : 'checked'}>絞り込み結果</label><label><input type="radio" name="export-target" value="all">全件</label></fieldset><label class="check-row"><input id="export-notes" type="checkbox"><span>メモ列を含める</span></label><div class="button-stack"><button class="button button-secondary" type="button" data-action="copy-tsv">TSVをコピー</button><button class="button button-secondary" type="button" data-action="download-tsv">TSVを保存</button><button class="button button-secondary" type="button" data-action="download-xlsx">XLSXを保存</button></div></section></div><div class="export-restore"><h3>復元・取り込み</h3><p>バックアップやChatGPTの回答は、検証してから反映します。</p><button class="button button-secondary" type="button" data-action="import">JSON／回答を取り込む</button></div>`;
  return modalFrame('書き出し・復元', 'EXPORT', body, `<button class="button button-primary" type="button" data-action="close-modal">閉じる</button>`, true);
}

function renderModal() {
  const root = document.querySelector('#modal-root');
  if (!root) return;
  let html = '';
  if (state.modal === 'details') html = renderDetailsModal();
  else if (state.modal === 'move') html = renderMoveModal();
  else if (state.modal === 'filter') html = renderFilterModal();
  else if (state.modal === 'display') html = renderDisplaySettingsModal();
  else if (state.modal === 'chat-input') html = renderChatInputModal();
  else if (state.modal === 'chat-output') html = renderChatOutputModal();
  else if (state.modal === 'import') html = renderImportModal();
  else if (state.modal === 'pending') html = renderPendingModal();
  else if (state.modal === 'project') html = renderProjectSettingsModal();
  else if (state.modal === 'export') html = renderExportModal();
  root.innerHTML = html;
  root.querySelector('input[autofocus], textarea[autofocus]')?.focus();
}

function setScale(scale) {
  const widths = { day: 32, week: 12, month: 4 };
  if (!(scale in widths)) return;
  setView({ scale, dayWidth: widths[scale] });
}

function scrollToday() {
  const view = state.project.viewSettings;
  const today = todayISO();
  if (today < view.start || today > view.end) {
    const span = Math.min(729, Math.max(28, diffDays(view.start, view.end)));
    view.start = addDays(today, -Math.floor(span * 0.25));
    view.end = addDays(view.start, span);
    state.storage.saveView(view);
    renderWorkspace();
  }
  requestAnimationFrame(() => {
    const scroll = document.querySelector('#timeline-scroll');
    if (!scroll) return;
    const offset = diffDays(state.project.viewSettings.start, today) * state.project.viewSettings.dayWidth;
    scroll.scrollLeft = Math.max(0, offset - scroll.clientWidth * 0.25);
  });
}

function fitAll() {
  const tasks = filteredTasks();
  if (!tasks.length) return;
  const min = tasks.map((task) => task.start).sort()[0];
  const max = tasks.map((task) => task.end).sort().at(-1);
  let start = addDays(min, -2);
  let end = addDays(max, 2);
  const span = inclusiveDays(start, end);
  state.ui.viewNotice = '';
  let dayWidth = state.project.viewSettings.dayWidth;
  if (span > 730) {
    end = addDays(start, 729);
    state.ui.viewNotice = `全期間 ${span}日・${tasks.length}件。表示上限730日の先頭部分を表示中`;
    dayWidth = Math.max(2, dayWidth);
  } else {
    const scroll = document.querySelector('#timeline-scroll');
    const available = scroll?.clientWidth || 900;
    dayWidth = clamp(Math.floor(available / Math.max(1, span)), 2, 32);
  }
  setView({ start, end, dayWidth });
}

function shiftRange(direction) {
  const view = state.project.viewSettings;
  const span = Math.min(730, inclusiveDays(view.start, view.end));
  setView({ start: addDays(view.start, direction * span), end: addDays(view.end, direction * span) });
}

function clearFilters() {
  state.ui.search = '';
  state.ui.searchNotes = false;
  state.ui.thisWeek = false;
  state.ui.incomplete = false;
  state.ui.overdue = false;
  state.ui.includeHidden = false;
  state.ui.categoryIds = new Set();
  state.ui.sort = 'manual';
  const search = document.querySelector('#search-input');
  if (search) search.value = '';
  renderToolbarState();
  renderWorkspace();
  if (state.modal === 'filter') renderModal();
}

function updateInlineName(input) {
  const task = state.project.tasks.find((item) => item.id === input.dataset.inlineName);
  if (!task) return;
  const name = input.value.trim();
  if (!name) { input.value = task.name; showToast('予定名を入力してください。', true); return; }
  if (name === task.name) return;
  contentCommit((project) => { project.tasks.find((item) => item.id === task.id).name = name.slice(0, 200); }, { reason: 'inline-name' });
}

function updateInlineDate(input, edge) {
  const taskId = edge === 'start' ? input.dataset.inlineStart : input.dataset.inlineEnd;
  const task = state.project.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const value = input.value;
  if (!parseISO(value)) { input.value = task[edge]; return; }
  if (edge === 'start' && value > task.end) { input.value = task.start; showToast('終了日は開始日以降にしてください。', true); return; }
  if (edge === 'end' && value < task.start) { input.value = task.end; showToast('終了日は開始日以降にしてください。', true); return; }
  if (value === task[edge]) return;
  contentCommit((project) => { const target = project.tasks.find((item) => item.id === task.id); target[edge] = value; if (target.milestone) target.end = target.start; }, { reason: `inline-${edge}` });
}

function revealSelectedTask() {
  const task = selectedTask();
  if (!task) return;
  const view = state.project.viewSettings;
  if (task.end < view.start || task.start > view.end) {
    const span = Math.min(729, Math.max(28, diffDays(view.start, view.end)));
    setView({ start: addDays(task.start, -3), end: addDays(task.start, span - 3) });
  }
  requestAnimationFrame(() => document.querySelector(`[data-task-row="${CSS.escape(task.id)}"]`)?.scrollIntoView({ block: 'nearest' }));
}
