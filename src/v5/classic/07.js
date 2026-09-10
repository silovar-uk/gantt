function readEditorForm() {
  const form = document.querySelector('#task-form');
  if (!form) return null;
  const data = new FormData(form);
  const milestone = data.get('type') === 'milestone';
  const original = state.editor.task;
  let start = milestone ? String(data.get('date') || original.end || original.start) : String(data.get('start') || '');
  let end = milestone ? start : String(data.get('end') || '');
  return {
    ...deepCopy(original),
    name: String(data.get('name') || '').trim(),
    milestone,
    start,
    end,
    categoryId: String(data.get('categoryId') || DEFAULT_CATEGORY_ID),
    colorOverride: String(data.get('colorOverride') || ''),
    completed: data.get('completed') === 'on',
    isDeadline: milestone && data.get('isDeadline') === 'on',
    isHidden: data.get('isHidden') === 'on',
    note: String(data.get('note') || ''),
  };
}

function validateEditor(task) {
  if (!task.name) return '予定名を入力してください。';
  if (task.name.length > 200) return '予定名は200文字以内にしてください。';
  if (!parseISO(task.start) || !parseISO(task.end)) return '日付を正しく入力してください。';
  if (task.end < task.start) return '終了日は開始日以降にしてください。';
  if (task.note.length > 5000) return 'メモは5,000文字以内にしてください。';
  return '';
}

function saveEditor() {
  const task = readEditorForm();
  if (!task) return;
  const error = validateEditor(task);
  const errorBox = document.querySelector('#task-form-error');
  if (error) {
    errorBox.hidden = false;
    errorBox.textContent = error;
    const field = error.startsWith('予定名') ? document.querySelector('[name="name"]') : document.querySelector('[name="start"], [name="date"]');
    field?.focus();
    return;
  }
  const wasNew = state.editor.isNew;
  const oldMilestone = state.editor.original?.milestone;
  if (!wasNew && oldMilestone === false && task.milestone === true) task.end = task.start;
  if (!wasNew && oldMilestone === true && task.milestone === false) task.end = task.end || task.start;
  contentCommit((project) => {
    if (wasNew) project.tasks.push({ ...task, id: uid('task'), order: project.tasks.length });
    else {
      const target = project.tasks.find((item) => item.id === task.id);
      if (target) Object.assign(target, task);
    }
  }, { reason: wasNew ? 'add-task' : 'edit-task', message: wasNew ? '予定を追加しました' : '予定を保存しました' });
  if (wasNew) state.selectedTaskId = state.project.tasks.at(-1)?.id || null;
  closeModal({ force: true });
  revealSelectedTask();
}

function renderMoveModal() {
  const task = state.project.tasks.find((item) => item.id === state.moveDraft.taskId);
  if (!task) return modalFrame('期間を移動', 'MOVE RANGE', '<p>予定が見つかりません。</p>');
  const duration = inclusiveDays(task.start, task.end);
  const newStart = state.moveDraft.start;
  const newEnd = addDays(newStart, duration - 1);
  const body = `<div class="range-preview"><span>変更前</span><strong>${formatDate(task.start, true)} 〜 ${formatDate(task.end, true)}</strong></div>
    <label class="field"><span>新しい開始日</span><input type="date" id="move-start" value="${newStart}"></label>
    <div class="range-preview"><span>変更後</span><strong id="move-preview">${formatDate(newStart, true)} 〜 ${formatDate(newEnd, true)}（${duration}日）</strong></div>`;
  const footer = `<button class="button button-quiet" type="button" data-action="back-details">戻る</button><button class="button button-primary" type="button" data-action="apply-move">移動する</button>`;
  return modalFrame('期間を移動', 'MOVE RANGE', body, footer);
}

