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
  await page.waitForFunction(() => document.body.dataset.timeCompassVersion === '20260914-compass1');

  assert.equal(await page.locator('#project-ribbon .project-ribbon-nav #ux-view-controls').count(), 1);
  assert.equal(await page.locator('#ux-density-controls').isHidden(), true);
  assert.equal(await page.locator('#ux-macro-indicator').isHidden(), true);
  assert.equal(await page.locator('.project-ribbon-activity').isHidden(), true);
  assert.equal(await page.locator('.project-ribbon-milestones').isHidden(), true);
  assert.ok((await page.locator('.time-compass-busy').getAttribute('style') || '').includes('linear-gradient'));
  assert.ok(await page.locator('.time-compass-milestone').count() >= 2);
  assert.equal(await page.locator('.time-compass-status').innerText(), '全体表示');
  assert.equal(await page.locator('#project-ribbon-viewport').isHidden(), true);
  assert.equal(await page.locator('#project-ribbon-track').getAttribute('role'), null);
  assert.equal(await page.locator('#project-ribbon-track').getAttribute('tabindex'), '-1');

  // Scrub Preview explains the day under the pointer without navigating.
  const wholeTrack = await page.locator('#project-ribbon-track').boundingBox();
  assert.ok(wholeTrack);
  const wholeScrollBefore = await page.locator('#timeline-scroll').evaluate((el) => el.scrollLeft);
  await page.mouse.move(wholeTrack.x + wholeTrack.width * 0.5, wholeTrack.y + wholeTrack.height * 0.5);
  await page.locator('#time-compass-preview').waitFor({ state: 'visible' });
  assert.ok((await page.locator('#time-compass-preview').innerText()).includes('進行中'));
  await page.mouse.click(wholeTrack.x + wholeTrack.width * 0.75, wholeTrack.y + wholeTrack.height * 0.5);
  const wholeScrollAfter = await page.locator('#timeline-scroll').evaluate((el) => el.scrollLeft);
  assert.equal(wholeScrollAfter, wholeScrollBefore, 'whole-project summary must not pretend to navigate');

  // Zooming converts Summary into Navigator and exposes the viewport only when movement is meaningful.
  for (let i = 0; i < 4; i += 1) await page.locator('[data-ux-action="zoom-in"]').click();
  await page.waitForFunction(() => document.querySelector('#project-ribbon-track')?.classList.contains('is-navigator'));
  assert.equal(await page.locator('#project-ribbon-track').getAttribute('role'), 'scrollbar');
  assert.equal(await page.locator('#project-ribbon-track').getAttribute('aria-controls'), 'timeline-scroll');
  assert.equal(await page.locator('#project-ribbon-viewport').isVisible(), true);
  const viewportAfter = await page.locator('#project-ribbon-viewport').boundingBox();
  const trackAfter = await page.locator('#project-ribbon-track').boundingBox();
  assert.ok(viewportAfter && trackAfter && viewportAfter.width < trackAfter.width * 0.94, `navigator viewport did not become local: ${JSON.stringify({ viewportAfter, trackAfter })}`);

  // Clicking toward the right now navigates the main timeline without changing data scope.
  const scrollBefore = await page.locator('#timeline-scroll').evaluate((el) => el.scrollLeft);
  await page.mouse.click(trackAfter.x + trackAfter.width * 0.82, trackAfter.y + trackAfter.height / 2);
  const scrollAfter = await page.locator('#timeline-scroll').evaluate((el) => el.scrollLeft);
  assert.ok(scrollAfter > scrollBefore, `time compass navigation did not move timeline: ${scrollBefore} -> ${scrollAfter}`);

  // Keyboard navigation is only exposed in Navigator state.
  await page.locator('#project-ribbon-track').focus();
  const keyboardBefore = await page.locator('#timeline-scroll').evaluate((el) => el.scrollLeft);
  await page.keyboard.press('ArrowLeft');
  const keyboardAfter = await page.locator('#timeline-scroll').evaluate((el) => el.scrollLeft);
  assert.ok(keyboardAfter < keyboardBefore, `time compass keyboard navigation did not move left: ${keyboardBefore} -> ${keyboardAfter}`);

  // Ctrl/Cmd + wheel on the compass changes scale around the pointed date.
  const widthBeforeWheel = await page.locator('.timeline-inner').evaluate((el) => Number.parseFloat(el.style.getPropertyValue('--day-width')));
  await page.mouse.move(trackAfter.x + trackAfter.width * 0.35, trackAfter.y + trackAfter.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  const widthAfterWheel = await page.locator('.timeline-inner').evaluate((el) => Number.parseFloat(el.style.getPropertyValue('--day-width')));
  assert.ok(widthAfterWheel >= widthBeforeWheel, `compass pointer zoom did not increase scale: ${widthBeforeWheel} -> ${widthAfterWheel}`);

  // Dense projects still enter semantic Macro, and Time Compass remains the project-wide context.
  await importProject(page, denseHandoff());
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.locator('.workspace.mode-macro').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#project-ribbon').isVisible(), true);
  assert.equal(await page.locator('.macro-density-strip').isHidden(), true);
  assert.equal(await page.locator('#ux-macro-indicator').isHidden(), true);
  assert.equal(await page.locator('body').getAttribute('data-surface-level'), 'shape');
  assert.equal(await page.locator('body').getAttribute('data-time-compass-version'), '20260914-compass1');

  const macroWidthBefore = await page.locator('.macro-timeline-inner').evaluate((el) => el.getBoundingClientRect().width);
  await page.locator('[data-ux-action="zoom-in"]').click();
  const macroWidthAfter = await page.locator('.macro-timeline-inner').evaluate((el) => el.getBoundingClientRect().width);
  assert.ok(macroWidthAfter > macroWidthBefore, `macro zoom did not work from the unified compass: ${macroWidthBefore} -> ${macroWidthAfter}`);

  assert.deepEqual(desktop.errors, [], `desktop page errors: ${desktop.errors.join(' | ')}`);
  await desktop.context.close();

  // Mobile keeps the existing navigation model and must not inherit desktop Time Compass chrome.
  const mobile = await openFresh({ width: 390, height: 844, touch: true });
  assert.equal(await mobile.page.locator('#project-ribbon').isHidden(), true);
  assert.equal(await mobile.page.locator('.toolbar #ux-view-controls').count(), 1);
  const dims = await mobile.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  assert.ok(dims.scrollWidth <= dims.innerWidth + 1, `mobile overflow: ${JSON.stringify(dims)}`);
  assert.deepEqual(mobile.errors, [], `mobile page errors: ${mobile.errors.join(' | ')}`);
  await mobile.context.close();

  console.log('public project surface + time compass suite passed');
} finally {
  await browser.close();
}
