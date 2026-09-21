(() => {
  const DENSITY_VERSION = '20260918-density3';
  const OVERVIEW_MODEL_VERSION = '20260918-overview2';
  const MIGRATION_KEY = `gantt-desk:${DENSITY_VERSION}:defaults`;
  const ROW_MIN = 14;
  const ROW_MAX = 56;
  const TEXT_MIN = 10;
  const TEXT_MAX = 16;
  const LIST_MIN = 200;
  const LIST_MAX = 520;
  const COMFORT_ROW = 36;
  const COMFORT_KEY = 'gantt-desk:20260921-desk:rows';
  const DEFAULT_TEXT = 11;
  const REPRESENTATION_HYSTERESIS = ROW_MIN * 2;
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

  function previewViewPatch(patch) {
    const view = currentView();
    if (!view) return;
    Object.assign(view, patch, { overviewAutoFit: false });
  }

  function commitViewPatch(patch) {
    const view = currentView();
    if (!view) return;
    Object.assign(view, patch, { overviewAutoFit: false });
    state.storage?.saveView(view);
  }

  function semanticZoom(dayWidth) {
    if (dayWidth < 5) return 'macro';
    if (dayWidth < 13) return 'medium';
    return 'detail';
  }

  // 下に浮かぶ操作盤と条件の帯が図を隠すぶん。実測して #workspace に置き、末尾の行をその上まで出せるようにする
  function syncDockReserve() {
    const workspace = document.querySelector('#workspace');
    if (!workspace) return 0;
    let reserve = 0;
    if (!document.body.classList.contains('is-present-mode')) {
      const bottom = workspace.getBoundingClientRect().bottom;
      const top = Math.min(...['.toolbar', '#condition-bar'].map((selector) => {
        const el = document.querySelector(selector);
        return el && el.getClientRects().length ? el.getBoundingClientRect().top : Infinity;
      }));
      if (Number.isFinite(top)) reserve = Math.max(0, Math.ceil(bottom - top)) + 8;
    }
    document.documentElement.style.setProperty('--dock-reserve', `${reserve}px`);
    return reserve;
  }

  function applyDensityToDom() {
    const view = currentView();
    const workspace = document.querySelector('#workspace');
    if (!view || !workspace) return;
    syncDockReserve();
    // 指で押せるよう、モバイルのガント表示だけ行を44px以上にする
    const touchFloor = innerWidth <= 767 && workspace.classList.contains('mode-gantt') ? 44 : 0;
    const rowHeight = Math.max(touchFloor, densityClamp(view.rowHeight, ROW_MIN, ROW_MAX, COMFORT_ROW));
    const textSize = densityClamp(view.textSize, TEXT_MIN, TEXT_MAX, DEFAULT_TEXT);
    const dayWidth = densityClamp(view.dayWidth, 2, 40, 12);
    workspace.style.setProperty('--row-height', `${rowHeight}px`);
    workspace.style.setProperty('--text-size', `${textSize}px`);
    workspace.classList.toggle('ux-auto-hide-category', view.autoHideCategory === true);
    workspace.classList.toggle('ux-row-compact', rowHeight < 18);
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
    const rowValue = densityClamp(view.rowHeight, ROW_MIN, ROW_MAX, COMFORT_ROW);
    const textValue = densityClamp(view.textSize, TEXT_MIN, TEXT_MAX, DEFAULT_TEXT);
    if (row) {
      row.min = String(ROW_MIN);
      row.max = String(ROW_MAX);
      if (document.activeElement !== row) row.value = String(rowValue);
    }
    if (text) {
      text.min = String(TEXT_MIN);
      text.max = String(TEXT_MAX);
      if (document.activeElement !== text) text.value = String(textValue);
    }
    const rowOut = document.querySelector('#ux-row-height-value');
    const textOut = document.querySelector('#ux-text-size-value');
    if (rowOut) rowOut.textContent = String(rowValue);
    if (textOut) textOut.textContent = String(textValue);
    document.querySelector('#ux-density-controls')?.classList.toggle('is-auto-fit', view.overviewAutoFit === true);
    const autoChip = document.querySelector('.ux-row-auto-chip');
    if (autoChip) autoChip.hidden = view.overviewAutoFit === true;
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
        <output id="ux-row-height-value">${COMFORT_ROW}</output>
      </label>
      <button type="button" class="revert-chip ux-row-auto-chip" data-density-action="row-auto-fit" hidden>自動</button>
      <label class="ux-density-control" title="文字サイズ">
        <span>文字</span>
        <input id="ux-text-size" type="range" min="${TEXT_MIN}" max="${TEXT_MAX}" step="1" aria-label="文字サイズ">
        <output id="ux-text-size-value">${DEFAULT_TEXT}</output>
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
    return densityClamp(view.preferredRowHeight ?? view.rowHeight, ROW_MIN, ROW_MAX, COMFORT_ROW);
  }

  function preferredTextSize(view) {
    return densityClamp(view.preferredTextSize ?? view.textSize, TEXT_MIN, TEXT_MAX, DEFAULT_TEXT);
  }

  function fitTextForRow(rowHeight, preferred) {
    const ceiling = rowHeight <= 22 ? 10 : rowHeight <= 26 ? 11 : 12;
    return densityClamp(Math.min(preferred, ceiling), TEXT_MIN, TEXT_MAX, TEXT_MIN);
  }

  function overviewRepresentationEligible(tasks) {
    return breakpoint() !== 'mobile' && effectiveMode() !== 'list' && tasks.length > 0;
  }

  function resolveOverviewRepresentation(tasks, availableHeight, { reason = 'explicit', currentShape = currentView()?.overviewMacroMode === true } = {}) {
    if (!overviewRepresentationEligible(tasks)) return 'rows';
    const requiredHeight = tasks.length * ROW_MIN;
    if (reason !== 'resize') return requiredHeight > availableHeight ? 'shape' : 'rows';
    if (currentShape) return requiredHeight > Math.max(ROW_MIN, availableHeight - REPRESENTATION_HYSTERESIS) ? 'shape' : 'rows';
    return requiredHeight > availableHeight + REPRESENTATION_HYSTERESIS ? 'shape' : 'rows';
  }

  function fitOverview({ reason = 'explicit' } = {}) {
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
      state.ui.viewNotice = '全期間は730日を超えています。先頭730日を俯瞰表示中';
    }

    const workspace = document.querySelector('#workspace');
    const timeline = document.querySelector('#macro-timeline-scroll') || document.querySelector('#timeline-scroll');
    // 見出し44pxと、下に浮かぶ操作盤のぶんを引いた、行に使える高さ
    const availableHeight = Math.max(ROW_MIN, (workspace?.clientHeight || innerHeight * 0.7) - 44 - syncDockReserve());
    const requiredHeight = tasks.length * ROW_MIN;
    const rawRowHeight = Math.floor(availableHeight / Math.max(1, tasks.length));
    const preferredRow = preferredRowHeight(view);
    const rowHeight = densityClamp(Math.min(preferredRow, Math.max(ROW_MIN, rawRowHeight)), ROW_MIN, ROW_MAX, COMFORT_ROW);
    const preferredText = preferredTextSize(view);
    const textSize = fitTextForRow(rowHeight, preferredText);
    const representation = resolveOverviewRepresentation(tasks, availableHeight, { reason, currentShape: view.overviewMacroMode === true });
    const cannotFitVertically = requiredHeight > availableHeight;

    const listWidth = densityClamp(view.listWidth, LIST_MIN, LIST_MAX, 280);
    const availableWidth = Math.max(120, timeline?.clientWidth || (workspace?.clientWidth || innerWidth) - listWidth);
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
      overviewMacroMode: representation === 'shape',
      autoHideCategory: representation === 'rows' && cannotFitVertically,
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
    syncDockReserve();
  };

  fitAll = fitOverview;

  renderDisplaySettingsModal = function overviewDisplaySettingsModal() {
    const view = state.project.viewSettings;
    const body = `<div class="form-grid two">
      <label class="field"><span>一覧の幅</span><input id="setting-list-width" type="number" min="${LIST_MIN}" max="${LIST_MAX}" value="${densityClamp(view.listWidth, LIST_MIN, LIST_MAX, 280)}"><small>${LIST_MIN}〜${LIST_MAX}px</small></label>
      <label class="field"><span>行の高さ</span><input id="setting-row-height" type="number" min="${ROW_MIN}" max="${ROW_MAX}" value="${densityClamp(view.rowHeight, ROW_MIN, ROW_MAX, COMFORT_ROW)}"><small>${ROW_MIN}〜${ROW_MAX}px</small></label>
      <label class="field"><span>文字サイズ</span><input id="setting-text-size" type="number" min="${TEXT_MIN}" max="${TEXT_MAX}" value="${densityClamp(view.textSize, TEXT_MIN, TEXT_MAX, DEFAULT_TEXT)}"><small>${TEXT_MIN}〜${TEXT_MAX}px</small></label>
      <label class="field"><span>日付幅</span><input id="setting-day-width" type="number" min="2" max="32" step="0.5" value="${densityClamp(view.dayWidth, 2, 32, 12)}"><small>2〜32px/日</small></label>
    </div>
    <h3 class="section-title">表示期間</h3>
    <div class="form-grid two"><label class="field"><span>開始</span><input id="setting-view-start" type="date" value="${view.start}"></label><label class="field"><span>終了</span><input id="setting-view-end" type="date" value="${view.end}"></label></div>
    <p class="form-help">行は20pxまで圧縮できます。「全体」は縦横と表示粒度を一度に最適化し、手動で変えた密度は次回の全体表示でも上限として尊重します。</p><div id="display-error" class="form-error" hidden></div>`;
    const footer = `<button class="button button-quiet" type="button" data-action="close-modal">キャンセル</button><button class="button button-primary" type="button" data-density-action="apply-display-settings">適用</button>`;
    return modalFrame('表示設定', 'OVERVIEW DISPLAY', body, footer, true);
  };

  document.addEventListener('input', (event) => {
    const view = currentView();
    if (!view) return;
    if (event.target.id === 'ux-row-height') {
      const value = densityClamp(event.target.value, ROW_MIN, ROW_MAX, COMFORT_ROW);
      const wasShape = view.overviewMacroMode === true;
      previewViewPatch({ rowHeight: value, preferredRowHeight: value, autoHideCategory: false, overviewMacroMode: false });
      if (wasShape) {
        renderWorkspace();
        renderToolbarState();
      } else {
        applyDensityToDom();
        syncDensityControls();
      }
    } else if (event.target.id === 'ux-text-size') {
      const value = densityClamp(event.target.value, TEXT_MIN, TEXT_MAX, DEFAULT_TEXT);
      const wasShape = view.overviewMacroMode === true;
      previewViewPatch({ textSize: value, preferredTextSize: value, overviewMacroMode: false });
      if (wasShape) {
        renderWorkspace();
        renderToolbarState();
      } else {
        applyDensityToDom();
        syncDensityControls();
      }
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.id === 'ux-row-height') {
      const value = densityClamp(event.target.value, ROW_MIN, ROW_MAX, COMFORT_ROW);
      commitViewPatch({ rowHeight: value, preferredRowHeight: value, autoHideCategory: false, overviewMacroMode: false });
    } else if (event.target.id === 'ux-text-size') {
      const value = densityClamp(event.target.value, TEXT_MIN, TEXT_MAX, DEFAULT_TEXT);
      commitViewPatch({ textSize: value, preferredTextSize: value, overviewMacroMode: false });
    }
  });

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-density-action]')?.dataset.densityAction;
    if (action === 'row-auto-fit') {
      event.preventDefault();
      fitOverview({ reason: 'explicit' });
      return;
    }
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
    const rowHeight = densityClamp(document.querySelector('#setting-row-height')?.value, ROW_MIN, ROW_MAX, COMFORT_ROW);
    const textSize = densityClamp(document.querySelector('#setting-text-size')?.value, TEXT_MIN, TEXT_MAX, DEFAULT_TEXT);
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
      overviewMacroMode: false,
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
    if ((event.ctrlKey || event.metaKey) && event.target.closest('#timeline-scroll, #macro-timeline-scroll')) setTimeout(rememberHorizontalPreference, 0);
  }, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === '+' || event.key === '=' || event.key === '-') setTimeout(rememberHorizontalPreference, 0);
  });

  addEventListener('resize', () => {
    clearTimeout(resizeFitTimer);
    resizeFitTimer = setTimeout(() => {
      if (currentView()?.overviewAutoFit) fitOverview({ reason: 'resize' });
    }, 180);
  });

  function migrateDensityDefaults() {
    const view = currentView();
    if (!view || localStorage.getItem(MIGRATION_KEY)) return false;
    if (Number(view.rowHeight) >= 28) view.rowHeight = COMFORT_ROW;
    if (!Number.isFinite(Number(view.preferredRowHeight)) || Number(view.preferredRowHeight) >= 28) view.preferredRowHeight = COMFORT_ROW;
    if (Number(view.textSize) >= 12) view.textSize = DEFAULT_TEXT;
    view.listWidth = densityClamp(view.listWidth, LIST_MIN, LIST_MAX, 280);
    view.preferredRowHeight = densityClamp(view.preferredRowHeight ?? view.rowHeight, ROW_MIN, ROW_MAX, COMFORT_ROW);
    view.preferredTextSize = densityClamp(view.preferredTextSize ?? view.textSize, TEXT_MIN, TEXT_MAX, DEFAULT_TEXT);
    view.preferredListWidth = view.listWidth;
    view.autoHideCategory = false;
    view.overviewAutoFit = true;
    state.storage.saveView(view);
    localStorage.setItem(MIGRATION_KEY, '1');
    return true;
  }

  // 既定の行の高さを36pxへ移す(1回だけ)。24px以下だった人は一度36pxに戻る
  // ponytail: 手で24にしていた人も一度36に戻る。困るなら移行前の値を別キーに退避して戻せるようにする
  function migrateComfortRow() {
    const view = currentView();
    if (!view || localStorage.getItem(COMFORT_KEY)) return false;
    localStorage.setItem(COMFORT_KEY, '1');
    if (Number(view.preferredRowHeight ?? view.rowHeight) > 24) return false;
    view.rowHeight = COMFORT_ROW;
    view.preferredRowHeight = COMFORT_ROW;
    state.storage.saveView(view);
    return true;
  }

  globalThis.ganttOverviewModel = {
    fit: fitOverview,
    resolveRepresentation(tasks, availableHeight, options) {
      return resolveOverviewRepresentation(tasks, availableHeight, options);
    },
  };

  function bootDensity() {
    if (!state?.project || !state.storage) {
      setTimeout(bootDensity, 30);
      return;
    }
    const migrated = migrateDensityDefaults() | migrateComfortRow();
    ensureDensityControls();
    renderWorkspace();
    renderToolbarState();
    document.body.dataset.densityVersion = DENSITY_VERSION;
    document.body.dataset.overviewModelVersion = OVERVIEW_MODEL_VERSION;
    if (migrated && filteredTasks().length) requestAnimationFrame(() => fitOverview({ reason: 'boot' }));
  }

  ensureDensityControls();
  bootDensity();
})();