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

function handoff(count = 18) {
  const categories = ['企画', '制作', '広報'];
  const tasks = Array.from({ length: count }, (_, index) => {
    const offset = index * 5;
    const start = new Date(Date.UTC(2026, 8, 1 + offset));
    const end = new Date(start.getTime() + ((index % 5) + 3) * 86400000);
    const iso = (date) => date.toISOString().slice(0, 10);
    return {
      name: `Surface Task ${String(index + 1).padStart(2, '0')}`,
      start: iso(start),
      end: iso(end),
      categoryName: categories[index % categories.length],
      note: '',
      milestone: index === 4 || index === 12,
    };
  });
  return { handoffVersion: 1, tasks, needsReview: [] };
}

function denseHandoff() {
  const categories = ['企画', '制作', '配信'];
  const tasks = Array.from({ length: 60 }, (_, index) => {
    const offset = (index * 2) % 110;
    const start = new Date(Date.UTC(2026, 8, 1 + offset));
    const end = new Date(start.getTime() + ((index % 8) + 2) * 86400000);
    const iso = (date) => date.toISOString().slice(0, 10);
    return {
      name: `Dense Task ${String(index + 1).padStart(2, '0')}`,
      start: iso(start),
      end: iso(end),
      categoryName: categories[index % categories.length],
      note: '',
      milestone: index % 19 === 0,
    };
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
  await page.locator('[data-action="apply-import"]').click();
  await waitSaved(page);
}

try {
  const desktop = await openFresh();
  const { page } = desktop;
  assert.equal(await page.locator('body').getAttribute('data-project-surface-version'), '20260914-surface1');

  await importProject(page, handoff());
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.locator('#project-ribbon').waitFor({ state: 'visible' });

  assert.equal(await page.locator('#project-ribbon .project-ribbon-nav #ux-view-controls').count(), 1);
  assert.equal(await page.locator('#ux-density-controls').isHidden(), true);
  assert.equal(await page.locator('#ux-macro-indicator').isHidden(), true);
  assert.ok(await page.locator('.project-ribbon-activity i').count() > 20);
  assert.ok(await page.locator('.project-ribbon-milestones i').count() >= 2);

  // Zooming in should reduce the visible fraction of the whole-project ribbon.
  const viewportBefore = await page.locator('#project-ribbon-viewport').boundingBox();
  for (let i = 0; i < 4; i += 1) await page.locator('[data-ux-action="zoom-in"]').click();
  const viewportAfter = await page.locator('#project-ribbon-viewport').boundingBox();
  assert.ok(viewportBefore && viewportAfter && viewportAfter.width < viewportBefore.width, `ribbon viewport did not shrink after zoom: ${JSON.stringify({ viewportBefore, viewportAfter })}`);

  // Clicking toward the right of the map navigates the main timeline without changing data scope.
  const track = await page.locator('#project-ribbon-track').boundingBox();
  assert.ok(track);
  const scrollBefore = await page.locator('#timeline-scroll').evaluate((el) => el.scrollLeft);
  await page.mouse.click(track.x + track.width * 0.82, track.y + track.height / 2);
  const scrollAfter = await page.locator('#timeline-scroll').evaluate((el) => el.scrollLeft);
  assert.ok(scrollAfter > scrollBefore, `ribbon navigation did not move timeline: ${scrollBefore} -> ${scrollAfter}`);

  // Keyboard navigation keeps the map operable without a pointer.
  await page.locator('#project-ribbon-track').focus();
  const keyboardBefore = await page.locator('#timeline-scroll').evaluate((el) => el.scrollLeft);
  await page.keyboard.press('ArrowLeft');
  const keyboardAfter = await page.locator('#timeline-scroll').evaluate((el) => el.scrollLeft);
  assert.ok(keyboardAfter < keyboardBefore, `ribbon keyboard navigation did not move left: ${keyboardBefore} -> ${keyboardAfter}`);

  // Dense projects still enter semantic Macro, but the project map replaces the old density strip.
  await importProject(page, denseHandoff());
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.locator('.workspace.mode-macro').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#project-ribbon').isVisible(), true);
  assert.equal(await page.locator('.macro-density-strip').isHidden(), true);
  assert.equal(await page.locator('#ux-macro-indicator').isHidden(), true);
  assert.equal(await page.locator('body').getAttribute('data-surface-level'), 'shape');

  const macroWidthBefore = await page.locator('.macro-timeline-inner').evaluate((el) => el.getBoundingClientRect().width);
  await page.locator('[data-ux-action="zoom-in"]').click();
  const macroWidthAfter = await page.locator('.macro-timeline-inner').evaluate((el) => el.getBoundingClientRect().width);
  assert.ok(macroWidthAfter > macroWidthBefore, `macro zoom did not work from the unified ribbon: ${macroWidthBefore} -> ${macroWidthAfter}`);

  assert.deepEqual(desktop.errors, [], `desktop page errors: ${desktop.errors.join(' | ')}`);
  await desktop.context.close();

  // Mobile keeps the existing navigation model and must not inherit desktop project-surface chrome.
  const mobile = await openFresh({ width: 390, height: 844, touch: true });
  assert.equal(await mobile.page.locator('#project-ribbon').isHidden(), true);
  assert.equal(await mobile.page.locator('.toolbar #ux-view-controls').count(), 1);
  const dims = await mobile.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  assert.ok(dims.scrollWidth <= dims.innerWidth + 1, `mobile overflow: ${JSON.stringify(dims)}`);
  assert.deepEqual(mobile.errors, [], `mobile page errors: ${mobile.errors.join(' | ')}`);
  await mobile.context.close();

  console.log('public project surface suite passed');
} finally {
  await browser.close();
}
