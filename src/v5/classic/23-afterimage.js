// 変化は、残像で語る。動いた予定に、前の姿を点線で重ね、動いた日数の付箋を出す。
// 取り込みの差分(移動・追加)は、確認が済むまで消さずに残す。
(() => {
  const AFTERIMAGE_VERSION = '20260921-afterimage1';
  const MAX = 60; // ponytail: 60件までの粗い上限。まとめて動かす件数が増えたら、画面内の行だけに絞る
  const FADE_MS = 1300;

  const present = () => document.body.classList.contains('is-present-mode');
  const macro = () => Boolean(document.querySelector('.workspace.mode-macro'));

  // 予定の位置と幅(px)。節目はひし形の中心に13px
  function geometry(task, view) {
    const dayWidth = Number(view.dayWidth) || 12;
    const left = diffDays(view.start, task.start) * dayWidth;
    if (task.milestone) return { left: left + Math.max(3, dayWidth / 2) - 6.5, width: 13 };
    return { left, width: Math.max(6, inclusiveDays(task.start, task.end) * dayWidth) };
  }

  function deltaText(prev, task) {
    const startDelta = diffDays(prev.start, task.start);
    const endDelta = diffDays(prev.end, task.end);
    const sign = (n) => (n > 0 ? `+${n}` : String(n));
    if (startDelta === endDelta) return `${sign(startDelta)}日`;
    return `期間 ${sign(endDelta - startDelta)}日`;
  }

  // 付箋は新しい位置の左に置く。左が狭ければ右
  function placeBadge(row, className, text, geo, totalWidth) {
    const chip = document.createElement('span');
    chip.className = className;
    chip.textContent = text;
    if (geo.left >= 72) chip.style.right = `${totalWidth - geo.left + 8}px`;
    else chip.style.left = `${geo.left + geo.width + 8}px`;
    row.append(chip);
    return chip;
  }

  function place(id, prev, { persist }) {
    const task = state.project.tasks.find((item) => item.id === id);
    const row = document.querySelector(`[data-timeline-row="${CSS.escape(id)}"]`);
    if (!task || !row) return;
    const view = state.project.viewSettings;
    const before = geometry({ ...task, start: prev.start, end: prev.end }, view);
    const after = geometry(task, view);
    const totalWidth = row.offsetWidth;
    const ghost = document.createElement('i');
    ghost.className = 'ux-afterimage';
    Object.assign(ghost.style, { left: `${before.left}px`, width: `${before.width}px` });
    row.append(ghost);
    const chip = placeBadge(row, 'ux-delta-chip', deltaText(prev, task), after, totalWidth);
    if (persist) {
      ghost.classList.add('is-static');
      chip.classList.add('is-static');
      return;
    }
    setTimeout(() => { ghost.remove(); chip.remove(); }, FADE_MS);
  }

  function markNew(id) {
    const task = state.project.tasks.find((item) => item.id === id);
    const row = document.querySelector(`[data-timeline-row="${CSS.escape(id)}"]`);
    if (!task || !row) return;
    row.querySelector('[data-timeline-task]')?.classList.add('is-new');
    const badge = placeBadge(row, 'ux-new-badge', '新規', geometry(task, state.project.viewSettings), row.offsetWidth);
    badge.classList.add('is-static');
  }

  // 編集・Undo・Redo・ドラッグ: 同じidで start か end が変わった予定
  document.addEventListener('gantt-desk:v5-change', (event) => {
    const { reason = '', before } = event.detail || {};
    if (reason.startsWith('import-') || !Array.isArray(before) || present() || macro()) return;
    const beforeById = new Map(before.map((task) => [task.id, task]));
    const changed = [];
    for (const task of state.project.tasks) {
      const prev = beforeById.get(task.id);
      if (prev && (prev.start !== task.start || prev.end !== task.end)) changed.push([task.id, prev]);
      if (changed.length >= MAX) break;
    }
    if (!changed.length) return;
    requestAnimationFrame(() => changed.forEach(([id, prev]) => place(id, prev, { persist: false })));
  });

  // 取り込みの差分は、描き直すたびに置き直す(次の取り込み・✕・Undo/Redo で消える)
  function placeImportMarks() {
    const diff = state.ui.importDiff;
    if (!diff || present() || macro()) return;
    diff.moved.forEach((prev, id) => place(id, prev, { persist: true }));
    diff.added.forEach((id) => markNew(id));
  }

  renderWorkspace = ((baseRenderWorkspace) => function afterimageRenderWorkspace() {
    baseRenderWorkspace();
    placeImportMarks();
  })(renderWorkspace);

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-diff-action]')?.dataset.diffAction;
    if (!action) return;
    event.preventDefault();
    const diff = state.ui.importDiff;
    if (action === 'only' && diff) state.ui.changedIds = state.ui.changedIds ? null : new Set([...diff.moved.keys(), ...diff.added]);
    else if (action === 'dismiss') { state.ui.importDiff = null; state.ui.changedIds = null; }
    renderToolbarState();
    renderWorkspace();
  });

  document.body.dataset.afterimageVersion = AFTERIMAGE_VERSION;
})();
