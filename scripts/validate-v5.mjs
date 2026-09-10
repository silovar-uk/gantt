import fs from 'node:fs';
import assert from 'node:assert/strict';

const sources = [
  'src/v5/classic/01.js',
  'src/v5/classic/02.js',
  'src/v5/classic/04.js',
].map((path) => fs.readFileSync(path, 'utf8')).join('\n\n');

const tests = String.raw`
assert.ok(parseISO('2028-02-29'), 'leap day should be valid');
assert.equal(parseISO('2027-02-29'), null, 'invalid leap day should be rejected');
assert.equal(parseISO('1899-12-31'), null, 'dates before supported range should be rejected');
assert.equal(parseISO('2200-01-01'), null, 'dates after supported range should be rejected');

const handoff = validateHandoff({
  handoffVersion: 1,
  tasks: [{
    name: '入稿',
    start: '2026-10-16',
    end: '2026-10-16',
    categoryName: 'WEB広告',
    note: '日本語テスト',
    milestone: true,
  }],
  needsReview: [{
    sourceText: '来月どこかで確認',
    reason: '日付が確定していない',
    missingFields: ['start', 'end'],
    candidateStart: '来月',
  }],
});
assert.deepEqual(handoff.errors, [], 'valid handoff should pass');
assert.equal(handoff.tasks.length, 1);
assert.equal(handoff.tasks[0].completed, false, 'GPT must not set completion state');
assert.equal(handoff.tasks[0].isHidden, false, 'GPT must not hide imported tasks');
assert.equal(handoff.pendingItems[0].candidateStart, '', 'ambiguous dates must not become candidate dates');

const unknown = validateHandoff({
  handoffVersion: 1,
  tasks: [{ name: '入稿', start: '2026-10-16', end: '2026-10-16', milestone: false, id: 'should-not-be-accepted' }],
  needsReview: [],
});
assert.ok(unknown.errors.some((message) => message.includes('未知の項目')), 'unknown fields must be rejected');

const prompt = buildInputPrompt({ sourceText: '10月16日に入稿。別件は来月。' });
assert.ok(prompt.includes('原文にない日付・年・期間を推測しない'), 'prompt must forbid date invention');
assert.ok(prompt.includes('needsReview'), 'prompt must route ambiguous items to needsReview');

const rows = [
  ['種別', 'カテゴリー', '件名', '開始日', '終了日', '状態'],
  ['タスク', 'WEB広告', '日本語の予定', '2026-10-01', '2026-10-09', '未完了'],
  ['タスク', '安全', '=SUM(A1:A2)', '2026-10-10', '2026-10-10', '未完了'],
];
assert.equal(safeCell('=SUM(A1:A2)'), "'=SUM(A1:A2)", 'spreadsheet formula injection must be escaped');
const xlsx = zipStore(filesFor('予定', rows));
assert.ok(xlsx.length > 1000, 'xlsx archive should be generated');
fs.writeFileSync('/tmp/gantt-v5-test.xlsx', Buffer.from(xlsx));
console.log('v5 contract tests passed');
`;

const run = new Function('assert', 'fs', `${sources}\n${tests}`);
run(assert, fs);
