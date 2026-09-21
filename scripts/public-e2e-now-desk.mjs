import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// 思想「時間が、見える」を機械で守る: いま・遅れ・締切・変化が画面に出て、道具は手元に浮かぶ。
// 予定の日付は今日からの相対で作る(#13 と同じ作法)。
const BASE = process.env.GANTT_BASE || 'https://silovar-uk.github.io/gantt/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function openFresh({ width = 1440, height = 900, touch = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('[data-action="add"]').first().waitFor({ state: 'visible' });
  return { context, page, errors };
}

async function waitSaved(page) {
  await page.waitForFunction(() => (document.querySelector('#save-status')?.textContent || '').includes('保存済み'), null, { timeout: 10000 });
}

const dayMs = 86400000;
const now = new Date();
const localMidnight = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
const iso = (offset) => new Date(localMidnight + offset * dayMs).toISOString().slice(0, 10);

// 遅れ2・進行中3・締切1(と、名前を確かめる節目1)を含む26件
function handoff() {
  const cats = ['企画', '制作', '広報', '営業'];
  const t = (name, from, to, index, milestone = false) => ({ name, start: iso(from), end: iso(milestone ? from : to), categoryName: cats[index % cats.length], note: '', milestone });
  const tasks = [
    t('遅れ予定A', -12, -4, 0),
    t('遅れ予定B', -9, -1, 1),
    t('進行中A', -3, 6, 2),
    t('進行中B', -1, 12, 3),
    t('進行中C', 0, 3, 0),
    t('締切ゴール', 40, 40, 1, true),
    t('中間の節目', 20, 20, 2, true),
    t('完了済みA', -20, -14, 3),
    t('完了済みB', -18, -10, 0),
  ];
  for (let index = 0; index < 17; index += 1) tasks.push(t(`これから ${String(index + 1).padStart(2, '0')}`, 2 + index * 2, 6 + index * 2, index));
  return { handoffVersion: 1, tasks, needsReview: [] };
}

async function importProject(page, data) {
  await page.locator('[data-toggle-menu="io-menu"]').click();
  await page.locator('#io-menu [data-action="import"]').click();
  await page.locator('.modal-layer').waitFor({ state: 'visible' });
  await page.locator('#import-input').fill(JSON.stringify(data));
  await page.locator('[data-action="validate-import"]').click();
  await page.locator('.validation-ok').waitFor({ state: 'visible' });
  const replace = page.locator('input[name="import-mode"][value="replace"]');
  if (await replace.count()) await replace.check();
  await page.locator('[data-action="apply-import"]').click();
  await waitSaved(page);
}

// 取り込み形式に無い「完了」「締切」は、画面の状態から付ける(実際の利用者が手で付けるのと同じ)
async function markCompletedAndDeadline(page) {
  await page.evaluate(() => {
    contentCommit((project) => {
      project.tasks.forEach((task) => {
        if (task.name.startsWith('完了済み')) task.completed = true;
        if (task.name === '締切ゴール') task.isDeadline = true;
      });
    }, { reason: 'test-setup' });
  });
  await waitSaved(page);
}

