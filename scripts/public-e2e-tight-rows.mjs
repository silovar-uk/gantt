import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = 'https://silovar-uk.github.io/gantt/';
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

try {
  const desktop = await openFresh();
  const { page } = desktop;

  assert.equal(await page.locator('#ux-density-controls').isHidden(), true);
  assert.equal(await page.locator('#ux-row-height').getAttribute('min'), '20');
  assert.equal(await page.locator('body').getAttribute('data-tight-rows'), '20260913-tight1');

  await page.locator('[data-action="add"]').first().click();
  await page.locator('#task-form [name="name"]').fill('Tight Row E2E');
  await page.locator('#task-form [name="start"]').fill('2026-09-10');
  await page.locator('#task-form [name="end"]').fill('2026-09-12');
  await page.locator('[data-action="save-task"]').click();
  await waitSaved(page);
  await page.locator('#project-ribbon').waitFor({ state: 'visible' });

  const id = await page.locator('input.inline-name').evaluateAll((inputs) => inputs.find((el) => el.value === 'Tight Row E2E')?.dataset.inlineName || null);
  assert.ok(id);

  // Extreme compact density remains available from advanced display settings.
  await page.locator('[data-toggle-menu="ux-more-menu"]').click();
  await page.locator('#ux-more-menu [data-action="display-settings"]').click();
  await page.locator('.modal-layer').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#setting-row-height').getAttribute('min'), '20');
  await page.locator('#setting-row-height').fill('20');
  await page.locator('[data-tight-action="apply-display-settings"]').click();
  assert.equal(await page.locator('.modal-layer').count(), 0);

  const listGeometry = await page.locator(`[data-task-row="${id}"]`).evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    menuHeight: el.querySelector('.row-menu-button')?.getBoundingClientRect().height || 0,
  }));
  const timelineHeight = await page.locator(`[data-timeline-row="${id}"]`).evaluate((el) => el.getBoundingClientRect().height);
  const barHeight = await page.locator(`[data-timeline-task="${id}"]`).evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(listGeometry.height >= 19 && listGeometry.height <= 21, `list row is not 20px: ${JSON.stringify(listGeometry)}`);
  assert.ok(timelineHeight >= 19 && timelineHeight <= 21, `timeline row is not 20px: ${timelineHeight}`);
  assert.ok(listGeometry.menuHeight <= listGeometry.height, `row menu overflows: ${JSON.stringify(listGeometry)}`);
  assert.ok(barHeight >= 15 && barHeight <= 17, `bar lost density balance: ${barHeight}`);

  // Fit can still use the 20px floor while remaining within valid bounds.
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  const fittedRow = Number(await page.locator('#ux-row-height').inputValue());
  assert.ok(fittedRow >= 20 && fittedRow <= 56, `invalid fitted row height: ${fittedRow}`);

  // Existing timeline direct manipulation must still be alive.
  const bar = page.locator(`[data-timeline-task="${id}"]`);
  const box = await bar.boundingBox();
  const dayWidth = await page.locator('.timeline-inner').evaluate((el) => Number.parseFloat(el.style.getPropertyValue('--day-width')));
  assert.ok(box && dayWidth > 0);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dayWidth, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await waitSaved(page);

  assert.deepEqual(desktop.errors, [], `desktop page errors: ${desktop.errors.join(' | ')}`);
  await desktop.context.close();

  // Mobile stays overflow-free and retains the same underlying density floor without exposing tuning chrome.
  const mobile = await openFresh({ width: 390, height: 844, touch: true });
  const dims = await mobile.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  assert.ok(dims.scrollWidth <= dims.innerWidth + 1, `mobile overflow: ${JSON.stringify(dims)}`);
  assert.equal(await mobile.page.locator('#ux-density-controls').isHidden(), true);
  assert.equal(await mobile.page.locator('#ux-row-height').getAttribute('min'), '20');
  assert.deepEqual(mobile.errors, [], `mobile page errors: ${mobile.errors.join(' | ')}`);
  await mobile.context.close();

  console.log('public tight-row suite passed');
} finally {
  await browser.close();
}
