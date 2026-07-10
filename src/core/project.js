export const STORAGE_KEY = 'gantt-desk:v2:project';
export const LEGACY_DISPLAY_KEY = 'gantt-desk:v4:display-settings';
export const APP_VERSION = 3;
export const MIN_ROW_HEIGHT = 18;
export const MAX_ROW_HEIGHT = 72;
export const MIN_DAY_WIDTH = 10;
export const MAX_DAY_WIDTH = 56;
export const MIN_PANEL_WIDTH = 320;
export const MAX_PANEL_WIDTH = 920;
export const COLOR_OPTIONS = [
  ['gray', 'グレー'],
  ['blue', '青'],
  ['green', '緑'],
  ['amber', '黄'],
  ['red', '赤'],
  ['purple', '紫'],
];

export function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(Math.max(number, min), max);
}

export function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

export function uid(prefix = 'item') {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseISO(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export function toISO(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function todayISO() {
  const now = new Date();
  return toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function addDays(value, amount) {
  const date = typeof value === 'string' ? parseISO(value) : new Date(value.getTime());
  if (!date) return todayISO();
  date.setUTCDate(date.getUTCDate() + amount);
  return typeof value === 'string' ? toISO(date) : date;
}

export function diffDays(start, end) {
  const a = typeof start === 'string' ? parseISO(start) : start;
  const b = typeof end === 'string' ? parseISO(end) : end;
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function compareISO(a, b) {
  return String(a).localeCompare(String(b));
}

export function formatDate(iso, withWeekday = false) {
  const date = parseISO(iso);
  if (!date) return '—';
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const base = `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  return withWeekday ? `${base}(${weekdays[date.getUTCDay()]})` : base;
}

export function normalizeCategory(value) {
  return String(value ?? '').trim() || '未分類';
}

export function normalizeColor(value) {
  const raw = String(value ?? 'gray').toLowerCase().trim();
  if (COLOR_OPTIONS.some(([key]) => key === raw)) return raw;
  const aliases = { grey: 'gray', yellow: 'amber', orange: 'amber', pink: 'red', violet: 'purple' };
  return aliases[raw] || 'gray';
}

export function normalizeTask(task) {
  if (!task || typeof task !== 'object') return null;
  const start = parseISO(task.start) ? task.start : null;
  const rawEnd = parseISO(task.end) ? task.end : start;
  if (!start || !rawEnd) return null;
  const milestone = Boolean(task.milestone);
  const end = milestone || compareISO(rawEnd, start) < 0 ? start : rawEnd;
  return {
    id: String(task.id || uid('task')),
    name: String(task.name ?? '').trim() || '名称未設定',
    start,
    end,
    category: normalizeCategory(task.category ?? task.categoryName),
    color: normalizeColor(task.color),
    completed: Boolean(task.completed),
    milestone,
    deadline: milestone && Boolean(task.deadline ?? task.isDeadline),
    note: String(task.note ?? ''),
  };
}

function readLegacyDisplaySettings() {
  try {
    return JSON.parse(localStorage.getItem(LEGACY_DISPLAY_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function createProject(partial = {}) {
  const today = todayISO();
  const legacy = readLegacyDisplaySettings();
  const partialView = partial.view || {};
  const start = parseISO(partialView.start) ? partialView.start : addDays(today, -7);
  const rawEnd = parseISO(partialView.end) ? partialView.end : addDays(today, 42);
  const tasks = Array.isArray(partial.tasks) ? partial.tasks.map(normalizeTask).filter(Boolean) : [];
  const categories = [...new Set([
    '未分類',
    ...(Array.isArray(partial.categories) ? partial.categories.map(normalizeCategory) : []),
    ...tasks.map((task) => task.category),
  ])];
  return {
    version: APP_VERSION,
    id: String(partial.id || uid('project')),
    title: String(partial.title || '新しいガント').trim() || '新しいガント',
    memo: String(partial.memo || ''),
    categories,
    tasks,
    view: {
      start,
      end: compareISO(start, rawEnd) <= 0 ? rawEnd : addDays(start, 42),
      dayWidth: clamp(partialView.dayWidth ?? legacy.dayWidth ?? 28, MIN_DAY_WIDTH, MAX_DAY_WIDTH),
      rowHeight: clamp(partialView.rowHeight ?? legacy.rowHeight ?? 40, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT),
      panelWidth: clamp(partialView.panelWidth ?? legacy.panelWidth ?? 500, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH),
      showCompleted: partialView.showCompleted !== false,
      categoryMode: ['show', 'color', 'hide'].includes(partialView.categoryMode ?? legacy.categoryMode)
        ? (partialView.categoryMode ?? legacy.categoryMode)
        : 'show',
      density: ['relaxed', 'standard', 'compact', 'ultra', 'custom'].includes(partialView.density ?? legacy.density)
        ? (partialView.density ?? legacy.density)
        : 'standard',
    },
    createdAt: partial.createdAt || partial.updatedAt || new Date().toISOString(),
    updatedAt: partial.updatedAt || new Date().toISOString(),
  };
}

export function loadProject() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return createProject(raw || {});
  } catch {
    return createProject();
  }
}

export function normalizeImportPayload(payload) {
  const errors = [];
  const warnings = [];
  if (!payload || typeof payload !== 'object') return { errors: ['JSONの最上位はオブジェクトにしてください。'], warnings, tasks: [], title: '' };
  const sourceTasks = Array.isArray(payload.tasks) ? payload.tasks : Array.isArray(payload) ? payload : [];
  if (!sourceTasks.length) warnings.push('読み込めるタスクがありません。');
  const tasks = [];
  sourceTasks.forEach((task, index) => {
    const normalized = normalizeTask(task);
    if (!normalized) errors.push(`${index + 1}件目の日付または形式を確認してください。`);
    else tasks.push(normalized);
  });
  return {
    errors,
    warnings,
    tasks,
    title: String(payload.title || '').trim(),
    categories: Array.isArray(payload.categories) ? payload.categories.map(normalizeCategory) : [],
  };
}

export function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function escapeAttr(value) {
  return escapeHTML(value);
}
