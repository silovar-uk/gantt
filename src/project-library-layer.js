(() => {
  const LEGACY_KEY = 'gantt-desk:v2:project';
  const INDEX_KEY = 'gantt-desk:v3:projects';
  const ACTIVE_KEY = 'gantt-desk:v3:active-project-id';
  const PROJECT_PREFIX = 'gantt-desk:v3:project:';
  const state = { tab: 'projects', selectedTaskIds: new Set(), syncTimer: null, reloadTimer: null, toastTimer: null };
  const $ = (selector) => document.querySelector(selector);

  function readJSON(key, fallback) {
    try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
    catch { return fallback; }
  }
  function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function deepCopy(value) { return JSON.parse(JSON.stringify(value)); }
  function nowISO() { return new Date().toISOString(); }
  function uid(prefix = 'project') { return window.crypto?.randomUUID ? `${prefix}-${window.crypto.randomUUID()}` : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  function escapeHTML(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
  function formatUpdatedAt(value) { const date = new Date(value || Date.now()); return Number.isNaN(date.getTime()) ? '更新日時不明' : `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
  function normalizeCategory(value) { return String(value ?? '').trim() || '未分類'; }

  function getIndex() { const index = readJSON(INDEX_KEY, []); return Array.isArray(index) ? index : []; }
  function setIndex(index) { writeJSON(INDEX_KEY, index); }
  function getActiveId() { return localStorage.getItem(ACTIVE_KEY); }
  function getLegacyProject() { return readJSON(LEGACY_KEY, null); }
  function getStoredProject(id) { return readJSON(`${PROJECT_PREFIX}${id}`, null); }
  function setStoredProject(project) { writeJSON(`${PROJECT_PREFIX}${project.id}`, project); }
  function compactProject(project) { return { id: project.id, title: String(project.title || '新しいガント'), updatedAt: project.updatedAt || nowISO(), createdAt: project.createdAt || project.updatedAt || nowISO(), taskCount: Array.isArray(project.tasks) ? project.tasks.length : 0 }; }

  function syncCurrentProject() {
    const activeId = getActiveId();
    const legacy = getLegacyProject();
    if (!activeId || !legacy) return;
    const existing = getStoredProject(activeId);
    const next = deepCopy(legacy);
    next.id = activeId;
    next.createdAt = existing?.createdAt || next.createdAt || nowISO();
    next.updatedAt = next.updatedAt || nowISO();
    next.tasks = Array.isArray(next.tasks) ? next.tasks : [];
    next.categories = [...new Set((Array.isArray(next.categories) ? next.categories : []).map(normalizeCategory).concat(next.tasks.map((task) => normalizeCategory(task.category))))];
    if (!next.categories.includes('未分類')) next.categories.unshift('未分類');
    setStoredProject(next);
    const index = getIndex();
    const row = compactProject(next);
    const at = index.findIndex((item) => item.id === activeId);
    if (at >= 0) index[at] = row; else index.unshift(row);
    setIndex(index.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))));
  }

  function persistAndReload(project, message) {
    project.updatedAt = nowISO();
    project.createdAt = project.createdAt || project.updatedAt;
    project.tasks = Array.isArray(project.tasks) ? project.tasks : [];
    project.categories = [...new Set((Array.isArray(project.categories) ? project.categories : []).map(normalizeCategory).concat(project.tasks.map((task) => normalizeCategory(task.category))))];
    if (!project.categories.includes('未分類')) project.categories.unshift('未分類');
    setStoredProject(project);
    const index = getIndex(); const row = compactProject(project); const position = index.findIndex((item) => item.id === project.id);
    if (position >= 0) index[position] = row; else index.unshift(row);
    setIndex(index.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))));
    localStorage.setItem(ACTIVE_KEY, project.id);
    writeJSON(LEGACY_KEY, project);
    showToast(message);
    clearTimeout(state.reloadTimer);
    state.reloadTimer = setTimeout(() => location.reload(), 220);
  }

  function mutateActiveProject(mutator, message) {
    syncCurrentProject();
    const activeId = getActiveId(); const project = getStoredProject(activeId);
    if (!project) return showToast('保存中のプロジェクトを読み込めませんでした。', true);
    mutator(project);
    persistAndReload(project, message);
  }

  function createBlankProject(title = '新しいガント') {
    const legacy = getLegacyProject();
    const baseView = legacy?.view || {};
    const today = new Date(); const day = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const toISO = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    const addDays = (date, amount) => { const copy = new Date(date.getTime()); copy.setUTCDate(copy.getUTCDate() + amount); return copy; };
    return { version: 2, id: uid(), title: String(title || '新しいガント').trim() || '新しいガント', memo: '', categories: ['未分類'], tasks: [], view: { start: baseView.start || toISO(addDays(day, -7)), end: baseView.end || toISO(addDays(day, 42)), dayWidth: baseView.dayWidth || 28, rowHeight: baseView.rowHeight || 52, showCompleted: true }, createdAt: nowISO(), updatedAt: nowISO() };
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .library-open-button { margin-right:2px; }
      .library-modal { position:fixed; z-index:135; inset:0; display:grid; place-items:center; padding:20px; }
      .library-modal[hidden] { display:none; }
      .library-modal__backdrop { position:absolute; inset:0; background:rgba(15,23,42,.42); }
      .library-modal__card { position:relative; width:min(940px,100%); max-height:min(830px,92vh); overflow:hidden; display:grid; grid-template-rows:auto auto minmax(0,1fr) auto; border:1px solid #dbe2ea; border-radius:14px; background:#fff; box-shadow:0 24px 58px rgba(15,23,42,.26); }
      .library-modal__head { padding:20px 22px 14px; display:flex; justify-content:space-between; align-items:flex-start; gap:14px; border-bottom:1px solid #dbe2ea; }
      .library-modal__head h2 { margin:0; color:#172033; font-size:21px; letter-spacing:-.02em; }
      .library-modal__copy { margin:7px 0 0; color:#64748b; font-size:13px; line-height:1.55; }
      .library-tabs { padding:9px 22px 0; display:flex; gap:6px; border-bottom:1px solid #dbe2ea; }
      .library-tab { min-height:37px; padding:8px 12px; border:0; border-bottom:2px solid transparent; color:#64748b; background:transparent; font-size:13px; font-weight:800; }
      .library-tab.is-active { color:#244a8f; border-bottom-color:#244a8f; }
      .library-modal__body { min-height:0; overflow:auto; padding:18px 22px; background:#fcfdff; }
      .library-panel[hidden] { display:none; }
      .library-notice { margin:0 0 14px; padding:10px 11px; border:1px solid #d9e5f6; border-radius:8px; color:#48627e; background:#f4f8ff; font-size:12px; line-height:1.55; }
      .library-project-actions { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:13px; }
      .library-project-list { display:grid; gap:8px; }
      .project-card { min-height:74px; padding:12px; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; align-items:center; border:1px solid #dbe2ea; border-radius:10px; background:#fff; }
      .project-card.is-active { border-color:#7da2df; box-shadow:inset 3px 0 0 #244a8f; background:#fbfdff; }
      .project-card__main { min-width:0; text-align:left; }
      .project-card__title-row { display:flex; align-items:center; gap:7px; }
      .project-card__title { overflow:hidden; color:#172033; font-size:14px; font-weight:800; text-overflow:ellipsis; white-space:nowrap; }
      .project-card__active { padding:3px 6px; border-radius:999px; color:#244a8f; background:#e8eefb; font-size:10px; font-weight:800; white-space:nowrap; }
      .project-card__meta { margin-top:4px; color:#64748b; font-size:11px; }
      .project-card__controls { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:6px; }
      .library-mini { min-height:30px; padding:5px 8px; border:1px solid #cbd5e1; border-radius:7px; color:#475569; background:#fff; font-size:11px; font-weight:750; }
      .library-mini:hover { border-color:#8497ab; background:#f8fafc; }
      .library-mini.danger { color:#b42318; border-color:#efb1ad; }
      .library-mini.danger:hover { background:#fef3f2; }
      .library-section { padding:14px 0; border-bottom:1px solid #edf1f5; }
      .library-section:first-child { padding-top:0; }
      .library-section:last-child { border-bottom:0; }
      .library-section h3 { margin:0 0 9px; color:#25354b; font-size:13px; }
      .library-add-category { display:flex; gap:8px; }
      .library-input, .library-select { min-height:36px; width:100%; padding:7px 9px; border:1px solid #b9c6d4; border-radius:8px; color:#172033; background:#fff; font-size:13px; outline:none; }
      .library-input:focus, .library-select:focus { border-color:#244a8f; box-shadow:0 0 0 3px rgba(36,74,143,.12); }
      .category-admin-list { display:grid; gap:7px; }
      .category-admin-row { display:grid; grid-template-columns:minmax(160px,1fr) auto minmax(140px,.65fr) auto; gap:7px; align-items:center; padding:8px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; }
      .category-admin-row.is-default { background:#f8fafc; }
      .category-admin-help { color:#64748b; font-size:11px; line-height:1.5; }
      .bulk-toolbar { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin:0 0 8px; }
      .bulk-toolbar__left, .bulk-toolbar__right { display:flex; align-items:center; gap:7px; }
      .bulk-count { color:#64748b; font-size:12px; }
      .bulk-task-list { display:grid; max-height:312px; overflow:auto; border:1px solid #dbe2ea; border-radius:9px; background:#fff; }
      .bulk-task-row { min-height:39px; padding:7px 9px; display:grid; grid-template-columns:20px minmax(0,1fr) auto; gap:8px; align-items:center; border-bottom:1px solid #edf1f5; cursor:pointer; }
      .bulk-task-row:last-child { border-bottom:0; }
      .bulk-task-row:hover { background:#f8fafc; }
      .bulk-task-row input { margin:0; accent-color:#244a8f; }
      .bulk-task-name { overflow:hidden; color:#26364b; font-size:12px; font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
      .bulk-task-meta { color:#64748b; font-size:11px; white-space:nowrap; }
      .bulk-apply { margin-top:10px; display:grid; grid-template-columns:minmax(180px,260px) auto; justify-content:space-between; gap:8px; }
      .library-modal__foot { padding:14px 22px; display:flex; justify-content:space-between; align-items:center; gap:10px; border-top:1px solid #dbe2ea; background:#fff; }
      .library-modal__status { color:#64748b; font-size:11px; }
      .library-toast { position:fixed; z-index:160; bottom:18px; left:50%; max-width:min(480px,calc(100vw - 36px)); padding:10px 13px; transform:translate(-50%,10px); border-radius:9px; color:#fff; background:#22324a; box-shadow:0 12px 36px rgba(15,23,42,.18); font-size:13px; opacity:0; transition:opacity .18s,transform .18s; }
      .library-toast.is-visible { transform:translate(-50%,0); opacity:1; }
      .library-toast.is-error { background:#9b2c28; }
      @media (max-width:720px) { .library-open-button { display:none; } .library-modal { padding:0; align-items:end; } .library-modal__card { width:100%; max-height:93vh; border-radius:16px 16px 0 0; } .library-modal__head { padding:16px; } .library-tabs { padding:7px 16px 0; } .library-modal__body { padding:14px 16px; } .library-modal__foot { padding:12px 16px; } .category-admin-row { grid-template-columns:minmax(0,1fr) auto; } .category-admin-row .library-select { grid-column:1; } .category-admin-row .category-delete-button { grid-column:2; } .bulk-apply { grid-template-columns:1fr; } }
    `;
    document.head.append(style);
  }

  function createUI() {
    const actions = $('.project-actions'); if (!actions || $('#library-open-btn')) return;
    const button = document.createElement('button'); button.id = 'library-open-btn'; button.className = 'button button-secondary library-open-button'; button.type = 'button'; button.textContent = '保存・管理';
    const share = $('#share-open-btn'); if (share) share.insertAdjacentElement('afterend', button); else actions.prepend(button);

    const modal = document.createElement('div'); modal.id = 'library-modal'; modal.className = 'library-modal'; modal.hidden = true;
    modal.innerHTML = `<div class="library-modal__backdrop" data-library-close></div><section class="library-modal__card" role="dialog" aria-modal="true" aria-labelledby="library-modal-title"><div class="library-modal__head"><div><p class="eyebrow">BROWSER LIBRARY</p><h2 id="library-modal-title">保存・管理</h2><p class="library-modal__copy">ガントはこのブラウザ内に保存されます。複数案件を切り替え、複製・削除し、カテゴリをまとめて整えられます。</p></div><button id="library-close-btn" class="icon-button" type="button" aria-label="閉じる">×</button></div><div class="library-tabs"><button class="library-tab is-active" type="button" data-library-tab="projects">プロジェクト</button><button class="library-tab" type="button" data-library-tab="categories">カテゴリ一括変更</button></div><div class="library-modal__body"><section id="library-projects-panel" class="library-panel"></section><section id="library-categories-panel" class="library-panel" hidden></section></div><div class="library-modal__foot"><span class="library-modal__status">このブラウザ内だけに保存されます。節目ではJSONバックアップも推奨です。</span><button class="button button-quiet" type="button" data-library-close>閉じる</button></div></section>`;
    document.body.append(modal);
    const toast = document.createElement('div'); toast.id = 'library-toast'; toast.className = 'library-toast'; toast.hidden = true; toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); document.body.append(toast);

    const moreMenu = $('#more-menu');
    if (moreMenu && !$('#library-menu-btn')) { const menuButton = document.createElement('button'); menuButton.id = 'library-menu-btn'; menuButton.type = 'button'; menuButton.setAttribute('role', 'menuitem'); menuButton.textContent = '保存・管理'; menuButton.addEventListener('click', () => { $('#more-btn')?.click(); openModal(); }); moreMenu.prepend(menuButton); }
  }

  function renderProjects() {
    syncCurrentProject();
    const activeId = getActiveId(); const projects = getIndex().slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const html = projects.map((project) => `<article class="project-card ${project.id === activeId ? 'is-active' : ''}"><button class="project-card__main" type="button" data-project-action="open" data-project-id="${escapeHTML(project.id)}"><div class="project-card__title-row"><span class="project-card__title">${escapeHTML(project.title)}</span>${project.id === activeId ? '<span class="project-card__active">編集中</span>' : ''}</div><div class="project-card__meta">${project.taskCount || 0}件のタスク　｜　更新 ${formatUpdatedAt(project.updatedAt)}</div></button><div class="project-card__controls">${project.id !== activeId ? `<button class="library-mini" type="button" data-project-action="open" data-project-id="${escapeHTML(project.id)}">開く</button>` : ''}<button class="library-mini" type="button" data-project-action="duplicate" data-project-id="${escapeHTML(project.id)}">複製</button><button class="library-mini danger" type="button" data-project-action="delete" data-project-id="${escapeHTML(project.id)}">削除</button></div></article>`).join('');
    $('#library-projects-panel').innerHTML = `<p class="library-notice">ここで保存する案件は、GitHub Pagesや他の端末には自動同期されません。共有するときはPNG／Excel、保管するときは完全バックアップJSONを使います。</p><div class="library-project-actions"><div><strong>保存済みプロジェクト</strong><span class="category-admin-help">　${projects.length}件</span></div><button id="new-project-btn" class="button button-primary" type="button">＋ 新しいガント</button></div><div class="library-project-list">${html || '<p class="category-admin-help">保存済みのプロジェクトはありません。</p>'}</div>`;
  }

  function categoryOptions(project, except = '') {
    const categories = [...new Set((project.categories || []).map(normalizeCategory).concat((project.tasks || []).map((task) => normalizeCategory(task.category))))];
    if (!categories.includes('未分類')) categories.unshift('未分類');
    return categories.filter((category) => category !== except);
  }

  function renderCategories() {
    syncCurrentProject(); const project = getStoredProject(getActiveId()); if (!project) return;
    const categories = categoryOptions(project); const taskCounts = new Map(categories.map((category) => [category, 0])); project.tasks.forEach((task) => taskCounts.set(normalizeCategory(task.category), (taskCounts.get(normalizeCategory(task.category)) || 0) + 1));
    const categoryRows = categories.map((category) => { const targets = categoryOptions(project, category); const isDefault = category === '未分類'; return `<div class="category-admin-row ${isDefault ? 'is-default' : ''}"><input class="library-input" data-category-rename-input="${escapeHTML(category)}" value="${escapeHTML(category)}" aria-label="${escapeHTML(category)}のカテゴリ名"><button class="library-mini" type="button" data-category-action="rename" data-category="${escapeHTML(category)}">名称変更</button><select class="library-select" data-category-target="${escapeHTML(category)}" ${isDefault ? 'disabled' : ''}>${targets.map((target) => `<option value="${escapeHTML(target)}" ${target === '未分類' ? 'selected' : ''}>${escapeHTML(target)}へ移動</option>`).join('')}</select><button class="library-mini danger category-delete-button" type="button" data-category-action="delete" data-category="${escapeHTML(category)}" ${isDefault ? 'disabled' : ''}>削除</button><span class="category-admin-help" style="grid-column:1 / -1">${taskCounts.get(category) || 0}件のタスクがこのカテゴリです${isDefault ? '（削除不可）' : ''}</span></div>`; }).join('');
    const tasks = project.tasks || []; const taskRows = tasks.map((task) => `<label class="bulk-task-row"><input type="checkbox" data-bulk-task-id="${escapeHTML(task.id)}" ${state.selectedTaskIds.has(task.id) ? 'checked' : ''}><span class="bulk-task-name">${escapeHTML(task.milestone ? `◆ ${task.name}` : task.name)}</span><span class="bulk-task-meta">${escapeHTML(normalizeCategory(task.category))}　${escapeHTML(task.start)}${task.milestone ? '' : `〜${escapeHTML(task.end || task.start)}`}</span></label>`).join('');
    $('#library-categories-panel').innerHTML = `<p class="library-notice">カテゴリを追加するだけでなく、名称変更は全タスクへ反映、削除時は別カテゴリへまとめて移動できます。下段では、選んだタスクだけを一括変更できます。</p><section class="library-section"><h3>カテゴリを追加・整理</h3><div class="library-add-category"><input id="new-category-input" class="library-input" type="text" placeholder="例：券売／イベント／制作" autocomplete="off"><button id="add-category-btn" class="button button-secondary" type="button">カテゴリを追加</button></div><div class="category-admin-list" style="margin-top:10px">${categoryRows}</div></section><section class="library-section"><h3>タスクのカテゴリを一括変更</h3><div class="bulk-toolbar"><div class="bulk-toolbar__left"><button id="bulk-select-all-btn" class="library-mini" type="button">全選択</button><button id="bulk-clear-btn" class="library-mini" type="button">解除</button><span class="bulk-count" id="bulk-selected-count">${state.selectedTaskIds.size}件を選択中</span></div><div class="bulk-toolbar__right"><span class="category-admin-help">${tasks.length}件</span></div></div><div id="bulk-task-list" class="bulk-task-list">${taskRows || '<p class="category-admin-help" style="padding:12px">タスクがありません。</p>'}</div><div class="bulk-apply"><select id="bulk-category-select" class="library-select">${categories.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('')}</select><button id="bulk-apply-btn" class="button button-primary" type="button">選択したタスクを変更</button></div></section>`;
  }

  function switchTab(tab) { state.tab = tab; document.querySelectorAll('[data-library-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.libraryTab === tab)); $('#library-projects-panel').hidden = tab !== 'projects'; $('#library-categories-panel').hidden = tab !== 'categories'; if (tab === 'projects') renderProjects(); else renderCategories(); }
  function openModal(tab = state.tab) { syncCurrentProject(); $('#library-modal').hidden = false; switchTab(tab); }
  function closeModal() { $('#library-modal').hidden = true; }
  function showToast(message, isError = false) { const toast = $('#library-toast'); clearTimeout(state.toastTimer); toast.textContent = message; toast.hidden = false; toast.classList.toggle('is-error', isError); requestAnimationFrame(() => toast.classList.add('is-visible')); state.toastTimer = setTimeout(() => { toast.classList.remove('is-visible'); setTimeout(() => { toast.hidden = true; }, 180); }, 2600); }

  function openProject(projectId) {
    syncCurrentProject(); const project = getStoredProject(projectId); if (!project) return showToast('プロジェクトが見つかりません。', true); localStorage.setItem(ACTIVE_KEY, projectId); writeJSON(LEGACY_KEY, project); showToast(`「${project.title}」を開きます`); setTimeout(() => location.reload(), 180);
  }
  function newProject() { const title = window.prompt('新しいガントの名前', '新しいガント'); if (title === null) return; persistAndReload(createBlankProject(title), '新しいガントを作成しました'); }
  function duplicateProject(projectId) { syncCurrentProject(); const source = getStoredProject(projectId); if (!source) return showToast('複製元が見つかりません。', true); const copy = deepCopy(source); copy.id = uid(); copy.title = `${source.title || '新しいガント'}（コピー）`; copy.createdAt = nowISO(); copy.updatedAt = nowISO(); persistAndReload(copy, 'プロジェクトを複製しました'); }
  function deleteProject(projectId) {
    syncCurrentProject(); const index = getIndex(); const project = getStoredProject(projectId); if (!project) return showToast('削除するプロジェクトが見つかりません。', true); if (!window.confirm(`「${project.title}」をブラウザから削除しますか？\nJSONバックアップが必要な場合は、先に書き出してください。`)) return;
    localStorage.removeItem(`${PROJECT_PREFIX}${projectId}`); const remaining = index.filter((item) => item.id !== projectId); setIndex(remaining); const activeId = getActiveId();
    if (projectId !== activeId) { renderProjects(); showToast('プロジェクトを削除しました'); return; }
    const next = remaining.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    if (next) { const nextProject = getStoredProject(next.id); localStorage.setItem(ACTIVE_KEY, next.id); writeJSON(LEGACY_KEY, nextProject); showToast('プロジェクトを削除しました'); setTimeout(() => location.reload(), 180); }
    else { persistAndReload(createBlankProject('新しいガント'), '最後のプロジェクトを削除したため、新しいガントを作成しました'); }
  }

  function addCategory() { const input = $('#new-category-input'); const category = normalizeCategory(input?.value); if (!input?.value.trim()) return showToast('追加するカテゴリ名を入力してください。', true); mutateActiveProject((project) => { if ((project.categories || []).map(normalizeCategory).includes(category)) throw new Error('同じカテゴリ名がすでにあります。'); project.categories.push(category); }, `「${category}」を追加しました`); }
  function renameCategory(oldName) { const input = document.querySelector(`[data-category-rename-input="${CSS.escape(oldName)}"]`); const nextName = normalizeCategory(input?.value); if (nextName === oldName) return showToast('名前は変更されていません。', true); mutateActiveProject((project) => { const all = (project.categories || []).map(normalizeCategory); if (all.includes(nextName)) throw new Error('同じカテゴリ名がすでにあります。'); project.categories = all.map((category) => category === oldName ? nextName : category); project.tasks.forEach((task) => { if (normalizeCategory(task.category) === oldName) task.category = nextName; }); }, `「${oldName}」を「${nextName}」に変更しました`); }
  function deleteCategory(name) { const target = document.querySelector(`[data-category-target="${CSS.escape(name)}"]`)?.value || '未分類'; if (!window.confirm(`カテゴリ「${name}」を削除し、タスクを「${target}」へ移動しますか？`)) return; mutateActiveProject((project) => { project.categories = (project.categories || []).map(normalizeCategory).filter((category) => category !== name); project.tasks.forEach((task) => { if (normalizeCategory(task.category) === name) task.category = target; }); }, `「${name}」を削除し、タスクを「${target}」へ移動しました`); }
  function bulkApplyCategory() { const target = $('#bulk-category-select')?.value; if (!target) return showToast('変更先のカテゴリを選んでください。', true); const ids = [...state.selectedTaskIds]; if (!ids.length) return showToast('変更するタスクを選んでください。', true); mutateActiveProject((project) => { project.tasks.forEach((task) => { if (ids.includes(task.id)) task.category = target; }); }, `${ids.length}件のカテゴリを「${target}」へ変更しました`); }

  function handleModalClick(event) {
    if (event.target.closest('[data-library-close]')) return closeModal();
    const tab = event.target.closest('[data-library-tab]'); if (tab) return switchTab(tab.dataset.libraryTab);
    const projectAction = event.target.closest('[data-project-action]'); if (projectAction) { const id = projectAction.dataset.projectId; if (projectAction.dataset.projectAction === 'open') return openProject(id); if (projectAction.dataset.projectAction === 'duplicate') return duplicateProject(id); if (projectAction.dataset.projectAction === 'delete') return deleteProject(id); }
    if (event.target.closest('#new-project-btn')) return newProject();
    if (event.target.closest('#add-category-btn')) { try { addCategory(); } catch (error) { showToast(error.message, true); } return; }
    const categoryAction = event.target.closest('[data-category-action]'); if (categoryAction) { try { if (categoryAction.dataset.categoryAction === 'rename') renameCategory(categoryAction.dataset.category); if (categoryAction.dataset.categoryAction === 'delete') deleteCategory(categoryAction.dataset.category); } catch (error) { showToast(error.message, true); } return; }
    if (event.target.closest('#bulk-select-all-btn')) { const project = getStoredProject(getActiveId()); state.selectedTaskIds = new Set((project?.tasks || []).map((task) => task.id)); renderCategories(); return; }
    if (event.target.closest('#bulk-clear-btn')) { state.selectedTaskIds.clear(); renderCategories(); return; }
    if (event.target.closest('#bulk-apply-btn')) { try { bulkApplyCategory(); } catch (error) { showToast(error.message, true); } }
  }
  function handleModalChange(event) { const checkbox = event.target.closest('[data-bulk-task-id]'); if (!checkbox) return; if (checkbox.checked) state.selectedTaskIds.add(checkbox.dataset.bulkTaskId); else state.selectedTaskIds.delete(checkbox.dataset.bulkTaskId); const count = $('#bulk-selected-count'); if (count) count.textContent = `${state.selectedTaskIds.size}件を選択中`; }

  function bindEvents() {
    $('#library-open-btn').addEventListener('click', () => openModal('projects')); $('#library-close-btn').addEventListener('click', closeModal); $('#library-modal').addEventListener('click', handleModalClick); $('#library-modal').addEventListener('change', handleModalChange);
    window.addEventListener('pagehide', syncCurrentProject); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') syncCurrentProject(); });
    state.syncTimer = window.setInterval(syncCurrentProject, 900);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#library-modal').hidden) closeModal(); });
  }
  function initialize() { addStyles(); createUI(); bindEvents(); syncCurrentProject(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize); else initialize();
})();
