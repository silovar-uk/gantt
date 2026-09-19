import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

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

// 今日を起点にした6件。表示期間に必ず収まる。
function handoff() {
  const base = Date.now();
  const iso = (offset) => new Date(base + offset * 86400000).toISOString().slice(0, 10);
  const tasks = Array.from({ length: 6 }, (_, index) => ({
    name: `Card ${index + 1}`, start: iso(index * 2), end: iso(index * 2 + 3), categoryName: index % 2 ? '制作' : '企画', note: '', milestone: false,
  }));
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

const openCard = '.task-card:popover-open';

try {
  // 1-4. デスクトップ: バーも一覧行の ••• も、同じ予定カードを開く。
  const desktop = await openFresh();
  const { page } = desktop;
  await importProject(page, handoff());
  await page.locator('[data-timeline-task]').first().waitFor({ state: 'visible' });

  const bar = page.locator('[data-timeline-task]').first();
  const id = await bar.getAttribute('data-timeline-task');
  const name = await page.locator(`[data-inline-name="${id}"]`).inputValue();
  await bar.click();
  await page.locator(openCard).waitFor({ state: 'visible' });
  assert.equal(await page.locator(`${openCard} [data-card-field="name"]`).inputValue(), name, 'bar click must open the card for that task');

  await page.keyboard.press('Escape');
  await page.locator(openCard).waitFor({ state: 'hidden' });

  await page.locator(`[data-task-row="${id}"] [data-action="details"]`).click();
  await page.locator(openCard).waitFor({ state: 'visible' });
  assert.equal(await page.locator(`${openCard} [data-card-field="name"]`).inputValue(), name, 'row ••• must open the same card');
  assert.equal(await page.locator('.modal-layer').count(), 0, 'row ••• must not open the modal any more');

  await page.locator(`${openCard} [data-card-field="name"]`).fill('Renamed in card');
  await page.locator('#condition-bar').click({ position: { x: 4, y: 4 } });
  await waitSaved(page);
  assert.equal(await page.locator(`[data-inline-name="${id}"]`).inputValue(), 'Renamed in card', 'list row must show the new name');
  assert.ok((await page.locator(`[data-timeline-task="${id}"]`).getAttribute('title')).startsWith('Renamed in card'), 'bar must show the new name');

  await page.locator(`[data-timeline-task="${id}"]`).click();
  await page.locator(openCard).waitFor({ state: 'visible' });
  await page.locator(`${openCard} [data-card-nav="1"]`).click();
  await page.locator(openCard).waitFor({ state: 'visible' });
  assert.equal(await page.locator(`${openCard} [data-card-field="name"]`).inputValue(), 'Card 2', '‹ › must move to the next task without closing');
  assert.equal(desktop.errors.length, 0, desktop.errors.join('\n'));
  await desktop.context.close();

  // 5-6. モバイル: ガント表示で予定名をタップ → ボトムシート
  const mobile = await openFresh({ width: 375, height: 812, touch: true });
  await importProject(mobile.page, handoff());
  await mobile.page.locator('[data-mode="gantt"]').tap();
  const label = mobile.page.locator('.mobile-timeline-label').first();
  await label.waitFor({ state: 'visible' });
  await label.tap();
  await mobile.page.locator(openCard).waitFor({ state: 'visible' });
  assert.equal(await mobile.page.locator(`${openCard}.is-sheet`).count(), 1, 'mobile card must be a bottom sheet');
  const box = await mobile.page.locator(openCard).boundingBox();
  assert.equal(Math.round(box.width), 375, 'bottom sheet must span the screen width');
  assert.equal(mobile.errors.length, 0, mobile.errors.join('\n'));
  await mobile.context.close();

  console.log('public task-card e2e passed');
} finally {
  await browser.close();
}