function renderFilterModal() {
  const body = `<div class="filter-section"><h3>状態</h3>
      <label class="check-row"><input type="checkbox" data-filter="thisWeek" ${state.ui.thisWeek ? 'checked' : ''}><span>今週にかかる予定</span></label>
      <label class="check-row"><input type="checkbox" data-filter="incomplete" ${state.ui.incomplete ? 'checked' : ''}><span>未完了</span></label>
      <label class="check-row"><input type="checkbox" data-filter="overdue" ${state.ui.overdue ? 'checked' : ''}><span>期限超過</span></label>
      <label class="check-row"><input type="checkbox" data-filter="includeHidden" ${state.ui.includeHidden ? 'checked' : ''}><span>非表示を含める</span></label>
      <label class="check-row"><input type="checkbox" data-filter="searchNotes" ${state.ui.searchNotes ? 'checked' : ''}><span>メモも検索</span></label>
    </div>
    <div class="filter-section"><h3>カテゴリー</h3>${state.project.categories.map((category) => `<label class="check-row"><input type="checkbox" data-filter-category="${category.id}" ${state.ui.categoryIds.has(category.id) ? 'checked' : ''}><span class="category-dot color-${category.color}"></span><span>${escapeHTML(category.name)}</span></label>`).join('')}</div>
    <div class="filter-section"><h3>並び順</h3><div class="radio-stack">
      <label><input type="radio" name="sort" value="manual" ${state.ui.sort === 'manual' ? 'checked' : ''}>手動順</label>
      <label><input type="radio" name="sort" value="start" ${state.ui.sort === 'start' ? 'checked' : ''}>開始日</label>
      <label><input type="radio" name="sort" value="category" ${state.ui.sort === 'category' ? 'checked' : ''}>カテゴリー</label>
    </div></div>`;
  const footer = `<button class="button button-secondary" type="button" data-action="clear-filters">すべて解除</button><button class="button button-primary" type="button" data-action="close-modal">完了</button>`;
  return modalFrame('表示・絞り込み', 'FILTER & SORT', body, footer);
}

function renderDisplaySettingsModal() {
  const view = state.project.viewSettings;
  const body = `<div class="form-grid two">
      <label class="field"><span>一覧の幅</span><input id="setting-list-width" type="number" min="360" max="640" value="${view.listWidth}"><small>360〜640px</small></label>
      <label class="field"><span>行の高さ</span><select id="setting-row-height"><option value="36" ${view.rowHeight === 36 ? 'selected' : ''}>コンパクト 36px</option><option value="44" ${view.rowHeight === 44 ? 'selected' : ''}>標準 44px</option><option value="48" ${view.rowHeight === 48 ? 'selected' : ''}>タッチ 48px</option><option value="56" ${view.rowHeight === 56 ? 'selected' : ''}>ゆったり 56px</option></select></label>
      <label class="field"><span>文字サイズ</span><input id="setting-text-size" type="number" min="12" max="18" value="${view.textSize}"><small>12〜18px</small></label>
      <label class="field"><span>日付幅</span><input id="setting-day-width" type="number" min="2" max="32" value="${view.dayWidth}"><small>2〜32px/日</small></label>
    </div>
    <h3 class="section-title">表示期間</h3>
    <div class="form-grid two"><label class="field"><span>開始</span><input id="setting-view-start" type="date" value="${view.start}"></label><label class="field"><span>終了</span><input id="setting-view-end" type="date" value="${view.end}"></label></div>
    <p class="form-help">表示設定はUndo対象外です。予定の日付は変更しません。</p><div id="display-error" class="form-error" hidden></div>`;
  const footer = `<button class="button button-quiet" type="button" data-action="close-modal">キャンセル</button><button class="button button-primary" type="button" data-action="apply-display-settings">適用</button>`;
  return modalFrame('表示設定', 'DISPLAY', body, footer);
}

function prepareInputDraft() {
  if (state.inputDraft) return;
  const stored = state.storage.readDraft('input');
  state.inputDraft = stored || { sourceText: '', targetYear: '', baseDate: '', category: '', prompt: '', manual: false, answer: '', completed: false };
}

function persistInputDraft() {
  state.storage.saveDraft('input', state.inputDraft);
}