try {
  const desktop = await openFresh();
  const { page } = desktop;
  await importProject(page, handoff());
  await markCompletedAndDeadline(page);
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.locator('[data-timeline-task]').first().waitFor({ state: 'visible' });
  await page.waitForTimeout(800); // 初回の動き(今日線・糸)が終わるまで

  // 2. 遅れの予定は朱の糸を今日線まで引く
  assert.equal(await page.locator('.task-bar.is-late').count(), 2, 'late bars must be marked');
  assert.equal(await page.locator('.ux-late-thread').count(), 2, 'each late task must draw a thread to today');
  const todayBox = await page.locator('.today-line').first().boundingBox();
  const todayX = todayBox.x + todayBox.width / 2;
  for (const thread of await page.locator('.ux-late-thread').all()) {
    const box = await thread.boundingBox();
    assert.ok(Math.abs(box.x + box.width - todayX) <= 2, `thread must end on the today line (${box.x + box.width} vs ${todayX})`);
  }
  assert.equal(await page.locator('.ux-late-label').count(), 2);
  assert.match(await page.locator('.ux-late-label').first().innerText(), /日遅れ/);

  // 3. 今日の旗に「遅れ 2」。押すと遅れだけになり、もう一度押すと戻る
  assert.match(await page.locator('.now-flag .pill').innerText(), /今日/);
  const late = page.locator('.now-flag .late');
  assert.match(await late.innerText(), /遅れ 2/);
  await late.click();
  assert.equal(await page.locator('[data-timeline-row]').count(), 2, 'overdue filter must show only the late tasks');
  await page.locator('.now-flag .late').click();
  assert.equal(await page.locator('[data-timeline-row]').count(), 26, 'second press must restore every task');

  // 4. 締切は全行を貫く柱と、あと N 日の旗
  assert.equal(await page.locator('.ux-deadline-pillar').count(), 1);
  assert.match(await page.locator('.deadline-flag').first().innerText(), /あと/);

  // 5. 節目には名前が出る
  const milestones = await page.locator('.milestone').count();
  assert.equal(milestones, 2);
  for (const id of await page.locator('.milestone').evaluateAll((els) => els.map((el) => el.dataset.timelineTask))) {
    const row = page.locator(`[data-timeline-row="${id}"]`);
    assert.ok((await row.locator('.ux-ms-name').innerText()).trim().length > 0, 'a milestone must show its name without hover');
  }

  // 6. 「全体」を押したあと、すべての行が浮かぶ操作盤の上に収まる
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.waitForTimeout(500);
  const dockTop = (await page.locator('.toolbar').boundingBox()).y;
  const bottoms = await page.locator('[data-timeline-row]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().bottom));
  assert.ok(bottoms.length === 26 && Math.max(...bottoms) <= dockTop + 0.5, `rows must end above the dock (${Math.max(...bottoms)} vs ${dockTop})`);

  // 7. 一覧は全幅、ガントは切り替えた直後に幅を使い切る
  await page.locator('#mode-switch [data-mode="list"]').click();
  const workspaceWidth = (await page.locator('#workspace').boundingBox()).width;
  const panelWidth = (await page.locator('.task-panel').boundingBox()).width;
  assert.ok(panelWidth >= workspaceWidth * 0.9, `list must fill the width (${panelWidth} of ${workspaceWidth})`);
  await page.locator('#mode-switch [data-mode="gantt"]').click();
  await page.waitForFunction(() => {
    const scroll = document.querySelector('#timeline-scroll');
    const inner = document.querySelector('.timeline-inner');
    return scroll && inner && inner.getBoundingClientRect().width >= scroll.clientWidth * 0.95;
  }, null, { timeout: 5000 });
  await page.locator('#mode-switch [data-mode="split"]').click();

  // 8. Ctrl+K で手帳。予定名の一部を打って Enter でその予定のカードが開く
  await page.keyboard.press('Control+k');
  await page.locator('dialog.command-palette[open]').waitFor({ state: 'visible' });
  await page.keyboard.type('これから 07');
  await page.keyboard.press('Enter');
  await page.locator('.task-card:popover-open').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.task-card:popover-open [data-card-field="name"]').inputValue(), 'これから 07');
  await page.keyboard.press('Escape');
  await page.locator('.task-card:popover-open').waitFor({ state: 'hidden' });

  // 9a. 予定を1日ずらすと、前の姿が点線で残り、付箋に +1日 が出る
  await page.evaluate(() => taskSelection.selectOnly(state.project.tasks.find((task) => task.name === 'これから 03').id));
  await page.keyboard.press('Alt+ArrowRight');
  await page.locator('.ux-afterimage').first().waitFor({ state: 'attached', timeout: 3000 });
  assert.equal(await page.locator('.ux-delta-chip').first().innerText(), '+1日');
  await page.waitForFunction(() => !document.querySelector('.ux-afterimage'), null, { timeout: 4000 }); // 残像は消える

  // 9b. AIから戻したJSONで「予定をすべて入れ替え」: 移動2(9aでずらした予定が元の日付に戻る分を含む)・追加1が図に残り、「変更だけ表示」で3件になる。印は消えない
  const returned = handoff();
  const moved = returned.tasks.find((task) => task.name === '進行中A');
  moved.end = iso(10); // 6日後 → 10日後(+4日)
  returned.tasks.push({ name: '追加された予定', start: iso(3), end: iso(8), categoryName: '企画', note: '', milestone: false });
  await importProject(page, returned);
  await page.locator('.ux-afterimage').first().waitFor({ state: 'attached' });
  assert.equal(await page.locator('.ux-afterimage').count(), 2, 'each moved task keeps its afterimage');
  assert.equal(await page.locator('.ux-new-badge').count(), 1, 'one added task is marked new');
  const diffText = await page.locator('.diff-chip').innerText();
  assert.match(diffText, /移動 2/);
  assert.match(diffText, /追加 1/);
  await page.locator('[data-diff-action="only"]').click();
  assert.equal(await page.locator('[data-timeline-row]').count(), 3, 'changed-only view shows the moved and the added tasks');
  await page.locator('[data-diff-action="only"]').click();
  assert.equal(await page.locator('[data-timeline-row]').count(), 27);
  const kept = await page.evaluate(() => ({
    done: state.project.tasks.filter((task) => task.completed).map((task) => task.name).sort(),
    deadline: state.project.tasks.filter((task) => task.isDeadline).map((task) => task.name),
  }));
  assert.deepEqual(kept.done, ['完了済みA', '完了済みB'], 'completed marks must survive a full replace');
  assert.deepEqual(kept.deadline, ['締切ゴール'], 'the deadline mark must survive a full replace');
  await page.locator('[data-diff-action="dismiss"]').click();
  assert.equal(await page.locator('.diff-chip').count(), 0);
  assert.equal(await page.locator('.ux-afterimage').count(), 0);

  assert.equal(desktop.errors.length, 0, desktop.errors.join('\n'));
  await desktop.context.close();

  // 10. スマホ: はみ出し0件、操作盤は44px以上、一覧の行に小さなガント、ガントは幅を使い切る
  const mobile = await openFresh({ width: 390, height: 844, touch: true });
  await importProject(mobile.page, handoff());
  await mobile.page.waitForTimeout(800);
  const overflowing = () => mobile.page.evaluate(() => [...document.querySelectorAll('body *')]
    .filter((el) => el.getClientRects().length && !el.closest('#timeline-scroll, .popup-menu, .toast, .task-card, #modal-root, dialog') && el.getBoundingClientRect().right > 390.5)
    .map((el) => el.tagName.toLowerCase() + '.' + el.className));
  assert.deepEqual(await overflowing(), [], 'nothing may overflow the 390px screen in list mode');
  const small = await mobile.page.locator('.toolbar button:visible').evaluateAll((els) => els.map((el) => {
    const box = el.getBoundingClientRect();
    return { label: el.textContent.trim() || el.getAttribute('aria-label'), w: Math.round(box.width), h: Math.round(box.height) };
  }).filter((box) => box.w < 44 || box.h < 44));
  assert.deepEqual(small, [], 'every dock button must be at least 44px');
  assert.ok(await mobile.page.locator('.task-row .mini-span').count() > 0, 'list rows must carry the small gantt');
  await mobile.page.locator('#mode-switch button:visible').tap();
  await mobile.page.waitForFunction(() => {
    const scroll = document.querySelector('#timeline-scroll');
    const inner = document.querySelector('.timeline-inner');
    return scroll && inner && inner.getBoundingClientRect().width >= scroll.clientWidth * 0.95;
  }, null, { timeout: 5000 });
  assert.deepEqual(await overflowing(), [], 'nothing may overflow the 390px screen in gantt mode');
  assert.equal(mobile.errors.length, 0, mobile.errors.join('\n'));
  await mobile.context.close();

  console.log('public now-desk e2e passed');
} finally {
  await browser.close();
}
