import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = 'https://silovar-uk.github.io/gantt/';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

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
    return { name: `Surface Task ${String(index + 1).padStart(2, '0')}`, start: iso(start), end: iso(end), categoryName: categories[index % categories.length], note: '', milestone: index === 4 || index === 12 };
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
    return { name: `Dense Task ${String(index + 1).padStart(2, '0')}`, start: iso(start), end: iso(end), categoryName: categories[index % categories.length], note: '', milestone: index % 19 === 0 };
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
  await importProject(page, handoff());
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.locator('#project-ribbon').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.body.dataset.timeCompassVersion === '20260914-compass6');

  // Architecture contract: the old Ribbon drawing layer is gone; Time Compass owns visualization.
  assert.equal(await page.locator('.project-ribbon-activity').count(), 0);
  assert.equal(await page.locator('.project-ribbon-milestones').count(), 0);
  assert.equal(await page.locator('#ux-macro-indicator').count(), 0);
  assert.equal(await page.evaluate(() => typeof globalThis.ganttTimeCompassSync), 'function');

  // Compass geometry: text and graphics have separate lanes, with no permanent milestone labels.
  const meta = await page.locator('.time-compass-meta').boundingBox();
  const rail = await page.locator('.time-compass-rail').boundingBox();
  assert.ok(meta && rail && meta.y + meta.height <= rail.y + 1, `compass lanes overlap: ${JSON.stringify({ meta, rail })}`);
  assert.equal(await page.locator('.time-compass-milestone span').count(), 0);
  assert.ok(await page.locator('.time-compass-milestone').count() >= 2);
  const firstMarker = await page.locator('.time-compass-milestone').first().boundingBox();
  assert.ok(firstMarker && firstMarker.y >= rail.y - 1 && firstMarker.y + firstMarker.height <= rail.y + rail.height + 1, `marker escaped rail: ${JSON.stringify({ firstMarker, rail })}`);
  assert.equal(await page.locator('.time-compass-annotation').innerText(), '全体表示');
  assert.equal(await page.locator('#project-ribbon-viewport').isHidden(), true);

  // Row height is a direct slider in the view zone, while the old density container stays hidden.
  assert.equal(await page.locator('#ux-density-controls').isHidden(), true);
  assert.equal(await page.locator('#ux-row-density-dock').isVisible(), true);
  const rowSlider = page.locator('#ux-row-density-dock #ux-row-height');
  assert.equal(await rowSlider.getAttribute('min'), '20');
  assert.equal(await rowSlider.getAttribute('max'), '56');
  await rowSlider.evaluate((el) => { el.value = '32'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(60);
  const row32 = await page.locator('.task-row').first().evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(row32 >= 31 && row32 <= 33, `row slider did not apply 32px: ${row32}`);
  await rowSlider.evaluate((el) => { el.value = '24'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(60);
  const row24 = await page.locator('.task-row').first().evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(row24 >= 23 && row24 <= 25, `row slider did not apply 24px: ${row24}`);

  // Hover stays inside the rail and replaces one annotation channel instead of stacking labels.
  const wholeScrollBefore = await page.locator('#timeline-scroll').evaluate((el) => el.scrollLeft);
  await page.mouse.move(rail.x + rail.width * .5, rail.y + rail.height / 2);
  await page.waitForFunction(() => (document.querySelector('.time-compass-annotation')?.textContent || '').includes('進行'));
  const pointer = await page.locator('.time-compass-pointer').boundingBox();
  assert.ok(pointer && pointer.y >= rail.y - 1 && pointer.y + pointer.height <= rail.y + rail.height + 1, `pointer escaped rail: ${JSON.stringify({ pointer, rail })}`);
  await page.mouse.click(rail.x + rail.width * .75, rail.y + rail.height / 2);
  const wholeScrollAfter = await page.locator('#timeline-scroll').evaluate((el) => el.scrollLeft);
  assert.equal(wholeScrollAfter, wholeScrollBefore, 'whole-project summary must not pretend to navigate');

  // Zoom converts Summary into Navigator with a bracket-style local viewport.
  for (let i = 0; i < 4; i += 1) await page.locator('[data-ux-action="zoom-in"]').click();
  await page.waitForFunction(() => document.querySelector('#project-ribbon-track')?.classList.contains('is-navigator'));
  assert.equal(await page.locator('#project-ribbon-track').getAttribute('role'), 'scrollbar');
  assert.equal(await page.locator('#project-ribbon-viewport').isVisible(), true);
  const navRail = await page.locator('.time-compass-rail').boundingBox();
  const viewport = await page.locator('#project-ribbon-viewport').boundingBox();
  assert.ok(viewport && navRail && viewport.width < navRail.width * .94, `viewport did not become local: ${JSON.stringify({ viewport, navRail })}`);
  const scrollBefore = await page.locator('#timeline-scroll').evaluate((el) => el.scrollLeft);
  await page.mouse.click(navRail.x + navRail.width * .82, navRail.y + navRail.height / 2);
  const scrollAfter = await page.locator('#timeline-scroll').evaluate((el) => el.scrollLeft);
  assert.ok(scrollAfter > scrollBefore, `compass navigation did not move timeline: ${scrollBefore} -> ${scrollAfter}`);

  // Explicit scroll updates the Compass without a DOM MutationObserver dependency.
  const leftBefore = Number.parseFloat(await page.locator('#project-ribbon-viewport').evaluate((el) => el.style.left || '0'));
  await page.locator('#timeline-scroll').evaluate((el) => { el.scrollLeft = Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + el.clientWidth * .35); el.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(80);
  const leftAfter = Number.parseFloat(await page.locator('#project-ribbon-viewport').evaluate((el) => el.style.left || '0'));
  assert.ok(leftAfter >= leftBefore, `explicit scroll did not synchronize Compass: ${leftBefore} -> ${leftAfter}`);

  // Fit re-synchronizes the manual row control with the computed row height.
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.waitForTimeout(80);
  const viewRow = await page.evaluate(() => state.project.viewSettings.rowHeight);
  const sliderRow = Number(await page.locator('#ux-row-height').inputValue());
  assert.equal(sliderRow, viewRow, `fit and row slider diverged: ${sliderRow} vs ${viewRow}`);

  // Dense projects enter semantic Shape; dead macro density/indicator DOM must not come back.
  await importProject(page, denseHandoff());
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.locator('.workspace.mode-macro').waitFor({ state: 'visible' });
  assert.equal(await page.locator('body').getAttribute('data-surface-level'), 'shape');
  assert.equal(await page.locator('#ux-row-density-dock').isHidden(), true);
  assert.equal(await page.locator('body').getAttribute('data-time-compass-version'), '20260914-compass6');
  assert.equal(await page.locator('.macro-density-strip').count(), 0);
  assert.equal(await page.locator('#ux-macro-indicator').count(), 0);

  assert.deepEqual(desktop.errors, [], `desktop page errors: ${desktop.errors.join(' | ')}`);
  await desktop.context.close();

  // Mobile keeps the touch-first chrome; desktop slider/compass exist in DOM but stay hidden and do not create overflow.
  const mobile = await openFresh({ width: 390, height: 844, touch: true });
  assert.equal(await mobile.page.locator('#project-ribbon').isHidden(), true);
  const mobileDock = mobile.page.locator('#ux-row-density-dock');
  if (await mobileDock.count()) assert.equal(await mobileDock.isHidden(), true);
  const dims = await mobile.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  assert.ok(dims.scrollWidth <= dims.innerWidth + 1, `mobile overflow: ${JSON.stringify(dims)}`);
  const addBox = await mobile.page.locator('[data-action="add"]').first().boundingBox();
  assert.ok(addBox && addBox.height >= 44, `mobile add target regressed: ${JSON.stringify(addBox)}`);
  assert.deepEqual(mobile.errors, [], `mobile page errors: ${mobile.errors.join(' | ')}`);
  await mobile.context.close();

  console.log('public consolidated project surface suite passed');
} finally {
  await browser.close();
}
