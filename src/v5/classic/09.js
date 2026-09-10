async function copyText(text, fallbackSelector = '') {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = fallbackSelector ? document.querySelector(fallbackSelector) : null;
    area?.focus();
    area?.select?.();
    showToast('コピーできませんでした。文章を選択してコピーしてください。', true);
    return false;
  }
}

function chatGPTUrl(prompt) {
  return `https://chatgpt.com/?prompt=${encodeURIComponent(prompt)}`;
}

async function openChatGPT(prompt, fallbackSelector) {
  const fullUrl = chatGPTUrl(prompt);
  if (fullUrl.length <= 2000) {
    const chatWindow = window.open(fullUrl, '_blank', 'noopener,noreferrer');
    if (!chatWindow) {
      showToast('ChatGPTを開けませんでした。指示文をコピーして手動で貼り付けてください。', true);
      return false;
    }
    return true;
  }

  const copied = await copyText(prompt, fallbackSelector);
  if (!copied) return false;
  showToast('文章が長いため全文をコピーしました。ChatGPTで貼り付けてください。');
  const shortPrompt = '次に貼り付ける指示文と資料を確認してから作業してください';
  const chatWindow = window.open(chatGPTUrl(shortPrompt), '_blank', 'noopener,noreferrer');
  if (!chatWindow) {
    showToast('ChatGPTを開けませんでした。コピー済みの文章を手動で貼り付けてください。', true);
    return false;
  }
  return true;
}

function backupObject(project = state.project) {
  return { ...deepCopy(project), schemaVersion: 1, viewSettings: deepCopy(state.project.viewSettings) };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportTaskSet(target) {
  if (target === 'all') return state.project.tasks;
  if (target === 'selected') return selectedTask() ? [selectedTask()] : [];
  return filteredTasks();
}

function tsvRows(tasks, includeNotes = false) {
  const header = ['種別', 'カテゴリー', '件名', '開始日', '終了日', '状態', ...(includeNotes ? ['メモ'] : [])];
  const rows = tasks.map((task) => [task.milestone ? 'マイルストーン' : 'タスク', taskCategoryName(task, state.project.categories), task.name, task.start, task.end, task.completed ? '完了' : '未完了', ...(includeNotes ? [task.note] : [])]);
  return [header, ...rows];
}

function safeTSVCell(value) {
  const text = String(value ?? '').replace(/[\t\r\n]+/g, ' ');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function tsvText(tasks, includeNotes) {
  return tsvRows(tasks, includeNotes).map((row) => row.map(safeTSVCell).join('\t')).join('\n');
}

function currentExportOptions() {
  const target = document.querySelector('input[name="export-target"]:checked')?.value || 'filtered';
  const includeNotes = document.querySelector('#export-notes')?.checked || false;
  return { target, includeNotes, tasks: exportTaskSet(target) };
}

function saveProjectSettings() {
  const title = document.querySelector('#project-settings-title')?.value.trim() || '';
  const memo = document.querySelector('#project-settings-memo')?.value || '';
  const rows = [...document.querySelectorAll('[data-category-setting]')];
  const categories = rows.map((row, index) => ({
    id: row.dataset.categorySetting,
    name: row.querySelector('[data-category-name]')?.value.trim() || '',
    color: row.querySelector('[data-category-color]')?.value || 'slate',
    order: index,
  }));
  const error = document.querySelector('#project-settings-error');
  if (!title) { error.hidden = false; error.textContent = 'プロジェクト名を入力してください。'; return; }
  if (categories.some((c) => !c.name)) { error.hidden = false; error.textContent = 'カテゴリー名を入力してください。'; return; }
  const names = categories.map((c) => c.name);
  if (new Set(names).size !== names.length) { error.hidden = false; error.textContent = 'カテゴリー名は重複できません。'; return; }
  contentCommit((project) => { project.title = title.slice(0, 120); project.memo = memo.slice(0, 10000); project.categories = categories; }, { reason: 'project-settings', message: 'プロジェクト設定を保存しました' });
  closeModal({ force: true });
}

function addCategory() {
  contentCommit((project) => {
    const base = '新しいカテゴリー';
    let name = base; let n = 2;
    while (project.categories.some((c) => c.name === name)) name = `${base}${n++}`;
    project.categories.push({ id: uid('cat'), name, color: COLOR_PALETTE[project.categories.length % COLOR_PALETTE.length], order: project.categories.length });
  }, { reason: 'add-category', message: 'カテゴリーを追加しました' });
  state.modal = 'project';
  renderModal();
}

function deleteCategory(id) {
  if (id === DEFAULT_CATEGORY_ID) return;
  const category = categoryById(id);
  const count = state.project.tasks.filter((task) => task.categoryId === id).length;
  if (!confirm(`「${category.name}」を削除しますか？${count ? `\n${count}件の予定は「未分類」へ移動します。` : ''}`)) return;
  contentCommit((project) => {
    project.tasks.forEach((task) => { if (task.categoryId === id) task.categoryId = DEFAULT_CATEGORY_ID; });
    project.categories = project.categories.filter((c) => c.id !== id);
  }, { reason: 'delete-category', message: 'カテゴリーを削除しました' });
  state.modal = 'project';
  renderModal();
}

function loadSample() {
  if (!confirm('サンプル予定を追加しますか？現在の予定は削除しません。')) return;
  const today = todayISO();
  contentCommit((project) => {
    let promo = project.categories.find((c) => c.name === 'プロモーション');
    if (!promo) { promo = { id: uid('cat'), name: 'プロモーション', color: 'indigo', order: project.categories.length }; project.categories.push(promo); }
    project.tasks.push(
      { id: uid('task'), name: '媒体・予算・ターゲット整理', start: today, end: addDays(today, 2), milestone: false, completed: false, categoryId: promo.id, note: '', colorOverride: '', isDeadline: false, isHidden: false, displayNamePosition: 'inside', order: project.tasks.length },
      { id: uid('task'), name: 'プラン確定', start: addDays(today, 7), end: addDays(today, 7), milestone: true, completed: false, categoryId: promo.id, note: '', colorOverride: '', isDeadline: true, isHidden: false, displayNamePosition: 'inside', order: project.tasks.length + 1 },
    );
  }, { reason: 'sample', message: 'サンプルを追加しました' });
}

function renderMigrationNotice() {
  if (!state.migration) return;
  showToast('旧版データを引き継ぎました。移行前データもブラウザ内に退避しています。');
  state.migration = null;
}
