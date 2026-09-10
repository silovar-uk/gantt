const SCHEMA_VERSION = 1;
const HANDOFF_VERSION = 1;
const DATE_MIN = '1900-01-01';
const DATE_MAX = '2199-12-31';
const MAX_TASKS = 1000;
const MAX_PENDING = 500;
const MAX_CATEGORIES = 100;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const DEFAULT_CATEGORY_ID = 'cat-uncategorized';
const COLOR_PALETTE = ['slate', 'indigo', 'emerald', 'amber', 'rose', 'violet', 'cyan', 'orange'];

function uid(prefix = 'item') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function deepCopy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function parseISO(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  if (value < DATE_MIN || value > DATE_MAX) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function toISO(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function todayISO() {
  const now = new Date();
  return toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

function addDays(value, amount) {
  const date = typeof value === 'string' ? parseISO(value) : new Date(value.getTime());
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + Number(amount || 0));
  return typeof value === 'string' ? toISO(date) : date;
}

function diffDays(start, end) {
  const a = parseISO(start);
  const b = parseISO(end);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

function inclusiveDays(start, end) {
  return diffDays(start, end) + 1;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function normalizeSearch(value) {
  return String(value ?? '').trim().normalize('NFKC').toLocaleLowerCase('ja-JP');
}

function formatDate(value, includeYear = false) {
  const date = parseISO(value);
  if (!date) return '—';
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const base = includeYear
    ? `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`
    : `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  return `${base}(${days[date.getUTCDay()]})`;
}

function mondayOfWeek(value = todayISO()) {
  const date = parseISO(value);
  if (!date) return todayISO();
  const day = date.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  return addDays(value, delta);
}

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeFileName(value) {
  return String(value || 'gantt').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'gantt';
}

function fileStamp(date = new Date()) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
}

function createDefaultViewSettings() {
  const today = todayISO();
  return {
    modeByBreakpoint: { desktop: 'split', tablet: 'split', mobile: 'list' },
    mode: 'split',
    scale: 'week',
    dayWidth: 12,
    rowHeight: 44,
    listWidth: 480,
    start: addDays(today, -7),
    end: addDays(today, 42),
    sort: 'manual',
    textSize: 14,
    density: 'standard',
  };
}

function createDefaultCategories() {
  return [{ id: DEFAULT_CATEGORY_ID, name: '未分類', color: 'slate', order: 0 }];
}

function createEmptyProject(partial = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: String(partial.projectId || uid('project')),
    title: String(partial.title || '新しいガント').trim().slice(0, 120) || '新しいガント',
    memo: String(partial.memo || '').slice(0, 10000),
    revision: Number.isInteger(partial.revision) && partial.revision >= 0 ? partial.revision : 0,
    updatedAt: partial.updatedAt || now,
    tasks: [],
    categories: createDefaultCategories(),
    pendingItems: [],
    viewSettings: { ...createDefaultViewSettings(), ...(partial.viewSettings || {}) },
  };
}

function categoryIdFromName(name, usedIds) {
  const normalized = normalizeSearch(name).replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 36);
  let id = normalized ? `cat-${normalized}` : uid('cat');
  let suffix = 2;
  while (usedIds.has(id)) id = `${id}-${suffix++}`;
  usedIds.add(id);
  return id;
}

function normalizeCategoryList(input, legacyTasks = []) {
  const raw = Array.isArray(input) ? input : [];
  const output = [];
  const usedIds = new Set();
  const names = new Set();
  const pushCategory = (item, index) => {
    const asObject = item && typeof item === 'object';
    const name = String(asObject ? item.name : item || '').trim().slice(0, 60) || '未分類';
    const nameKey = name.trim();
    if (names.has(nameKey)) return;
    names.add(nameKey);
    let id = asObject ? String(item.id || '').trim() : '';
    if (!id || usedIds.has(id)) id = name === '未分類' ? DEFAULT_CATEGORY_ID : categoryIdFromName(name, usedIds);
    else usedIds.add(id);
    if (name === '未分類') id = DEFAULT_CATEGORY_ID;
    const colorRaw = asObject ? item.color : '';
    const color = COLOR_PALETTE.includes(colorRaw) ? colorRaw : legacyColorToPalette(colorRaw || legacyTasks.find((t) => String(t.category || t.categoryName || '').trim() === name)?.color);
    output.push({ id, name, color, order: Number.isInteger(asObject ? item.order : null) ? item.order : index });
  };
  pushCategory({ id: DEFAULT_CATEGORY_ID, name: '未分類', color: 'slate', order: 0 }, 0);
  raw.forEach((item, index) => {
    if ((typeof item === 'string' ? item : item?.name) === '未分類') return;
    pushCategory(item, index + 1);
  });
  legacyTasks.forEach((task) => {
    const name = String(task?.category || task?.categoryName || '').trim();
    if (name && !names.has(name)) pushCategory({ name, color: task.color }, output.length);
  });
  return output.slice(0, MAX_CATEGORIES).map((category, index) => ({ ...category, order: index }));
}

function legacyColorToPalette(value) {
  const map = {
    gray: 'slate', grey: 'slate', blue: 'indigo', green: 'emerald', amber: 'amber', yellow: 'amber', red: 'rose', pink: 'rose', purple: 'violet', violet: 'violet', cyan: 'cyan', orange: 'orange',
  };
  return COLOR_PALETTE.includes(value) ? value : (map[String(value || '').toLowerCase()] || 'slate');
}

function normalizeTask(task, categories, order = 0, { strict = false } = {}) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) return { error: '予定の形式が正しくありません。' };
  const name = String(task.name ?? '').trim();
  if (!name) return { error: '予定名を入力してください。' };
  if (name.length > 200) return { error: '予定名は200文字以内にしてください。' };
  const start = String(task.start || task.date || '');
  const rawEnd = String(task.end || start);
  if (!parseISO(start)) return { error: '開始日が日付として読み取れません。' };
  if (!parseISO(rawEnd)) return { error: '終了日が日付として読み取れません。' };
  const milestone = task.milestone === true;
  const end = milestone ? start : rawEnd;
  if (start > end) return { error: '終了日は開始日以降にしてください。' };
  const categoryName = String(task.categoryName ?? task.category ?? '').trim();
  const categoryIdRaw = String(task.categoryId || '').trim();
  let category = categories.find((item) => item.id === categoryIdRaw);
  if (!category && categoryName) category = categories.find((item) => item.name === categoryName);
  if (!category) category = categories.find((item) => item.id === DEFAULT_CATEGORY_ID);
  const note = String(task.note ?? '');
  if (note.length > 5000) return { error: 'メモは5,000文字以内にしてください。' };
  const colorOverrideRaw = String(task.colorOverride || '').trim();
  const legacyColor = String(task.color || '').trim();
  const colorOverride = COLOR_PALETTE.includes(colorOverrideRaw)
    ? colorOverrideRaw
    : (strict ? '' : (legacyColor ? legacyColorToPalette(legacyColor) : ''));
  return {
    value: {
      id: String(task.id || uid('task')),
      name,
      start,
      end,
      milestone,
      completed: task.completed === true,
      categoryId: category.id,
      note,
      colorOverride,
      isDeadline: milestone && (task.isDeadline === true || task.deadline === true),
      isHidden: task.isHidden === true || task.hidden === true,
      displayNamePosition: task.displayNamePosition === 'right' ? 'right' : 'inside',
      order: Number.isInteger(task.order) && task.order >= 0 ? task.order : order,
    },
  };
}
