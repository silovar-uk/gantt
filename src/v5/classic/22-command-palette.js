// Ctrl+K の手帳。予定にも操作にも、数文字で着く。<dialog> の showModal() を使うので、
// Esc・背景・フォーカスの閉じ込めはブラウザに任せる。
(() => {
  const PALETTE_VERSION = '20260921-palette1';
  const TASK_MAX = 8;
  const EMPTY_TASK_MAX = 6;

  // 操作の実行は、既存のクリック処理を使う(新しい処理経路は作らない)
  // ponytail: 一時ボタンの合成クリック。操作が増えて見通しが悪くなったら、操作表を 10.js と共有する
  const ACTIONS = [
    { name: '予定を追加', icon: '＋', attr: ['data-action', 'add'] },
    { name: '今日へ移動', icon: '◷', key: 'T', attr: ['data-action', 'today'] },
    { name: '全体を表示', icon: '⤢', key: 'F', attr: ['data-action', 'fit'] },
    { name: '一覧で表示', icon: '☰', attr: ['data-mode', 'list'] },
    { name: '分割で表示', icon: '◫', attr: ['data-mode', 'split'], desktopOnly: true },
    { name: 'ガントで表示', icon: '▤', attr: ['data-mode', 'gantt'] },
    { name: '遅れだけ表示', icon: '!', attr: ['data-now-action', 'overdue'] },
    { name: 'Present', icon: '▶', attr: ['data-ux-action', 'present'] },
    { name: 'AI用JSONをコピー', icon: '⧉', attr: ['data-ux-action', 'copy-ai-json'] },
    { name: 'JSON・回答を取り込む', icon: '⇩', attr: ['data-action', 'import'] },
    { name: '書き出し・復元', icon: '⇧', attr: ['data-action', 'export'] },
    { name: '表示設定', icon: '⚙', attr: ['data-action', 'display-settings'] },
    { name: 'プロジェクト設定', icon: '⚙', attr: ['data-action', 'project-settings'] },
    { name: '操作のヒントを出す', icon: '?', attr: ['data-coach-action', 'reset'] },
  ];
  const TOP_ACTIONS = ['予定を追加', '今日へ移動', '全体を表示', '遅れだけ表示'];

  let dialog = null;
  let input = null;
  let list = null;
  let foot = null;
  let items = [];
  let active = 0;

  const isMac = () => /mac/i.test(navigator.platform || '');
  const escape = (value) => escapeHTML(value);
  const typing = (target) => target?.matches?.('input, textarea, select, [contenteditable="true"]');

  // 正規化(全角→半角・小文字)で照合し、一致範囲は元の文字列の位置へ戻して <mark> にする
  function highlight(text, query) {
    if (!query) return escape(text);
    const chars = [...text];
    let normalized = '';
    const map = [];
    chars.forEach((ch, index) => {
      const piece = ch.normalize('NFKC').toLocaleLowerCase('ja-JP');
      for (let i = 0; i < piece.length; i += 1) map.push(index);
      normalized += piece;
    });
    const at = normalized.indexOf(query);
    if (at < 0) return escape(text);
    const from = map[at];
    const to = map[at + query.length - 1] + 1;
    return `${escape(chars.slice(0, from).join(''))}<mark>${escape(chars.slice(from, to).join(''))}</mark>${escape(chars.slice(to).join(''))}`;
  }

  function taskRank(task, query, categories) {
    const name = normalizeSearch(task.name);
    if (name.startsWith(query)) return 0;
    if (name.includes(query)) return 1;
    if (normalizeSearch(taskCategoryName(task, categories)).includes(query)) return 2;
    if (normalizeSearch(task.note).includes(query)) return 3;
    return -1;
  }

  function findTasks(query) {
    const { tasks, categories } = state.project;
    const visible = tasks.filter((task) => !task.isHidden);
    if (!query) {
      const today = todayISO();
      const rank = { late: 0, active: 1 };
      return visible
        .filter((task) => taskState(task, today) in rank)
        .sort((a, b) => rank[taskState(a, today)] - rank[taskState(b, today)] || a.end.localeCompare(b.end))
        .slice(0, EMPTY_TASK_MAX)
        .map((task) => ({ task, rank: -1 }));
    }
    return visible
      .map((task) => ({ task, rank: taskRank(task, query, categories) }))
      .filter((hit) => hit.rank >= 0)
      .sort((a, b) => a.rank - b.rank || [...a.task.name].length - [...b.task.name].length || a.task.start.localeCompare(b.task.start))
      .slice(0, TASK_MAX);
  }

  function findActions(query) {
    const mobile = breakpoint() === 'mobile';
    return ACTIONS
      .filter((action) => !(mobile && action.desktopOnly))
      .filter((action) => (query ? normalizeSearch(action.name).includes(query) : TOP_ACTIONS.includes(action.name)));
  }

  function taskItemHTML(hit, query, index) {
    const { task } = hit;
    const color = taskColor(task, state.project.categories);
    const today = todayISO();
    const status = taskState(task, today);
    const range = task.milestone ? shortMD(task.start) : `${shortMD(task.start)}–${shortMD(task.end)}`;
    const notes = [];
    if (status === 'late') notes.push(`<span class="is-late">${diffDays(task.milestone ? task.start : task.end, today)}日遅れ</span>`);
    else if (task.milestone && task.isDeadline && status !== 'done') notes.push(`締切 あと${Math.max(0, diffDays(today, task.start))}日`);
    notes.push(escape(taskCategoryName(task, state.project.categories)));
    if (hit.rank === 3) notes.push(`メモに「${escape(query)}」`);
    const dot = task.milestone && task.isDeadline ? '<i class="pal-diamond"></i>' : '<i class="pal-dot"></i>';
    return `<button type="button" class="pal-item cat-${color}" role="option" data-pal-index="${index}" aria-selected="false">${dot}<span>${highlight(task.name, hit.rank <= 1 ? query : '')}</span><small>${range} · ${notes.join(' · ')}</small></button>`;
  }

  function actionItemHTML(action, index, query) {
    return `<button type="button" class="pal-item" role="option" data-pal-index="${index}" aria-selected="false"><span class="pal-icon" aria-hidden="true">${action.icon}</span><span>${highlight(action.name, query)}</span>${action.key ? `<kbd>${action.key}</kbd>` : '<small></small>'}</button>`;
  }

  function render() {
    const query = normalizeSearch(input.value);
    const tasks = findTasks(query);
    const actions = findActions(query);
    items = [];
    let html = '';
    if (tasks.length) {
      html += `<div class="pal-group" role="group" aria-label="予定"><h4>${query ? '予定' : '遅れ・進行中'}</h4>`;
      tasks.forEach((hit) => { html += taskItemHTML(hit, query, items.length); items.push({ type: 'task', id: hit.task.id }); });
      html += '</div>';
    }
    if (actions.length || query) {
      html += '<div class="pal-group" role="group" aria-label="操作"><h4>操作</h4>';
      if (query) {
        html += `<button type="button" class="pal-item" role="option" data-pal-index="${items.length}" aria-selected="false"><span class="pal-icon" aria-hidden="true">⌕</span><span>「${escape(input.value.trim())}」で絞り込む</span><small>Shift + Enter</small></button>`;
        items.push({ type: 'filter' });
      }
      actions.forEach((action) => { html += actionItemHTML(action, items.length, query); items.push({ type: 'action', action }); });
      html += '</div>';
    }
    if (!items.length) html = '<div class="pal-empty">見つかりません</div>';
    list.innerHTML = html;
    foot.querySelector('.count').textContent = `予定 ${tasks.length} · 操作 ${actions.length}`;
    setActive(0);
  }

  function setActive(index) {
    if (!items.length) { active = 0; return; }
    active = (index + items.length) % items.length;
    list.querySelectorAll('.pal-item').forEach((el) => {
      const on = Number(el.dataset.palIndex) === active;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', String(on));
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function fire([attr, value]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.hidden = true;
    button.setAttribute(attr, value);
    document.body.append(button);
    button.click();
    button.remove();
  }

  function goToTask(id) {
    const task = state.project.tasks.find((item) => item.id === id);
    if (!task) return;
    const view = state.project.viewSettings;
    if (!filteredTasks().some((item) => item.id === id)) clearFilters();
    if (view.overviewMacroMode) {
      // 1件ずつ見る(15-macro-overview の exitMacro と同じ)
      Object.assign(view, { overviewMacroMode: false, overviewAutoFit: false, rowHeight: Math.max(24, Number(view.preferredRowHeight) || 24) });
      state.storage.saveView(view);
    }
    taskSelection.selectOnly(id);
    renderWorkspace();
    revealTask(id);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const bar = document.querySelector(`[data-timeline-task="${CSS.escape(id)}"]`) || document.querySelector(`[data-task-row="${CSS.escape(id)}"]`);
      openTaskCard(id, bar || undefined);
    }));
  }

  function run(index, { filter = false } = {}) {
    const query = input.value.trim();
    const item = filter ? { type: 'filter' } : items[index];
    if (!item) return;
    dialog.close();
    if (item.type === 'task') goToTask(item.id);
    else if (item.type === 'action') fire(item.action.attr);
    else if (item.type === 'filter' && query) {
      state.ui.search = query;
      const box = document.querySelector('#search-input');
      if (box) box.value = query;
      renderToolbarState();
      renderWorkspace();
    }
  }

  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'command-palette';
    dialog.setAttribute('aria-label', '予定・操作を探す');
    dialog.innerHTML = `
      <div class="palette-input">${globalThis.ganttIcon ? ganttIcon('search') : ''}<input type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" autocomplete="off" spellcheck="false" placeholder="予定・操作を探す" aria-label="予定・操作を探す"><kbd>Esc</kbd></div>
      <div id="palette-list" class="palette-list" role="listbox"></div>
      <div class="pal-foot"><span>↑↓ 選ぶ</span><span>Enter 開く</span><span>Esc 閉じる</span><span class="count"></span></div>`;
    document.body.append(dialog);
    input = dialog.querySelector('input');
    list = dialog.querySelector('.palette-list');
    foot = dialog.querySelector('.pal-foot');

    input.addEventListener('input', render);
    input.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return; // 日本語入力の変換確定のEnterで実行しない
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(active + 1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(active - 1); }
      else if (event.key === 'Enter') { event.preventDefault(); run(active, { filter: event.shiftKey }); }
    });
    list.addEventListener('pointermove', (event) => {
      const el = event.target.closest('.pal-item');
      if (el && Number(el.dataset.palIndex) !== active) setActive(Number(el.dataset.palIndex));
    });
    list.addEventListener('click', (event) => {
      const el = event.target.closest('.pal-item');
      if (el) run(Number(el.dataset.palIndex));
    });
    // 背景を押したら閉じる
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  }

  function openPalette() {
    if (!state?.project || state.modal || document.body.classList.contains('is-present-mode')) return;
    ensureDialog();
    if (dialog.open) return;
    closeMenus();
    input.value = '';
    dialog.showModal();
    render();
    input.focus();
  }

  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && key === 'k') {
      event.preventDefault();
      openPalette();
    } else if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !typing(event.target)) {
      event.preventDefault();
      openPalette();
    }
  }, true);

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-palette-open]')) return;
    event.preventDefault();
    openPalette();
  });

  function boot() {
    document.body.dataset.paletteVersion = PALETTE_VERSION;
    document.querySelectorAll('.palette-key kbd').forEach((kbd) => { kbd.textContent = isMac() ? '⌘K' : 'Ctrl K'; });
  }

  boot();
  // 検索欄の Ctrl K の表示は、描き直しで戻らないが、念のため一度だけ遅れて整える
  setTimeout(boot, 300);
})();