function renderChatInputModal() {
  const d = state.inputDraft;
  const hasPrevious = d.updatedAt && (d.sourceText || d.prompt || d.answer);
  const body = `${hasPrevious ? `<div class="draft-banner"><strong>前回の下書きを再開しています。</strong><button class="link-button" type="button" data-action="new-input-draft">新しく作成</button></div>` : ''}
    <label class="field full"><span>元の文章</span><textarea id="input-source" rows="7" placeholder="日程、メモ、メール本文などを貼り付け">${escapeHTML(d.sourceText)}</textarea></label>
    <div class="form-grid three"><label class="field"><span>対象年（任意）</span><input id="input-year" inputmode="numeric" maxlength="4" placeholder="2026" value="${escapeHTML(d.targetYear)}"></label><label class="field"><span>基準日（任意）</span><input id="input-base-date" type="date" value="${escapeHTML(d.baseDate)}"></label><label class="field"><span>カテゴリー（任意）</span><input id="input-category" value="${escapeHTML(d.category)}"></label></div>
    <div class="prompt-head"><div><h3>ChatGPTへ渡す指示文</h3><p>${d.manual ? '手編集あり。元文や条件を変えたあと「再作成」すると手編集は置き換わります。' : '原文にない日付を推測しないJSON形式で依頼します。'}</p></div><button class="button button-secondary" type="button" data-action="build-input-prompt">${d.prompt ? '再作成' : '指示文を作成'}</button></div>
    <textarea id="input-prompt" class="code-area" rows="12" spellcheck="false">${escapeHTML(d.prompt)}</textarea>
    <p class="handoff-note">表示中の指示文・データをChatGPTへ渡します。アプリ内でAI処理は行いません。</p>
    <div class="handoff-actions"><button class="button button-secondary" type="button" data-action="copy-input-prompt" ${d.prompt ? '' : 'disabled'}>全文をコピー</button><button class="button button-primary" type="button" data-action="open-input-chatgpt" ${d.prompt ? '' : 'disabled'}>ChatGPTで開く</button><button class="link-button" type="button" data-action="paste-answer">回答を貼り付ける</button></div>`;
  return modalFrame('文章から予定を作る', 'CHATGPT HANDOFF', body, `<button class="button button-quiet" type="button" data-action="close-modal">閉じる</button>`, true);
}

function prepareOutputSession() {
  const visible = filteredTasks();
  const selected = selectedTask();
  state.outputSession = {
    revision: state.project.revision,
    project: deepCopy(state.project),
    selectedTaskId: selected?.id || null,
    visibleIds: visible.map((task) => task.id),
    target: selected ? 'selected' : 'filtered',
    purpose: 'manager',
    includePending: false,
    includeProjectMemo: false,
    includeTaskMemo: false,
    prompt: '',
  };
  refreshOutputPrompt();
}

function outputTasksFromSession() {
  const s = state.outputSession;
  if (!s) return [];
  if (s.target === 'all') return s.project.tasks;
  if (s.target === 'selected') return s.project.tasks.filter((task) => task.id === s.selectedTaskId);
  return s.project.tasks.filter((task) => s.visibleIds.includes(task.id));
}

function refreshOutputPrompt() {
  const s = state.outputSession;
  if (!s) return;
  const tasks = outputTasksFromSession();
  const pending = s.includePending ? s.project.pendingItems : [];
  s.prompt = buildOutputPrompt({ project: s.project, tasks, pendingItems: pending, purpose: s.purpose, includeProjectMemo: s.includeProjectMemo, includeTaskMemo: s.includeTaskMemo });
  state.storage.saveDraft('output', { ...s, project: undefined, visibleIds: undefined, prompt: s.prompt });
}

