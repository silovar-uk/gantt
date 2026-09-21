import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = process.env.GANTT_BASE || 'https://silovar-uk.github.io/gantt/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function openFresh({ width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
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

function projectHandoff(count, { dense = false } = {}) {
  const categories = ['企画', '制作', '配信'];
  const tasks = Array.from({ length: count }, (_, index) => {
    const offset = dense ? (index * 2) % 86 : index * 5;
    const start = new Date(Date.UTC(2026, 8, 1 + offset));
    const end = new Date(start.getTime() + ((index % 6) + 2) * 86400000);
    const iso = (date) => date.toISOString().slice(0, 10);
    return {
      name: `Overview Task ${String(index + 1).padStart(2, '0')}`,
      start: iso(start),
      end: iso(end),
      categoryName: categories[index % categories.length],
      note: '',
      milestone: index % 17 === 0,
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
  assert.equal(await page.locator('body').getAttribute('data-overview-model-version'), '20260918-overview2');
  assert.equal(await page.evaluate(() => typeof globalThis.ganttOverviewModel?.fit), 'function');
  assert.equal(await page.evaluate(() => typeof globalThis.ganttOverviewModel?.resolveRepresentation), 'function');

  // The resolver uses one explicit boundary and a resize-only hysteresis band.
  const resolution = await page.evaluate(() => {
    const tasks = Array.from({ length: 30 }, () => ({})); // required height = 420px at the 14px floor
    const resolve = globalThis.ganttOverviewModel.resolveRepresentation;
    return {
      explicit: resolve(tasks, 413, { reason: 'explicit', currentShape: false }),
      resizeRowsNear: resolve(tasks, 413, { reason: 'resize', currentShape: false }),
      resizeRowsBeyond: resolve(tasks, 385, { reason: 'resize', currentShape: false }),
      resizeShapeNear: resolve(tasks, 441, { reason: 'resize', currentShape: true }),
      resizeShapeClear: resolve(tasks, 455, { reason: 'resize', currentShape: true }),
    };
  });
  assert.deepEqual(resolution, {
    explicit: 'shape',
    resizeRowsNear: 'rows',
    resizeRowsBeyond: 'shape',
    resizeShapeNear: 'shape',
    resizeShapeClear: 'rows',
  });

  // Small/medium projects: one Overview action keeps normal task rows.
  await importProject(page, projectHandoff(18));
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.locator('.workspace.mode-split').waitFor({ state: 'visible' });
  let overviewState = await page.evaluate(() => ({
    auto: state.project.viewSettings.overviewAutoFit,
    shape: state.project.viewSettings.overviewMacroMode === true,
  }));
  assert.deepEqual(overviewState, { auto: true, shape: false });

  // Compass stays synchronized with the resolved Overview. Its exact annotation depends on whether
  // the fitted viewport covers >=94% of the project range; that semantic is tested in the dedicated
  // Project Surface suite rather than being duplicated here.
  assert.equal(await page.locator('#project-ribbon').isVisible(), true);
  const overviewAnnotation = (await page.locator('.time-compass-annotation').innerText()).trim();
  assert.ok(overviewAnnotation.length > 0, 'Time Compass annotation should stay synchronized after Overview');
  const compassClass = await page.locator('#project-ribbon-track').getAttribute('class');
  assert.ok(compassClass?.includes('is-whole') || compassClass?.includes('is-navigator'), `Compass state missing after Overview: ${compassClass}`);

  // Row height is a manual task-axis override: it exits Auto and remains stable across resize.
  const rowSlider = page.locator('#ux-row-height');
  await rowSlider.evaluate((el) => {
    el.value = '32';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(80);
  overviewState = await page.evaluate(() => ({
    auto: state.project.viewSettings.overviewAutoFit,
    shape: state.project.viewSettings.overviewMacroMode === true,
    rowHeight: state.project.viewSettings.rowHeight,
  }));
  assert.deepEqual(overviewState, { auto: false, shape: false, rowHeight: 32 });
  await page.setViewportSize({ width: 1380, height: 900 });
  await page.waitForTimeout(320);
  assert.deepEqual(await page.evaluate(() => ({
    auto: state.project.viewSettings.overviewAutoFit,
    rowHeight: state.project.viewSettings.rowHeight,
  })), { auto: false, rowHeight: 32 });

  // Dense projects: the same Overview action chooses the high-level representation internally.
  await importProject(page, projectHandoff(60, { dense: true }));
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.locator('.workspace.mode-macro').waitFor({ state: 'visible' });
  overviewState = await page.evaluate(() => ({
    auto: state.project.viewSettings.overviewAutoFit,
    shape: state.project.viewSettings.overviewMacroMode === true,
  }));
  assert.deepEqual(overviewState, { auto: true, shape: true });
  assert.equal(await page.locator('.macro-label-head strong').innerText(), '全体');
  assert.equal((await page.locator('.macro-label-head').innerText()).includes('PROJECT SHAPE'), false);
  assert.equal(await page.locator('#ux-macro-indicator').count(), 0);
  assert.equal(await page.locator('#project-ribbon').isVisible(), true);

  assert.deepEqual(desktop.errors, [], `page errors: ${desktop.errors.join(' | ')}`);
  await desktop.context.close();
  console.log('public one overview model suite passed');
} finally {
  await browser.close();
}
