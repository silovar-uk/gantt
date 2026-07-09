(() => {
  const PROJECT_KEY = 'gantt-desk:v2:project';
  const CUSTOM_PREFIX = 'gantt-desk:v4:custom-holidays:';
  const COLORS = {
    weekend: 'rgba(148, 163, 184, 0.08)',
    weekendBorder: 'rgba(148, 163, 184, 0.18)',
    holiday: 'rgba(214, 83, 79, 0.08)',
    holidayBorder: 'rgba(214, 83, 79, 0.18)',
    today: '#0f1f46',
    todaySoft: 'rgba(15, 31, 70, 0.18)',
    text: '#64748b',
  };
  const $ = (selector) => document.querySelector(selector);
  const holidayCache = new Map();
  let pendingImportHolidays = [];
  let applying = false;
  let scheduleTimer = null;
  let lastClassSignature = '';
  let lastBandSignature = '';

  function pad(value) { return String(value).padStart(2, '0'); }
  function iso(year, month, day) { return `${year}-${pad(month)}-${pad(day)}`; }
  function parseISO(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }
  function toISO(date) { return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`; }
  function addDays(value, amount) {
    const date = typeof value === 'string' ? parseISO(value) : new Date(value.getTime());
    if (!date) return value;
    date.setUTCDate(date.getUTCDate() + amount);
    return typeof value === 'string' ? toISO(date) : date;
  }
  function diffDays(start, end) { return Math.round((parseISO(end) - parseISO(start)) / 86400000); }
  function nthMonday(year, month, nth) {
    const date = new Date(Date.UTC(year, month - 1, 1));
    return 1 + ((8 - date.getUTCDay()) % 7) + (nth - 1) * 7;
  }
  function springEquinoxDay(year) { return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)); }
  function autumnEquinoxDay(year) { return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)); }

  function getProject() {
    try { return JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}'); }
    catch { return {}; }
  }
  function getProjectId(project = getProject()) { return String(project.id || 'default'); }
  function customKey(project = getProject()) { return `${CUSTOM_PREFIX}${getProjectId(project)}`; }

  function normalizeHolidayEntry(entry) {
    if (typeof entry === 'string') return parseISO(entry) ? { date: entry, name: '休業日' } : null;
    if (!entry || typeof entry !== 'object') return null;
    const date = String(entry.date || entry.day || entry.start || '').trim();
    if (!parseISO(date)) return null;
    return { date, name: String(entry.name || entry.title || entry.label || '休業日').trim() || '休業日' };
  }

  function extractHolidays(value) {
    try {
      const payload = typeof value === 'string' ? JSON.parse(value) : value;
      let source = payload;
      if (payload && typeof payload === 'object' && payload.project && typeof payload.project === 'object') source = payload.project;
      const candidates = [
        ...(Array.isArray(source?.holidays) ? source.holidays : []),
        ...(Array.isArray(source?.calendar?.holidays) ? source.calendar.holidays : []),
      ];
      const seen = new Map();
      candidates.map(normalizeHolidayEntry).filter(Boolean).forEach((item) => seen.set(item.date, item));
      return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      return [];
    }
  }

  function readCustomHolidays(project = getProject()) {
    const source = [...extractHolidays(project)];
    try {
      const stored = JSON.parse(localStorage.getItem(customKey(project)) || '[]');
      if (Array.isArray(stored)) source.push(...stored.map(normalizeHolidayEntry).filter(Boolean));
    } catch {
      // Ignore broken custom holiday cache.
    }
    const seen = new Map();
    source.forEach((item) => seen.set(item.date, item));
    return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function saveCustomHolidays(holidays, project = getProject(), { merge = true } = {}) {
    const existing = merge ? readCustomHolidays(project) : [];
    const seen = new Map(existing.map((item) => [item.date, item]));
    holidays.map(normalizeHolidayEntry).filter(Boolean).forEach((item) => seen.set(item.date, item));
    const normalized = [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem(customKey(project), JSON.stringify(normalized));
    const latest = getProject();
    latest.holidays = normalized;
    localStorage.setItem(PROJECT_KEY, JSON.stringify(latest));
    lastClassSignature = '';
    lastBandSignature = '';
    return normalized;
  }

  function baseJapaneseHolidays(year) {
    if (holidayCache.has(year)) return holidayCache.get(year);
    const holidays = [
      { date: iso(year, 1, 1), name: '元日' },
      { date: iso(year, 1, nthMonday(year, 1, 2)), name: '成人の日' },
      { date: iso(year, 2, 11), name: '建国記念の日' },
      { date: iso(year, 2, 23), name: '天皇誕生日' },
      { date: iso(year, 3, springEquinoxDay(year)), name: '春分の日' },
      { date: iso(year, 4, 29), name: '昭和の日' },
      { date: iso(year, 5, 3), name: '憲法記念日' },
      { date: iso(year, 5, 4), name: 'みどりの日' },
      { date: iso(year, 5, 5), name: 'こどもの日' },
      { date: iso(year, 7, nthMonday(year, 7, 3)), name: '海の日' },
      { date: iso(year, 8, 11), name: '山の日' },
      { date: iso(year, 9, nthMonday(year, 9, 3)), name: '敬老の日' },
      { date: iso(year, 9, autumnEquinoxDay(year)), name: '秋分の日' },
      { date: iso(year, 10, nthMonday(year, 10, 2)), name: 'スポーツの日' },
      { date: iso(year, 11, 3), name: '文化の日' },
      { date: iso(year, 11, 23), name: '勤労感謝の日' },
    ];

    const byDate = new Map(holidays.map((item) => [item.date, item]));
    holidays.forEach((item) => {
      const date = parseISO(item.date);
      if (date?.getUTCDay() !== 0) return;
      let substitute = addDays(item.date, 1);
      while (byDate.has(substitute)) substitute = addDays(substitute, 1);
      byDate.set(substitute, { date: substitute, name: '振替休日' });
    });

    const sorted = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const current = sorted[i];
      const next = sorted[i + 1];
      const between = addDays(current.date, 1);
      const betweenDate = parseISO(between);
      if (betweenDate?.getUTCDay() !== 0 && betweenDate?.getUTCDay() !== 6 && between === addDays(next.date, -1) && !byDate.has(between)) {
        byDate.set(between, { date: between, name: '国民の休日' });
      }
    }
    const result = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    holidayCache.set(year, result);
    return result;
  }

  function holidayMapForRange(start, end) {
    const startDate = parseISO(start);
    const endDate = parseISO(end);
    if (!startDate || !endDate) return new Map();
    const years = [];
    for (let year = startDate.getUTCFullYear() - 1; year <= endDate.getUTCFullYear() + 1; year += 1) years.push(year);
    const map = new Map();
    years.flatMap(baseJapaneseHolidays).forEach((item) => map.set(item.date, item));
    readCustomHolidays().forEach((item) => map.set(item.date, item));
    return map;
  }

  function getCurrentRange() {
    const project = getProject();
    const start = $('#timeline-start')?.value || project.view?.start;
    const end = $('#timeline-end')?.value || project.view?.end;
    return parseISO(start) && parseISO(end) ? { start, end } : null;
  }

  function addStyles() {
    if ($('#calendar-highlight-style')) return;
    const style = document.createElement('style');
    style.id = 'calendar-highlight-style';
    style.textContent = `
      :root {
        --calendar-weekend-bg: ${COLORS.weekend};
        --calendar-weekend-border: ${COLORS.weekendBorder};
        --calendar-holiday-bg: ${COLORS.holiday};
        --calendar-holiday-border: ${COLORS.holidayBorder};
        --calendar-today: ${COLORS.today};
        --calendar-today-soft: ${COLORS.todaySoft};
      }
      .day-cell { background:#fff; }
      .day-cell.is-weekend { background:var(--calendar-weekend-bg) !important; }
      .day-cell.is-saturday span:first-child,
      .day-cell.is-saturday span:last-child,
      .day-cell.is-sunday span:first-child,
      .day-cell.is-sunday span:last-child { color:${COLORS.text} !important; }
      .day-cell.is-holiday { background:var(--calendar-holiday-bg) !important; box-shadow:inset 0 -1px 0 var(--calendar-holiday-border); }
      .day-cell.is-holiday span:first-child,
      .day-cell.is-holiday span:last-child { color:#77545b !important; }
      .weekend-band,
      .weekend-band.is-faint { background:var(--calendar-weekend-bg) !important; }
      .weekend-marker { background:var(--calendar-weekend-border) !important; }
      .holiday-band { position:absolute; top:0; bottom:0; background:var(--calendar-holiday-bg); box-shadow:inset 1px 0 0 var(--calendar-holiday-border), inset -1px 0 0 var(--calendar-holiday-border); pointer-events:none; }
      .today-line { width:2px !important; background:var(--calendar-today) !important; box-shadow:0 0 0 1px var(--calendar-today-soft) !important; }
      .today-dot { display:none !important; }
      .week-line { background:#e5ebf2 !important; }
      .calendar-legend-bar { min-height:30px; padding:6px 18px; display:flex; align-items:center; justify-content:flex-end; gap:12px; border-top:1px solid #eef2f6; border-bottom:1px solid #e8eef5; background:rgba(255,255,255,.96); }
      .calendar-legend-title { margin-right:auto; color:#94a3b8; font-size:10px; font-weight:850; letter-spacing:.08em; }
      .calendar-legend-item { display:inline-flex; align-items:center; gap:5px; color:#64748b; font-size:11px; font-weight:800; white-space:nowrap; }
      .calendar-legend-swatch { width:16px; height:10px; border-radius:3px; border:1px solid rgba(15,23,42,.10); background:#fff; }
      .calendar-legend-swatch.is-weekend { background:var(--calendar-weekend-bg); border-color:var(--calendar-weekend-border); }
      .calendar-legend-swatch.is-holiday { background:var(--calendar-holiday-bg); border-color:var(--calendar-holiday-border); }
      .calendar-legend-swatch.is-today { width:12px; height:16px; border:0; border-radius:0; background:linear-gradient(90deg, transparent 0 5px, var(--calendar-today) 5px 7px, transparent 7px); }
      .gantt-share-mode .calendar-legend-bar { border-top:0; justify-content:flex-start; }
      @media (max-width:820px) { .calendar-legend-bar { padding:6px 12px; justify-content:flex-start; overflow-x:auto; } .calendar-legend-title { display:none; } }
      @media (max-width:650px) { .calendar-legend-item { font-size:10px; } .calendar-legend-bar { gap:9px; } }
    `;
    document.head.append(style);
  }

  function ensureLegend() {
    if ($('#calendar-legend-bar')) return;
    const header = $('.app-header');
    if (!header) return;
    const legend = document.createElement('div');
    legend.id = 'calendar-legend-bar';
    legend.className = 'calendar-legend-bar';
    legend.setAttribute('aria-label', 'カレンダー表示の凡例');
    legend.innerHTML = `
      <span class="calendar-legend-title">CALENDAR</span>
      <span class="calendar-legend-item"><span class="calendar-legend-swatch is-weekend"></span>土日</span>
      <span class="calendar-legend-item"><span class="calendar-legend-swatch is-holiday"></span>祝日・休業日</span>
      <span class="calendar-legend-item"><span class="calendar-legend-swatch is-today"></span>今日</span>`;
    header.append(legend);
  }

  function addHolidayClasses(range, holidayMap) {
    const dayCells = [...document.querySelectorAll('.day-row .day-cell')];
    const holidayKeys = [...holidayMap.keys()].filter((date) => date >= range.start && date <= range.end).join('|');
    const signature = `${range.start}_${range.end}_${dayCells.length}_${holidayKeys}`;
    if (signature === lastClassSignature) return;
    lastClassSignature = signature;

    dayCells.forEach((cell, index) => {
      const date = addDays(range.start, index);
      const holiday = holidayMap.get(date);
      cell.classList.toggle('is-holiday', Boolean(holiday));
      if (holiday) {
        cell.title = `${date} ${holiday.name}`;
        cell.setAttribute('aria-label', `${date} ${holiday.name}`);
      } else if (cell.classList.contains('is-holiday') === false) {
        if (cell.title?.includes('休業') || cell.title?.includes('休日') || cell.title?.includes('祝')) cell.removeAttribute('title');
      }
    });
  }

  function addHolidayBands(range, holidayMap) {
    const weekendLayer = $('.weekend-layer');
    const timelineBody = $('.timeline-body');
    const dayCell = $('.day-row .day-cell');
    if (!weekendLayer || !timelineBody || !dayCell) return;
    const dayWidth = Number.parseFloat(dayCell.style.width || dayCell.getBoundingClientRect().width || 0);
    const height = Number.parseFloat(timelineBody.style.height || timelineBody.getBoundingClientRect().height || 0);
    if (!dayWidth || !height) return;
    const totalDays = diffDays(range.start, range.end) + 1;
    const bands = [];
    const bandKeys = [];
    for (let index = 0; index < totalDays; index += 1) {
      const date = addDays(range.start, index);
      const holiday = holidayMap.get(date);
      if (!holiday) continue;
      const left = Math.round(index * dayWidth * 100) / 100;
      const width = Math.round(dayWidth * 100) / 100;
      const bandHeight = Math.round(height * 100) / 100;
      bandKeys.push(`${date}:${left}:${width}:${bandHeight}`);
      bands.push(`<div class="holiday-band" style="left:${left}px;width:${width}px;height:${bandHeight}px" title="${escapeHTML(holiday.name)}"></div>`);
    }
    const signature = `${range.start}_${range.end}_${bandKeys.join('|')}`;
    if (weekendLayer.dataset.holidaySignature === signature && signature === lastBandSignature) return;
    weekendLayer.dataset.holidaySignature = signature;
    lastBandSignature = signature;
    weekendLayer.querySelectorAll('.holiday-band').forEach((node) => node.remove());
    if (bands.length) weekendLayer.insertAdjacentHTML('beforeend', bands.join(''));
  }

  function escapeHTML(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function applyHighlights() {
    if (applying) return;
    applying = true;
    try {
      ensureLegend();
      const range = getCurrentRange();
      if (!range) return;
      const holidayMap = holidayMapForRange(range.start, range.end);
      addHolidayClasses(range, holidayMap);
      addHolidayBands(range, holidayMap);
    } finally {
      applying = false;
    }
  }

  function scheduleApply() {
    clearTimeout(scheduleTimer);
    scheduleTimer = setTimeout(() => requestAnimationFrame(applyHighlights), 120);
  }

  function bindImportHolidayBridge() {
    document.addEventListener('click', (event) => {
      if (event.target.closest('#validate-json-btn')) {
        pendingImportHolidays = extractHolidays($('#json-input')?.value || '');
      }
      if (event.target.closest('#apply-json-btn')) {
        const mode = document.querySelector('input[name="import-mode"]:checked')?.value || 'replace';
        const holidays = extractHolidays($('#json-input')?.value || '');
        pendingImportHolidays = holidays;
        setTimeout(() => {
          if (mode === 'replace') saveCustomHolidays(pendingImportHolidays, getProject(), { merge: false });
          else if (pendingImportHolidays.length) saveCustomHolidays(pendingImportHolidays, getProject(), { merge: true });
          pendingImportHolidays = [];
          scheduleApply();
        }, 720);
      }
    }, true);
  }

  function startObserver() {
    const start = () => {
      const canvas = $('#timeline-canvas');
      const taskList = $('#task-list');
      if (!canvas || !taskList) return setTimeout(start, 120);
      const observer = new MutationObserver((records) => {
        const shouldApply = records.some((record) => !record.target?.classList?.contains('weekend-layer'));
        if (shouldApply) scheduleApply();
      });
      observer.observe(canvas, { childList: true, attributes: true, attributeFilter: ['style', 'class'] });
      observer.observe(taskList, { childList: true });
      scheduleApply();
    };
    start();
  }

  function initialize() {
    addStyles();
    ensureLegend();
    bindImportHolidayBridge();
    startObserver();
    ['timeline-start', 'timeline-end', 'zoom-range'].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.addEventListener('change', () => { lastClassSignature = ''; lastBandSignature = ''; scheduleApply(); });
      if (input) input.addEventListener('input', () => { lastBandSignature = ''; scheduleApply(); });
    });
    window.addEventListener('resize', () => { lastBandSignature = ''; scheduleApply(); });
    window.addEventListener('storage', (event) => { if (event.key === PROJECT_KEY || event.key?.startsWith(CUSTOM_PREFIX)) { lastClassSignature = ''; lastBandSignature = ''; scheduleApply(); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
