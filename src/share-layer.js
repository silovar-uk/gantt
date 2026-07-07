(() => {
  const STORAGE_KEY = 'gantt-desk:v2:project';
  const SETTINGS_KEY = 'gantt-desk:v2:share-settings';
  const COLORS = {
    gray: { fill: '#cbd5e1', border: '#94a3b8', text: '#334155', xlsx: 'CBD5E1' },
    blue: { fill: '#bfdbfe', border: '#76a9e8', text: '#153967', xlsx: 'BFDBFE' },
    green: { fill: '#bbf7d0', border: '#73cb96', text: '#1c4e38', xlsx: 'BBF7D0' },
    amber: { fill: '#fde68a', border: '#efbd52', text: '#754510', xlsx: 'FDE68A' },
    red: { fill: '#fecdd3', border: '#ed8791', text: '#7d2832', xlsx: 'FECDD3' },
    purple: { fill: '#e9d5ff', border: '#bc91ec', text: '#533878', xlsx: 'E9D5FF' },
  };
  const DEFAULT_SETTINGS = {
    preset: 'current', customStart: '', customEnd: '', showTitle: true, showPeriod: true,
    showUpdatedAt: true, showLegend: true, showMemo: false, includeCompleted: true, pngFormat: 'wide',
  };
  const state = { settings: loadSettings(), originalView: null, inShareMode: false, currentRange: null, toastTimer: null };
  const $ = (selector) => document.querySelector(selector);

  function loadSettings() {
    try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) }; }
    catch { return { ...DEFAULT_SETTINGS }; }
  }
  function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); }
  function getProject() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } }
  function parseISO(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }
  function toISO(date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }
  function addDays(iso, days) { const date = typeof iso === 'string' ? parseISO(iso) : new Date(iso.getTime()); date.setUTCDate(date.getUTCDate() + days); return typeof iso === 'string' ? toISO(date) : date; }
  function diffDays(start, end) { return Math.round((parseISO(end) - parseISO(start)) / 86400000); }
  function todayISO() { const now = new Date(); return toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))); }
  function formatDate(iso) { const date = parseISO(iso); return date ? `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日` : '—'; }
  function formatShortDate(iso) { const date = parseISO(iso); return date ? `${date.getUTCMonth() + 1}/${date.getUTCDate()}` : '—'; }
  function formatUpdatedAt(value) {
    const date = new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? '更新日不明' : `最終更新：${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  function escapeHTML(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
  function getCurrentView() {
    const project = getProject(); const start = $('#timeline-start')?.value; const end = $('#timeline-end')?.value;
    return { start: parseISO(start) ? start : (project?.view?.start || todayISO()), end: parseISO(end) ? end : (project?.view?.end || addDays(todayISO(), 28)) };
  }
  function fitRangeToProject(project) {
    const tasks = Array.isArray(project?.tasks) ? project.tasks : [];
    if (!tasks.length) return getCurrentView();
    const starts = tasks.map((task) => task.start).filter(parseISO).sort();
    const ends = tasks.map((task) => task.end || task.start).filter(parseISO).sort();
    return starts.length && ends.length ? { start: addDays(starts[0], -2), end: addDays(ends.at(-1), 2) } : getCurrentView();
  }
  function getRangeFromPreset(project, preset = state.settings.preset) {
    const now = todayISO();
    if (preset === 'all') return fitRangeToProject(project);
    if (preset === 'month') { const date = parseISO(now); return { start: toISO(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))), end: toISO(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))) }; }
    if (preset === 'next4weeks') return { start: now, end: addDays(now, 27) };
    if (preset === 'custom' && parseISO(state.settings.customStart) && parseISO(state.settings.customEnd) && state.settings.customStart <= state.settings.customEnd) return { start: state.settings.customStart, end: state.settings.customEnd };
    return getCurrentView();
  }
  function taskIntersects(task, range) { const start = task.start; const end = task.milestone ? task.start : (task.end || task.start); return parseISO(start) && parseISO(end) && start <= range.end && end >= range.start; }
  function getExportData() {
    const project = getProject(); if (!project) throw new Error('プロジェクトのデータを読み込めませんでした。');
    const range = getRangeFromPreset(project);
    const tasks = (project.tasks || []).filter((task) => state.settings.includeCompleted || !task.completed).filter((task) => taskIntersects(task, range));
    return { project, range, tasks };
  }
  function getLegend(tasks) {
    const seen = new Map(); tasks.forEach((task) => { const category = String(task.category || '未分類'); if (!seen.has(category)) seen.set(category, task.color in COLORS ? task.color : 'gray'); });
    return [...seen.entries()].map(([name, color]) => ({ name, color }));
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .share-open-button { margin-right:2px; }
      .share-modal { position:fixed; inset:0; z-index:120; display:grid; place-items:center; padding:20px; }
      .share-modal[hidden] { display:none; }
      .share-modal__backdrop { position:absolute; inset:0; background:rgba(15,23,42,.42); }
      .share-modal__card { position:relative; width:min(740px,100%); max-height:min(820px,92vh); overflow:auto; padding:22px; border:1px solid #dbe2ea; border-radius:14px; background:#fff; box-shadow:0 24px 58px rgba(15,23,42,.26); }
      .share-modal__head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; padding-bottom:16px; border-bottom:1px solid #dbe2ea; }
      .share-modal__head h2 { margin:0; font-size:21px; letter-spacing:-.02em; }
      .share-modal__copy { margin:7px 0 0; color:#64748b; font-size:13px; line-height:1.55; }
      .share-modal__section { padding:16px 0; border-bottom:1px solid #edf1f5; }
      .share-modal__section:last-of-type { border-bottom:0; }
      .share-modal__section h3 { margin:0 0 10px; font-size:13px; }
      .share-choice-row { display:flex; flex-wrap:wrap; gap:7px; }
      .share-choice { min-height:33px; padding:6px 10px; border:1px solid #cbd5e1; border-radius:999px; color:#475569; background:#fff; font-size:12px; font-weight:750; }
      .share-choice:hover { background:#f8fafc; }
      .share-choice.is-active { color:#244a8f; border-color:#7aa0e1; background:#e8eefb; }
      .share-custom-range { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:7px; max-width:390px; margin-top:10px; }
      .share-custom-range input { min-height:35px; padding:5px 7px; border:1px solid #b9c6d4; border-radius:7px; color:#172033; }
      .share-option-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
      .share-check { min-height:58px; padding:8px; display:grid; align-content:center; gap:4px; border:1px solid #dbe2ea; border-radius:8px; background:#fff; cursor:pointer; }
      .share-check:hover { background:#f8fafc; }
      .share-check input { margin:0; accent-color:#244a8f; }
      .share-check span { font-size:12px; font-weight:750; }
      .share-output-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
      .share-output-button { min-height:42px; padding:9px 11px; border:1px solid #b9c6d4; border-radius:8px; color:#172033; background:#fff; text-align:left; font-size:13px; font-weight:750; }
      .share-output-button:hover { border-color:#7d93ac; background:#f8fafc; }
      .share-output-button strong { display:block; }
      .share-output-button small { display:block; margin-top:3px; color:#64748b; font-weight:500; }
      .share-modal__foot { display:flex; justify-content:space-between; align-items:center; gap:8px; padding-top:17px; }
      .share-modal__status { color:#64748b; font-size:12px; }
      .share-mode-header { display:none; min-height:76px; padding:13px 18px; align-items:center; justify-content:space-between; gap:16px; border-bottom:1px solid #dbe2ea; background:#fff; }
      .share-mode-header__main { min-width:0; }
      .share-mode-header__eyebrow { margin:0 0 2px; color:#94a3b8; font-size:10px; font-weight:800; letter-spacing:.11em; }
      .share-mode-header__title { margin:0; overflow:hidden; color:#172033; font-size:20px; letter-spacing:-.02em; text-overflow:ellipsis; white-space:nowrap; }
      .share-mode-header__meta { margin:4px 0 0; display:flex; flex-wrap:wrap; gap:10px; color:#64748b; font-size:12px; }
      .share-mode-header__legend { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:6px 9px; }
      .share-legend-item { display:inline-flex; align-items:center; gap:5px; color:#526174; font-size:11px; font-weight:700; white-space:nowrap; }
      .share-legend-swatch { width:10px; height:10px; border-radius:3px; border:1px solid rgba(15,23,42,.12); }
      .share-mode-header__actions { display:flex; align-items:center; gap:6px; flex:0 0 auto; }
      .gantt-share-mode .project-bar, .gantt-share-mode .toolbar { display:none; }
      .gantt-share-mode .share-mode-header { display:flex; }
      .gantt-share-mode .app-header { box-shadow:0 1px 2px rgba(15,23,42,.07); }
      .gantt-share-mode .task-row, .gantt-share-mode .task-bar, .gantt-share-mode .milestone { pointer-events:none; cursor:default; }
      .gantt-share-mode .task-row:hover { background:#fff; }
      .gantt-share-mode .pane-resizer { display:none; }
      .gantt-share-mode .task-panel { width:500px !important; }
      .share-toast { position:fixed; z-index:150; left:50%; bottom:18px; max-width:min(480px,calc(100vw - 36px)); padding:10px 13px; transform:translate(-50%,10px); border-radius:9px; color:#fff; background:#22324a; box-shadow:0 12px 36px rgba(15,23,42,.18); font-size:13px; opacity:0; transition:opacity .18s,transform .18s; }
      .share-toast.is-visible { transform:translate(-50%,0); opacity:1; }
      .share-toast.is-error { background:#9b2c28; }
      @media (max-width:820px) { .share-mode-header { align-items:flex-start; padding:11px 12px; } .share-mode-header__legend { display:none; } .share-option-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .share-output-grid { grid-template-columns:1fr; } }
      @media (max-width:650px) { .share-open-button { display:none; } .share-modal { padding:0; align-items:end; } .share-modal__card { width:100%; max-height:92vh; border-radius:16px 16px 0 0; } .share-modal__foot { position:sticky; bottom:0; padding:12px 0 0; background:#fff; } .gantt-share-mode .task-panel { width:310px !important; } .share-mode-header__actions .button-secondary { display:none; } }
    `;
    document.head.append(style);
  }

  function createUI() {
    const actionRow = $('.project-actions'); if (!actionRow || $('#share-open-btn')) return;
    const shareButton = document.createElement('button');
    shareButton.id = 'share-open-btn'; shareButton.className = 'button button-secondary share-open-button'; shareButton.type = 'button'; shareButton.textContent = '共有・出力'; actionRow.prepend(shareButton);
    const appHeader = $('.app-header');
    const header = document.createElement('section');
    header.id = 'share-mode-header'; header.className = 'share-mode-header';
    header.innerHTML = `<div class="share-mode-header__main"><p class="share-mode-header__eyebrow">GANTT OVERVIEW</p><h1 id="share-header-title" class="share-mode-header__title"></h1><p id="share-header-meta" class="share-mode-header__meta"></p></div><div id="share-header-legend" class="share-mode-header__legend"></div><div class="share-mode-header__actions"><button id="share-settings-btn" class="button button-secondary" type="button">共有設定</button><button id="share-exit-btn" class="button button-primary" type="button">編集に戻る</button></div>`;
    appHeader.prepend(header);

    const modal = document.createElement('div'); modal.id = 'share-modal'; modal.className = 'share-modal'; modal.hidden = true;
    modal.innerHTML = `<div class="share-modal__backdrop" data-share-close></div><section class="share-modal__card" role="dialog" aria-modal="true" aria-labelledby="share-modal-title"><div class="share-modal__head"><div><p class="eyebrow">SHARE & EXPORT</p><h2 id="share-modal-title">共有・出力</h2><p class="share-modal__copy">操作用のUIを外した共有画面と、会議・チャットにそのまま使えるPNG／Excelを用意します。</p></div><button id="share-close-btn" class="icon-button" type="button" aria-label="閉じる">×</button></div><div class="share-modal__section"><h3>共有する期間</h3><div id="share-preset-row" class="share-choice-row"><button class="share-choice" type="button" data-preset="all">全体</button><button class="share-choice" type="button" data-preset="month">今月</button><button class="share-choice" type="button" data-preset="next4weeks">直近4週間</button><button class="share-choice" type="button" data-preset="current">今見えている範囲</button><button class="share-choice" type="button" data-preset="custom">指定期間</button></div><div class="share-custom-range"><input id="share-custom-start" type="date" aria-label="共有開始日"><span>〜</span><input id="share-custom-end" type="date" aria-label="共有終了日"></div></div><div class="share-modal__section"><h3>共有資料に入れる情報</h3><div class="share-option-grid"><label class="share-check"><input type="checkbox" data-share-setting="showTitle"><span>案件名</span></label><label class="share-check"><input type="checkbox" data-share-setting="showPeriod"><span>表示期間</span></label><label class="share-check"><input type="checkbox" data-share-setting="showUpdatedAt"><span>最終更新日</span></label><label class="share-check"><input type="checkbox" data-share-setting="showLegend"><span>凡例</span></label><label class="share-check"><input type="checkbox" data-share-setting="showMemo"><span>メモ</span></label><label class="share-check"><input type="checkbox" data-share-setting="includeCompleted"><span>完了タスク</span></label></div></div><div class="share-modal__section"><h3>出力</h3><div class="share-output-grid"><button class="share-output-button" type="button" data-share-action="share"><strong>共有ビューを開く</strong><small>編集UIを隠して、説明用の画面に切り替えます</small></button><button class="share-output-button" type="button" data-share-action="png-wide"><strong>PNG 16:9</strong><small>PowerPoint・会議資料向け</small></button><button class="share-output-button" type="button" data-share-action="png-a4"><strong>PNG A4横</strong><small>資料貼り付け・印刷向け</small></button><button class="share-output-button" type="button" data-share-action="png-portrait"><strong>PNG 縦長</strong><small>スマホ・チャット共有向け</small></button><button class="share-output-button" type="button" data-share-action="clipboard"><strong>画像をクリップボードへ</strong><small>SlackやPowerPointにそのまま貼り付け</small></button><button class="share-output-button" type="button" data-share-action="xlsx"><strong>共有用Excel</strong><small>ガント＋データ一覧の2シート</small></button></div></div><div class="share-modal__foot"><span id="share-modal-status" class="share-modal__status">現在の表示範囲を基準に出力します</span><button class="button button-quiet" type="button" data-share-close>閉じる</button></div></section>`;
    document.body.append(modal);
    const toast = document.createElement('div'); toast.id = 'share-toast'; toast.className = 'share-toast'; toast.hidden = true; toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); document.body.append(toast);
  }

  function setModalControls() {
    document.querySelectorAll('[data-preset]').forEach((button) => button.classList.toggle('is-active', button.dataset.preset === state.settings.preset));
    $('#share-custom-start').value = state.settings.customStart || ''; $('#share-custom-end').value = state.settings.customEnd || '';
    document.querySelectorAll('[data-share-setting]').forEach((input) => { input.checked = Boolean(state.settings[input.dataset.shareSetting]); });
    const project = getProject(); const range = getRangeFromPreset(project); $('#share-modal-status').textContent = `${formatDate(range.start)}〜${formatDate(range.end)} を共有します`;
  }
  function openModal() { document.activeElement?.blur?.(); setModalControls(); $('#share-modal').hidden = false; }
  function closeModal() { $('#share-modal').hidden = true; }
  function showToast(message, isError = false) { const toast = $('#share-toast'); clearTimeout(state.toastTimer); toast.textContent = message; toast.hidden = false; toast.classList.toggle('is-error', isError); requestAnimationFrame(() => toast.classList.add('is-visible')); state.toastTimer = setTimeout(() => { toast.classList.remove('is-visible'); setTimeout(() => { toast.hidden = true; }, 180); }, 2800); }
  async function waitForProjectSave() { document.activeElement?.blur?.(); await new Promise((resolve) => setTimeout(resolve, 440)); }
  function applyRangeToApp(range) { const startInput = $('#timeline-start'); const endInput = $('#timeline-end'); if (!startInput || !endInput) return; startInput.value = range.start; endInput.value = range.end; endInput.dispatchEvent(new Event('change', { bubbles: true })); }
  function setCompletedVisibility(includeCompleted) { const button = $('#toggle-completed-btn'); if (!button) return; const currentlyShowing = button.textContent.includes('隠す'); if (currentlyShowing !== includeCompleted) button.click(); }

  async function enterShareMode() {
    await waitForProjectSave(); const project = getProject(); if (!project) return showToast('プロジェクトのデータを読み込めませんでした。', true);
    if (!state.inShareMode) state.originalView = { start: $('#timeline-start')?.value || project.view?.start, end: $('#timeline-end')?.value || project.view?.end, showCompleted: project.view?.showCompleted !== false };
    const range = getRangeFromPreset(project); state.currentRange = range; applyRangeToApp(range); await new Promise((resolve) => setTimeout(resolve, 80)); setCompletedVisibility(state.settings.includeCompleted);
    state.inShareMode = true; document.body.classList.add('gantt-share-mode'); updateShareHeader(); closeModal(); showToast('共有ビューを開きました');
  }
  function exitShareMode() {
    if (!state.inShareMode) return; document.body.classList.remove('gantt-share-mode');
    if (state.originalView) { applyRangeToApp(state.originalView); setTimeout(() => setCompletedVisibility(state.originalView.showCompleted), 80); }
    state.inShareMode = false; state.currentRange = null; state.originalView = null; showToast('編集ビューに戻りました');
  }
  function updateShareHeader() {
    const { project, range, tasks } = getExportData(); const title = $('#share-header-title'); const meta = $('#share-header-meta'); const legend = $('#share-header-legend');
    title.textContent = state.settings.showTitle ? project.title || '名称未設定' : 'ガントチャート';
    const metaItems = []; if (state.settings.showPeriod) metaItems.push(`${formatDate(range.start)}〜${formatDate(range.end)}`); if (state.settings.showUpdatedAt) metaItems.push(formatUpdatedAt(project.updatedAt)); if (state.settings.showMemo && project.memo) metaItems.push(project.memo);
    meta.innerHTML = metaItems.map((item) => `<span>${escapeHTML(item)}</span>`).join('');
    legend.innerHTML = state.settings.showLegend ? getLegend(tasks).map((item) => `<span class="share-legend-item"><span class="share-legend-swatch" style="background:${COLORS[item.color].fill}"></span>${escapeHTML(item.name)}</span>`).join('') : '';
  }

  function getCanvasSpec(format, taskCount) {
    const fixed = { wide: { width: 1600, height: 900 }, a4: { width: 1600, height: 1131 }, portrait: { width: 1080, height: 1350 } }[format] || { width: 1600, height: 900 };
    const top = 170; const bottom = 72; const minRow = format === 'portrait' ? 31 : 28; return { ...fixed, height: Math.max(fixed.height, top + Math.max(taskCount, 1) * minRow + bottom), top, bottom };
  }
  function drawText(ctx, text, x, y, maxWidth, options = {}) {
    const { font = '14px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color = '#172033', align = 'left' } = options;
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; let output = String(text || '');
    if (maxWidth && ctx.measureText(output).width > maxWidth) { while (output.length && ctx.measureText(`${output}…`).width > maxWidth) output = output.slice(0, -1); output += '…'; }
    ctx.fillText(output, x, y);
  }
  function roundRect(ctx, x, y, width, height, radius) { const r = Math.min(radius, width / 2, height / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath(); }

  function drawShareCanvas(format = state.settings.pngFormat) {
    const { project, range, tasks } = getExportData(); const spec = getCanvasSpec(format, tasks.length); const canvas = document.createElement('canvas'); canvas.width = spec.width; canvas.height = spec.height; const ctx = canvas.getContext('2d');
    const margin = format === 'portrait' ? 44 : 56; const titleY = 56; const legendY = state.settings.showTitle || state.settings.showPeriod || state.settings.showUpdatedAt ? 122 : 72; const headerY = Math.max(156, legendY + (state.settings.showLegend ? 30 : 0)); const leftWidth = format === 'portrait' ? 355 : 430; const tableX = margin; const timelineX = tableX + leftWidth; const timelineWidth = spec.width - timelineX - margin; const totalDays = Math.max(1, diffDays(range.start, range.end) + 1); const dayWidth = timelineWidth / totalDays; const monthHeight = 26; const dayHeaderHeight = 31; const bodyY = headerY + monthHeight + dayHeaderHeight; const rowHeight = Math.max(28, Math.min(44, (spec.height - bodyY - spec.bottom) / Math.max(tasks.length, 1))); const bodyHeight = Math.max(rowHeight * Math.max(tasks.length, 1), 1);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, spec.width, spec.height);
    if (state.settings.showTitle) drawText(ctx, project.title || 'ガントチャート', margin, titleY, spec.width - margin * 2, { font: '700 29px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif' });
    const meta = []; if (state.settings.showPeriod) meta.push(`${formatDate(range.start)}〜${formatDate(range.end)}`); if (state.settings.showUpdatedAt) meta.push(formatUpdatedAt(project.updatedAt)); if (state.settings.showMemo && project.memo) meta.push(project.memo);
    drawText(ctx, meta.join('　｜　'), margin, titleY + 29, spec.width - margin * 2, { font: '13px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: '#64748b' });
    if (state.settings.showLegend) { let x = margin; getLegend(tasks).forEach((item) => { const color = COLORS[item.color] || COLORS.gray; ctx.fillStyle = color.fill; roundRect(ctx, x, legendY - 10, 12, 12, 3); ctx.fill(); drawText(ctx, item.name, x + 18, legendY, 105, { font: '700 11px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: '#526174' }); x += Math.min(140, 25 + ctx.measureText(item.name).width); }); }
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(tableX, headerY, leftWidth, monthHeight + dayHeaderHeight); ctx.fillRect(timelineX, headerY, timelineWidth, monthHeight + dayHeaderHeight); ctx.strokeStyle = '#dbe2ea'; ctx.lineWidth = 1; ctx.strokeRect(tableX, headerY, leftWidth + timelineWidth, monthHeight + dayHeaderHeight + bodyHeight);
    [['タスク', tableX + 13], ['カテゴリ', tableX + leftWidth - 128], ['期間', tableX + leftWidth - 58]].forEach(([label, x]) => drawText(ctx, label, x, headerY + monthHeight + 20, 110, { font: '700 11px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: '#64748b' }));
    const startDate = parseISO(range.start); let monthStartIndex = 0; let activeMonth = `${startDate.getUTCFullYear()}-${startDate.getUTCMonth()}`; const monthGroups = [];
    for (let index = 1; index <= totalDays; index += 1) { const date = index < totalDays ? addDays(startDate, index) : null; const key = date ? `${date.getUTCFullYear()}-${date.getUTCMonth()}` : null; if (index === totalDays || key !== activeMonth) { monthGroups.push({ start: monthStartIndex, end: index - 1, date: addDays(startDate, monthStartIndex) }); monthStartIndex = index; activeMonth = key; } }
    monthGroups.forEach((group) => { const x = timelineX + group.start * dayWidth; const width = (group.end - group.start + 1) * dayWidth; ctx.fillStyle = '#f8fafc'; ctx.fillRect(x, headerY, width, monthHeight); ctx.strokeStyle = '#dbe2ea'; ctx.strokeRect(x, headerY, width, monthHeight); drawText(ctx, `${group.date.getUTCFullYear()}年${group.date.getUTCMonth() + 1}月`, x + 8, headerY + 17, width - 10, { font: '700 11px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: '#526174' }); });
    for (let index = 0; index < totalDays; index += 1) { const date = addDays(startDate, index); const dayOfWeek = date.getUTCDay(); const x = timelineX + index * dayWidth; if (dayOfWeek === 6 || dayOfWeek === 0) { ctx.fillStyle = '#f6f7f9'; ctx.fillRect(x, headerY + monthHeight, dayWidth, dayHeaderHeight + bodyHeight); } ctx.strokeStyle = '#edf1f5'; ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, headerY + monthHeight); ctx.lineTo(Math.round(x) + .5, bodyY + bodyHeight); ctx.stroke(); const showDate = dayWidth >= 17 || (dayOfWeek === 1 && dayWidth >= 9); if (showDate) { const weekday = ['日','月','火','水','木','金','土'][dayOfWeek]; const color = dayOfWeek === 0 ? '#a85c64' : dayOfWeek === 6 ? '#4d6e95' : '#64748b'; drawText(ctx, weekday, x + dayWidth / 2, headerY + monthHeight + 11, dayWidth - 2, { font: '700 8px sans-serif', color, align: 'center' }); drawText(ctx, dayWidth >= 17 ? String(date.getUTCDate()) : `${date.getUTCMonth() + 1}/${date.getUTCDate()}`, x + dayWidth / 2, headerY + monthHeight + 24, dayWidth - 2, { font: '700 10px sans-serif', color: dayOfWeek === 0 ? '#a85c64' : dayOfWeek === 6 ? '#4d6e95' : '#334155', align: 'center' }); } }
    ctx.strokeStyle = '#dbe2ea'; ctx.beginPath(); ctx.moveTo(tableX, headerY + monthHeight); ctx.lineTo(tableX + leftWidth + timelineWidth, headerY + monthHeight); ctx.moveTo(tableX, bodyY); ctx.lineTo(tableX + leftWidth + timelineWidth, bodyY); ctx.stroke();
    tasks.forEach((task, rowIndex) => { const y = bodyY + rowIndex * rowHeight; const color = COLORS[task.color] || COLORS.gray; ctx.fillStyle = rowIndex % 2 ? '#ffffff' : '#fcfdff'; ctx.fillRect(tableX, y, leftWidth, rowHeight); ctx.strokeStyle = '#edf1f5'; ctx.beginPath(); ctx.moveTo(tableX, y + rowHeight + .5); ctx.lineTo(tableX + leftWidth + timelineWidth, y + rowHeight + .5); ctx.stroke(); const textY = y + rowHeight / 2 + 4; drawText(ctx, task.name, tableX + 13, textY, leftWidth - 195, { font: '700 12px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: task.completed ? '#8a98a9' : '#172033' }); ctx.fillStyle = '#f1f5f9'; roundRect(ctx, tableX + leftWidth - 130, y + (rowHeight - 20) / 2, 62, 20, 10); ctx.fill(); drawText(ctx, task.category || '未分類', tableX + leftWidth - 99, textY, 56, { font: '700 9px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: '#526174', align: 'center' }); drawText(ctx, task.milestone ? formatShortDate(task.start) : `${formatShortDate(task.start)}〜${formatShortDate(task.end || task.start)}`, tableX + leftWidth - 8, textY, 62, { font: '10px ui-monospace, SFMono-Regular, Menlo, monospace', color: '#64748b', align: 'right' }); const taskStart = task.start; const taskEnd = task.milestone ? task.start : (task.end || task.start); if (task.milestone) { if (taskStart >= range.start && taskStart <= range.end) { const x = timelineX + diffDays(range.start, taskStart) * dayWidth + dayWidth / 2; const midY = y + rowHeight / 2; ctx.save(); ctx.translate(x, midY); ctx.rotate(Math.PI / 4); ctx.fillStyle = color.fill; ctx.fillRect(-7, -7, 14, 14); ctx.strokeStyle = task.deadline ? '#c3474d' : color.border; ctx.lineWidth = task.deadline ? 2 : 1; ctx.strokeRect(-7, -7, 14, 14); ctx.restore(); } } else { const clippedStart = taskStart < range.start ? range.start : taskStart; const clippedEnd = taskEnd > range.end ? range.end : taskEnd; const x = timelineX + diffDays(range.start, clippedStart) * dayWidth + 2; const width = Math.max(6, (diffDays(clippedStart, clippedEnd) + 1) * dayWidth - 4); const barY = y + (rowHeight - 21) / 2; ctx.fillStyle = color.fill; roundRect(ctx, x, barY, width, 21, 5); ctx.fill(); ctx.strokeStyle = color.border; ctx.lineWidth = 1; ctx.stroke(); if (width > 70) drawText(ctx, task.name, x + 7, barY + 14, width - 12, { font: '700 10px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: color.text }); } });
    const today = todayISO(); if (today >= range.start && today <= range.end) { const x = timelineX + diffDays(range.start, today) * dayWidth + dayWidth / 2; ctx.strokeStyle = '#d6534f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, headerY + monthHeight); ctx.lineTo(x, bodyY + bodyHeight); ctx.stroke(); ctx.fillStyle = '#d6534f'; ctx.beginPath(); ctx.arc(x, headerY + monthHeight + 3, 3.3, 0, Math.PI * 2); ctx.fill(); }
    drawText(ctx, 'Gantt Desk', spec.width - margin, spec.height - 25, 100, { font: '10px -apple-system, BlinkMacSystemFont, sans-serif', color: '#94a3b8', align: 'right' }); return canvas;
  }
  async function canvasToBlob(canvas) { return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png')); }
  async function exportPNG(format) { await waitForProjectSave(); const canvas = drawShareCanvas(format); const blob = await canvasToBlob(canvas); if (!blob) return showToast('PNGを生成できませんでした。', true); downloadBlob(blob, `${safeFilename(getProject()?.title || 'gantt')}_${format}.png`); showToast('PNGを書き出しました'); }
  async function copyPNG() { await waitForProjectSave(); const canvas = drawShareCanvas(state.settings.pngFormat || 'wide'); const blob = await canvasToBlob(canvas); if (!blob) return showToast('画像を生成できませんでした。', true); try { if (!navigator.clipboard || !window.ClipboardItem) throw new Error('clipboard unavailable'); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); showToast('画像をクリップボードにコピーしました'); } catch { downloadBlob(blob, `${safeFilename(getProject()?.title || 'gantt')}_share.png`); showToast('クリップボードに対応していないため、PNGを保存しました'); } }
  function safeFilename(value) { return String(value || 'gantt').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50); }
  function downloadBlob(blob, filename) { const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(anchor.href), 500); }

  function xmlEscape(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
  function columnName(index) { let value = ''; let current = index; while (current > 0) { const remainder = (current - 1) % 26; value = String.fromCharCode(65 + remainder) + value; current = Math.floor((current - 1) / 26); } return value; }
  function inlineCell(col, row, value, style = 0) { return `<c r="${columnName(col)}${row}" t="inlineStr" s="${style}"><is><t>${xmlEscape(value)}</t></is></c>`; }
  function blankCell(col, row, style = 0) { return `<c r="${columnName(col)}${row}" s="${style}"/>`; }
  function colorStyleIndex(color) { const keys = ['gray','blue','green','amber','red','purple']; const index = keys.indexOf(color); return index < 0 ? 0 : index; }
  function colorCellStyle(color) { return 11 + colorStyleIndex(color); }

  function xlsxSheet(project, range, tasks) {
    const startDate = parseISO(range.start); const dayCount = diffDays(range.start, range.end) + 1; const finalColumn = 4 + dayCount; const legend = getLegend(tasks); const rows = []; const merges = [];
    const cols = `<col min="1" max="1" width="31" customWidth="1"/><col min="2" max="2" width="14" customWidth="1"/><col min="3" max="4" width="13" customWidth="1"/><col min="5" max="${finalColumn}" width="4.1" customWidth="1"/>`;
    rows.push(`<row r="1" ht="28" customHeight="1">${inlineCell(1,1,state.settings.showTitle ? (project.title || 'ガントチャート') : 'ガントチャート',1)}</row>`); merges.push(`A1:${columnName(finalColumn)}1`);
    const meta = []; if (state.settings.showPeriod) meta.push(`${formatDate(range.start)}〜${formatDate(range.end)}`); if (state.settings.showUpdatedAt) meta.push(formatUpdatedAt(project.updatedAt)); if (state.settings.showMemo && project.memo) meta.push(project.memo);
    rows.push(`<row r="2" ht="20" customHeight="1">${inlineCell(1,2,meta.join('　｜　'),2)}</row>`); merges.push(`A2:${columnName(finalColumn)}2`);
    const legendCells = state.settings.showLegend ? legend.map((item,index) => inlineCell(index+1,3,`■ ${item.name}`,colorCellStyle(item.color))).join('') : ''; rows.push(`<row r="3" ht="19" customHeight="1">${legendCells}</row>`);
    const monthCells = [inlineCell(1,4,'タスク',3), inlineCell(2,4,'カテゴリ',3), inlineCell(3,4,'開始',3), inlineCell(4,4,'終了',3)]; let groupStart=0; let active=`${startDate.getUTCFullYear()}-${startDate.getUTCMonth()}`;
    for (let i=1;i<=dayCount;i+=1) { const date=i<dayCount?addDays(startDate,i):null; const key=date?`${date.getUTCFullYear()}-${date.getUTCMonth()}`:null; if(i===dayCount||key!==active){ const firstCol=5+groupStart; const lastCol=5+i-1; const monthDate=addDays(startDate,groupStart); monthCells.push(inlineCell(firstCol,4,`${monthDate.getUTCFullYear()}年${monthDate.getUTCMonth()+1}月`,3)); if(lastCol>firstCol) merges.push(`${columnName(firstCol)}4:${columnName(lastCol)}4`); groupStart=i; active=key; } }
    rows.push(`<row r="4" ht="22" customHeight="1">${monthCells.join('')}</row>`);
    const dayCells=[inlineCell(1,5,'タスク',4),inlineCell(2,5,'カテゴリ',4),inlineCell(3,5,'開始',4),inlineCell(4,5,'終了',4)];
    for(let i=0;i<dayCount;i+=1){ const date=addDays(startDate,i); const day=date.getUTCDay(); dayCells.push(inlineCell(5+i,5,`${['日','月','火','水','木','金','土'][day]}\n${date.getUTCDate()}`,day===0||day===6?5:4)); }
    rows.push(`<row r="5" ht="30" customHeight="1">${dayCells.join('')}</row>`);
    tasks.forEach((task,index)=>{ const rowNo=6+index; const cells=[inlineCell(1,rowNo,task.milestone?`◆ ${task.name}`:task.name,6),inlineCell(2,rowNo,task.category||'未分類',7),inlineCell(3,rowNo,task.start,7),inlineCell(4,rowNo,task.milestone?task.start:(task.end||task.start),7)]; const taskStart=task.start; const taskEnd=task.milestone?task.start:(task.end||task.start); for(let dayIndex=0;dayIndex<dayCount;dayIndex+=1){ const date=addDays(startDate,dayIndex); const iso=toISO(date); const weekend=date.getUTCDay(); let style=weekend===0||weekend===6?9:8; let text=''; if(task.milestone&&iso===taskStart){style=colorCellStyle(task.color);text='◆';}else if(!task.milestone&&iso>=taskStart&&iso<=taskEnd){style=colorCellStyle(task.color);} cells.push(text?inlineCell(5+dayIndex,rowNo,text,style):blankCell(5+dayIndex,rowNo,style)); } rows.push(`<row r="${rowNo}" ht="23" customHeight="1">${cells.join('')}</row>`); });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane xSplit="4" ySplit="5" topLeftCell="E6" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map((merge)=>`<mergeCell ref="${merge}"/>`).join('')}</mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/></worksheet>`;
  }
  function dataSheet(tasks) {
    const headers=['タスク名','カテゴリ','開始日','終了日','マイルストーン','締切','完了','色','メモ']; const rows=[`<row r="1" ht="22" customHeight="1">${headers.map((header,index)=>inlineCell(index+1,1,header,4)).join('')}</row>`];
    tasks.forEach((task,index)=>{const values=[task.name,task.category||'未分類',task.start,task.milestone?task.start:(task.end||task.start),task.milestone?'TRUE':'FALSE',task.deadline?'TRUE':'FALSE',task.completed?'TRUE':'FALSE',task.color||'gray',task.note||''];rows.push(`<row r="${index+2}" ht="21" customHeight="1">${values.map((value,cellIndex)=>inlineCell(cellIndex+1,index+2,value,cellIndex===8?6:7)).join('')}</row>`);});
    const columns=['32','14','13','13','14','10','10','10','48'].map((width,index)=>`<col min="${index+1}" max="${index+1}" width="${width}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${rows.join('')}</sheetData><autoFilter ref="A1:I${Math.max(1,tasks.length+1)}"/></worksheet>`;
  }
  function stylesXml() {
    const fills=['<fill><patternFill patternType="none"/></fill>','<fill><patternFill patternType="gray125"/></fill>','<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>','<fill><patternFill patternType="solid"><fgColor rgb="FFF6F7F9"/><bgColor indexed="64"/></patternFill></fill>','<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>',...['gray','blue','green','amber','red','purple'].map((key)=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${COLORS[key].xlsx}"/><bgColor indexed="64"/></patternFill></fill>`)].join('');
    const colorXfs=['gray','blue','green','amber','red','purple'].map((key,index)=>`<xf numFmtId="0" fontId="2" fillId="${5+index}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="10"/><color rgb="FF172033"/><name val="Aptos"/><family val="2"/></font><font><b/><sz val="16"/><color rgb="FF172033"/><name val="Aptos Display"/><family val="2"/></font><font><b/><sz val="10"/><color rgb="FF475569"/><name val="Aptos"/><family val="2"/></font></fonts><fills count="11">${fills}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDDE4EC"/></left><right style="thin"><color rgb="FFDDE4EC"/></right><top style="thin"><color rgb="FFDDE4EC"/></top><bottom style="thin"><color rgb="FFDDE4EC"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="17"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>${colorXfs}</cellXfs></styleSheet>`;
  }
  function createWorkbookBlob(project,range,tasks) {
    const files={
      '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="共有用ガント" sheetId="1" r:id="rId1"/><sheet name="データ一覧" sheetId="2" r:id="rId2"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml':stylesXml(), 'xl/worksheets/sheet1.xml':xlsxSheet(project,range,tasks), 'xl/worksheets/sheet2.xml':dataSheet(tasks),
    };
    return new Blob([zipStore(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  function crc32(bytes) { let crc=-1; for(let i=0;i<bytes.length;i+=1){crc^=bytes[i];for(let j=0;j<8;j+=1)crc=(crc>>>1)^(0xEDB88320&-(crc&1));} return (crc^-1)>>>0; }
  function uint16(value) { return new Uint8Array([value&255,(value>>>8)&255]); }
  function uint32(value) { return new Uint8Array([value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255]); }
  function concatBytes(chunks) { const length=chunks.reduce((sum,chunk)=>sum+chunk.length,0); const output=new Uint8Array(length); let offset=0; chunks.forEach((chunk)=>{output.set(chunk,offset);offset+=chunk.length;}); return output; }
  function dosDateTime(date=new Date()) { const year=Math.max(1980,date.getFullYear()); return {time:(date.getHours()<<11)|(date.getMinutes()<<5)|Math.floor(date.getSeconds()/2),date:((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate()}; }
  function zipStore(files) { const encoder=new TextEncoder(); const records=[]; const central=[]; let offset=0; const {time,date}=dosDateTime(); Object.entries(files).forEach(([name,content])=>{const nameBytes=encoder.encode(name);const data=content instanceof Uint8Array?content:encoder.encode(content);const crc=crc32(data);const local=concatBytes([uint32(0x04034b50),uint16(20),uint16(0),uint16(0),uint16(time),uint16(date),uint32(crc),uint32(data.length),uint32(data.length),uint16(nameBytes.length),uint16(0),nameBytes,data]);records.push(local);central.push(concatBytes([uint32(0x02014b50),uint16(20),uint16(20),uint16(0),uint16(0),uint16(time),uint16(date),uint32(crc),uint32(data.length),uint32(data.length),uint16(nameBytes.length),uint16(0),uint16(0),uint16(0),uint16(0),uint32(0),uint32(offset),nameBytes]));offset+=local.length;});const centralData=concatBytes(central);const end=concatBytes([uint32(0x06054b50),uint16(0),uint16(0),uint16(central.length),uint16(central.length),uint32(centralData.length),uint32(offset),uint16(0)]);return concatBytes([...records,centralData,end]); }
  async function exportXLSX() { await waitForProjectSave(); try { const {project,range,tasks}=getExportData(); const blob=createWorkbookBlob(project,range,tasks); downloadBlob(blob,`${safeFilename(project.title||'gantt')}_shared.xlsx`); showToast('共有用Excelを書き出しました'); } catch(error) { console.error(error); showToast('Excelを生成できませんでした。',true); } }
  async function handleAction(action) { try { if(action==='share') return enterShareMode(); if(action==='png-wide') return exportPNG('wide'); if(action==='png-a4') return exportPNG('a4'); if(action==='png-portrait') return exportPNG('portrait'); if(action==='clipboard') return copyPNG(); if(action==='xlsx') return exportXLSX(); } catch(error) { console.error(error); showToast('出力の途中でエラーが発生しました。',true); } }
  function bindEvents() {
    $('#share-open-btn').addEventListener('click',openModal); $('#share-settings-btn').addEventListener('click',openModal); $('#share-exit-btn').addEventListener('click',exitShareMode); $('#share-close-btn').addEventListener('click',closeModal);
    $('#share-modal').addEventListener('click',(event)=>{ if(event.target.closest('[data-share-close]')) closeModal(); const preset=event.target.closest('[data-preset]'); if(preset){state.settings.preset=preset.dataset.preset;saveSettings();setModalControls();if(state.inShareMode)enterShareMode();} const action=event.target.closest('[data-share-action]');if(action)handleAction(action.dataset.shareAction); });
    $('#share-modal').addEventListener('change',(event)=>{const input=event.target;if(input.matches('[data-share-setting]')){state.settings[input.dataset.shareSetting]=input.checked;saveSettings();setModalControls();if(state.inShareMode)updateShareHeader();}if(input.id==='share-custom-start'||input.id==='share-custom-end'){state.settings.customStart=$('#share-custom-start').value;state.settings.customEnd=$('#share-custom-end').value;state.settings.preset='custom';saveSettings();setModalControls();if(state.inShareMode)updateShareHeader();}});
    document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&!$('#share-modal').hidden)closeModal();});
  }
  function initialize() { injectStyles(); createUI(); bindEvents(); }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();
