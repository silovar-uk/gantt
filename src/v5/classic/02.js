function normalizePendingItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return { error: '保留項目の形式が正しくありません。' };
  const sourceText = String(item.sourceText || '').trim();
  const reason = String(item.reason || '').trim();
  const missingFields = Array.isArray(item.missingFields) ? item.missingFields.map(String).filter(Boolean) : [];
  if (!sourceText) return { error: '保留項目のsourceTextがありません。' };
  if (!reason) return { error: '保留項目のreasonがありません。' };
  if (!missingFields.length) return { error: '保留項目のmissingFieldsがありません。' };
  if (sourceText.length > 5000 || reason.length > 1000) return { error: '保留項目の文字数上限を超えています。' };
  const candidateStart = item.candidateStart && parseISO(String(item.candidateStart)) ? String(item.candidateStart) : '';
  const candidateEnd = item.candidateEnd && parseISO(String(item.candidateEnd)) ? String(item.candidateEnd) : '';
  return {
    value: {
      id: String(item.id || uid('pending')),
      sourceText,
      name: String(item.name || '').slice(0, 200),
      categoryName: String(item.categoryName || '').slice(0, 60),
      candidateStart,
      candidateEnd,
      reason,
      missingFields,
      note: String(item.note || '').slice(0, 5000),
      createdAt: item.createdAt || new Date().toISOString(),
    },
  };
}

function normalizeProject(payload, { legacy = false } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { errors: ['プロジェクトの形式が正しくありません。'] };
  const legacyTasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  const categories = normalizeCategoryList(payload.categories, legacyTasks);
  const errors = [];
  const tasks = [];
  legacyTasks.forEach((task, index) => {
    const result = normalizeTask(task, categories, index, { strict: !legacy });
    if (result.error) errors.push(`${index + 1}件目「${String(task?.name || '名称不明')}」: ${result.error}`);
    else tasks.push(result.value);
  });
  const pendingItems = [];
  const rawPending = Array.isArray(payload.pendingItems) ? payload.pendingItems : [];
  rawPending.forEach((item, index) => {
    const result = normalizePendingItem(item);
    if (result.error) errors.push(`保留${index + 1}件目: ${result.error}`);
    else pendingItems.push(result.value);
  });
  if (tasks.length > MAX_TASKS) errors.push(`予定は${MAX_TASKS}件までです。`);
  if (pendingItems.length > MAX_PENDING) errors.push(`保留項目は${MAX_PENDING}件までです。`);
  const base = createEmptyProject({
    projectId: payload.projectId || payload.id,
    title: payload.title,
    memo: payload.memo,
    revision: payload.revision,
    updatedAt: payload.updatedAt,
    viewSettings: payload.viewSettings || payload.view,
  });
  base.tasks = tasks.map((task, index) => ({ ...task, order: index }));
  base.categories = categories;
  base.pendingItems = pendingItems;
  return { errors, project: base };
}

function migrateLegacyProject(payload) {
  const result = normalizeProject(payload || {}, { legacy: true });
  if (result.errors?.length) return result;
  const project = result.project;
  const oldView = payload?.view || {};
  const scale = oldView.dayWidth >= 24 ? 'day' : oldView.dayWidth <= 6 ? 'month' : 'week';
  project.viewSettings = {
    ...createDefaultViewSettings(),
    start: parseISO(oldView.start) ? oldView.start : createDefaultViewSettings().start,
    end: parseISO(oldView.end) && oldView.end >= oldView.start ? oldView.end : createDefaultViewSettings().end,
    dayWidth: clamp(oldView.dayWidth ?? 12, 2, 32),
    rowHeight: clamp(oldView.rowHeight ?? 44, 36, 64),
    listWidth: clamp(oldView.panelWidth ?? 480, 360, 640),
    scale,
  };
  return { errors: [], project };
}

function taskColor(task, categories) {
  if (task.colorOverride && COLOR_PALETTE.includes(task.colorOverride)) return task.colorOverride;
  return categories.find((category) => category.id === task.categoryId)?.color || 'slate';
}

function taskCategoryName(task, categories) {
  return categories.find((category) => category.id === task.categoryId)?.name || '未分類';
}

