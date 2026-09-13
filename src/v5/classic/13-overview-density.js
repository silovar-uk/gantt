(() => {
  const DENSITY_VERSION = '20260913-density1';
  const MIGRATION_KEY = `gantt-desk:${DENSITY_VERSION}:defaults`;
  const ROW_MIN = 24;
  const ROW_MAX = 56;
  const TEXT_MIN = 10;
  const TEXT_MAX = 16;
  const LIST_MIN = 200;
  const LIST_MAX = 520;
  let resizeFitTimer = null;

  function densityClamp(value, min, max, fallback = min) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function scaleForWidth(dayWidth) {
    if (dayWidth >= 18) return 'day';
    if (dayWidth >= 6) return 'week';
    return 'month';
  }

  function currentView() {
    return state?.project?.viewSettings || null;
  }

  function rememberViewPatch(patch) {
    const view = currentView();
    if (!view) return;
    Object.assign(view, patch, { overviewAutoFit: false });
    state.storage?.saveView(view);
  }

  function densityValues() {
    const view = currentView();
    return {
      rowHeight: densityClamp(view?.rowHeight, ROW_MIN, ROW_MAX, 28),
      textSize: densityClamp(view?.textSize, TEXT_MIN, TEXT_MAX, 11),
    };
  }

  function semanticZoom(dayWidth) {
    if (dayWidth < 5) return 'macro';
    if (dayWidth < 13) return 'medium';
    return 'detail';
  }

  function applyDensityToDom() {
    const view = currentView();
    const workspace = document.querySelector('#workspace');
    if (!view || !workspace) return;
    const rowHeight = densityClamp(view.rowHeight, ROW_MIN, ROW_MAX, 28);
    const textSize = densityClamp(view.textSize, TEXT_MIN, TEXT_MAX, 11);
    const dayWidth = densityClamp(view.dayWidth, 2, 40, 12);
    workspace.style.setProperty('--row-height', `${rowHeight}px`);
    workspace.style.setProperty('--text-size', `${textSize}px`);
    workspace.classList.toggle('ux-auto-hide-category', view.autoHideCategory === true);
    workspace.dataset.semanticZoom = semanticZoom(dayWidth);
    const inner = workspace.querySelector('.timeline-inner');
    if (inner) {
      inner.style.setProperty('--row-height', `${rowHeight}px`);
      inner.style.setProperty('--day-width', `${dayWidth}px`);
    }
  }

  function syncDensityControls() {
    const view = currentView();
    if (!view) return;
    const row = document.querySelector('#ux-row-height');
    const text = document.querySelector('#ux-text-size');
    const rowValue = densityClamp(view.rowHeight, ROW_MIN, ROW_MAX, 28);
    const textValue = densityClamp(view.textSize, TEXT_MIN, TEXT_MAX, 11);
    if (row && document.activeElement !== row) row.value = String(rowValue);
    if (text && document.activeElement !== text) text.value = String(textValue);
    const rowOut = document.querySelector('#ux-row-height-value');
    const textOut = document.querySelector('#ux-text-size-value');
    if (rowOut) rowOut.textContent = String(rowValue);
    if (textOut) textOut.textContent = String(textValue);
    document.querySelector('#ux-density-controls')?.classList.toggle('is-auto-fit', view.overviewAutoFit === true);
  }

  function ensureDensityControls() {
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar || document.querySelector('#ux-density-controls')) return;
    const controls = document.createElement('div');
    controls.id = 'ux-density-controls';
    controls.className = 'ux-density-controls';
    controls.innerHTML = `
      <label class="ux-density-control" title="行の高さ">
        <span>行</span>
        <input id="ux-row-height" type="range" min="${ROW_MIN}" max="${ROW_MAX}" step="1" aria-label="行の高さ">
        <output id="ux-row-height-value">28</output>
      </label>
      <label class="ux-density-control" title="文字サイズ">
        <span>文字</span>
        <input id="ux-text-size" type="range" min="${TEXT_MIN}" max="${TEXT_MAX}" step="1" aria-label="文字サイズ">
        <output id="ux-text-size-value">11</output>
      </label>`;
    const viewControls = document.querySelector('#ux-view-controls');
    if (viewControls?.parentElement === toolbar) viewControls.insertAdjacentElement('afterend', controls);
    else toolbar.append(controls);
    syncDensityControls();
  }

  function bindHeaderCollapse() {
    document.querySelectorAll('#task-scroll, #timeline-scroll, #mobile-label-scroll').forEach((scroller) => {
      if (scroller.dataset.densityScrollBound) return;
      scroller.dataset.densityScrollBound = '1';
      let lastTop = scroller.scrollTop;
      scroller.addEventListener('scroll', () => {
        const top = scroller.scrollTop;
        if (top < 8) document.body.classList.remove('ux-header-collapsed');
        else if (top > lastTop + 3) document.body.classList.add('ux-header-collapsed');
        else if (top < lastTop - 3) document.body.classList.remove('ux-header-collapsed');
        lastTop = top;
      }, { passive: true });
    });
  }

  function preferredRowHeight(view) {
    return densityClamp(view.preferredRowHeight ?? view.rowHeight, ROW_MIN, ROW_MAX, 28);
  }

  function preferredTextSize(view) {
    return densityClamp(view.preferredTextSize ?? view.textSize, TEXT_MIN, TEXT_MAX, 11);
  }

  function fitTextForRow(rowHeight, preferred) {
    let suggested = 12;
    if (rowHeight <= 24) suggested = 10;
    else if (rowHeight <= 28) suggested = 11;
    return densityClamp(Math.min(preferred, suggested), TEXT_MIN, TEXT_MAX, TEXT_MIN);
  }

  function fitOverview() {
    const view = currentView();
    const tasks = filteredTasks();
    if (!view || !tasks.length) return;

    const min = tasks.map((task) => task.start).sort()[0];
    const max = tasks.map((task) => task.end).sort().at(-1);
    let start = addDays(min, -2);
    let end = addDays(max, 2);
    let span = inclusiveDays(start, end);
    state.ui.viewNotice = '';
    if (span > 730) {
      end = addDays(start, 729);
      span = 730;
      state.ui.viewNotice = `全期間は730日を超えています。先頭730日を俯瞰表示中`;
    }

    const workspace = document.querySelector('#workspace');
    const timeline = document.querySelector('#timeline-scroll');
    const availableHeight = Math.max(ROW_MIN, (workspace?.clientHeight || innerHeight * 0.7) - 31);
    const rawRowHeight = Math.floor(availableHeight / Math.max(1, tasks.length));
    const preferredRow = preferredRowHeight(view);
    const rowHeight = densityClamp(Math.min(preferredRow, Math.max(ROW_MIN, rawRowHeight)), ROW_MIN, ROW_MAX, 28);
    const preferredText = preferredTextSize(view);
    const textSize = fitTextForRow(rowHeight, preferredText);
    const cannotFitVertically = tasks.length * ROW_MIN > availableHeight;

    const availableWidth = Math.max(120, timeline?.clientWidth || (workspace?.clientWidth || innerWidth) - densityClamp(view.listWidth, LIST_MIN, LIST_MAX, 280));
    const fittedDayWidth = Math.max(2, Math.floor((availableWidth / Math.max(1, span)) * 10) / 10);
    const preferredDay = Number(view.preferredDayWidth);
    const dayWidth = densityClamp(Number.isFinite(preferredDay) ? Math.min(preferredDay, fittedDayWidth) : fittedDayWidth, 2, 32, 2);

    Object.assign(view, {
      start,
      end,
      rowHeight,
      textSize,
      dayWidth,
      scale: scaleForWidth(dayWidth),
      autoHideCategory: cannotFitVertically,
      overviewAutoFit: true,
    });
    state.storage.saveView(view);
    renderWorkspace();
    renderToolbarState();
    syncDensityControls();
  }

  const previousRenderWorkspace = renderWorkspace;
  renderWorkspace = function overviewDensityRenderWorkspace() {
    previousRenderWorkspace();
    applyDensityToDom();
    ensureDensityControls();
    syncDensityControls();
    requestAnimationFrame(bindHeaderCollapse);
  };

  const previousRenderToolbarState = renderToolbarState;
  renderToolbarState = function overviewDensityRenderToolbarState() {
    previousRenderToolbarState();
    ensureDensityControls();
    syncDensityControls();
  };

  fitAll = fitOverview;

  renderDisplaySettingsModal = function overviewDisplaySettingsModal() {
    const view = state.project.viewSettings;
    const body = `<div class="form-grid two">
      <label class="field"><span>一覧の幅</span><input id="setting-list-width" type="number" min="${LIST_MIN}" max="${LIST_MAX}" value="${densityClamp(view.listWidth, LIST_MIN, LIST_MAX, 280)}"><small>${LIST_MIN}〜${LIST_MAX}px</small></label>
      <label class="field"><span>行の高さ</span><input id="setting-row-height" type="number" min="${ROW_MIN}" max="${ROW_MAX}" value="${densityClamp(view.rowHeight, ROW_MIN, ROW_MAX, 28)}"><small>${ROW_MIN}〜${ROW_MAX}px</small></label>
      <label class="field"><span>文字サイズ</span><input id="setting-text-size" type="number" min="${TEXT_MIN}" max="${TEXT_MAX}" value="${densityClamp(view.textSize, TEXT_MIN, TEXT_MAX, 11)}"><small>${TEXT_MIN}〜${TEXT_MAX}px</small></label>
      <label class="field"><span>日付幅</span><input id="setting-day-width" type="number" min="2" max="32" step="0.5" value="${densityClamp(view.dayWidth, 2, 32, 12)}"><small>2〜32px/日</small></label>
    </div>
    <h3 class="section-title">表示期間</h3>
    <div class="form-grid two"><label class="field"><span>開始</span><input id="setting-view-start" type="date" value="${view.start}"></label><label class="field"><span>終了</span><input id="setting-view-end" type="date" value="${view.end}"></label></div>
    <p class="form-help">「全体」は縦横を自動最適化します。手動で変えた密度は次回の全体表示でも上限として尊重します。</p><div id="display-error" class="form-error" hidden></div>`;
    const footer = `<button class="button button-quiet" type="button" data-action="close-modal">キャンセル</button><button class="button button-primary" type="button" data-action="apply-display-settings">適用</button>`;
    return modalFrame('表示設定', 'OVERVIEW DISPLAY', body, footer, true);
  };

  document.addEventListener('input', (event) => {
    const view = currentView();
    if (!view) return;
    if (event.target.id === 'ux-row-height') {
      const value = densityClamp(event.target.value, ROW_MIN, ROW_MAX, 28);
      rememberViewPatch({ rowHeight: value, preferredRowHeight: value, autoHideCategory: false });
      applyDensityToDom();
      syncDensityControls();
    } else if (event.target.id === 'ux-text-size') {
      const value = densityClamp(event.target.value, TEXT_MIN, TEXT_MAX, 11);
      rememberViewPatch({ textSize: value, preferredTextSize: value });
      applyDensityToDom();
      syncDensityControls();
    }
  });

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action !== 'apply-display-settings') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const start = document.querySelector('#setting-view-start')?.value;
    const end = document.querySelector('#setting-view-end')?.value;
    const error = document.querySelector('#display-error');
    if (!parseISO(start) || !parseISO(end) || start > end) {
      if (error) { error.hidden = false; error.textContent = '終了日は開始日以降にしてください。'; }
      return;
    }
    if (inclusiveDays(start, end) > 730) {
      if (error) { error.hidden = false; error.textContent = '一度に表示できる期間は730日までです。'; }
      return;
    }
    const rowHeight = densityClamp(document.querySelector('#setting-row-height')?.value, ROW_MIN, ROW_MAX, 28);
    const textSize = densityClamp(document.querySelector('#setting-text-size')?.value, TEXT_MIN, TEXT_MAX, 11);
    const dayWidth = densityClamp(document.querySelector('#setting-day-width')?.value, 2, 32, 12);
    const listWidth = densityClamp(document.querySelector('#setting-list-width')?.value, LIST_MIN, LIST_MAX, 280);
    setView({
      start,
      end,
      listWidth,
      rowHeight,
      textSize,
      dayWidth,
      scale: scaleForWidth(dayWidth),
      preferredRowHeight: rowHeight,
      preferredTextSize: textSize,
      preferredDayWidth: dayWidth,
      preferredListWidth: listWidth,
      autoHideCategory: false,
      overviewAutoFit: false,
    });
    closeModal({ force: true });
  }, true);

  function rememberHorizontalPreference() {
    const view = currentView();
    if (!view) return;
    view.preferredDayWidth = densityClamp(view.dayWidth, 2, 32, 12);
    view.overviewAutoFit = false;
    state.storage.saveView(view);
    syncDensityControls();
  }

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-ux-action]')?.dataset.uxAction;
    if (action === 'zoom-in' || action === 'zoom-out') setTimeout(rememberHorizontalPreference, 0);
  });

  document.addEventListener('wheel', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.target.closest('#timeline-scroll')) setTimeout(rememberHorizontalPreference, 0);
  }, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === '+' || event.key === '=' || event.key === '-') setTimeout(rememberHorizontalPreference, 0);
  });

  addEventListener('resize', () => {
    clearTimeout(resizeFitTimer);
    resizeFitTimer = setTimeout(() => {
      if (currentView()?.overviewAutoFit) fitOverview();
    }, 180);
  });

  function migrateDensityDefaults() {
    const view = currentView();
    if (!view || localStorage.getItem(MIGRATION_KEY)) return false;
    if (Number(view.rowHeight) >= 36) view.rowHeight = 28;
    if (Number(view.textSize) >= 12) view.textSize = 11;
    view.listWidth = densityClamp(view.listWidth, LIST_MIN, LIST_MAX, 280);
    view.preferredRowHeight = densityClamp(view.rowHeight, ROW_MIN, ROW_MAX, 28);
    view.preferredTextSize = densityClamp(view.textSize, TEXT_MIN, TEXT_MAX, 11);
    view.preferredListWidth = view.listWidth;
    view.autoHideCategory = false;
    view.overviewAutoFit = true;
    state.storage.saveView(view);
    localStorage.setItem(MIGRATION_KEY, '1');
    return true;
  }

  function bootDensity() {
    if (!state?.project || !state.storage) {
      setTimeout(bootDensity, 30);
      return;
    }
    const migrated = migrateDensityDefaults();
    ensureDensityControls();
    renderWorkspace();
    renderToolbarState();
    document.body.dataset.densityVersion = DENSITY_VERSION;
    if (migrated && filteredTasks().length) requestAnimationFrame(fitOverview);
  }

  ensureDensityControls();
  bootDensity();
})();