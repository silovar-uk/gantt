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
  let applyTimer = null;
  let retryCount = 0;
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
    if (!date || Number.isNaN(date.getTime())) return value;
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
  function escapeHTML(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function readProject() {
    try { return JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}'); }
    catch { return {}; }
  }
  function projectId(project = readProject()) { return String(project.id || 'default'); }
  function normalizeHoliday(entry) {
    if (typeof entry === 'string') return parseISO(entry) ? { date: entry, name: '休業日' } : null;
    if (!entry || typeof entry !== 'object') return null;
    const date = String(entry.date || entry.day || entry.start || '').trim();
    if (!parseISO(date)) return null;
    return { date, name: String(entry.name || entry.title || entry.label || '休業日').trim() || '休業日' };
  }
  function customHolidays(project = readProject()) {
    const holidays = [];
    if (Array.isArray(project.holidays)) holidays.push(...project.holidays.map(normalizeHoliday).filter(Boolean));
    if (Array.isArray(project.calendar?.holidays)) holidays.push(...project.calendar.holidays.map(normalizeHoliday).filter(Boolean));
    try {
      const stored = JSON.parse(localStorage.getItem(`${CUSTOM_PREFIX}${projectId(project)}`) || '[]');
      if (Array.isArray(stored)) holidays.push(...stored.map(normalizeHoliday).filter(Boolean));
    } catch {}
    const seen = new Map();
    holidays.forEach((item) => seen.set(item.date, item));
    return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
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
    const map = new Map(holidays.map((item) => [item.date, item]));
    holidays.forEach((item) => {
      const date = parseISO(item.date);
      if (date?.getUTCDay() !== 0) return;
      let substitute = addDays(item.date, 1);
      while (map.has(substitute)) substitute = addDays(substitute, 1);
      map.set(substitute, { date: substitute, name: '振替休日' });
    });
    const sorted = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const between = addDays(sorted[i].date, 1);
      const betweenDate = parseISO(between);
      if (betweenDate?.getUTCDay() !== 0 && betweenDate?.getUTCDay() !== 6 && between === addDays(sorted[i + 1].date, -1) && !map.has(between)) {
        map.set(between, { date: between, name: '国民の休日' });
      }
    }
    const result = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
    holidayCache.set(year, result);
    return result;
  }

  function currentRange() {
    const project = readProject();
    const start = $('#timeline-start')?.value || project.view?.start;
    const end = $('#timeline-end')?.value || project.view?.end;
    return parseISO(start) && parseISO(end) && start <= end ? { start, end } : null;
  }
  function holidayMapForRange(range) {
    const startDate = parseISO(range.start);
    const endDate = parseISO(range.end);
    const map = new Map();
    if (!startDate || !endDate) return map;
    for (let year = startDate.getUTCFullYear() - 1; year <= endDate.getUTCFullYear() + 1; year += 1) {
      baseJapaneseHolidays(year).forEach((item) => map.set(item.date, item));
    }
    customHolidays().forEach((item) => map.set(item.date, item));
    return map;
  }

  function addStyles() {
    if ($('#calendar-highlight-style')) return;
    const style = document.createElement('style');
    style.id = 'calendar-highlight-style';
    style.textContent = `
      :root { --calendar-weekend-bg:${COLORS.weekend}; --calendar-holiday-bg:${COLORS.holiday}; --calendar-today:${COLORS.today}; }
      .day-cell.is-weekend { background:var(--calendar-weekend-bg)!important; }
      .day-cell.is-saturday span:first-child,
      .day-cell.is-saturday span:last-child,
      .day-cell.is-sunday span:first-child,
      .day-cell.is-sunday span:last-child { color:${COLORS.text}!important; }
      .day-cell.is-holiday { background:var(--calendar-holiday-bg)!important; box-shadow:inset 0 -1px 0 ${COLORS.holidayBorder}; }
      .day-cell.is-holiday span:first-child,
      .day-cell.is-holiday span:last-child { color:#77545b!important; }
      .weekend-band,
      .weekend-band.is-faint { background:var(--calendar-weekend-bg)!important; }
      .holiday-band { position:absolute; top:0; bottom:0; background:var(--calendar-holiday-bg); box-shadow:inset 1px 0 0 ${COLORS.holidayBorder}, inset -1px 0 0 ${COLORS.holidayBorder}; pointer-events:none!important; }
      .today-line { width:2px!important; background:var(--calendar-today)!important; box-shadow:0 0 0 1px ${COLORS.todaySoft}!important; pointer-events:none!important; }
      .today-dot { display:none!important; pointer-events:none!important; }
      .calendar-legend-bar { min-height:30px; padding:6px 18px; display:flex; align-items:center; justify-content:flex-end; gap:12px; border-top:1px solid #eef2f6; border-bottom:1px solid #e8eef5; background:rgba(255,255,255,.96); }
      .calendar-legend-title { margin-right:auto; color:#94a3b8; font-size:10px; font-weight:850; letter-spacing:.08em; }
      .calendar-legend-item { display:inline-flex; align-items:center; gap:5px; color:#64748b; font-size:11px; font-weight:800; white-space:nowrap; }
      .calendar-legend-swatch { width:16px; height:10px; border-radius:3px; border:1px solid rgba(15,23,42,.10); background:#fff; }
      .calendar-legend-swatch.is-weekend { background:${COLORS.weekend}; border-color:${COLORS.weekendBorder}; }
      .calendar-legend-swatch.is-holiday { background:${COLORS.holiday}; border-color:${COLORS.holidayBorder}; }
      .calendar-legend-swatch.is-today { width:12px; height:16px; border:0; border-radius:0; background:linear-gradient(90deg, transparent 0 5px, ${COLORS.today} 5px 7px, transparent 7px); }
      @media (max-width:760px) { .calendar-legend-bar { padding:5px 12px; gap:9px; justify-content:flex-start; overflow-x:auto; } .calendar-legend-title { display:none; } .calendar-legend-item { font-size:10px; } }
      @media (max-width:430px) { .calendar-legend-item { font-size:0; gap:0; } .calendar-legend-item::after { content:attr(data-short); margin-left:4px; color:#64748b; font-size:10px; font-weight:900; } }
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
      <span class="calendar-legend-item" data-short="土日"><span class="calendar-legend-swatch is-weekend"></span>土日</span>
      <span class="calendar-legend-item" data-short="祝"><span class="calendar-legend-swatch is-holiday"></span>祝日・休業日</span>
      <span class="calendar-legend-item" data-short="今日"><span class="calendar-legend-swatch is-today"></span>今日</span>`;
    header.append(legend);
  }

  function applyClasses(range, holidays) {
    const cells = [...document.querySelectorAll('.day-row .day-cell')];
    cells.forEach((cell, index) => {
      const date = addDays(range.start, index);
      const holiday = holidays.get(date);
      cell.classList.toggle('is-holiday', Boolean(holiday));
      if (holiday) {
        cell.title = `${date} ${holiday.name}`;
        cell.setAttribute('aria-label', `${date} ${holiday.name}`);
      } else {
        cell.classList.remove('is-holiday');
        if (cell.title) cell.removeAttribute('title');
      }
    });
  }

  function applyBands(range, holidays) {
    const layer = $('.weekend-layer');
    const body = $('.timeline-body');
    const dayCell = $('.day-row .day-cell');
    if (!layer || !body || !dayCell) return;
    const dayWidth = Number.parseFloat(dayCell.style.width || dayCell.getBoundingClientRect().width || 0);
    const height = Number.parseFloat(body.style.height || body.getBoundingClientRect().height || 0);
    if (!dayWidth || !height) return;
    const totalDays = diffDays(range.start, range.end) + 1;
    const bands = [];
    const keys = [];
    for (let index = 0; index < totalDays; index += 1) {
      const date = addDays(range.start, index);
      const holiday = holidays.get(date);
      if (!holiday) continue;
      const left = Math.round(index * dayWidth * 100) / 100;
      const width = Math.round(dayWidth * 100) / 100;
      const bandHeight = Math.round(height * 100) / 100;
      keys.push(`${date}:${left}:${width}:${bandHeight}`);
      bands.push(`<div class="holiday-band" style="left:${left}px;width:${width}px;height:${bandHeight}px" title="${escapeHTML(holiday.name)}"></div>`);
    }
    const signature = `${range.start}_${range.end}_${keys.join('|')}`;
    if (signature === lastBandSignature && layer.dataset.holidaySignature === signature) return;
    lastBandSignature = signature;
    layer.dataset.holidaySignature = signature;
    layer.querySelectorAll('.holiday-band').forEach((node) => node.remove());
    if (bands.length) layer.insertAdjacentHTML('beforeend', bands.join(''));
  }

  function applyHighlights() {
    ensureLegend();
    const range = currentRange();
    if (!range || !$('.day-row .day-cell')) return false;
    const holidays = holidayMapForRange(range);
    applyClasses(range, holidays);
    applyBands(range, holidays);
    return true;
  }

  function scheduleApply(delay = 180) {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      if (!applyHighlights() && retryCount < 30) {
        retryCount += 1;
        scheduleApply(160);
      }
    }, delay);
  }

  function bindEvents() {
    ['timeline-start', 'timeline-end', 'zoom-range'].forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('change', () => { lastBandSignature = ''; scheduleApply(260); });
      input.addEventListener('input', () => { lastBandSignature = ''; scheduleApply(260); });
    });
    document.addEventListener('click', (event) => {
      if (event.target.closest('#today-btn, #zoom-in-btn, #zoom-out-btn, #add-task-btn, #add-milestone-btn, #apply-json-btn, #load-sample-btn, #reset-project-btn')) {
        lastBandSignature = '';
        scheduleApply(520);
      }
    });
    window.addEventListener('resize', () => { lastBandSignature = ''; scheduleApply(260); });
    window.addEventListener('storage', (event) => {
      if (event.key === PROJECT_KEY || event.key?.startsWith(CUSTOM_PREFIX)) {
        lastBandSignature = '';
        scheduleApply(260);
      }
    });
  }

  function initialize() {
    addStyles();
    ensureLegend();
    bindEvents();
    scheduleApply(360);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
