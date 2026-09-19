(() => {
  const LENS_VERSION = '20260914-lens1';
  let lensAnchor = null;
  let lensKind = '';
  let lensId = '';

  function currentView() {
    return state?.project?.viewSettings || null;
  }

  function macroActive() {
    return currentView()?.overviewMacroMode === true && !!document.querySelector('.workspace.mode-macro');
  }

  function ensureLens() {
    let lens = document.querySelector('#macro-detail-lens');
    if (lens) return lens;
    lens = document.createElement('aside');
    lens.id = 'macro-detail-lens';
    lens.className = 'macro-detail-lens';
    lens.hidden = true;
    lens.setAttribute('role', 'dialog');
    lens.setAttribute('aria-modal', 'false');
    lens.setAttribute('aria-label', '俯瞰の詳細');
    lens.innerHTML = '<div class="macro-lens-shell"></div>';
    document.body.append(lens);
    return lens;
  }

  function clearFocusState() {
    document.querySelectorAll('.is-lens-focus').forEach((element) => element.classList.remove('is-lens-focus'));
  }

  function closeLens({ returnFocus = false } = {}) {
    const lens = ensureLens();
    const anchor = lensAnchor;
    lens.hidden = true;
    lensKind = '';
    lensId = '';
    lensAnchor = null;
    clearFocusState();
    if (returnFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
  }

  function categoryForTask(task) {
    return state.project.categories.find((category) => category.id === task.categoryId) || null;
  }

  function durationLabel(task) {
    if (task.milestone) return 'マイルストーン';
    const days = inclusiveDays(task.start, task.end);
    return `${days}日間`;
  }

  function taskStatus(task) {
    if (task.completed) return '完了';
    if (task.deadline) return '締切';
    if (task.milestone) return '節目';
    return '予定';
  }

  function compactText(value, max = 180) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function lensTaskHTML(task) {
    const category = categoryForTask(task);
    const note = compactText(task.note);
    return `
      <div class="macro-lens-eyebrow">FOCUS · TASK</div>
      <div class="macro-lens-title-row">
        <span class="category-dot color-${category?.color || 'gray'}"></span>
        <h3>${escapeHTML(task.name)}</h3>
        <button class="macro-lens-close" type="button" data-lens-action="close" aria-label="閉じる">×</button>
      </div>
      <div class="macro-lens-meta">
        <span>${escapeHTML(category?.name || '未分類')}</span>
        <span>${escapeHTML(taskStatus(task))}</span>
        <span>${escapeHTML(durationLabel(task))}</span>
      </div>
      <div class="macro-lens-period">
        <strong>${escapeHTML(task.start)}</strong>
        <span>→</span>
        <strong>${escapeHTML(task.end)}</strong>
      </div>
      ${note ? `<p class="macro-lens-note">${escapeHTML(note)}</p>` : ''}
      <div class="macro-lens-actions">
        <button class="button button-primary" type="button" data-lens-action="task-row" data-lens-task="${task.id}">行表示で開く</button>
        <button class="button button-secondary" type="button" data-lens-action="task-details" data-lens-task="${task.id}">詳細</button>
      </div>`;
  }

  function categoryStats(categoryId) {
    const tasks = filteredTasks().filter((task) => task.categoryId === categoryId);
    const starts = tasks.map((task) => task.start).filter(Boolean).sort();
    const ends = tasks.map((task) => task.end).filter(Boolean).sort();
    const completed = tasks.filter((task) => task.completed).length;
    const milestones = tasks.filter((task) => task.milestone).length;
    return {
      tasks,
      completed,
      milestones,
      start: starts[0] || '',
      end: ends.at(-1) || '',
    };
  }

  function lensCategoryHTML(category) {
    const stats = categoryStats(category.id);
    const examples = stats.tasks.slice(0, 4).map((task) => `<li>${escapeHTML(task.name)}</li>`).join('');
    return `
      <div class="macro-lens-eyebrow">FOCUS · CATEGORY</div>
      <div class="macro-lens-title-row">
        <span class="category-dot color-${category.color}"></span>
        <h3>${escapeHTML(category.name)}</h3>
        <button class="macro-lens-close" type="button" data-lens-action="close" aria-label="閉じる">×</button>
      </div>
      <div class="macro-lens-meta">
        <span>${stats.tasks.length}件</span>
        <span>完了 ${stats.completed}</span>
        ${stats.milestones ? `<span>節目 ${stats.milestones}</span>` : ''}
      </div>
      ${stats.start ? `<div class="macro-lens-period"><strong>${escapeHTML(stats.start)}</strong><span>→</span><strong>${escapeHTML(stats.end)}</strong></div>` : ''}
      ${examples ? `<ul class="macro-lens-list">${examples}</ul>` : ''}
      <div class="macro-lens-actions">
        <button class="button button-primary" type="button" data-lens-action="category-focus" data-lens-category="${category.id}">このカテゴリを詳しく見る</button>
      </div>`;
  }

  function positionLens(anchor) {
    const lens = ensureLens();
    if (!anchor?.isConnected || lens.hidden) return;
    const anchorRect = anchor.getBoundingClientRect();
    const lensRect = lens.getBoundingClientRect();
    const gap = 10;
    const margin = 10;
    let left = anchorRect.right + gap;
    if (left + lensRect.width > innerWidth - margin) left = anchorRect.left - lensRect.width - gap;
    left = Math.max(margin, Math.min(left, innerWidth - lensRect.width - margin));
    let top = anchorRect.top + anchorRect.height / 2 - lensRect.height / 2;
    top = Math.max(margin, Math.min(top, innerHeight - lensRect.height - margin));
    lens.style.left = `${Math.round(left)}px`;
    lens.style.top = `${Math.round(top)}px`;
  }

  function showLens({ kind, id, anchor, keyboard = false }) {
    if (!macroActive()) return;
    const lens = ensureLens();
    clearFocusState();
    lensKind = kind;
    lensId = id;
    lensAnchor = anchor;

    if (kind === 'task') {
      const task = state.project.tasks.find((item) => item.id === id);
      if (!task) return;
      lens.querySelector('.macro-lens-shell').innerHTML = lensTaskHTML(task);
      anchor.classList.add('is-lens-focus');
    } else {
      const category = state.project.categories.find((item) => item.id === id);
      if (!category) return;
      lens.querySelector('.macro-lens-shell').innerHTML = lensCategoryHTML(category);
      anchor.classList.add('is-lens-focus');
      document.querySelector(`[data-macro-category="${CSS.escape(id)}"]`)?.classList.add('is-lens-focus');
    }

    lens.dataset.lensKind = kind;
    lens.hidden = false;
    requestAnimationFrame(() => {
      positionLens(anchor);
      if (keyboard) lens.querySelector('[data-lens-action]')?.focus({ preventScroll: true });
    });
  }

  function leaveMacro({ taskId = '', categoryId = '' } = {}) {
    const view = currentView();
    if (!view) return;
    closeLens();
    view.overviewMacroMode = false;
    view.overviewAutoFit = false;
    view.rowHeight = Math.max(24, Number(view.preferredRowHeight) || 24);
    state.storage.saveView(view);
    if (categoryId) state.ui.categoryIds = new Set([categoryId]);
    if (taskId) state.selectedTaskId = taskId;
    renderToolbarState();
    renderWorkspace();
    if (taskId) revealTask(taskId);
  }

  function handleLensAction(target) {
    const action = target?.dataset.lensAction;
    if (!action) return false;
    if (action === 'close') {
      closeLens({ returnFocus: true });
      return true;
    }
    if (action === 'task-row') {
      leaveMacro({ taskId: target.dataset.lensTask });
      return true;
    }
    if (action === 'task-details') {
      const task = state.project.tasks.find((item) => item.id === target.dataset.lensTask);
      closeLens();
      if (task) openModal('details', { task });
      return true;
    }
    if (action === 'category-focus') {
      leaveMacro({ categoryId: target.dataset.lensCategory });
      return true;
    }
    return false;
  }

  window.addEventListener('click', (event) => {
    const lensAction = event.target.closest('[data-lens-action]');
    if (lensAction) {
      event.preventDefault();
      event.stopImmediatePropagation();
      handleLensAction(lensAction);
      return;
    }
    if (!macroActive()) return;
    const taskTarget = event.target.closest('[data-macro-task]');
    if (taskTarget) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showLens({ kind: 'task', id: taskTarget.dataset.macroTask, anchor: taskTarget, keyboard: event.detail === 0 });
      return;
    }
    const categoryTarget = event.target.closest('[data-macro-category-focus]');
    if (categoryTarget) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showLens({ kind: 'category', id: categoryTarget.dataset.macroCategoryFocus, anchor: categoryTarget, keyboard: event.detail === 0 });
      return;
    }
    if (!event.target.closest('#macro-detail-lens') && !ensureLens().hidden) closeLens();
  }, true);

  window.addEventListener('dblclick', (event) => {
    if (!macroActive()) return;
    const taskTarget = event.target.closest('[data-macro-task]');
    if (!taskTarget) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const task = state.project.tasks.find((item) => item.id === taskTarget.dataset.macroTask);
    closeLens();
    if (task) openModal('details', { task });
  }, true);

  window.addEventListener('keydown', (event) => {
    const lens = ensureLens();
    if (event.key === 'Escape' && !lens.hidden) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeLens({ returnFocus: true });
    }
  }, true);

  const previousRenderWorkspace = renderWorkspace;
  renderWorkspace = function detailLensRenderWorkspace() {
    if (!ensureLens().hidden) closeLens();
    previousRenderWorkspace();
  };

  addEventListener('resize', () => {
    if (!ensureLens().hidden) closeLens();
  });

  document.addEventListener('scroll', (event) => {
    if (ensureLens().hidden || !macroActive()) return;
    if (event.target.closest?.('#macro-detail-lens')) return;
    closeLens();
  }, true);

  function bootLens() {
    ensureLens();
    document.body.dataset.macroDetailLensVersion = LENS_VERSION;
  }

  bootLens();
})();
