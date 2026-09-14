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

const iso = (date) => date.toISOString().slice(0, 10);

function clusteredHandoff() {
  const categories = ['企画', '制作', '配信'];
  const tasks = [];

  // Sparse bookends keep the project range wide while the middle forms one clear concentration window.
  for (let index = 0; index < 6; index += 1) {
    const start = new Date(Date.UTC(2026, 7, 1 + index * 4));
    const end = new Date(start.getTime() + 3 * 86400000);
    tasks.push({ name: `Early ${index + 1}`, start: iso(start), end: iso(end), categoryName: categories[index % 3], note: '', milestone: index === 2 });
  }

  for (let index = 0; index < 22; index += 1) {
    const start = new Date(Date.UTC(2026, 9, 10 + (index % 5)));
    const end = new Date(Date.UTC(2026, 9, 22 + (index % 4)));
    tasks.push({ name: `Peak ${String(index + 1).padStart(2, '0')}`, start: iso(start), end: iso(end), categoryName: categories[index % 3], note: '', milestone: index === 5 });
  }

  for (let index = 0; index < 6; index += 1) {
    const start = new Date(Date.UTC(2026, 11, 1 + index * 4));
    const end = new Date(start.getTime() + 3 * 86400000);
    tasks.push({ name: `Late ${index + 1}`, start: iso(start), end: iso(end), categoryName: categories[index % 3], note: '', milestone: index === 3 });
  }

  return { handoffVersion: 1, tasks, needsReview: [] };
}

function flatHandoff() {
  const categories = ['企画', '制作', '配信'];
  const tasks = Array.from({ length: 12 }, (_, index) => {
    const start = new Date(Date.UTC(2026, 8, 1 + index * 7));
    const end = new Date(start.getTime() + 86400000);
    return { name: `Flat ${index + 1}`, start: iso(start), end: iso(end), categoryName: categories[index % 3], note: '', milestone: false };
  });
  return { handoffVersion: 1, tasks, needsReview: [] };
}

try {
  const desktop = await openFresh();
  const { page } = desktop;

  assert.equal(await page.evaluate(() => typeof globalThis.ganttProjectRhythm?.derive), 'function');
  assert.equal(await page.locator('body').getAttribute('data-project-rhythm-version'), '20260914-rhythm1');

  await importProject(page, clusteredHandoff());
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.locator('#project-ribbon').waitFor({ state: 'visible' });
  await page.locator('.time-compass-rhythm-window').first().waitFor({ state: 'visible' });

  const rhythmCount = await page.locator('.time-compass-rhythm-window').count();
  assert.ok(rhythmCount >= 1 && rhythmCount <= 3, `unexpected rhythm window count: ${rhythmCount}`);
  assert.equal(await page.locator('.time-compass-rhythm-window.is-primary').count(), 1);
  const primary = page.locator('.time-compass-rhythm-window.is-primary');
  assert.ok((await primary.getAttribute('aria-label')).includes('最大'));

  const trackBox = await page.locator('#project-ribbon-track').boundingBox();
  assert.ok(trackBox && trackBox.height >= 35 && trackBox.height <= 37, `Time Compass height changed: ${JSON.stringify(trackBox)}`);
  assert.equal(await page.locator('.time-compass-rail').getAttribute('aria-hidden'), null, 'interactive rail must not be aria-hidden');

  await primary.hover();
  await page.waitForFunction(() => (document.querySelector('.time-compass-annotation')?.textContent || '').includes('集中'));

  const before = await page.evaluate(() => ({
    auto: state.project.viewSettings.overviewAutoFit,
    rowHeight: state.project.viewSettings.rowHeight,
    dayWidth: state.project.viewSettings.dayWidth,
  }));
  await primary.click();
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => ({
    auto: state.project.viewSettings.overviewAutoFit,
    rowHeight: state.project.viewSettings.rowHeight,
    dayWidth: state.project.viewSettings.dayWidth,
  }));
  assert.equal(after.auto, false, 'rhythm focus should become a manual time-axis view');
  assert.equal(after.rowHeight, before.rowHeight, 'rhythm focus must not alter task-axis density');
  assert.ok(after.dayWidth >= before.dayWidth, `rhythm focus unexpectedly zoomed out: ${before.dayWidth} -> ${after.dayWidth}`);

  // Keyboard activation uses the same interaction contract.
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  const primaryKeyboard = page.locator('.time-compass-rhythm-window.is-primary');
  await primaryKeyboard.focus();
  assert.ok((await page.locator('.time-compass-annotation').innerText()).includes('集中'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => state.project.viewSettings.overviewAutoFit), false);

  // A flat project must not invent a meaningful peak.
  await importProject(page, flatHandoff());
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.time-compass-rhythm-window').count(), 0, 'flat schedule should not get a false concentration landmark');

  assert.deepEqual(desktop.errors, [], `desktop page errors: ${desktop.errors.join(' | ')}`);
  await desktop.context.close();

  const mobile = await openFresh({ width: 390, height: 844, touch: true });
  assert.equal(await mobile.page.locator('#project-ribbon').isHidden(), true);
  const dims = await mobile.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  assert.ok(dims.scrollWidth <= dims.innerWidth + 1, `mobile overflow: ${JSON.stringify(dims)}`);
  assert.deepEqual(mobile.errors, [], `mobile page errors: ${mobile.errors.join(' | ')}`);
  await mobile.context.close();

  console.log('public Project Rhythm landmark suite passed');
} finally {
  await browser.close();
}