function sortAndFilterTasks(project, ui) {
  const query = normalizeSearch(ui.search);
  const categoryIds = ui.categoryIds || new Set();
  const weekStart = mondayOfWeek();
  const weekEnd = addDays(weekStart, 6);
  const today = todayISO();
  const filtered = project.tasks.filter((task) => {
    if (!ui.includeHidden && task.isHidden) return false;
    if (query) {
      const category = taskCategoryName(task, project.categories);
      const haystack = `${task.name}\n${category}${ui.searchNotes ? `\n${task.note}` : ''}`;
      if (!normalizeSearch(haystack).includes(query)) return false;
    }
    if (categoryIds.size && !categoryIds.has(task.categoryId)) return false;
    if (ui.thisWeek && !(task.start <= weekEnd && task.end >= weekStart)) return false;
    if (ui.incomplete && task.completed) return false;
    if (ui.overdue && (task.completed || task.end >= today)) return false;
    return true;
  });
  const manual = (a, b) => a.order - b.order;
  if (ui.sort === 'start') filtered.sort((a, b) => a.start.localeCompare(b.start) || manual(a, b));
  else if (ui.sort === 'category') filtered.sort((a, b) => taskCategoryName(a, project.categories).localeCompare(taskCategoryName(b, project.categories), 'ja') || a.start.localeCompare(b.start) || manual(a, b));
  else filtered.sort(manual);
  return filtered;
}

function stripSingleCodeFence(text) {
  const trimmed = String(text || '').trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function validateHandoff(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { errors: ['JSONの最上位はオブジェクトにしてください。'] };
  const topAllowed = new Set(['handoffVersion', 'tasks', 'needsReview']);
  Object.keys(payload).forEach((key) => { if (!topAllowed.has(key)) errors.push(`未知の項目「${key}」があります。`); });
  if (payload.handoffVersion !== HANDOFF_VERSION) errors.push('handoffVersionは1にしてください。');
  if (!Array.isArray(payload.tasks)) errors.push('tasksは配列にしてください。');
  if (!Array.isArray(payload.needsReview)) errors.push('needsReviewは配列にしてください。');
  const tempCategories = createDefaultCategories();
  const tasks = [];
  (Array.isArray(payload.tasks) ? payload.tasks : []).forEach((task, index) => {
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      errors.push(`${index + 1}件目: 予定の形式が正しくありません。`);
      return;
    }
    const allowed = new Set(['name', 'start', 'end', 'categoryName', 'note', 'milestone']);
    Object.keys(task).forEach((key) => { if (!allowed.has(key)) errors.push(`${index + 1}件目「${task.name || '名称不明'}」: 未知の項目「${key}」があります。`); });
    if (typeof task.name !== 'string' || !task.name.trim()) errors.push(`${index + 1}件目: nameが必要です。`);
    if (typeof task.start !== 'string' || !parseISO(task.start)) errors.push(`${index + 1}件目「${task.name || '名称不明'}」: startが日付として読み取れません。`);
    if (typeof task.end !== 'string' || !parseISO(task.end)) errors.push(`${index + 1}件目「${task.name || '名称不明'}」: endが日付として読み取れません。`);
    if (typeof task.milestone !== 'undefined' && typeof task.milestone !== 'boolean') errors.push(`${index + 1}件目「${task.name || '名称不明'}」: milestoneはtrue/falseで指定してください。`);
    if (typeof task.categoryName !== 'undefined' && typeof task.categoryName !== 'string') errors.push(`${index + 1}件目「${task.name || '名称不明'}」: categoryNameは文字列にしてください。`);
    if (typeof task.note !== 'undefined' && typeof task.note !== 'string') errors.push(`${index + 1}件目「${task.name || '名称不明'}」: noteは文字列にしてください。`);
    const categoryName = typeof task.categoryName === 'string' ? task.categoryName.trim().slice(0, 60) : '';
    let category = tempCategories.find((item) => item.name === categoryName);
    if (!category && categoryName) {
      if (tempCategories.length >= MAX_CATEGORIES) errors.push('カテゴリー数の上限を超えています。');
      else {
        category = { id: categoryIdFromName(categoryName, new Set(tempCategories.map((c) => c.id))), name: categoryName, color: COLOR_PALETTE[(tempCategories.length - 1) % COLOR_PALETTE.length], order: tempCategories.length };
        tempCategories.push(category);
      }
    }
    if (!category) category = tempCategories[0];
    if (typeof task.start === 'string' && typeof task.end === 'string' && parseISO(task.start) && parseISO(task.end) && task.start <= task.end && typeof task.name === 'string' && task.name.trim()) {
      tasks.push({
        id: uid('task'), name: task.name.trim().slice(0, 200), start: task.start, end: task.milestone === true ? task.start : task.end,
        milestone: task.milestone === true, completed: false, categoryId: category.id, note: String(task.note || '').slice(0, 5000), colorOverride: '', isDeadline: false, isHidden: false, displayNamePosition: 'inside', order: tasks.length,
      });
    }
  });
  const pendingItems = [];
  (Array.isArray(payload.needsReview) ? payload.needsReview : []).forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`保留${index + 1}件目: 形式が正しくありません。`);
      return;
    }
    const allowed = new Set(['sourceText', 'reason', 'missingFields', 'name', 'categoryName', 'candidateStart', 'candidateEnd', 'note']);
    Object.keys(item).forEach((key) => { if (!allowed.has(key)) errors.push(`保留${index + 1}件目: 未知の項目「${key}」があります。`); });
    const result = normalizePendingItem(item);
    if (result.error) errors.push(`保留${index + 1}件目: ${result.error}`);
    else pendingItems.push(result.value);
  });
  if (tasks.length > MAX_TASKS) errors.push(`予定は${MAX_TASKS}件までです。`);
  if (pendingItems.length > MAX_PENDING) errors.push(`保留項目は${MAX_PENDING}件までです。`);
  return { errors, tasks, pendingItems, categories: tempCategories };
}

