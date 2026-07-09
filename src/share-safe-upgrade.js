(() => {
  const PROJECT_KEY = 'gantt-desk:v2:project';
  const SETTINGS_KEY = 'gantt-desk:v2:share-settings';
  const CUSTOM_PREFIX = 'gantt-desk:v4:custom-holidays:';
  const TASK_COLORS = {
    gray: { fill: '#cbd5e1', border: '#94a3b8', text: '#334155', xlsx: 'CBD5E1' },
    blue: { fill: '#bfdbfe', border: '#76a9e8', text: '#153967', xlsx: 'BFDBFE' },
    green: { fill: '#bbf7d0', border: '#73cb96', text: '#1c4e38', xlsx: 'BBF7D0' },
    amber: { fill: '#fde68a', border: '#efbd52', text: '#754510', xlsx: 'FDE68A' },
    red: { fill: '#fecdd3', border: '#ed8791', text: '#7d2832', xlsx: 'FECDD3' },
    purple: { fill: '#e9d5ff', border: '#bc91ec', text: '#533878', xlsx: 'E9D5FF' },
  };
  const CAL = {
    weekend: 'rgba(148, 163, 184, 0.08)',
    holiday: 'rgba(214, 83, 79, 0.08)',
    holidayBorder: 'rgba(214, 83, 79, 0.18)',
    today: '#0f1f46',
    text: '#64748b',
    weekendXlsx: 'F1F4F8',
    holidayXlsx: 'FDEEEF',
    todayXlsx: '0F1F46',
  };
  const DEFAULT_SETTINGS = {
    preset: 'current', customStart: '', customEnd: '', showTitle: true, showPeriod: true,
    showUpdatedAt: true, showLegend: true, showMemo: false, includeCompleted: true, pngFormat: 'wide',
  };
  const $ = (selector) => document.querySelector(selector);
  const holidayCache = new Map();

  function readJSON(key, fallback) {
    try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
    catch { return fallback; }
  }
  function settings() { return { ...DEFAULT_SETTINGS, ...readJSON(SETTINGS_KEY, {}) }; }
  function project() { return readJSON(PROJECT_KEY, null); }
  function parseISO(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }
  function toISO(date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }
  function addDays(value, amount) {
    const date = typeof value === 'string' ? parseISO(value) : new Date(value.getTime());
    date.setUTCDate(date.getUTCDate() + amount);
    return typeof value === 'string' ? toISO(date) : date;
  }
  function diffDays(start, end) { return Math.round((parseISO(end) - parseISO(start)) / 86400000); }
  function todayISO() { const now = new Date(); return toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))); }
  function formatDate(iso) { const date = parseISO(iso); return date ? `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日` : '—'; }
  function formatShortDate(iso) { const date = parseISO(iso); return date ? `${date.getUTCMonth() + 1}/${date.getUTCDate()}` : '—'; }
  function formatUpdatedAt(value) {
    const date = new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? '更新日不明' : `最終更新：${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  function escapeHTML(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
  function safeFilename(value) { return String(value || 'gantt').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50); }

  function currentView() {
    const p = project();
    const start = $('#timeline-start')?.value;
    const end = $('#timeline-end')?.value;
    return { start: parseISO(start) ? start : (p?.view?.start || todayISO()), end: parseISO(end) ? end : (p?.view?.end || addDays(todayISO(), 28)) };
  }
  function fitRange(p) {
    const tasks = Array.isArray(p?.tasks) ? p.tasks : [];
    if (!tasks.length) return currentView();
    const starts = tasks.map((task) => task.start).filter(parseISO).sort();
    const ends = tasks.map((task) => task.end || task.start).filter(parseISO).sort();
    return starts.length && ends.length ? { start: addDays(starts[0], -2), end: addDays(ends.at(-1), 2) } : currentView();
  }
  function rangeFor(p, s = settings()) {
    const now = todayISO();
    if (s.preset === 'all') return fitRange(p);
    if (s.preset === 'month') {
      const date = parseISO(now);
      return { start: toISO(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))), end: toISO(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))) };
    }
    if (s.preset === 'next4weeks') return { start: now, end: addDays(now, 27) };
    if (s.preset === 'custom' && parseISO(s.customStart) && parseISO(s.customEnd) && s.customStart <= s.customEnd) return { start: s.customStart, end: s.customEnd };
    return currentView();
  }
  function intersects(task, range) {
    const start = task.start;
    const end = task.milestone ? task.start : (task.end || task.start);
    return parseISO(start) && parseISO(end) && start <= range.end && end >= range.start;
  }
  function exportData() {
    const p = project();
    if (!p) throw new Error('project not found');
    const s = settings();
    const range = rangeFor(p, s);
    const tasks = (p.tasks || []).filter((task) => s.includeCompleted || !task.completed).filter((task) => intersects(task, range));
    return { project: p, settings: s, range, tasks };
  }
  function legend(tasks) {
    const seen = new Map();
    tasks.forEach((task) => {
      const name = String(task.category || '未分類');
      if (!seen.has(name)) seen.set(name, task.color in TASK_COLORS ? task.color : 'gray');
    });
    return [...seen.entries()].map(([name, color]) => ({ name, color }));
  }

  function nthMonday(year, month, nth) {
    const date = new Date(Date.UTC(year, month - 1, 1));
    return 1 + ((8 - date.getUTCDay()) % 7) + (nth - 1) * 7;
  }
  function springEquinoxDay(year) { return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)); }
  function autumnEquinoxDay(year) { return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)); }
  function baseHolidays(year) {
    if (holidayCache.has(year)) return holidayCache.get(year);
    const iso = (m, d) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const source = [
      [iso(1,1),'元日'], [iso(1,nthMonday(year,1,2)),'成人の日'], [iso(2,11),'建国記念の日'], [iso(2,23),'天皇誕生日'],
      [iso(3,springEquinoxDay(year)),'春分の日'], [iso(4,29),'昭和の日'], [iso(5,3),'憲法記念日'], [iso(5,4),'みどりの日'], [iso(5,5),'こどもの日'],
      [iso(7,nthMonday(year,7,3)),'海の日'], [iso(8,11),'山の日'], [iso(9,nthMonday(year,9,3)),'敬老の日'], [iso(9,autumnEquinoxDay(year)),'秋分の日'],
      [iso(10,nthMonday(year,10,2)),'スポーツの日'], [iso(11,3),'文化の日'], [iso(11,23),'勤労感謝の日'],
    ].map(([date, name]) => ({ date, name }));
    const map = new Map(source.map((item) => [item.date, item]));
    source.forEach((item) => {
      const d = parseISO(item.date);
      if (d?.getUTCDay() !== 0) return;
      let substitute = addDays(item.date, 1);
      while (map.has(substitute)) substitute = addDays(substitute, 1);
      map.set(substitute, { date: substitute, name: '振替休日' });
    });
    const sorted = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const between = addDays(sorted[i].date, 1);
      const d = parseISO(between);
      if (d?.getUTCDay() !== 0 && d?.getUTCDay() !== 6 && between === addDays(sorted[i + 1].date, -1) && !map.has(between)) {
        map.set(between, { date: between, name: '国民の休日' });
      }
    }
    const result = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
    holidayCache.set(year, result);
    return result;
  }
  function normalizeHoliday(entry) {
    if (typeof entry === 'string') return parseISO(entry) ? { date: entry, name: '休業日' } : null;
    if (!entry || typeof entry !== 'object') return null;
    const date = String(entry.date || entry.day || entry.start || '').trim();
    if (!parseISO(date)) return null;
    return { date, name: String(entry.name || entry.title || entry.label || '休業日').trim() || '休業日' };
  }
  function holidayMap(range) {
    const map = new Map();
    const start = parseISO(range.start);
    const end = parseISO(range.end);
    if (!start || !end) return map;
    for (let year = start.getUTCFullYear() - 1; year <= end.getUTCFullYear() + 1; year += 1) baseHolidays(year).forEach((item) => map.set(item.date, item));
    const p = project() || {};
    const customs = [...(Array.isArray(p.holidays) ? p.holidays : []), ...(Array.isArray(p.calendar?.holidays) ? p.calendar.holidays : [])];
    try {
      const stored = JSON.parse(localStorage.getItem(`${CUSTOM_PREFIX}${p.id || 'default'}`) || '[]');
      if (Array.isArray(stored)) customs.push(...stored);
    } catch {}
    customs.map(normalizeHoliday).filter(Boolean).forEach((item) => map.set(item.date, item));
    return map;
  }
  function dayKind(date, holidays) {
    const iso = typeof date === 'string' ? date : toISO(date);
    if (holidays.has(iso)) return 'holiday';
    const d = typeof date === 'string' ? parseISO(date) : date;
    return d.getUTCDay() === 0 || d.getUTCDay() === 6 ? 'weekend' : 'normal';
  }

  function addStyles() {
    if ($('#share-safe-upgrade-style')) return;
    const style = document.createElement('style');
    style.id = 'share-safe-upgrade-style';
    style.textContent = `
      .share-mode-header.share-safe-polished { min-height:0; padding:0; display:none; flex-direction:column; align-items:stretch; gap:0; }
      .gantt-share-mode .share-mode-header.share-safe-polished { display:flex; }
      .share-safe-head { min-height:72px; padding:12px 18px 10px; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:14px; align-items:center; }
      .share-safe-title-wrap { min-width:0; }
      .share-safe-head .share-mode-header__eyebrow { margin:0 0 3px; }
      .share-safe-head .share-mode-header__title { white-space:normal; }
      .share-safe-meta-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; margin-top:5px; color:#64748b; font-size:12px; }
      .share-safe-count { padding:2px 7px; border:1px solid #dbe7f3; border-radius:999px; background:#f8fbff; color:#334155; font-weight:850; }
      .share-safe-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:6px; }
      .share-safe-actions .button, .share-safe-output { min-height:32px; padding:6px 10px; border-radius:8px; font-size:12px; font-weight:850; white-space:nowrap; }
      .share-safe-output { border:1px solid #b9c6d4; background:#fff; color:#172033; cursor:pointer; }
      .share-safe-output:hover { background:#f8fafc; border-color:#8ea2b8; }
      .share-safe-legend-row { padding:7px 18px 9px; display:grid; grid-template-columns:auto minmax(0,1fr); gap:10px 18px; border-top:1px solid #eef2f6; background:#fbfdff; }
      .share-safe-calendar, .share-safe-categories { display:flex; align-items:center; gap:7px; min-width:0; }
      .share-safe-label { color:#94a3b8; font-size:10px; font-weight:900; letter-spacing:.08em; white-space:nowrap; }
      .share-safe-calendar-items { display:flex; align-items:center; gap:9px; overflow:hidden; }
      .share-safe-cal-item { display:inline-flex; align-items:center; gap:5px; color:#64748b; font-size:11px; font-weight:850; white-space:nowrap; }
      .share-safe-swatch { width:16px; height:10px; border-radius:3px; border:1px solid rgba(15,23,42,.10); background:#fff; }
      .share-safe-swatch.weekend { background:${CAL.weekend}; border-color:rgba(148,163,184,.18); }
      .share-safe-swatch.holiday { background:${CAL.holiday}; border-color:${CAL.holidayBorder}; }
      .share-safe-swatch.today { width:12px; height:16px; border:0; border-radius:0; background:linear-gradient(90deg, transparent 0 5px, ${CAL.today} 5px 7px, transparent 7px); }
      .share-mode-header__legend { justify-content:flex-start; }
      @media (max-width:820px) { .share-safe-head { grid-template-columns:1fr; align-items:start; padding:11px 12px 9px; } .share-safe-actions { justify-content:flex-start; } .share-safe-legend-row { grid-template-columns:1fr; padding:7px 12px 9px; gap:7px; } .share-safe-label { display:none; } }
      @media (max-width:520px) { .share-safe-actions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); width:100%; } .share-safe-actions .button, .share-safe-output { width:100%; } .share-safe-calendar-items { gap:7px; } .share-safe-cal-item { font-size:0; gap:0; } .share-safe-cal-item::after { content:attr(data-short); margin-left:4px; color:#64748b; font-size:10px; font-weight:900; } .share-safe-categories { display:none; } }
    `;
    document.head.append(style);
  }

  function enhanceHeader() {
    const header = $('#share-mode-header');
    if (!header || header.classList.contains('share-safe-polished')) return Boolean(header);
    const title = $('#share-header-title');
    const meta = $('#share-header-meta');
    const legendNode = $('#share-header-legend');
    const settingsButton = $('#share-settings-btn');
    const exitButton = $('#share-exit-btn');
    if (!title || !meta || !legendNode || !settingsButton || !exitButton) return false;
    header.classList.add('share-safe-polished');
    header.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'share-safe-head';
    const main = document.createElement('div');
    main.className = 'share-safe-title-wrap';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'share-mode-header__eyebrow';
    eyebrow.textContent = 'GANTT OVERVIEW';
    meta.classList.add('share-safe-meta-row');
    main.append(eyebrow, title, meta);
    const actions = document.createElement('div');
    actions.className = 'share-safe-actions';
    const png = document.createElement('button'); png.className = 'share-safe-output'; png.type = 'button'; png.textContent = 'PNG'; png.addEventListener('click', () => exportPNG('wide'));
    const xlsx = document.createElement('button'); xlsx.className = 'share-safe-output'; xlsx.type = 'button'; xlsx.textContent = 'Excel'; xlsx.addEventListener('click', () => exportXLSX());
    const copy = document.createElement('button'); copy.className = 'share-safe-output'; copy.type = 'button'; copy.textContent = 'コピー'; copy.addEventListener('click', () => copyPNG());
    settingsButton.textContent = '設定';
    exitButton.textContent = '編集に戻る';
    actions.append(png, xlsx, copy, settingsButton, exitButton);
    head.append(main, actions);
    const legendRow = document.createElement('div');
    legendRow.className = 'share-safe-legend-row';
    const calendar = document.createElement('div');
    calendar.className = 'share-safe-calendar';
    calendar.innerHTML = `<span class="share-safe-label">CALENDAR</span><div class="share-safe-calendar-items"><span class="share-safe-cal-item" data-short="土日"><span class="share-safe-swatch weekend"></span>土日</span><span class="share-safe-cal-item" data-short="祝"><span class="share-safe-swatch holiday"></span>祝日・休業日</span><span class="share-safe-cal-item" data-short="今日"><span class="share-safe-swatch today"></span>今日</span></div>`;
    const categories = document.createElement('div');
    categories.className = 'share-safe-categories';
    categories.innerHTML = '<span class="share-safe-label">CATEGORY</span>';
    categories.append(legendNode);
    legendRow.append(calendar, categories);
    header.append(head, legendRow);
    return true;
  }
  function refreshHeaderMeta() {
    const meta = $('#share-header-meta');
    if (!meta) return;
    try {
      const { range, tasks } = exportData();
      const items = [...meta.querySelectorAll('span')].map((item) => item.outerHTML).join('');
      const count = `<span class="share-safe-count">${tasks.length}件表示</span>`;
      if (!items.includes('件表示')) meta.innerHTML = `${items}${count}`;
      else meta.querySelector('.share-safe-count').textContent = `${tasks.length}件表示`;
      meta.dataset.range = `${range.start}_${range.end}`;
    } catch {}
  }

  function canvasSpec(format, taskCount) {
    const fixed = { wide: { width: 1600, height: 900 }, a4: { width: 1600, height: 1131 }, portrait: { width: 1080, height: 1350 } }[format] || { width: 1600, height: 900 };
    const top = 190; const bottom = 72; const minRow = format === 'portrait' ? 31 : 28;
    return { ...fixed, height: Math.max(fixed.height, top + Math.max(taskCount, 1) * minRow + bottom), top, bottom };
  }
  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
  }
  function drawText(ctx, text, x, y, maxWidth, options = {}) {
    const { font = '14px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color = '#172033', align = 'left' } = options;
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align;
    let output = String(text || '');
    if (maxWidth && ctx.measureText(output).width > maxWidth) { while (output.length && ctx.measureText(`${output}…`).width > maxWidth) output = output.slice(0, -1); output += '…'; }
    ctx.fillText(output, x, y);
  }
  function drawCalendarLegend(ctx, x, y) {
    const items = [{ label: '土日', color: CAL.weekend }, { label: '祝日・休業日', color: CAL.holiday }, { label: '今日', today: true }];
    let cursor = x;
    items.forEach((item) => {
      if (item.today) { ctx.strokeStyle = CAL.today; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cursor + 6, y - 12); ctx.lineTo(cursor + 6, y + 2); ctx.stroke(); }
      else { ctx.fillStyle = item.color; roundRect(ctx, cursor, y - 11, 16, 10, 3); ctx.fill(); }
      drawText(ctx, item.label, cursor + 22, y, 95, { font: '700 11px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: '#64748b' });
      cursor += item.today ? 58 : (item.label.length > 2 ? 118 : 62);
    });
    return cursor;
  }
  function drawShareCanvas(format = 'wide') {
    const { project: p, settings: s, range, tasks } = exportData();
    const spec = canvasSpec(format, tasks.length);
    const canvas = document.createElement('canvas'); canvas.width = spec.width; canvas.height = spec.height;
    const ctx = canvas.getContext('2d');
    const margin = format === 'portrait' ? 44 : 56;
    const titleY = 56;
    const legendY = s.showTitle || s.showPeriod || s.showUpdatedAt ? 122 : 72;
    const headerY = Math.max(176, legendY + (s.showLegend ? 34 : 0));
    const leftWidth = format === 'portrait' ? 355 : 430;
    const tableX = margin;
    const timelineX = tableX + leftWidth;
    const timelineWidth = spec.width - timelineX - margin;
    const totalDays = Math.max(1, diffDays(range.start, range.end) + 1);
    const dayWidth = timelineWidth / totalDays;
    const monthHeight = 26;
    const dayHeaderHeight = 31;
    const bodyY = headerY + monthHeight + dayHeaderHeight;
    const rowHeight = Math.max(28, Math.min(44, (spec.height - bodyY - spec.bottom) / Math.max(tasks.length, 1)));
    const bodyHeight = Math.max(rowHeight * Math.max(tasks.length, 1), 1);
    const holidays = holidayMap(range);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, spec.width, spec.height);
    if (s.showTitle) drawText(ctx, p.title || 'ガントチャート', margin, titleY, spec.width - margin * 2, { font: '700 29px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif' });
    const meta = [];
    if (s.showPeriod) meta.push(`${formatDate(range.start)}〜${formatDate(range.end)}`);
    if (s.showUpdatedAt) meta.push(formatUpdatedAt(p.updatedAt));
    if (s.showMemo && p.memo) meta.push(p.memo);
    meta.push(`${tasks.length}件表示`);
    drawText(ctx, meta.join('　｜　'), margin, titleY + 29, spec.width - margin * 2, { font: '13px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: '#64748b' });
    if (s.showLegend) {
      let x = drawCalendarLegend(ctx, margin, legendY) + 14;
      legend(tasks).forEach((item) => {
        const color = TASK_COLORS[item.color] || TASK_COLORS.gray;
        ctx.fillStyle = color.fill; roundRect(ctx, x, legendY - 10, 12, 12, 3); ctx.fill();
        drawText(ctx, item.name, x + 18, legendY, 105, { font: '700 11px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: '#526174' });
        x += Math.min(140, 25 + ctx.measureText(item.name).width);
      });
    }
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(tableX, headerY, leftWidth + timelineWidth, monthHeight + dayHeaderHeight);
    const startDate = parseISO(range.start);
    for (let index = 0; index < totalDays; index += 1) {
      const date = addDays(startDate, index); const iso = toISO(date); const kind = dayKind(date, holidays); const x = timelineX + index * dayWidth;
      if (kind === 'weekend' || kind === 'holiday') { ctx.fillStyle = kind === 'holiday' ? CAL.holiday : CAL.weekend; ctx.fillRect(x, headerY + monthHeight, dayWidth, dayHeaderHeight + bodyHeight); }
      if (kind === 'holiday') { ctx.strokeStyle = CAL.holidayBorder; ctx.strokeRect(x, headerY + monthHeight, dayWidth, dayHeaderHeight + bodyHeight); }
    }
    ctx.strokeStyle = '#dbe2ea'; ctx.lineWidth = 1; ctx.strokeRect(tableX, headerY, leftWidth + timelineWidth, monthHeight + dayHeaderHeight + bodyHeight);
    [['タスク', tableX + 13], ['カテゴリ', tableX + leftWidth - 128], ['期間', tableX + leftWidth - 58]].forEach(([label, x]) => drawText(ctx, label, x, headerY + monthHeight + 20, 110, { font: '700 11px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: '#64748b' }));
    let monthStartIndex = 0; let activeMonth = `${startDate.getUTCFullYear()}-${startDate.getUTCMonth()}`; const monthGroups = [];
    for (let index = 1; index <= totalDays; index += 1) { const date = index < totalDays ? addDays(startDate, index) : null; const key = date ? `${date.getUTCFullYear()}-${date.getUTCMonth()}` : null; if (index === totalDays || key !== activeMonth) { monthGroups.push({ start: monthStartIndex, end: index - 1, date: addDays(startDate, monthStartIndex) }); monthStartIndex = index; activeMonth = key; } }
    monthGroups.forEach((group) => { const x = timelineX + group.start * dayWidth; const width = (group.end - group.start + 1) * dayWidth; ctx.fillStyle = '#f8fafc'; ctx.fillRect(x, headerY, width, monthHeight); ctx.strokeStyle = '#dbe2ea'; ctx.strokeRect(x, headerY, width, monthHeight); drawText(ctx, `${group.date.getUTCFullYear()}年${group.date.getUTCMonth() + 1}月`, x + 8, headerY + 17, width - 10, { font: '700 11px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: '#526174' }); });
    for (let index = 0; index < totalDays; index += 1) {
      const date = addDays(startDate, index); const x = timelineX + index * dayWidth; const weekday = ['日','月','火','水','木','金','土'][date.getUTCDay()];
      ctx.strokeStyle = '#edf1f5'; ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, headerY + monthHeight); ctx.lineTo(Math.round(x) + .5, bodyY + bodyHeight); ctx.stroke();
      const showDate = dayWidth >= 17 || (date.getUTCDay() === 1 && dayWidth >= 9);
      if (showDate) { const color = dayKind(date, holidays) === 'holiday' ? '#77545b' : '#64748b'; drawText(ctx, weekday, x + dayWidth / 2, headerY + monthHeight + 11, dayWidth - 2, { font: '700 8px sans-serif', color, align: 'center' }); drawText(ctx, dayWidth >= 17 ? String(date.getUTCDate()) : `${date.getUTCMonth() + 1}/${date.getUTCDate()}`, x + dayWidth / 2, headerY + monthHeight + 24, dayWidth - 2, { font: '700 10px sans-serif', color, align: 'center' }); }
    }
    ctx.strokeStyle = '#dbe2ea'; ctx.beginPath(); ctx.moveTo(tableX, headerY + monthHeight); ctx.lineTo(tableX + leftWidth + timelineWidth, headerY + monthHeight); ctx.moveTo(tableX, bodyY); ctx.lineTo(tableX + leftWidth + timelineWidth, bodyY); ctx.stroke();
    tasks.forEach((task, rowIndex) => {
      const y = bodyY + rowIndex * rowHeight; const color = TASK_COLORS[task.color] || TASK_COLORS.gray;
      ctx.fillStyle = rowIndex % 2 ? 'rgba(255,255,255,.75)' : 'rgba(252,253,255,.75)'; ctx.fillRect(tableX, y, leftWidth, rowHeight);
      ctx.strokeStyle = '#edf1f5'; ctx.beginPath(); ctx.moveTo(tableX, y + rowHeight + .5); ctx.lineTo(tableX + leftWidth + timelineWidth, y + rowHeight + .5); ctx.stroke();
      const textY = y + rowHeight / 2 + 4;
      drawText(ctx, task.name, tableX + 13, textY, leftWidth - 195, { font: '700 12px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: task.completed ? '#8a98a9' : '#172033' });
      ctx.fillStyle = color.fill; roundRect(ctx, tableX + leftWidth - 130, y + (rowHeight - 20) / 2, 62, 20, 10); ctx.fill();
      drawText(ctx, task.category || '未分類', tableX + leftWidth - 99, textY, 56, { font: '700 9px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: color.text, align: 'center' });
      drawText(ctx, task.milestone ? formatShortDate(task.start) : `${formatShortDate(task.start)}〜${formatShortDate(task.end || task.start)}`, tableX + leftWidth - 8, textY, 62, { font: '10px ui-monospace, SFMono-Regular, Menlo, monospace', color: '#64748b', align: 'right' });
      const taskStart = task.start; const taskEnd = task.milestone ? task.start : (task.end || task.start);
      if (task.milestone) {
        if (taskStart >= range.start && taskStart <= range.end) { const x = timelineX + diffDays(range.start, taskStart) * dayWidth + dayWidth / 2; const midY = y + rowHeight / 2; ctx.save(); ctx.translate(x, midY); ctx.rotate(Math.PI / 4); ctx.fillStyle = color.fill; ctx.fillRect(-7, -7, 14, 14); ctx.strokeStyle = task.deadline ? '#c3474d' : color.border; ctx.lineWidth = task.deadline ? 2 : 1; ctx.strokeRect(-7, -7, 14, 14); ctx.restore(); }
      } else {
        const clippedStart = taskStart < range.start ? range.start : taskStart; const clippedEnd = taskEnd > range.end ? range.end : taskEnd;
        const x = timelineX + diffDays(range.start, clippedStart) * dayWidth + 2; const width = Math.max(6, (diffDays(clippedStart, clippedEnd) + 1) * dayWidth - 4); const barY = y + (rowHeight - 21) / 2;
        ctx.fillStyle = color.fill; roundRect(ctx, x, barY, width, 21, 5); ctx.fill(); ctx.strokeStyle = color.border; ctx.lineWidth = 1; ctx.stroke();
        if (width > 70) drawText(ctx, task.name, x + 7, barY + 14, width - 12, { font: '700 10px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: color.text });
      }
    });
    const today = todayISO();
    if (today >= range.start && today <= range.end) { const x = timelineX + diffDays(range.start, today) * dayWidth + dayWidth / 2; ctx.strokeStyle = CAL.today; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, headerY + monthHeight); ctx.lineTo(x, bodyY + bodyHeight); ctx.stroke(); }
    drawText(ctx, 'Gantt Desk', spec.width - margin, spec.height - 25, 100, { font: '10px -apple-system, BlinkMacSystemFont, sans-serif', color: '#94a3b8', align: 'right' });
    return canvas;
  }
  function canvasToBlob(canvas) { return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png')); }
  function downloadBlob(blob, filename) { const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(anchor.href), 500); }
  async function exportPNG(format) { try { await new Promise((resolve) => setTimeout(resolve, 220)); const canvas = drawShareCanvas(format); const blob = await canvasToBlob(canvas); if (!blob) throw new Error('blob failed'); downloadBlob(blob, `${safeFilename(project()?.title || 'gantt')}_${format}.png`); toast('PNGを書き出しました'); } catch (error) { console.error(error); toast('PNGを生成できませんでした', true); } }
  async function copyPNG() { try { const canvas = drawShareCanvas(settings().pngFormat || 'wide'); const blob = await canvasToBlob(canvas); if (!blob) throw new Error('blob failed'); if (!navigator.clipboard || !window.ClipboardItem) throw new Error('clipboard unavailable'); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('画像をコピーしました'); } catch { exportPNG('wide'); } }

  function xmlEscape(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
  function columnName(index) { let value = ''; let current = index; while (current > 0) { const remainder = (current - 1) % 26; value = String.fromCharCode(65 + remainder) + value; current = Math.floor((current - 1) / 26); } return value; }
  function inlineCell(col, row, value, style = 0) { return `<c r="${columnName(col)}${row}" t="inlineStr" s="${style}"><is><t>${xmlEscape(value)}</t></is></c>`; }
  function blankCell(col, row, style = 0) { return `<c r="${columnName(col)}${row}" s="${style}"/>`; }
  function colorIndex(color) { return ['gray','blue','green','amber','red','purple'].indexOf(color); }
  function colorCellStyle(color) { const index = colorIndex(color); return index < 0 ? 15 : 15 + index; }
  function dayStyle(iso, range, holidays, base = 'body') {
    const today = todayISO();
    const kind = dayKind(iso, holidays);
    const todayOffset = iso === today ? 3 : 0;
    if (base === 'header') return (kind === 'holiday' ? 6 : kind === 'weekend' ? 5 : 4) + todayOffset;
    return (kind === 'holiday' ? 11 : kind === 'weekend' ? 10 : 9) + todayOffset;
  }
  function xlsxSheet(p, range, tasks) {
    const startDate = parseISO(range.start); const dayCount = diffDays(range.start, range.end) + 1; const finalCol = 4 + dayCount; const holidays = holidayMap(range); const rows = []; const merges = [];
    const cols = `<col min="1" max="1" width="31" customWidth="1"/><col min="2" max="2" width="14" customWidth="1"/><col min="3" max="4" width="13" customWidth="1"/><col min="5" max="${finalCol}" width="4.1" customWidth="1"/>`;
    rows.push(`<row r="1" ht="28" customHeight="1">${inlineCell(1, 1, settings().showTitle ? (p.title || 'ガントチャート') : 'ガントチャート', 1)}</row>`); merges.push(`A1:${columnName(finalCol)}1`);
    const meta = []; const s = settings(); if (s.showPeriod) meta.push(`${formatDate(range.start)}〜${formatDate(range.end)}`); if (s.showUpdatedAt) meta.push(formatUpdatedAt(p.updatedAt)); if (s.showMemo && p.memo) meta.push(p.memo); meta.push(`${tasks.length}件表示`);
    rows.push(`<row r="2" ht="20" customHeight="1">${inlineCell(1, 2, meta.join('　｜　'), 2)}</row>`); merges.push(`A2:${columnName(finalCol)}2`);
    const calLegend = [inlineCell(1,3,'■ 土日',5), inlineCell(2,3,'■ 祝日・休業日',6), inlineCell(3,3,'│ 今日',12)];
    const categoryLegend = s.showLegend ? legend(tasks).map((item, index) => inlineCell(index + 5, 3, `■ ${item.name}`, colorCellStyle(item.color))).join('') : '';
    rows.push(`<row r="3" ht="19" customHeight="1">${calLegend.join('')}${categoryLegend}</row>`);
    const monthCells = [inlineCell(1,4,'タスク',3), inlineCell(2,4,'カテゴリ',3), inlineCell(3,4,'開始',3), inlineCell(4,4,'終了',3)];
    let groupStart = 0; let active = `${startDate.getUTCFullYear()}-${startDate.getUTCMonth()}`;
    for (let i = 1; i <= dayCount; i += 1) { const date = i < dayCount ? addDays(startDate, i) : null; const key = date ? `${date.getUTCFullYear()}-${date.getUTCMonth()}` : null; if (i === dayCount || key !== active) { const first = 5 + groupStart; const last = 5 + i - 1; const monthDate = addDays(startDate, groupStart); monthCells.push(inlineCell(first,4,`${monthDate.getUTCFullYear()}年${monthDate.getUTCMonth() + 1}月`,3)); if (last > first) merges.push(`${columnName(first)}4:${columnName(last)}4`); groupStart = i; active = key; } }
    rows.push(`<row r="4" ht="22" customHeight="1">${monthCells.join('')}</row>`);
    const dayCells = [inlineCell(1,5,'タスク',4), inlineCell(2,5,'カテゴリ',4), inlineCell(3,5,'開始',4), inlineCell(4,5,'終了',4)];
    for (let i = 0; i < dayCount; i += 1) { const date = addDays(startDate, i); const iso = toISO(date); dayCells.push(inlineCell(5 + i, 5, `${['日','月','火','水','木','金','土'][date.getUTCDay()]}\n${date.getUTCDate()}`, dayStyle(iso, range, holidays, 'header'))); }
    rows.push(`<row r="5" ht="30" customHeight="1">${dayCells.join('')}</row>`);
    tasks.forEach((task, index) => {
      const rowNo = 6 + index; const taskStart = task.start; const taskEnd = task.milestone ? task.start : (task.end || task.start);
      const cells = [inlineCell(1,rowNo,task.milestone ? `◆ ${task.name}` : task.name,7), inlineCell(2,rowNo,task.category || '未分類',8), inlineCell(3,rowNo,task.start,8), inlineCell(4,rowNo,taskEnd,8)];
      for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) { const iso = toISO(addDays(startDate, dayIndex)); let style = dayStyle(iso, range, holidays, 'body'); let text = ''; if (task.milestone && iso === taskStart) { style = colorCellStyle(task.color); text = '◆'; } else if (!task.milestone && iso >= taskStart && iso <= taskEnd) style = colorCellStyle(task.color); cells.push(text ? inlineCell(5 + dayIndex, rowNo, text, style) : blankCell(5 + dayIndex, rowNo, style)); }
      rows.push(`<row r="${rowNo}" ht="23" customHeight="1">${cells.join('')}</row>`);
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane xSplit="4" ySplit="5" topLeftCell="E6" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map((merge) => `<mergeCell ref="${merge}"/>`).join('')}</mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/></worksheet>`;
  }
  function dataSheet(tasks) {
    const headers = ['タスク名','カテゴリ','開始日','終了日','マイルストーン','締切','完了','色','メモ'];
    const rows = [`<row r="1" ht="22" customHeight="1">${headers.map((header, index) => inlineCell(index + 1, 1, header, 4)).join('')}</row>`];
    tasks.forEach((task, index) => {
      const values = [task.name, task.category || '未分類', task.start, task.milestone ? task.start : (task.end || task.start), task.milestone ? 'TRUE' : 'FALSE', task.deadline ? 'TRUE' : 'FALSE', task.completed ? 'TRUE' : 'FALSE', task.color || 'gray', task.note || ''];
      rows.push(`<row r="${index + 2}" ht="21" customHeight="1">${values.map((value, i) => inlineCell(i + 1, index + 2, value, i === 8 ? 7 : 8)).join('')}</row>`);
    });
    const cols = ['32','14','13','13','14','10','10','10','48'].map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData><autoFilter ref="A1:I${Math.max(1, tasks.length + 1)}"/></worksheet>`;
  }
  function stylesXml() {
    const fills = [
      '<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F4F8"/><bgColor indexed="64"/></patternFill></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFDEEEF"/><bgColor indexed="64"/></patternFill></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>',
      ...['gray','blue','green','amber','red','purple'].map((key) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${TASK_COLORS[key].xlsx}"/><bgColor indexed="64"/></patternFill></fill>`),
    ].join('');
    const colorXfs = ['gray','blue','green','amber','red','purple'].map((key, index) => `<xf numFmtId="0" fontId="2" fillId="${6 + index}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="10"/><color rgb="FF172033"/><name val="Aptos"/><family val="2"/></font><font><b/><sz val="16"/><color rgb="FF172033"/><name val="Aptos Display"/><family val="2"/></font><font><b/><sz val="10"/><color rgb="FF475569"/><name val="Aptos"/><family val="2"/></font></fonts><fills count="12">${fills}</fills><borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDDE4EC"/></left><right style="thin"><color rgb="FFDDE4EC"/></right><top style="thin"><color rgb="FFDDE4EC"/></top><bottom style="thin"><color rgb="FFDDE4EC"/></bottom><diagonal/></border><border><left style="medium"><color rgb="FF${CAL.todayXlsx}"/></left><right style="medium"><color rgb="FF${CAL.todayXlsx}"/></right><top style="thin"><color rgb="FFDDE4EC"/></top><bottom style="thin"><color rgb="FFDDE4EC"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="21"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="5" borderId="2" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="2" xfId="0" applyFill="1" applyBorder="1"/>${colorXfs}</cellXfs></styleSheet>`;
  }
  function createWorkbookBlob(p, range, tasks) {
    const files = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="共有用ガント" sheetId="1" r:id="rId1"/><sheet name="データ一覧" sheetId="2" r:id="rId2"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml': stylesXml(), 'xl/worksheets/sheet1.xml': xlsxSheet(p, range, tasks), 'xl/worksheets/sheet2.xml': dataSheet(tasks),
    };
    return new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function crc32(bytes) { let crc = -1; for (let i = 0; i < bytes.length; i += 1) { crc ^= bytes[i]; for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1)); } return (crc ^ -1) >>> 0; }
  function uint16(value) { return new Uint8Array([value & 255, (value >>> 8) & 255]); }
  function uint32(value) { return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]); }
  function concatBytes(chunks) { const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0); const output = new Uint8Array(length); let offset = 0; chunks.forEach((chunk) => { output.set(chunk, offset); offset += chunk.length; }); return output; }
  function dosDateTime(date = new Date()) { const year = Math.max(1980, date.getFullYear()); return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() }; }
  function zipStore(files) { const encoder = new TextEncoder(); const records = []; const central = []; let offset = 0; const { time, date } = dosDateTime(); Object.entries(files).forEach(([name, content]) => { const nameBytes = encoder.encode(name); const data = content instanceof Uint8Array ? content : encoder.encode(content); const crc = crc32(data); const local = concatBytes([uint32(0x04034b50), uint16(20), uint16(0), uint16(0), uint16(time), uint16(date), uint32(crc), uint32(data.length), uint32(data.length), uint16(nameBytes.length), uint16(0), nameBytes, data]); records.push(local); central.push(concatBytes([uint32(0x02014b50), uint16(20), uint16(20), uint16(0), uint16(0), uint16(time), uint16(date), uint32(crc), uint32(data.length), uint32(data.length), uint16(nameBytes.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), nameBytes])); offset += local.length; }); const centralData = concatBytes(central); const end = concatBytes([uint32(0x06054b50), uint16(0), uint16(0), uint16(central.length), uint16(central.length), uint32(centralData.length), uint32(offset), uint16(0)]); return concatBytes([...records, centralData, end]); }
  async function exportXLSX() { try { await new Promise((resolve) => setTimeout(resolve, 220)); const { project: p, range, tasks } = exportData(); const blob = createWorkbookBlob(p, range, tasks); downloadBlob(blob, `${safeFilename(p.title || 'gantt')}_shared.xlsx`); toast('共有用Excelを書き出しました'); } catch (error) { console.error(error); toast('Excelを生成できませんでした', true); } }

  function toast(message, isError = false) {
    let node = $('#share-toast') || $('#toast');
    if (!node) { node = document.createElement('div'); node.id = 'share-safe-toast'; node.className = 'share-toast'; node.hidden = true; document.body.append(node); }
    node.textContent = message; node.hidden = false; node.classList.toggle('is-error', isError); requestAnimationFrame(() => node.classList.add('is-visible'));
    clearTimeout(node._timer); node._timer = setTimeout(() => { node.classList.remove('is-visible'); setTimeout(() => { node.hidden = true; }, 180); }, 2400);
  }
  function interceptOutputs() {
    const modal = $('#share-modal');
    if (!modal || modal.dataset.safeOutputsBound === '1') return;
    modal.dataset.safeOutputsBound = '1';
    modal.addEventListener('click', (event) => {
      const action = event.target.closest('[data-share-action]')?.dataset.shareAction;
      if (!['png-wide','png-a4','png-portrait','clipboard','xlsx'].includes(action)) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      if (action === 'png-wide') return exportPNG('wide');
      if (action === 'png-a4') return exportPNG('a4');
      if (action === 'png-portrait') return exportPNG('portrait');
      if (action === 'clipboard') return copyPNG();
      if (action === 'xlsx') return exportXLSX();
    }, true);
  }
  function init() {
    addStyles();
    let attempts = 0;
    const retry = () => {
      const ok = enhanceHeader();
      interceptOutputs();
      if (!ok && attempts < 25) { attempts += 1; setTimeout(retry, 120); }
    };
    retry();
    document.addEventListener('click', (event) => {
      if (event.target.closest('#share-open-btn, #share-settings-btn, [data-share-action], #share-exit-btn')) setTimeout(() => { enhanceHeader(); refreshHeaderMeta(); }, 240);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
