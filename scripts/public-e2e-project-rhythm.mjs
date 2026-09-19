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

async function importProject(page, data, { mode = 'replace' } = {}) {
  await page.locator('[data-toggle-menu="io-menu"]').click();
  await page.locator('#io-menu [data-action="import"]').click();
  await page.locator('.modal-layer').waitFor({ state: 'visible' });
  await page.locator('#import-input').fill(JSON.stringify(data));
  await page.locator('[data-action="validate-import"]').click();
  await page.locator('.validation-ok').waitFor({ state: 'visible' });
  const modeOption = page.locator(`input[name="import-mode"][value="${mode}"]`);
  if (await modeOption.count()) await modeOption.check();
  await page.locator('[data-action="apply-import"]').click();
  await waitSaved(page);
}

const iso = (date) => date.toISOString().slice(0, 10);

function planClusterHandoff() {
  const tasks = [];
  for (let index = 0; index < 3; index += 1) {
    const start = new Date(Date.UTC(2026, 7, 1 + index * 9));
    const end = new Date(start.getTime() + 2 * 86400000);
    tasks.push({ name: `Early ${index + 1}`, start: iso(start), end: iso(end), categoryName: '配信', note: '', milestone: index === 1 });
  }
  for (let index = 0; index < 12; index += 1) {
    const start = new Date(Date.UTC(2026, 9, 10 + (index % 3)));
    const end = new Date(Date.UTC(2026, 9, 20 + (index % 3)));
    tasks.push({ name: `Peak ${String(index + 1).padStart(2, '0')}`, start: iso(start), end: iso(end), categoryName: index % 2 ? '制作' : '企画', note: '', milestone: index === 5 });
  }
  for (let index = 0; index < 3; index += 1) {
    const start = new Date(Date.UTC(2026, 11, 1 + index * 9));
    const end = new Date(start.getTime() + 2 * 86400000);
    tasks.push({ name: `Late ${index + 1}`, start: iso(start), end: iso(end), categoryName: '配信', note: '', milestone: index === 1 });
  }
  return { handoffVersion: 1, tasks, needsReview: [] };
}

function denseClusterHandoff() {
  const tasks = [];
  for (let index = 0; index < 10; index += 1) {
    const start = new Date(Date.UTC(2026, 7, 1 + index * 3));
    const end = new Date(start.getTime() + 2 * 86400000);
    tasks.push({ name: `Sparse Early ${index + 1}`, start: iso(start), end: iso(end), categoryName: index % 2 ? '広報' : '配信', note: '', milestone: index === 4 });
  }
  for (let index = 0; index < 40; index += 1) {
    const start = new Date(Date.UTC(2026, 9, 8 + (index % 5)));
    const end = new Date(Date.UTC(2026, 9, 23 + (index % 4)));
    tasks.push({ name: `Dense Peak ${String(index + 1).padStart(2, '0')}`, start: iso(start), end: iso(end), categoryName: index % 2 ? '制作' : '企画', note: '', milestone: index === 9 });
  }
  for (let index = 0; index < 10; index += 1) {
    const start = new Date(Date.UTC(2026, 11, 1 + index * 3));
    const end = new Date(start.getTime() + 2 * 86400000);
    tasks.push({ name: `Sparse Late ${index + 1}`, start: iso(start), end: iso(end), categoryName: index % 2 ? '広報' : '配信', note: '', milestone: index === 4 });
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

async function clearPointer(page) {
  await page.mouse.move(8, 8);
  await page.waitForFunction(() => !document.querySelector('#workspace')?.classList.contains('is-rhythm-echo'));
}

// A rhythm window's peak (and any milestone marking it) tends to sit near its start, not its
// center. Hover near its trailing edge so a nearby milestone marker cannot steal the hover target.
async function hoverRhythmWindow(page, locator) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2);
}