function detectImportFormat(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'handoffVersion' in payload) return 'handoff';
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.schemaVersion === SCHEMA_VERSION) return 'backup';
  if (Array.isArray(payload)) return 'legacy-array';
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && Array.isArray(payload.tasks)) return 'legacy-project';
  return 'unknown';
}

function buildInputPrompt({ sourceText, targetYear = '', baseDate = '', category = '' }) {
  const context = [
    targetYear ? `対象年: ${targetYear}` : '',
    baseDate ? `基準日: ${baseDate}` : '',
    category ? `任意カテゴリー: ${category}` : '',
  ].filter(Boolean).join('\n') || '対象年・基準日は指定なし。原文だけでは確定できない日付を推測しない。';
  return `以下の文章から、ガントチャートへ取り込める予定を抽出してください。\n\n【重要ルール】\n- 原文にない日付・年・期間を推測しない。\n- 日付が確定できるものだけtasksへ入れる。\n- 日付や対象が曖昧なものはneedsReviewへ入れ、reasonとmissingFieldsを具体的に書く。\n- 出力はJSONのみ。説明文やMarkdownコードフェンスは不要。\n- 未知のフィールドを追加しない。\n- milestoneは期間のない単一点の予定だけtrue。\n\n【JSON形式】\n{\n  "handoffVersion": 1,\n  "tasks": [\n    {\n      "name": "予定名",\n      "start": "YYYY-MM-DD",\n      "end": "YYYY-MM-DD",\n      "categoryName": "カテゴリー名",\n      "note": "必要な補足",\n      "milestone": false\n    }\n  ],\n  "needsReview": [\n    {\n      "sourceText": "判断元の原文",\n      "reason": "確定できない理由",\n      "missingFields": ["start"],\n      "name": "分かる場合のみ",\n      "categoryName": "分かる場合のみ",\n      "candidateStart": "確定できた場合のみYYYY-MM-DD",\n      "candidateEnd": "確定できた場合のみYYYY-MM-DD",\n      "note": "必要な補足"\n    }\n  ]\n}\n\n【基準情報】\n${context}\n\n【原文】\n${sourceText.trim()}`;
}

function buildOutputPrompt({ project, tasks, pendingItems = [], purpose, includeProjectMemo, includeTaskMemo }) {
  const taskRows = tasks.map((task) => ({
    種別: task.milestone ? 'マイルストーン' : 'タスク',
    カテゴリー: taskCategoryName(task, project.categories),
    件名: task.name,
    開始日: task.start,
    終了日: task.end,
    状態: task.completed ? '完了' : '未完了',
    ...(includeTaskMemo ? { メモ: task.note } : {}),
  }));
  const source = {
    タイトル: project.title,
    ...(includeProjectMemo ? { プロジェクトメモ: project.memo } : {}),
    予定: taskRows,
    ...(pendingItems.length ? { 保留項目: pendingItems.map(({ sourceText, reason, missingFields, name, categoryName }) => ({ sourceText, reason, missingFields, name, categoryName })) } : {}),
  };
  const instruction = purpose === 'tsv'
    ? '下記データを「種別、カテゴリー、件名、開始日、終了日、状態」の順でTSVにしてください。説明文を付けずTSVだけを返してください。メモが含まれている場合は最後にメモ列を追加してください。'
    : purpose === 'check'
      ? '下記データから「事実として確認できる点」と「追加確認が必要な点」を分けて整理してください。予定の重なりだけを理由に問題と断定しないでください。推測で成果や進捗を補わないでください。'
      : '下記の予定データを上長報告向けに400〜600字程度、箇条書き中心で整理してください。予定・進捗としてデータにない成果や事情を推測しないでください。要確認事項があれば分けて示してください。文字数は目安です。';
  return `${instruction}\n\n【データ】\n${JSON.stringify(source, null, 2)}`;
}
