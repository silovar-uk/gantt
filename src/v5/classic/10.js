function bindEvents() {
  document.addEventListener('click', async (event) => {
    const toggle = event.target.closest('[data-toggle-menu]');
    if (toggle) {
      event.stopPropagation();
      const id = toggle.dataset.toggleMenu;
      const panel = document.querySelector(`#${CSS.escape(id)}`);
      const next = panel?.hidden ?? true;
      closeMenus();
      if (panel) { panel.hidden = !next; toggle.setAttribute('aria-expanded', String(next)); }
      return;
    }
    if (!event.target.closest('.menu-wrap')) closeMenus();

    const scale = event.target.closest('[data-scale]')?.dataset.scale;
    if (scale) { setScale(scale); return; }
    const mode = event.target.closest('[data-mode]')?.dataset.mode;
    if (mode) { setMode(mode); return; }
    const shift = event.target.closest('[data-shift-range]')?.dataset.shiftRange;
    if (shift) { shiftRange(Number(shift)); return; }

    const timelineTask = event.target.closest('[data-timeline-task]')?.dataset.timelineTask;
    if (timelineTask) { state.selectedTaskId = timelineTask; renderWorkspace(); return; }
    const row = event.target.closest('[data-task-row]');
    if (row && !event.target.closest('input,button,select,textarea')) { state.selectedTaskId = row.dataset.taskRow; renderWorkspace(); return; }

    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === 'add') openModal('details');
    else if (action === 'undo') undo();
    else if (action === 'redo') redo();
    else if (action === 'filter') openModal('filter');
    else if (action === 'display-settings') openModal('display');
    else if (action === 'project-settings') openModal('project');
    else if (action === 'chat-input') openModal('chat-input');
    else if (action === 'chat-output') openModal('chat-output');
    else if (action === 'import') openModal('import');
    else if (action === 'export') openModal('export');
    else if (action === 'pending') openModal('pending');
    else if (action === 'today') scrollToday();
    else if (action === 'fit') fitAll();
    else if (action === 'clear-filters') clearFilters();
    else if (action === 'details') { state.selectedTaskId = actionEl.dataset.taskId; openModal('details', { task: selectedTask() }); }
    else if (action === 'close-modal') closeModal();
    else if (action === 'save-task') saveEditor();
    else if (action === 'move-period') { const task = state.project.tasks.find((item) => item.id === actionEl.dataset.taskId); if (task) openModal('move', { task }); }
    else if (action === 'back-details') { const task = state.project.tasks.find((item) => item.id === state.moveDraft?.taskId); state.modal = 'details'; prepareEditor(task); renderModal(); }
    else if (action === 'apply-move') {
      const task = state.project.tasks.find((item) => item.id === state.moveDraft?.taskId);
      const start = document.querySelector('#move-start')?.value;
      if (!task || !parseISO(start)) return;
      const days = inclusiveDays(task.start, task.end);
      const end = addDays(start, days - 1);
      contentCommit((project) => { const target = project.tasks.find((item) => item.id === task.id); target.start = start; target.end = end; }, { reason: 'move-period', message: '期間を移動しました' });
      state.modal = 'details'; prepareEditor(state.project.tasks.find((item) => item.id === task.id)); renderModal();
    }
    else if (action === 'apply-display-settings') {
      const start = document.querySelector('#setting-view-start')?.value;
      const end = document.querySelector('#setting-view-end')?.value;
      const error = document.querySelector('#display-error');
      if (!parseISO(start) || !parseISO(end) || start > end) { error.hidden = false; error.textContent = '終了日は開始日以降にしてください。'; return; }
      const span = inclusiveDays(start, end);
      if (span > 730) { error.hidden = false; error.textContent = '一度に表示できる期間は730日までです。'; return; }
      setView({ start, end, listWidth: clamp(document.querySelector('#setting-list-width').value, 360, 640), rowHeight: clamp(document.querySelector('#setting-row-height').value, 36, 64), textSize: clamp(document.querySelector('#setting-text-size').value, 12, 18), dayWidth: clamp(document.querySelector('#setting-day-width').value, 2, 32) });
      closeModal({ force: true });
    }
    else if (action === 'build-input-prompt') {
      const d = state.inputDraft;
      d.sourceText = document.querySelector('#input-source')?.value || '';
      d.targetYear = document.querySelector('#input-year')?.value.trim() || '';
      d.baseDate = document.querySelector('#input-base-date')?.value || '';
      d.category = document.querySelector('#input-category')?.value.trim() || '';
      if (!d.sourceText.trim()) { showToast('元の文章を入力してください。', true); return; }
      if (d.manual && d.prompt && !confirm('手編集した指示文を再作成して置き換えますか？')) return;
      d.prompt = buildInputPrompt(d); d.manual = false; persistInputDraft(); renderModal();
    }
    else if (action === 'copy-input-prompt') { await copyText(state.inputDraft.prompt, '#input-prompt'); if (state.inputDraft.prompt) showToast('全文をコピーしました'); }
    else if (action === 'open-input-chatgpt') { await openChatGPT(state.inputDraft.prompt, '#input-prompt'); showToast('ChatGPTを開く操作を行いました'); }
    else if (action === 'paste-answer') { state.inputDraft.answer = state.inputDraft.answer || ''; persistInputDraft(); openModal('import', { prefill: state.inputDraft.answer }); }
    else if (action === 'new-input-draft') {
      if ((state.inputDraft.sourceText || state.inputDraft.prompt) && !confirm('前回の下書きを破棄して新しく作成しますか？')) return;
      state.inputDraft = { sourceText: '', targetYear: '', baseDate: '', category: '', prompt: '', manual: false, answer: '', completed: false }; persistInputDraft(); renderModal();
    }
    else if (action === 'refresh-output') { prepareOutputSession(); renderModal(); }
    else if (action === 'copy-output-prompt') { await copyText(state.outputSession.prompt, '#output-prompt'); showToast('全文をコピーしました'); }
    else if (action === 'open-output-chatgpt') { await openChatGPT(state.outputSession.prompt, '#output-prompt'); showToast('ChatGPTを開く操作を行いました'); }
    else if (action === 'validate-import') { state.importRaw = document.querySelector('#import-input')?.value || ''; if (state.inputDraft) { state.inputDraft.answer = state.importRaw; persistInputDraft(); } validateImport(); }
    else if (action === 'apply-import') applyImport();
    else if (action === 'register-pending') registerPending(actionEl.dataset.pendingId);
    else if (action === 'delete-pending') {
      const id = actionEl.dataset.pendingId; if (!confirm('この保留項目を削除しますか？')) return;
      contentCommit((project) => { project.pendingItems = project.pendingItems.filter((item) => item.id !== id); }, { reason: 'delete-pending', message: '保留項目を削除しました' });
      state.modal = 'pending'; renderModal();
    }
    else if (action === 'save-project-settings') saveProjectSettings();
    else if (action === 'add-category') addCategory();
    else if (action === 'delete-category') deleteCategory(actionEl.dataset.categoryId);
    else if (action === 'download-backup' || action === 'download-current') {
      const blob = new Blob([JSON.stringify(backupObject(), null, 2)], { type: 'application/json;charset=utf-8' });
      downloadBlob(blob, `${safeFileName(state.project.title)}-${fileStamp()}-backup.json`);
      showToast('バックアップのダウンロードを開始しました');
    }
    else if (action === 'copy-backup') { await copyText(JSON.stringify(backupObject(), null, 2)); showToast('バックアップJSONをコピーしました'); }
    else if (action === 'copy-tsv') { const o = currentExportOptions(); await copyText(tsvText(o.tasks, o.includeNotes)); showToast(`${o.tasks.length}件のTSVをコピーしました`); }
    else if (action === 'download-tsv') { const o = currentExportOptions(); downloadBlob(new Blob([`\ufeff${tsvText(o.tasks, o.includeNotes)}`], { type: 'text/tab-separated-values;charset=utf-8' }), `${safeFileName(state.project.title)}-${fileStamp()}.tsv`); }
    else if (action === 'download-xlsx') { const o = currentExportOptions(); downloadBlob(makeXlsxBlob({ sheetName: '予定', rows: tsvRows(o.tasks, o.includeNotes) }), `${safeFileName(state.project.title)}-${fileStamp()}.xlsx`); }
    else if (action === 'reload-saved') {
      if (!confirm('このタブの未保存内容を破棄して、保存済みの内容へ切り替えますか？必要なら先にダウンロードしてください。')) return;
      try { state.project = await state.storage.reloadSaved(); state.conflict = false; state.history = []; state.future = []; state.selectedTaskId = null; state.saveStatus = 'saved'; renderAll(); }
      catch (error) { showToast(error.message || '読み込みに失敗しました。', true); }
    }
    else if (action === 'save-status') { if (state.saveStatus === 'error' || state.saveStatus === 'conflict') openModal('export'); }
    else if (action === 'sample') loadSample();
  });

  document.addEventListener('input', (event) => {
    if (event.target.id === 'search-input') {
      state.ui.search = event.target.value;
      renderConditionBar(); renderWorkspace(); return;
    }
    if (state.modal === 'details' && event.target.closest('#task-form')) state.editor.dirty = true;
    if (state.modal === 'chat-input') {
      if (event.target.id === 'input-source') state.inputDraft.sourceText = event.target.value;
      else if (event.target.id === 'input-year') state.inputDraft.targetYear = event.target.value;
      else if (event.target.id === 'input-base-date') state.inputDraft.baseDate = event.target.value;
      else if (event.target.id === 'input-category') state.inputDraft.category = event.target.value;
      else if (event.target.id === 'input-prompt') { state.inputDraft.prompt = event.target.value; state.inputDraft.manual = true; }
      persistInputDraft();
    }
    if (state.modal === 'import' && event.target.id === 'import-input') state.importRaw = event.target.value;
    if (state.modal === 'move' && event.target.id === 'move-start') {
      state.moveDraft.start = event.target.value;
      const task = state.project.tasks.find((item) => item.id === state.moveDraft.taskId);
      if (task && parseISO(event.target.value)) {
        const days = inclusiveDays(task.start, task.end);
        const preview = document.querySelector('#move-preview');
        if (preview) preview.textContent = `${formatDate(event.target.value, true)} 〜 ${formatDate(addDays(event.target.value, days - 1), true)}（${days}日）`;
      }
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-task-complete]')) {
      const id = event.target.dataset.taskComplete;
      contentCommit((project) => { project.tasks.find((task) => task.id === id).completed = event.target.checked; }, { reason: 'complete' }); return;
    }
    if (event.target.matches('[data-inline-start]')) { updateInlineDate(event.target, 'start'); return; }
    if (event.target.matches('[data-inline-end]')) { updateInlineDate(event.target, 'end'); return; }
    if (event.target.name === 'type' && state.modal === 'details') {
      const current = readEditorForm();
      if (!current) return;
      if (event.target.value === 'milestone') { current.milestone = true; current.start = state.editor.original?.end || current.end || current.start; current.end = current.start; }
      else { current.milestone = false; current.end = current.end || current.start; }
      state.editor.task = current; state.editor.dirty = true; renderModal(); return;
    }
    if (event.target.matches('[data-filter]')) { state.ui[event.target.dataset.filter] = event.target.checked; renderToolbarState(); renderWorkspace(); return; }
    if (event.target.matches('[data-filter-category]')) { const id = event.target.dataset.filterCategory; if (event.target.checked) state.ui.categoryIds.add(id); else state.ui.categoryIds.delete(id); renderToolbarState(); renderWorkspace(); return; }
    if (event.target.name === 'sort') { state.ui.sort = event.target.value; renderToolbarState(); renderWorkspace(); return; }
    if (state.modal === 'chat-output') {
      if (event.target.name === 'output-target') state.outputSession.target = event.target.value;
      if (event.target.name === 'output-purpose') state.outputSession.purpose = event.target.value;
      if (event.target.id === 'output-pending') state.outputSession.includePending = event.target.checked;
      if (event.target.id === 'output-project-memo') state.outputSession.includeProjectMemo = event.target.checked;
      if (event.target.id === 'output-task-memo') state.outputSession.includeTaskMemo = event.target.checked;
      refreshOutputPrompt(); renderModal();
    }
  });

  document.addEventListener('focusin', (event) => {
    const row = event.target.closest('[data-task-row]');
    if (row) state.selectedTaskId = row.dataset.taskRow;
  });

  document.addEventListener('focusout', (event) => {
    if (event.target.matches('[data-inline-name]')) updateInlineName(event.target);
  });

  document.addEventListener('keydown', (event) => {
    const isMac = navigator.platform?.toLowerCase().includes('mac');
    const meta = isMac ? event.metaKey : event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'z' && !event.target.matches('input,textarea,[contenteditable="true"]')) {
      event.preventDefault(); event.shiftKey ? redo() : undo(); return;
    }
    if (!isMac && event.ctrlKey && event.key.toLowerCase() === 'y' && !event.target.matches('input,textarea,[contenteditable="true"]')) { event.preventDefault(); redo(); return; }
    if (event.key === 'Escape' && state.modal) { closeModal(); return; }
    if (event.target.matches('[data-inline-name]') && event.key === 'Enter' && !event.isComposing) { event.preventDefault(); event.target.blur(); return; }
    if (event.target.matches('[data-inline-name]') && event.key === 'Escape') { const task = state.project.tasks.find((item) => item.id === event.target.dataset.inlineName); event.target.value = task?.name || ''; event.target.blur(); return; }
    const row = event.target.closest('.task-row');
    if (row && event.target === row) {
      const tasks = filteredTasks(); const index = tasks.findIndex((t) => t.id === row.dataset.taskRow);
      if (event.key === 'Enter') { event.preventDefault(); state.selectedTaskId = row.dataset.taskRow; openModal('details', { task: selectedTask() }); }
      else if (event.key === 'Delete') { event.preventDefault(); const task = state.project.tasks.find((t) => t.id === row.dataset.taskRow); if (task && confirm(`「${task.name}」を削除しますか？`)) contentCommit((project) => { project.tasks = project.tasks.filter((t) => t.id !== task.id); }, { reason: 'delete-task', message: '予定を削除しました。元に戻せます。' }); }
      else if (event.key === 'ArrowDown' && index < tasks.length - 1) { event.preventDefault(); document.querySelector(`[data-task-row="${CSS.escape(tasks[index + 1].id)}"]`)?.focus(); }
      else if (event.key === 'ArrowUp' && index > 0) { event.preventDefault(); document.querySelector(`[data-task-row="${CSS.escape(tasks[index - 1].id)}"]`)?.focus(); }
    }
  });

  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { renderToolbarState(); renderWorkspace(); }, 120);
  });

  addEventListener('beforeunload', (event) => {
    if (state.saveStatus === 'error' || state.saveStatus === 'saving') { event.preventDefault(); event.returnValue = ''; }
  });
}

async function init() {
  app.innerHTML = shellHTML();
  bindEvents();
  state.storage = new ProjectStorage({
    onExternalUpdate: ({ revision }) => {
      if (revision > Number(state.storage.savedRevision || 0) || revision > Number(state.project?.revision || 0)) {
        state.conflict = true;
        state.saveStatus = 'conflict';
        renderAll();
      }
    },
  });
  try {
    const loaded = await state.storage.init();
    state.project = loaded.project;
    state.migration = loaded.migration;
    state.saveStatus = 'saved';
  } catch (error) {
    state.project = createEmptyProject();
    state.saveStatus = 'error';
    state.saveError = error.message || String(error);
  }
  renderAll();
  renderMigrationNotice();
}

init();
