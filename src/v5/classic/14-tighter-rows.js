(() => {
  const TIGHT_VERSION = '20260913-tight1';
  const MIGRATION_KEY = `gantt-desk:${TIGHT_VERSION}:defaults`;
  const ROW_MIN = 20;
  const ROW_MAX = 56;
  const TEXT_MIN = 10;
  const TEXT_MAX = 16;
  const LIST_MIN = 200;
  const LIST_MAX = 520;

  function tightClamp(value, min, max, fallback = min) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function tightScale(dayWidth) {
    if (dayWidth >= 18) return 'day';
    if (dayWidth >= 6) return 'week';
    return 'month';
  }

  function view() {
    return state?.project?.viewSettings || null;
  }

  function applyTightDensity() {
    const current = view();
    const workspace = document.querySelector('#workspace');
    if (!current || !workspace) return;
    const rowHeight = tightClamp(current.rowHeight, ROW_MIN, ROW_MAX, 24);
    const textSize = tightClamp(current.textSize, TEXT_MIN, TEXT_MAX, 11);
    workspace.style.setProperty('--row-height', `${rowHeight}px`);
    workspace.style.setProperty('--text-size', `${textSize}px`);
    const inner = workspace.querySelector('.timeline-inner');
    if (inner) inner.style.setProperty('--row-height', `${rowHeight}px`);
  }

  function syncControls() {
    const current = view();
    if (!current) return;
    const row = document.querySelector('#ux-row-height');
    const rowOut = document.querySelector('#ux-row-height-value');
    if (row) {
      row.min = String(ROW_MIN);
      if (document.activeElement !== row) row.value = String(tightClamp(current.rowHeight, ROW_MIN, ROW_MAX, 24));
    }
    if (rowOut) rowOut.textContent = String(tightClamp(current.rowHeight, ROW_MIN, ROW_MAX, 24));
  }

  function fittedText(rowHeight, preferred) {
    const ceiling = rowHeight <= 22 ? 10 : rowHeight <= 26 ? 11 : 12;
    return tightClamp(Math.min(preferred, ceiling), TEXT_MIN, TEXT_MAX, 10);
  }

  function fitTightOverview() {
    const current = view();
    const tasks = filteredTasks();
    if (!current || !tasks.length) return;

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
    const preferredRow = tightClamp(current.preferredRowHeight ?? current.rowHeight, ROW_MIN, ROW_MAX, 24);
    const rowHeight = tightClamp(Math.min(preferredRow, Math.max(ROW_MIN, rawRowHeight)), ROW_MIN, ROW_MAX, 24);
    const preferredText = tightClamp(current.preferredTextSize ?? current.textSize, TEXT_MIN, TEXT_MAX, 11);
    const textSize = fittedText(rowHeight, preferredText);
    const cannotFitVertically = tasks.length * ROW_MIN > availableHeight;

    const listWidth = tightClamp(current.listWidth, LIST_MIN, LIST_MAX, 280);
    const availableWidth = Math.max(120, timeline?.clientWidth || (workspace?.clientWidth || innerWidth) - listWidth);
    const fittedDayWidth = Math.max(2, Math.floor((availableWidth / Math.max(1, span)) * 10) / 10);
    const preferredDay = Number(current.preferredDayWidth);
    const dayWidth = tightClamp(Number.isFinite(preferredDay) ? Math.min(preferredDay, fittedDayWidth) : fittedDayWidth, 2, 32, 2);

    Object.assign(current, {
      start,
      end,
      rowHeight,
      textSize,
      dayWidth,
      scale: tightScale(dayWidth),
      autoHideCategory: cannotFitVertically,
      overviewAutoFit: true,
    });
    state.storage.saveView(current);
    renderWorkspace();
    renderToolbarState();
    syncControls();
  }

  fitAll = fitTightOverview;

  const previousRenderWorkspace = renderWorkspace;
  renderWorkspace = function tighterRowsRenderWorkspace() {
    previousRenderWorkspace();
    applyTightDensity();
    syncControls();
  };

  const previousRenderToolbarState = renderToolbarState;
  renderToolbarState = function tighterRowsRenderToolbarState() {
    previousRenderToolbarState();
    syncControls();
  };

  renderDisplaySettingsModal = function tighterRowsDisplaySettingsModal() {
    const current = state.project.viewSettings;
    const body = `<div class="form-grid two">
      <label class="field"><span>一覧の幅</span><input id="setting-list-width" type="number" min="${LIST_MIN}" max="${LIST_MAX}" value="${tightClamp(current.listWidth, LIST_MIN, LIST_MAX, 280)}"><small>${LIST_MIN}〜${LIST_MAX}px</small></label>
      <label class="field"><span>行の高さ</span><input id="setting-row-height" type="number" min="${ROW_MIN}" max="${ROW_MAX}" value="${tightClamp(current.rowHeight, ROW_MIN, ROW_MAX, 24)}"><small>${ROW_MIN}〜${ROW_MAX}px</small></label>
      <label class="field"><span>文字サイズ</span><input id="setting-text-size" type="number" min="${TEXT_MIN}" max="${TEXT_MAX}" value="${tightClamp(current.textSize, TEXT_MIN, TEXT_MAX, 11)}"><small>${TEXT_MIN}〜${TEXT_MAX}px</small></label>
      <label class="field"><span>日付幅</span><input id="setting-day-width" type="number" min="2" max="32" step="0.5" value="${tightClamp(current.dayWidth, 2, 32, 12)}"><small>2〜32px/日</small></label>
    </div>
    <h3 class="section-title">表示期間</h3>
    <div class="form-grid two"><label class="field"><span>開始</span><input id="setting-view-start" type="date" value="${current.start}"></label><label class="field"><span>終了</span><input id="setting-view-end" type="date" value="${current.end}"></label></div>
    <p class="form-help">行は20pxまで圧縮できます。全体表示では読みやすさを残しつつ、必要な場合だけ20pxまで自動で詰めます。</p><div id="display-error" class="form-error" hidden></div>`;
    const footer = `<button class="button button-quiet" type="button" data-action="close-modal">キャンセル</button><button class="button button-primary" type="button" data-tight-action="apply-display-settings">適用</button>`;
    return modalFrame('表示設定', 'OVERVIEW DISPLAY', body, footer, true);
  };

  document.addEventListener('input', (event) => {
    if (event.target.id !== 'ux-row-height') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const current = view();
    if (!current) return;
    const value = tightClamp(event.target.value, ROW_MIN, ROW_MAX, 24);
    Object.assign(current, {
      rowHeight: value,
      preferredRowHeight: value,
      autoHideCategory: false,
      overviewAutoFit: false,
    });
    state.storage.saveView(current);
    applyTightDensity();
    syncControls();
  }, true);

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-tight-action]')?.dataset.tightAction;
    if (action !== 'apply-display-settings') return;
    event.preventDefault();
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
    const rowHeight = tightClamp(document.querySelector('#setting-row-height')?.value, ROW_MIN, ROW_MAX, 24);
    const textSize = tightClamp(document.querySelector('#setting-text-size')?.value, TEXT_MIN, TEXT_MAX, 11);
    const dayWidth = tightClamp(document.querySelector('#setting-day-width')?.value, 2, 32, 12);
    const listWidth = tightClamp(document.querySelector('#setting-list-width')?.value, LIST_MIN, LIST_MAX, 280);
    setView({
      start,
      end,
      listWidth,
      rowHeight,
      textSize,
      dayWidth,
      scale: tightScale(dayWidth),
      preferredRowHeight: rowHeight,
      preferredTextSize: textSize,
      preferredDayWidth: dayWidth,
      preferredListWidth: listWidth,
      autoHideCategory: false,
      overviewAutoFit: false,
    });
    closeModal({ force: true });
  });

  function migrateTighterRows() {
    const current = view();
    if (!current || localStorage.getItem(MIGRATION_KEY)) return;
    if (Number(current.rowHeight) >= 28) current.rowHeight = 24;
    if (!Number.isFinite(Number(current.preferredRowHeight)) || Number(current.preferredRowHeight) >= 28) current.preferredRowHeight = 24;
    state.storage.saveView(current);
    localStorage.setItem(MIGRATION_KEY, '1');
  }

  function bootTighterRows() {
    if (!state?.project || !state.storage) {
      setTimeout(bootTighterRows, 30);
      return;
    }
    migrateTighterRows();
    renderWorkspace();
    renderToolbarState();
    document.body.dataset.tightRows = TIGHT_VERSION;
  }

  bootTighterRows();
})();