function renderChatOutputModal() {
  const s = state.outputSession;
  const stale = s.revision !== state.project.revision;
  const tasks = outputTasksFromSession();
  const body = `${stale ? `<div class="stale-banner"><strong>予定が更新されています。</strong><span>確認内容を更新するまで受け渡しを止めています。</span><button class="button button-secondary" type="button" data-action="refresh-output">プレビューを更新</button></div>` : ''}
    <div class="form-grid three"><fieldset class="choice-group"><legend>対象</legend>
      <label><input type="radio" name="output-target" value="selected" ${s.target === 'selected' ? 'checked' : ''} ${s.selectedTaskId ? '' : 'disabled'}>選択中の1件</label>
      <label><input type="radio" name="output-target" value="filtered" ${s.target === 'filtered' ? 'checked' : ''}>絞り込み結果</label>
      <label><input type="radio" name="output-target" value="all" ${s.target === 'all' ? 'checked' : ''}>全件</label>
    </fieldset><fieldset class="choice-group"><legend>用途</legend>
      <label><input type="radio" name="output-purpose" value="manager" ${s.purpose === 'manager' ? 'checked' : ''}>上長報告</label>
      <label><input type="radio" name="output-purpose" value="tsv" ${s.purpose === 'tsv' ? 'checked' : ''}>日程一覧／TSV</label>
      <label><input type="radio" name="output-purpose" value="check" ${s.purpose === 'check' ? 'checked' : ''}>確認事項の整理</label>
    </fieldset><fieldset class="choice-group"><legend>含める情報</legend>
      <label><input type="checkbox" id="output-pending" ${s.includePending ? 'checked' : ''}>保留項目</label>
      <label><input type="checkbox" id="output-project-memo" ${s.includeProjectMemo ? 'checked' : ''}>プロジェクトメモ</label>
      <label><input type="checkbox" id="output-task-memo" ${s.includeTaskMemo ? 'checked' : ''}>タスクメモ</label>
    </fieldset></div>
    <div class="snapshot-summary"><strong>${tasks.length}件</strong><span>タイトル「${escapeHTML(s.project.title)}」を含めます${s.includePending ? ` · 保留${s.project.pendingItems.length}件` : ''}</span></div>
    <textarea id="output-prompt" class="code-area" rows="14" readonly>${escapeHTML(s.prompt)}</textarea>
    <div class="handoff-actions"><button class="button button-secondary" type="button" data-action="copy-output-prompt" ${stale ? 'disabled' : ''}>全文をコピー</button><button class="button button-primary" type="button" data-action="open-output-chatgpt" ${stale ? 'disabled' : ''}>ChatGPTで開く</button></div>`;
  return modalFrame('予定を文章にする', 'CHATGPT HANDOFF', body, `<button class="button button-quiet" type="button" data-action="close-modal">閉じる</button>`, true);
}

function validateImport() {
  state.importPreview = null;
  const raw = stripSingleCodeFence(state.importRaw);
  const bytes = new TextEncoder().encode(raw).length;
  if (bytes > MAX_IMPORT_BYTES) {
    state.importPreview = { errors: ['入力は5MiBまでです。'], format: 'unknown' };
    renderModal();
    return;
  }
  let payload;
  try { payload = JSON.parse(raw); }
  catch {
    state.importPreview = { errors: ['JSONを読み取れませんでした。全文を貼り付けたか確認してください。'], format: 'unknown' };
    renderModal();
    return;
  }
  const format = detectImportFormat(payload);
  let errors = [];
  let tasks = [];
  let pendingItems = [];
  let categories = createDefaultCategories();
  let project = null;
  if (format === 'handoff') {
    const result = validateHandoff(payload);
    errors = result.errors;
    tasks = result.tasks || [];
    pendingItems = result.pendingItems || [];
    categories = result.categories || categories;
  } else if (format === 'backup') {
    const result = normalizeProject(payload, { legacy: false });
    errors = result.errors || [];
    project = result.project;
    tasks = project?.tasks || [];
    pendingItems = project?.pendingItems || [];
    categories = project?.categories || categories;
  } else if (format === 'legacy-array' || format === 'legacy-project') {
    const wrapped = Array.isArray(payload) ? { tasks: payload } : payload;
    const result = normalizeProject(wrapped, { legacy: true });
    errors = result.errors || [];
    project = result.project;
    tasks = project?.tasks || [];
    pendingItems = project?.pendingItems || [];
    categories = project?.categories || categories;
  } else {
    errors = ['この形式のデータには対応していません。'];
  }
  const hash = hashString(stableStringify(payload));
  const duplicate = hash === state.storage.getLastImportHash();
  const incomingNames = new Set(categories.map((c) => c.name));
  const existingNames = new Set(state.project.categories.map((c) => c.name));
  const newCategories = [...incomingNames].filter((name) => name !== '未分類' && !existingNames.has(name));
  state.importPreview = { format, payload, errors, tasks, pendingItems, categories, project, hash, duplicate, revision: state.project.revision, newCategories };
  renderModal();
}
