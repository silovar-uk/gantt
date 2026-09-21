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

function fortyTaskHandoff() {
  const categories = ['企画', '制作', '広報', '営業', '運用'];
  const base = Date.UTC(2026, 8, 18);
  const tasks = Array.from({ length: 40 }, (_, index) => {
    const start = new Date(base + index * 3 * 86400000);
    const end = new Date(start.getTime() + ((index % 5) + 2) * 86400000);
    const iso = (date) => date.toISOString().slice(0, 10);
    return { name: `Visible Truth ${String(index + 1).padStart(2, '0')}`, start: iso(start), end: iso(end), categoryName: categories[index % categories.length], note: '', milestone: false };
  });
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

try {
  const desktop = await openFresh();
  const { page } = desktop;

  // 1-2. Importing 40 tasks over ~4 months must render all 40 bars, not a truncated subset.
  await importProject(page, fortyTaskHandoff());
  await page.locator('[data-timeline-task]').first().waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-timeline-task]').count(), 40, 'all 40 imported tasks must be drawn');
  assert.equal(await page.locator('.result-count').innerText(), '表示中 40 / 40件');

  // 3. Pressing Overview again must not collapse 40 rows into Shape.
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.waitForTimeout(120);
  assert.equal(await page.locator('.workspace.mode-macro').count(), 0, '40 tasks must stay in row representation at the 14px floor');
  assert.equal(await page.locator('[data-timeline-task]').count(), 40, 'bars must survive a repeated Overview press');

  // 4. Nothing should be reported as hidden outside the (now full-range) view.
  assert.equal(await page.locator('.view-notice').count(), 0, 'condition bar must not report tasks outside the view');

  // 5. The Time Window covers (at least) 95% of the full project range right after import.
  const rail = page.locator('.time-compass-rail');
  await rail.waitFor({ state: 'visible' });
  const railBox = await rail.boundingBox();
  const viewportEl = page.locator('#project-ribbon-viewport');
  const isWhole = (await page.locator('#project-ribbon-track').getAttribute('class'))?.includes('is-whole');
  if (isWhole) {
    assert.equal(await viewportEl.isHidden(), true, 'a whole Time Window hides its own viewport rectangle');
  } else {
    const viewportBox = await viewportEl.boundingBox();
    assert.ok(railBox && viewportBox && viewportBox.width >= railBox.width * 0.95, `Time Window is not covering the full range: ${JSON.stringify({ railBox, viewportBox })}`);
  }

  // 6. Dragging the window's start handle forward must move viewSettings.start and reveal the "全体" chip.
  // Zoom in first so the window no longer spans the whole rail and its edge handles become interactive.
  for (let i = 0; i < 4; i += 1) await page.locator('[data-ux-action="zoom-in"]').click();
  await page.waitForFunction(() => document.querySelector('#project-ribbon-track')?.classList.contains('is-navigator'));
  const beforeStart = await page.evaluate(() => state.project.viewSettings.start);
  const startHandle = page.locator('[data-window-handle="start"]');
  const handleBox = await startHandle.boundingBox();
  assert.ok(handleBox, 'start handle must be present');
  await page.evaluate(({ x, y }) => {
    const handle = document.querySelector('[data-window-handle="start"]');
    handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 101 }));
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: x + 120, clientY: y, pointerId: 101 }));
  }, { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 });
  await page.waitForTimeout(80);
  await page.evaluate(({ x, y }) => {
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: x + 120, clientY: y, pointerId: 101 }));
  }, { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 });
  await page.waitForTimeout(120);
  const afterStart = await page.evaluate(() => state.project.viewSettings.start);
  assert.ok(afterStart > beforeStart, `dragging the start handle forward must advance viewSettings.start: ${beforeStart} -> ${afterStart}`);
  await page.locator('.time-window-chip').waitFor({ state: 'visible' });

  // 7. Pressing the chip must return the window to the full project range.
  await page.locator('.time-window-chip').click();
  await page.waitForTimeout(120);
  const revertedStart = await page.evaluate(() => state.project.viewSettings.start);
  assert.equal(revertedStart, beforeStart, 'the "全体" chip must restore the original full-range window start');
  assert.equal(await page.locator('.time-window-chip').isHidden(), true, 'the chip hides again once the window covers the whole range');

  assert.deepEqual(desktop.errors, [], `desktop page errors: ${desktop.errors.join(' | ')}`);
  await desktop.context.close();

  // 8. At 375px, the 一覧/ガント toggle is visible and switching to ガント draws the timeline.
  const mobile = await openFresh({ width: 375, height: 812, touch: true });
  await importProject(mobile.page, fortyTaskHandoff());
  const modeSwitch = mobile.page.locator('#mode-switch');
  await modeSwitch.waitFor({ state: 'visible' });
  const ganttButton = modeSwitch.locator('[data-mode="gantt"]');
  await ganttButton.waitFor({ state: 'visible' });
  await ganttButton.click();
  await mobile.page.locator('[data-timeline-task]').first().waitFor({ state: 'visible' });
  assert.ok(await mobile.page.locator('[data-timeline-task]').count() > 0, 'ガント must draw the timeline on mobile');
  const dims = await mobile.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  assert.ok(dims.scrollWidth <= dims.innerWidth + 1, `mobile overflow after switching to ガント: ${JSON.stringify(dims)}`);
  assert.deepEqual(mobile.errors, [], `mobile page errors: ${mobile.errors.join(' | ')}`);
  await mobile.context.close();

  console.log('public visible-truth suite passed');
} finally {
  await browser.close();
}