try {
  const desktop = await openFresh();
  const { page } = desktop;

  assert.equal(await page.evaluate(() => typeof globalThis.ganttProjectRhythm?.derive), 'function');
  assert.equal(await page.evaluate(() => typeof globalThis.ganttProjectRhythm?.context), 'function');
  assert.equal(await page.locator('body').getAttribute('data-project-rhythm-version'), '20260914-rhythm3');
  assert.equal(await page.locator('body').getAttribute('data-rhythm-context-echo-version'), '20260914-echo1');

  // PLAN representation: rhythm hover returns meaning through the existing surface.
  await importProject(page, planClusterHandoff());
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.locator('#project-ribbon').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.workspace.mode-macro').count(), 0, 'plan fixture should stay in task rows');
  await page.locator('.time-compass-rhythm-window').first().waitFor({ state: 'visible' });

  const rhythmCount = await page.locator('.time-compass-rhythm-window').count();
  assert.ok(rhythmCount >= 1 && rhythmCount <= 3, `unexpected rhythm window count: ${rhythmCount}`);
  assert.equal(await page.locator('.time-compass-rhythm-window.is-primary').count(), 1);
  let primary = page.locator('.time-compass-rhythm-window.is-primary');
  const baseAria = await primary.getAttribute('aria-label');
  assert.ok(baseAria?.includes('最大'));

  const trackBox = await page.locator('#project-ribbon-track').boundingBox();
  assert.ok(trackBox && trackBox.height >= 35 && trackBox.height <= 37, `Time Compass height changed: ${JSON.stringify(trackBox)}`);
  assert.equal(await page.locator('.time-compass-rail').getAttribute('aria-hidden'), null, 'interactive rail must not be aria-hidden');

  await hoverRhythmWindow(page, primary);
  await page.waitForFunction(() => document.querySelector('#workspace')?.classList.contains('is-rhythm-echo'));
  const planEcho = await page.evaluate(() => ({
    taskMatch: document.querySelectorAll('.task-row.is-rhythm-match').length,
    taskMuted: document.querySelectorAll('.task-row.is-rhythm-muted').length,
    timelineMatch: document.querySelectorAll('.timeline-row.is-rhythm-match').length,
    timelineMuted: document.querySelectorAll('.timeline-row.is-rhythm-muted').length,
    count: Number(document.querySelector('#workspace')?.dataset.rhythmEchoCount || 0),
    annotation: document.querySelector('.time-compass-annotation')?.textContent || '',
  }));
  assert.ok(planEcho.taskMatch > 0 && planEcho.taskMuted > 0, `task echo missing: ${JSON.stringify(planEcho)}`);
  assert.ok(planEcho.timelineMatch > 0 && planEcho.timelineMuted > 0, `timeline echo missing: ${JSON.stringify(planEcho)}`);
  assert.equal(planEcho.taskMatch, planEcho.timelineMatch);
  assert.equal(planEcho.count, planEcho.taskMatch);
  assert.match(planEcho.annotation, /(企画|制作|配信)/, `annotation has no category meaning: ${planEcho.annotation}`);
  const contextualAria = await primary.getAttribute('aria-label');
  assert.notEqual(contextualAria, baseAria);
  assert.match(contextualAria || '', /(企画|制作|配信)/);

  await clearPointer(page);
  assert.equal(await primary.getAttribute('aria-label'), baseAria, 'rhythm accessible label did not reset after echo');
  assert.equal(await page.locator('.is-rhythm-match, .is-rhythm-muted').count(), 0, 'echo classes leaked after pointer leave');

  const before = await page.evaluate(() => ({
    auto: state.project.viewSettings.overviewAutoFit,
    rowHeight: state.project.viewSettings.rowHeight,
    dayWidth: state.project.viewSettings.dayWidth,
  }));
  await hoverRhythmWindow(page, primary);
  await primary.click();
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => ({
    auto: state.project.viewSettings.overviewAutoFit,
    rowHeight: state.project.viewSettings.rowHeight,
    dayWidth: state.project.viewSettings.dayWidth,
    echo: document.querySelector('#workspace')?.classList.contains('is-rhythm-echo'),
  }));
  assert.equal(after.auto, false, 'rhythm focus should become a manual time-axis view');
  assert.equal(after.rowHeight, before.rowHeight, 'rhythm focus must not alter task-axis density');
  assert.ok(after.dayWidth >= before.dayWidth, `rhythm focus unexpectedly zoomed out: ${before.dayWidth} -> ${after.dayWidth}`);
  assert.equal(after.echo, false, 'echo must clear when rhythm focus becomes an explicit zoom');

  // Keyboard focus gets the same contextual echo and Enter gets the same action.
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  primary = page.locator('.time-compass-rhythm-window.is-primary');
  await primary.focus();
  await page.waitForFunction(() => document.querySelector('#workspace')?.classList.contains('is-rhythm-echo'));
  assert.match(await page.locator('.time-compass-annotation').innerText(), /(企画|制作|配信)/);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => state.project.viewSettings.overviewAutoFit), false);
  assert.equal(await page.locator('#workspace').evaluate((el) => el.classList.contains('is-rhythm-echo')), false);

  // SHAPE representation: the same cue works without leaving Macro Overview.
  await importProject(page, denseClusterHandoff());
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.locator('.workspace.mode-macro').waitFor({ state: 'visible' });
  primary = page.locator('.time-compass-rhythm-window.is-primary');
  await primary.waitFor({ state: 'visible' });
  await hoverRhythmWindow(page, primary);
  await page.waitForFunction(() => document.querySelector('#workspace')?.classList.contains('is-rhythm-echo'));
  const macroEcho = await page.evaluate(() => ({
    taskMatch: document.querySelectorAll('[data-macro-task].is-rhythm-match').length,
    taskMuted: document.querySelectorAll('[data-macro-task].is-rhythm-muted').length,
    categoryMatch: document.querySelectorAll('[data-macro-category-focus].is-rhythm-match').length,
    categoryMuted: document.querySelectorAll('[data-macro-category-focus].is-rhythm-muted').length,
    annotation: document.querySelector('.time-compass-annotation')?.textContent || '',
  }));
  assert.ok(macroEcho.taskMatch > 0 && macroEcho.taskMuted > 0, `macro task echo missing: ${JSON.stringify(macroEcho)}`);
  assert.ok(macroEcho.categoryMatch > 0 && macroEcho.categoryMuted > 0, `macro category echo missing: ${JSON.stringify(macroEcho)}`);
  assert.match(macroEcho.annotation, /(企画|制作)/);
  await clearPointer(page);
  assert.equal(await page.locator('.is-rhythm-match, .is-rhythm-muted').count(), 0, 'macro echo classes leaked after pointer leave');

  // A flat project must not invent a meaningful peak, even if multiple dates fall into the same coarse bucket.
  // Import mode is explicitly replace so no concentration tasks from the prior fixture survive.
  await importProject(page, flatHandoff());
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.time-compass-rhythm-window').count(), 0, 'flat schedule should not get a false concentration landmark');

  assert.deepEqual(desktop.errors, [], `desktop page errors: ${desktop.errors.join(' | ')}`);
  await desktop.context.close();

  const mobile = await openFresh({ width: 390, height: 844, touch: true });
  assert.equal(await mobile.page.locator('#project-ribbon').isHidden(), true, 'empty project should not show the Time Window');
  assert.equal(await mobile.page.locator('#workspace').evaluate((el) => el.classList.contains('is-rhythm-echo')), false);
  const dims = await mobile.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  assert.ok(dims.scrollWidth <= dims.innerWidth + 1, `mobile overflow: ${JSON.stringify(dims)}`);
  assert.deepEqual(mobile.errors, [], `mobile page errors: ${mobile.errors.join(' | ')}`);
  await mobile.context.close();

  console.log('public Project Rhythm + Context Echo suite passed');
} finally {
  await browser.close();
}
