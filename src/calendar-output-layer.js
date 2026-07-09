(() => {
  const PROJECT_KEY = 'gantt-desk:v2:project';
  const SHARE_SETTINGS_KEY = 'gantt-desk:v2:share-settings';
  const CUSTOM_HOLIDAY_PREFIX = 'gantt-desk:v4:custom-holidays:';
  const CALENDAR = {
    weekend: { css: 'rgba(148, 163, 184, 0.08)', xlsx: 'F1F4F8', label: '土日' },
    holiday: { css: 'rgba(214, 83, 79, 0.08)', xlsx: 'FDEEEF', label: '祝日・休業日' },
    today: { css: '#0f1f46', xlsx: '0F1F46', label: '今日' },
    grid: '#edf1f5',
  };
  const TASK_COLORS = {
    gray: { fill: '#cbd5e1', border: '#94a3b8', text: '#334155', xlsx: 'CBD5E1' },
    blue: { fill: '#bfdbfe', border: '#76a9e8', text: '#153967', xlsx: 'BFDBFE' },
    green: { fill: '#bbf7d0', border: '#73cb96', text: '#1c4e38', xlsx: 'BBF7D0' },
    amber: { fill: '#fde68a', border: '#efbd52', text: '#754510', xlsx: 'FDE68A' },
    red: { fill: '#fecdd3', border: '#ed8791', text: '#7d2832', xlsx: 'FECDD3' },
    purple: { fill: '#e9d5ff', border: '#bc91ec', text: '#533878', xlsx: 'E9D5FF' },
  };
  const DEFAULT_SHARE_SETTINGS = {
    preset: 'current', customStart: '', customEnd: '', showTitle: true, showPeriod: true,
    showUpdatedAt: true, showLegend: true, showMemo: false, includeCompleted: true, pngFormat: 'wide',
  };
  const $ = (selector) => document.querySelector(selector);
  let toastTimer = null;

  function readProject() {
    try { return JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null'); }
    catch { return null; }
  }
  function readShareSettings() {
    try { return { ...DEFAULT_SHARE_SETTINGS, ...(JSON.parse(localStorage.getItem(SHARE_SETTINGS_KEY)) || {}) }; }
    catch { return { ...DEFAULT_SHARE_SETTINGS }; }
  }
  function pad(value) { return String(value).padStart(2, '0'); }
  function parseISO(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }
  function toISO(date) { return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`; }
  function makeISO(year, month, day) { return `${year}-${pad(month)}-${pad(day)}`; }
  function addDays(value, amount) {
    const date = typeof value === 'string' ? parseISO(value) : new Date(value.getTime());
    date.setUTCDate(date.getUTCDate() + amount);
    return typeof value === 'string' ? toISO(date) : date;
  }
  function diffDays(start, end) { return Math.round((parseISO(end) - parseISO(start)) / 86400000); }
  function todayISO() {
    const now = new Date();
    return toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  }
  function formatDate(iso) {
    const date = parseISO(iso);
    return date ? `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日` : '—';
  }
  function formatShortDate(iso) {
    const date = parseISO(iso);
    return date ? `${date.getUTCMonth() + 1}/${date.getUTCDate()}` : '—';
  }
  function formatUpdatedAt(value) {
    const date = new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? '更新日不明' : `最終更新：${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  function safeFilename(value) { return String(value || 'gantt').replace(/[\/:*?"<>|]/g, '_').slice(0, 50); }
  function xmlEscape(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
  function htmlEscape(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }

  function nthMonday(year, month, nth) {
    const date = new Date(Date.UTC(year, month - 1, 1));
    return 1 + ((8 - date.getUTCDay()) % 7) + (nth - 1) * 7;
  }
  function springEquinoxDay(year) { return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)); }
  function autumnEquinoxDay(year) { return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)); }
  function normalizeHoliday(entry) {
    if (typeof entry === 'string') return parseISO(entry) ? { date: entry, name: '休業日' } : null;
    if (!entry || typeof entry !== 'object') return null;
    const date = String(entry.date || entry.day || entry.start || '').trim();
    if (!parseISO(date)) return null;
    return { date, name: String(entry.name || entry.title || entry.label || '休業日').trim() || '休業日' };
  }
  function baseJapaneseHolidays(year) {
    const holidays = [
      { date: makeISO(year, 1, 1), name: '元日' },
      { date: makeISO(year, 1, nthMonday(year, 1, 2)), name: '成人の日' },
      { date: makeISO(year, 2, 11), name: '建国記念の日' },
      { date: makeISO(year, 2, 23), name: '天皇誕生日' },
      { date: makeISO(year, 3, springEquinoxDay(year)), name: '春分の日' },
      { date: makeISO(year, 4, 29), name: '昭和の日' },
      { date: makeISO(year, 5, 3), name: '憲法記念日' },
      { date: makeISO(year, 5, 4), name: 'みどりの日' },
      { date: makeISO(year, 5, 5), name: 'こどもの日' },
      { date: makeISO(year, 7, nthMonday(year, 7, 3)), name: '海の日' },
      { date: makeISO(year, 8, 11), name: '山の日' },
      { date: makeISO(year, 9, nthMonday(year, 9, 3)), name: '敬老の日' },
      { date: makeISO(year, 9, autumnEquinoxDay(year)), name: '秋分の日' },
      { date: makeISO(year, 10, nthMonday(year, 10, 2)), name: 'スポーツの日' },
      { date: makeISO(year, 11, 3), name: '文化の日' },
      { date: makeISO(year, 11, 23), name: '勤労感謝の日' },
    ];
    const map = new Map(holidays.map((item) => [item.date, item]));
    holidays.forEach((item) => {
      const date = parseISO(item.date);
      if (date?.getUTCDay() !== 0) return;
      let substitute = addDays(item.date, 1);
      while (map.has(substitute)) substitute = addDays(substitute, 1);
      map.set(substitute, { date: substitute, name: '振替休日' });
    });
    const sorted = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const between = addDays(sorted[index].date, 1);
      const betweenDate = parseISO(between);
      if (betweenDate?.getUTCDay() !== 0 && betweenDate?.getUTCDay() !== 6 && between === addDays(sorted[index + 1].date, -1) && !map.has(between)) {
        map.set(between, { date: between, name: '国民の休日' });
      }
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  function customHolidayKey(project) { return `${CUSTOM_HOLIDAY_PREFIX}${String(project?.id || 'default')}`; }
  function customHolidays(project) {
    const holidays = [];
    if (Array.isArray(project?.holidays)) holidays.push(...project.holidays.map(normalizeHoliday).filter(Boolean));
    if (Array.isArray(project?.calendar?.holidays)) holidays.push(...project.calendar.holidays.map(normalizeHoliday).filter(Boolean));
    try {
      const stored = JSON.parse(localStorage.getItem(customHolidayKey(project)) || '[]');
      if (Array.isArray(stored)) holidays.push(...stored.map(normalizeHoliday).filter(Boolean));
    } catch {
      // ignore
    }
    const seen = new Map();
    holidays.forEach((item) => seen.set(item.date, item));
    return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  function holidayMapForRange(project, start, end) {
    const startDate = parseISO(start);
    const endDate = parseISO(end);
    const map = new Map();
    if (!startDate || !endDate) return map;
    for (let year = startDate.getUTCFullYear() - 1; year <= endDate.getUTCFullYear() + 1; year += 1) {
      baseJapaneseHolidays(year).forEach((item) => map.set(item.date, item));
    }
    customHolidays(project).forEach((item) => map.set(item.date, item));
    return map;
  }

  function getCurrentView(project) {
    const start = $('#timeline-start')?.value;
    const end = $('#timeline-end')?.value;
    return {
      start: parseISO(start) ? start : (project?.view?.start || todayISO()),
      end: parseISO(end) ? end : (project?.view?.end || addDays(todayISO(), 28)),
    };
  }
  function fitRangeToProject(project) {
    const tasks = Array.isArray(project?.tasks) ? project.tasks : [];
    if (!tasks.length) return getCurrentView(project);
    const starts = tasks.map((task) => task.start).filter(parseISO).sort();
    const ends = tasks.map((task) => task.end || task.start).filter(parseISO).sort();
    return starts.length && ends.length ? { start: addDays(starts[0], -2), end: addDays(ends.at(-1), 2) } : getCurrentView(project);
  }
  function rangeFromPreset(project, settings) {
    const now = todayISO();
    if (settings.preset === 'all') return fitRangeToProject(project);
    if (settings.preset === 'month') {
      const date = parseISO(now);
      return { start: toISO(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))), end: toISO(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))) };
    }
    if (settings.preset === 'next4weeks') return { start: now, end: addDays(now, 27) };
    if (settings.preset === 'custom' && parseISO(settings.customStart) && parseISO(settings.customEnd) && settings.customStart <= settings.customEnd) {
      return { start: settings.customStart, end: settings.customEnd };
    }
    return getCurrentView(project);
  }
  function taskIntersects(task, range) {
    const start = task.start;
    const end = task.milestone ? task.start : (task.end || task.start);
    return parseISO(start) && parseISO(end) && start <= range.end && end >= range.start;
  }
  function exportData() {
    const project = readProject();
    if (!project) throw new Error('プロジェクトのデータを読み込めませんでした。');
    const settings = readShareSettings();
    const range = rangeFromPreset(project, settings);
    const tasks = (project.tasks || [])
      .filter((task) => settings.includeCompleted || !task.completed)
      .filter((task) => taskIntersects(task, range));
    return { project, settings, range, tasks, holidays: holidayMapForRange(project, range.start, range.end) };
  }
  function categoryLegend(tasks) {
    const seen = new Map();
    tasks.forEach((task) => {
      const category = String(task.category || '未分類');
      if (!seen.has(category)) seen.set(category, task.color in TASK_COLORS ? task.color : 'gray');
    });
    return [...seen.entries()].map(([name, color]) => ({ name, color }));
  }

  function showToast(message, isError = false) {
    let toast = $('#share-toast') || $('#calendar-output-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'calendar-output-toast';
      toast.className = 'share-toast';
      toast.hidden = true;
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.append(toast);
    }
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.toggle('is-error', isError);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    toastTimer = setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => { toast.hidden = true; }, 180);
    }, 2800);
  }
  async function waitForProjectSave() {
    document.activeElement?.blur?.();
    await new Promise((resolve) => setTimeout(resolve, 460));
  }
  function drawText(ctx, text, x, y, maxWidth, options = {}) {
    const { font = '14px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color = '#172033', align = 'left' } = options;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    let output = String(text || '');
    if (maxWidth && ctx.measureText(output).width > maxWidth) {
      while (output.length && ctx.measureText(`${output}…`).width > maxWidth) output = output.slice(0, -1);
      output += '…';
    }
    ctx.fillText(output, x, y);
  }
  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }
  function canvasSpec(format, taskCount) {
    const fixed = { wide: { width: 1600, height: 900 }, a4: { width: 1600, height: 1131 }, portrait: { width: 1080, height: 1350 } }[format] || { width: 1600, height: 900 };
    const top = 184;
    const bottom = 72;
    const minRow = format === 'portrait' ? 31 : 28;
    return { ...fixed, height: Math.max(fixed.height, top + Math.max(taskCount, 1) * minRow + bottom), top, bottom };
  }
  function drawCalendarLegend(ctx, x, y) {
    const items = [
      { label: '土日', type: 'weekend' },
      { label: '祝日・休業日', type: 'holiday' },
      { label: '今日', type: 'today' },
    ];
    let cursor = x;
    items.forEach((item) => {
      if (item.type === 'today') {
        ctx.strokeStyle = CALENDAR.today.css;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cursor + 7, y - 11);
        ctx.lineTo(cursor + 7, y + 4);
        ctx.stroke();
      } else {
        ctx.fillStyle = CALENDAR[item.type].css;
        roundRect(ctx, cursor, y - 11, 16, 11, 3);
        ctx.fill();
        ctx.strokeStyle = item.type === 'weekend' ? 'rgba(148,163,184,.18)' : 'rgba(214,83,79,.18)';
        ctx.stroke();
      }
      drawText(ctx, item.label, cursor + 22, y, 110, { font: '700 11px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: '#64748b' });
      cursor += item.type === 'holiday' ? 122 : 76;
    });
    return cursor;
  }

  function drawShareCanvas(format) {
    const { project, settings, range, tasks, holidays } = exportData();
    const spec = canvasSpec(format, tasks.length);
    const canvas = document.createElement('canvas');
    canvas.width = spec.width;
    canvas.height = spec.height;
    const ctx = canvas.getContext('2d');
    const margin = format === 'portrait' ? 44 : 56;
    const titleY = 56;
    const legendY = settings.showTitle || settings.showPeriod || settings.showUpdatedAt ? 122 : 72;
    const headerY = Math.max(170, legendY + (settings.showLegend ? 38 : 20));
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
    const today = todayISO();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, spec.width, spec.height);
    if (settings.showTitle) drawText(ctx, project.title || 'ガントチャート', margin, titleY, spec.width - margin * 2, { font: '700 29px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif' });
    const meta = [];
    if (settings.showPeriod) meta.push(`${formatDate(range.start)}〜${formatDate(range.end)}`);
    if (settings.showUpdatedAt) meta.push(formatUpdatedAt(project.updatedAt));
    if (settings.showMemo && project.memo) meta.push(project.memo);
    drawText(ctx, meta.join('　｜　'), margin, titleY + 29, spec.width - margin * 2, { font: '13px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: '#64748b' });

    if (settings.showLegend) {
      let x = margin;
      x = drawCalendarLegend(ctx, x, legendY) + 18;
      categoryLegend(tasks).forEach((item) => {
        if (x > spec.width - margin - 90) return;
        const color = TASK_COLORS[item.color] || TASK_COLORS.gray;
        ctx.fillStyle = color.fill;
        roundRect(ctx, x, legendY - 10, 12, 12, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(15,23,42,.12)';
        ctx.stroke();
        drawText(ctx, item.name, x + 18, legendY, 105, { font: '700 11px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: '#526174' });
        x += Math.min(140, 25 + ctx.measureText(item.name).width);
      });
    }

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(tableX, headerY, leftWidth, monthHeight + dayHeaderHeight);
    ctx.fillRect(timelineX, headerY, timelineWidth, monthHeight + dayHeaderHeight);
    ctx.strokeStyle = '#dbe2ea';
    ctx.lineWidth = 1;
    ctx.strokeRect(tableX, headerY, leftWidth + timelineWidth, monthHeight + dayHeaderHeight + bodyHeight);
    [['タスク', tableX + 13], ['カテゴリ', tableX + leftWidth - 128], ['期間', tableX + leftWidth - 58]].forEach(([label, x]) => {
      drawText(ctx, label, x, headerY + monthHeight + 20, 110, { font: '700 11px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: '#64748b' });
    });

    const startDate = parseISO(range.start);
    const monthGroups = [];
    let monthStartIndex = 0;
    let activeMonth = `${startDate.getUTCFullYear()}-${startDate.getUTCMonth()}`;
    for (let index = 1; index <= totalDays; index += 1) {
      const date = index < totalDays ? addDays(startDate, index) : null;
      const key = date ? `${date.getUTCFullYear()}-${date.getUTCMonth()}` : null;
      if (index === totalDays || key !== activeMonth) {
        monthGroups.push({ start: monthStartIndex, end: index - 1, date: addDays(startDate, monthStartIndex) });
        monthStartIndex = index;
        activeMonth = key;
      }
    }
    monthGroups.forEach((group) => {
      const x = timelineX + group.start * dayWidth;
      const width = (group.end - group.start + 1) * dayWidth;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(x, headerY, width, monthHeight);
      ctx.strokeStyle = '#dbe2ea';
      ctx.strokeRect(x, headerY, width, monthHeight);
      drawText(ctx, `${group.date.getUTCFullYear()}年${group.date.getUTCMonth() + 1}月`, x + 8, headerY + 17, width - 10, { font: '700 11px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: '#526174' });
    });

    for (let index = 0; index < totalDays; index += 1) {
      const date = addDays(startDate, index);
      const iso = toISO(date);
      const dayOfWeek = date.getUTCDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = holidays.has(iso);
      const x = timelineX + index * dayWidth;
      if (isWeekend || isHoliday) {
        ctx.fillStyle = isHoliday ? CALENDAR.holiday.css : CALENDAR.weekend.css;
        ctx.fillRect(x, headerY + monthHeight, dayWidth, dayHeaderHeight + bodyHeight);
      }
      ctx.strokeStyle = CALENDAR.grid;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + .5, headerY + monthHeight);
      ctx.lineTo(Math.round(x) + .5, bodyY + bodyHeight);
      ctx.stroke();
      const showDate = dayWidth >= 17 || (dayOfWeek === 1 && dayWidth >= 9);
      if (showDate) {
        const weekday = ['日','月','火','水','木','金','土'][dayOfWeek];
        drawText(ctx, weekday, x + dayWidth / 2, headerY + monthHeight + 10, dayWidth - 2, { font: '700 8px -apple-system, BlinkMacSystemFont, sans-serif', color: '#64748b', align: 'center' });
        drawText(ctx, date.getUTCDate(), x + dayWidth / 2, headerY + monthHeight + 25, dayWidth - 2, { font: '700 10px -apple-system, BlinkMacSystemFont, sans-serif', color: isHoliday ? '#77545b' : '#364152', align: 'center' });
      }
    }

    tasks.forEach((task, rowIndex) => {
      const y = bodyY + rowIndex * rowHeight;
      const color = TASK_COLORS[task.color] || TASK_COLORS.gray;
      ctx.fillStyle = rowIndex % 2 ? '#ffffff' : '#fcfdff';
      ctx.fillRect(tableX, y, leftWidth, rowHeight);
      ctx.strokeStyle = '#edf1f5';
      ctx.beginPath();
      ctx.moveTo(tableX, y + rowHeight + .5);
      ctx.lineTo(tableX + leftWidth + timelineWidth, y + rowHeight + .5);
      ctx.stroke();
      const textY = y + rowHeight / 2 + 4;
      drawText(ctx, task.name, tableX + 13, textY, leftWidth - 195, { font: '700 12px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: task.completed ? '#8a98a9' : '#172033' });
      ctx.fillStyle = '#f1f5f9';
      roundRect(ctx, tableX + leftWidth - 130, y + (rowHeight - 20) / 2, 62, 20, 10);
      ctx.fill();
      drawText(ctx, task.category || '未分類', tableX + leftWidth - 99, textY, 56, { font: '700 9px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: '#526174', align: 'center' });
      drawText(ctx, task.milestone ? formatShortDate(task.start) : `${formatShortDate(task.start)}〜${formatShortDate(task.end || task.start)}`, tableX + leftWidth - 8, textY, 62, { font: '10px ui-monospace, SFMono-Regular, Menlo, monospace', color: '#64748b', align: 'right' });
      const taskStart = task.start;
      const taskEnd = task.milestone ? task.start : (task.end || task.start);
      if (task.milestone) {
        if (taskStart >= range.start && taskStart <= range.end) {
          const x = timelineX + diffDays(range.start, taskStart) * dayWidth + dayWidth / 2;
          const midY = y + rowHeight / 2;
          ctx.save();
          ctx.translate(x, midY);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = color.fill;
          ctx.fillRect(-7, -7, 14, 14);
          ctx.strokeStyle = task.deadline ? '#c3474d' : color.border;
          ctx.lineWidth = task.deadline ? 2 : 1;
          ctx.strokeRect(-7, -7, 14, 14);
          ctx.restore();
        }
      } else {
        const clippedStart = taskStart < range.start ? range.start : taskStart;
        const clippedEnd = taskEnd > range.end ? range.end : taskEnd;
        const x = timelineX + diffDays(range.start, clippedStart) * dayWidth + 2;
        const width = Math.max(6, (diffDays(clippedStart, clippedEnd) + 1) * dayWidth - 4);
        const barY = y + (rowHeight - 21) / 2;
        ctx.fillStyle = color.fill;
        roundRect(ctx, x, barY, width, 21, 5);
        ctx.fill();
        ctx.strokeStyle = color.border;
        ctx.lineWidth = 1;
        ctx.stroke();
        if (width > 70) drawText(ctx, task.name, x + 7, barY + 14, width - 12, { font: '700 10px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif', color: color.text });
      }
    });

    if (today >= range.start && today <= range.end) {
      const x = timelineX + diffDays(range.start, today) * dayWidth + dayWidth / 2;
      ctx.strokeStyle = CALENDAR.today.css;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, headerY + monthHeight);
      ctx.lineTo(x, bodyY + bodyHeight);
      ctx.stroke();
    }
    drawText(ctx, 'Gantt Desk', spec.width - margin, spec.height - 25, 100, { font: '10px -apple-system, BlinkMacSystemFont, sans-serif', color: '#94a3b8', align: 'right' });
    return canvas;
  }

  async function canvasToBlob(canvas) { return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png')); }
  function downloadBlob(blob, filename) {
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
  }
  async function exportPNG(format) {
    await waitForProjectSave();
    const canvas = drawShareCanvas(format);
    const blob = await canvasToBlob(canvas);
    if (!blob) return showToast('PNGを生成できませんでした。', true);
    downloadBlob(blob, `${safeFilename(readProject()?.title || 'gantt')}_${format}.png`);
    showToast('PNGを書き出しました');
  }
  async function copyPNG() {
    await waitForProjectSave();
    const canvas = drawShareCanvas(readShareSettings().pngFormat || 'wide');
    const blob = await canvasToBlob(canvas);
    if (!blob) return showToast('画像を生成できませんでした。', true);
    try {
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error('clipboard unavailable');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('画像をクリップボードにコピーしました');
    } catch {
      downloadBlob(blob, `${safeFilename(readProject()?.title || 'gantt')}_share.png`);
      showToast('クリップボード非対応のため、PNGを保存しました');
    }
  }

  function columnName(index) {
    let value = '';
    let current = index;
    while (current > 0) {
      const remainder = (current - 1) % 26;
      value = String.fromCharCode(65 + remainder) + value;
      current = Math.floor((current - 1) / 26);
    }
    return value;
  }
  function inlineCell(col, row, value, style = 0) { return `<c r="${columnName(col)}${row}" t="inlineStr" s="${style}"><is><t>${xmlEscape(value)}</t></is></c>`; }
  function blankCell(col, row, style = 0) { return `<c r="${columnName(col)}${row}" s="${style}"/>`; }
  function taskColorIndex(color) { return ['gray','blue','green','amber','red','purple'].indexOf(color); }
  function taskColorCellStyle(color) { const index = taskColorIndex(color); return 13 + (index < 0 ? 0 : index); }
  function calendarStyleForDate(date, holidays, today) {
    const isoDate = toISO(date);
    const day = date.getUTCDay();
    const isToday = isoDate === today;
    const isHoliday = holidays.has(isoDate);
    if (isToday && isHoliday) return 12;
    if (isToday) return 11;
    if (isHoliday) return 10;
    if (day === 0 || day === 6) return 9;
    return 8;
  }

  function xlsxSheet(project, settings, range, tasks, holidays) {
    const startDate = parseISO(range.start);
    const dayCount = diffDays(range.start, range.end) + 1;
    const finalColumn = 4 + dayCount;
    const legend = categoryLegend(tasks);
    const rows = [];
    const merges = [];
    const today = todayISO();
    const cols = `<col min="1" max="1" width="31" customWidth="1"/><col min="2" max="2" width="14" customWidth="1"/><col min="3" max="4" width="13" customWidth="1"/><col min="5" max="${finalColumn}" width="4.1" customWidth="1"/>`;

    rows.push(`<row r="1" ht="28" customHeight="1">${inlineCell(1, 1, settings.showTitle ? (project.title || 'ガントチャート') : 'ガントチャート', 1)}</row>`);
    merges.push(`A1:${columnName(finalColumn)}1`);
    const meta = [];
    if (settings.showPeriod) meta.push(`${formatDate(range.start)}〜${formatDate(range.end)}`);
    if (settings.showUpdatedAt) meta.push(formatUpdatedAt(project.updatedAt));
    if (settings.showMemo && project.memo) meta.push(project.memo);
    rows.push(`<row r="2" ht="20" customHeight="1">${inlineCell(1, 2, meta.join('　｜　'), 2)}</row>`);
    merges.push(`A2:${columnName(finalColumn)}2`);

    let legendCells = '';
    if (settings.showLegend) {
      legendCells += inlineCell(1, 3, '■ 土日', 9);
      legendCells += inlineCell(2, 3, '■ 祝日・休業日', 10);
      legendCells += inlineCell(3, 3, '│ 今日', 11);
      legendCells += legend.map((item, index) => inlineCell(index + 5, 3, `■ ${item.name}`, taskColorCellStyle(item.color))).join('');
    }
    rows.push(`<row r="3" ht="19" customHeight="1">${legendCells}</row>`);

    const monthCells = [inlineCell(1, 4, 'タスク', 3), inlineCell(2, 4, 'カテゴリ', 3), inlineCell(3, 4, '開始', 3), inlineCell(4, 4, '終了', 3)];
    let groupStart = 0;
    let active = `${startDate.getUTCFullYear()}-${startDate.getUTCMonth()}`;
    for (let i = 1; i <= dayCount; i += 1) {
      const date = i < dayCount ? addDays(startDate, i) : null;
      const key = date ? `${date.getUTCFullYear()}-${date.getUTCMonth()}` : null;
      if (i === dayCount || key !== active) {
        const firstCol = 5 + groupStart;
        const lastCol = 5 + i - 1;
        const monthDate = addDays(startDate, groupStart);
        monthCells.push(inlineCell(firstCol, 4, `${monthDate.getUTCFullYear()}年${monthDate.getUTCMonth() + 1}月`, 3));
        if (lastCol > firstCol) merges.push(`${columnName(firstCol)}4:${columnName(lastCol)}4`);
        groupStart = i;
        active = key;
      }
    }
    rows.push(`<row r="4" ht="22" customHeight="1">${monthCells.join('')}</row>`);

    const dayCells = [inlineCell(1, 5, 'タスク', 4), inlineCell(2, 5, 'カテゴリ', 4), inlineCell(3, 5, '開始', 4), inlineCell(4, 5, '終了', 4)];
    for (let i = 0; i < dayCount; i += 1) {
      const date = addDays(startDate, i);
      const day = date.getUTCDay();
      dayCells.push(inlineCell(5 + i, 5, `${['日','月','火','水','木','金','土'][day]}\n${date.getUTCDate()}`, calendarStyleForDate(date, holidays, today)));
    }
    rows.push(`<row r="5" ht="30" customHeight="1">${dayCells.join('')}</row>`);

    tasks.forEach((task, index) => {
      const rowNo = 6 + index;
      const cells = [
        inlineCell(1, rowNo, task.milestone ? `◆ ${task.name}` : task.name, 6),
        inlineCell(2, rowNo, task.category || '未分類', 7),
        inlineCell(3, rowNo, task.start, 7),
        inlineCell(4, rowNo, task.milestone ? task.start : (task.end || task.start), 7),
      ];
      const taskStart = task.start;
      const taskEnd = task.milestone ? task.start : (task.end || task.start);
      for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
        const date = addDays(startDate, dayIndex);
        const isoDate = toISO(date);
        let style = calendarStyleForDate(date, holidays, today);
        let text = '';
        if (task.milestone && isoDate === taskStart) {
          style = taskColorCellStyle(task.color);
          text = '◆';
        } else if (!task.milestone && isoDate >= taskStart && isoDate <= taskEnd) {
          style = taskColorCellStyle(task.color);
        }
        cells.push(text ? inlineCell(5 + dayIndex, rowNo, text, style) : blankCell(5 + dayIndex, rowNo, style));
      }
      rows.push(`<row r="${rowNo}" ht="23" customHeight="1">${cells.join('')}</row>`);
    });

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane xSplit="4" ySplit="5" topLeftCell="E6" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map((merge) => `<mergeCell ref="${merge}"/>`).join('')}</mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/></worksheet>`;
  }
  function dataSheet(tasks) {
    const headers = ['タスク名','カテゴリ','開始日','終了日','マイルストーン','締切','完了','色','メモ'];
    const rows = [`<row r="1" ht="22" customHeight="1">${headers.map((header, index) => inlineCell(index + 1, 1, header, 4)).join('')}</row>`];
    tasks.forEach((task, index) => {
      const values = [task.name, task.category || '未分類', task.start, task.milestone ? task.start : (task.end || task.start), task.milestone ? 'TRUE' : 'FALSE', task.deadline ? 'TRUE' : 'FALSE', task.completed ? 'TRUE' : 'FALSE', task.color || 'gray', task.note || ''];
      rows.push(`<row r="${index + 2}" ht="21" customHeight="1">${values.map((value, cellIndex) => inlineCell(cellIndex + 1, index + 2, value, cellIndex === 8 ? 6 : 7)).join('')}</row>`);
    });
    const columns = ['32','14','13','13','14','10','10','10','48'].map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${rows.join('')}</sheetData><autoFilter ref="A1:I${Math.max(1, tasks.length + 1)}"/></worksheet>`;
  }
  function stylesXml() {
    const taskKeys = ['gray','blue','green','amber','red','purple'];
    const fills = [
      '<fill><patternFill patternType="none"/></fill>',
      '<fill><patternFill patternType="gray125"/></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>',
      `<fill><patternFill patternType="solid"><fgColor rgb="FF${CALENDAR.weekend.xlsx}"/><bgColor indexed="64"/></patternFill></fill>`,
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>',
      `<fill><patternFill patternType="solid"><fgColor rgb="FF${CALENDAR.holiday.xlsx}"/><bgColor indexed="64"/></patternFill></fill>`,
      ...taskKeys.map((key) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${TASK_COLORS[key].xlsx}"/><bgColor indexed="64"/></patternFill></fill>`),
    ].join('');
    const taskColorXfs = taskKeys.map((key, index) => `<xf numFmtId="0" fontId="2" fillId="${6 + index}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="10"/><color rgb="FF172033"/><name val="Aptos"/><family val="2"/></font><font><b/><sz val="16"/><color rgb="FF172033"/><name val="Aptos Display"/><family val="2"/></font><font><b/><sz val="10"/><color rgb="FF475569"/><name val="Aptos"/><family val="2"/></font></fonts><fills count="12">${fills}</fills><borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDDE4EC"/></left><right style="thin"><color rgb="FFDDE4EC"/></right><top style="thin"><color rgb="FFDDE4EC"/></top><bottom style="thin"><color rgb="FFDDE4EC"/></bottom><diagonal/></border><border><left style="medium"><color rgb="FF${CALENDAR.today.xlsx}"/></left><right style="medium"><color rgb="FF${CALENDAR.today.xlsx}"/></right><top style="thin"><color rgb="FFDDE4EC"/></top><bottom style="thin"><color rgb="FFDDE4EC"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="19"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="4" borderId="2" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="5" borderId="2" xfId="0" applyFill="1" applyBorder="1"/>${taskColorXfs}</cellXfs></styleSheet>`;
  }
  function crc32(bytes) {
    let crc = -1;
    for (let i = 0; i < bytes.length; i += 1) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
    return (crc ^ -1) >>> 0;
  }
  function uint16(value) { return new Uint8Array([value & 255, (value >>> 8) & 255]); }
  function uint32(value) { return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]); }
  function concatBytes(chunks) {
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    chunks.forEach((chunk) => { output.set(chunk, offset); offset += chunk.length; });
    return output;
  }
  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() };
  }
  function zipStore(files) {
    const encoder = new TextEncoder();
    const records = [];
    const central = [];
    let offset = 0;
    const { time, date } = dosDateTime();
    Object.entries(files).forEach(([name, content]) => {
      const nameBytes = encoder.encode(name);
      const data = content instanceof Uint8Array ? content : encoder.encode(content);
      const crc = crc32(data);
      const local = concatBytes([uint32(0x04034b50), uint16(20), uint16(0), uint16(0), uint16(time), uint16(date), uint32(crc), uint32(data.length), uint32(data.length), uint16(nameBytes.length), uint16(0), nameBytes, data]);
      records.push(local);
      central.push(concatBytes([uint32(0x02014b50), uint16(20), uint16(20), uint16(0), uint16(0), uint16(time), uint16(date), uint32(crc), uint32(data.length), uint32(data.length), uint16(nameBytes.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), nameBytes]));
      offset += local.length;
    });
    const centralData = concatBytes(central);
    const end = concatBytes([uint32(0x06054b50), uint16(0), uint16(0), uint16(central.length), uint16(central.length), uint32(centralData.length), uint32(offset), uint16(0)]);
    return concatBytes([...records, centralData, end]);
  }
  function createWorkbookBlob(project, settings, range, tasks, holidays) {
    const files = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="共有用ガント" sheetId="1" r:id="rId1"/><sheet name="データ一覧" sheetId="2" r:id="rId2"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml': stylesXml(),
      'xl/worksheets/sheet1.xml': xlsxSheet(project, settings, range, tasks, holidays),
      'xl/worksheets/sheet2.xml': dataSheet(tasks),
    };
    return new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  async function exportXLSX() {
    await waitForProjectSave();
    try {
      const { project, settings, range, tasks, holidays } = exportData();
      const blob = createWorkbookBlob(project, settings, range, tasks, holidays);
      downloadBlob(blob, `${safeFilename(project.title || 'gantt')}_shared.xlsx`);
      showToast('共有用Excelを書き出しました');
    } catch (error) {
      console.error(error);
      showToast('Excelを生成できませんでした。', true);
    }
  }

  function installMobileLegendFallback() {
    if (document.querySelector('#calendar-output-mobile-legend-style')) return;
    const style = document.createElement('style');
    style.id = 'calendar-output-mobile-legend-style';
    style.textContent = `
      @media (max-width:650px) {
        .calendar-legend-bar { min-height:28px; padding:5px 12px; gap:8px; }
        .calendar-legend-item { font-size:0 !important; gap:0; }
        .calendar-legend-item .calendar-legend-swatch { margin-right:0; }
        .calendar-legend-item::after { content:attr(data-short); margin-left:4px; color:#64748b; font-size:10px; font-weight:850; }
      }
      @media (max-width:420px) {
        .calendar-legend-bar { justify-content:flex-start; }
        .calendar-legend-item::after { content:''; margin-left:0; }
        .calendar-legend-swatch { width:18px; height:12px; }
        .calendar-legend-swatch.is-today { height:17px; }
      }
    `;
    document.head.append(style);
  }
  function annotateLegendItems() {
    const items = [...document.querySelectorAll('.calendar-legend-item')];
    items.forEach((item) => {
      const text = item.textContent.trim();
      if (text.includes('土日')) item.dataset.short = '土日';
      else if (text.includes('祝日')) item.dataset.short = '祝';
      else if (text.includes('今日')) item.dataset.short = '今日';
      item.title = text;
      item.setAttribute('aria-label', text);
    });
  }

  function interceptShareActions() {
    document.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-share-action]');
      if (!actionButton) return;
      const action = actionButton.dataset.shareAction;
      if (!['png-wide', 'png-a4', 'png-portrait', 'clipboard', 'xlsx'].includes(action)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (action === 'png-wide') exportPNG('wide');
      else if (action === 'png-a4') exportPNG('a4');
      else if (action === 'png-portrait') exportPNG('portrait');
      else if (action === 'clipboard') copyPNG();
      else if (action === 'xlsx') exportXLSX();
    }, true);
  }

  function initialize() {
    installMobileLegendFallback();
    annotateLegendItems();
    interceptShareActions();
    const observer = new MutationObserver(annotateLegendItems);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
