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

function denseHandoff() {
  const categories = ['企画', '制作', '配信'];
  const tasks = Array.from({ length: 60 }, (_, index) => {
    const categoryName = categories[index % categories.length];
    const offset = (index * 2) % 74;
    const start = new Date(Date.UTC(2026, 8, 1 + offset));
    const end = new Date(start.getTime() + ((index % 8) + 2) * 86400000);
    const iso = (date) => date.toISOString().slice(0, 10);
    return {
      name: `Macro Task ${String(index + 1).padStart(2, '0')}`,
      start: iso(start),
      end: iso(end),
      categoryName,
      note: index === 0 ? 'Lens keeps the project context visible.' : '',
      milestone: index % 17 === 0,
    };
  });
  return { handoffVersion: 1, tasks, needsReview: [] };
}

async function importDenseProject(page) {
  await page.locator('[data-toggle-menu="io-menu"]').click();
  await page.locator('#io-menu [data-action="import"]').click();
  await page.locator('.modal-layer').waitFor({ state: 'visible' });
  await page.locator('#import-input').fill(JSON.stringify(denseHandoff()));
  await page.locator('[data-action="validate-import"]').click();
  await page.locator('.validation-ok').waitFor({ state: 'visible' });
  await page.locator('[data-action="apply-import"]').click();
  await waitSaved(page);
}

try {
  const desktop = await openFresh({ width: 1440, height: 900 });
  const { page } = desktop;
  assert.equal(await page.locator('body').getAttribute('data-macro-overview-version'), '20260914-macro1');
  assert.equal(await page.locator('body').getAttribute('data-macro-detail-lens-version'), '20260914-lens1');

  await importDenseProject(page);
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.locator('.workspace.mode-macro').waitFor({ state: 'visible' });

  assert.equal(await page.locator('#workspace').getAttribute('data-macro-overview'), '20260914-macro1');
  assert.equal(await page.locator('.macro-category-row').count(), 3);
  assert.equal(await page.locator('[data-macro-task]').count(), 60);
  assert.ok(await page.locator('.macro-density-strip i').count() > 30);
  assert.ok((await page.locator('#ux-macro-indicator').innerText()).includes('60→3'));

  const macroRows = await page.locator('.macro-timeline-row').count();
  assert.equal(macroRows, 3);
  const macroBodyHeight = await page.locator('.macro-timeline-body').evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(macroBodyHeight < 60 * 20, `macro view did not reduce vertical structure: ${macroBodyHeight}`);

  // Focus+context: one click reveals detail without destroying the overview.
  const firstMacroTask = page.locator('[data-macro-task]').first();
  const firstId = await firstMacroTask.getAttribute('data-macro-task');
  await firstMacroTask.click();
  await page.locator('#macro-detail-lens').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.workspace.mode-macro').isVisible(), true);
  assert.ok((await page.locator('#macro-detail-lens').innerText()).includes('Macro Task'));
  const lensBox = await page.locator('#macro-detail-lens').boundingBox();
  assert.ok(lensBox && lensBox.x >= 0 && lensBox.y >= 0 && lensBox.x + lensBox.width <= 1440 && lensBox.y + lensBox.height <= 900);

  // Escape dismisses only the focus lens and leaves Macro intact.
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#macro-detail-lens').isHidden(), true);
  assert.equal(await page.locator('.workspace.mode-macro').isVisible(), true);

  // Explicit drill-down moves to the task-level row view.
  await firstMacroTask.click();
  await page.locator('#macro-detail-lens').waitFor({ state: 'visible' });
  await page.locator('[data-lens-action="task-row"]').click();
  await page.locator('.workspace.mode-split').waitFor({ state: 'visible' });
  assert.equal(await page.locator(`[data-task-row="${firstId}"]`).count(), 1);
  assert.equal(await page.locator('#ux-macro-indicator').isHidden(), true);

  // Fit returns to Macro automatically when the task-level rows no longer fit.
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.locator('.workspace.mode-macro').waitFor({ state: 'visible' });

  // Category focus follows the same rule: inspect first, change scope only on explicit action.
  const categoryButton = page.locator('[data-macro-category-focus]').first();
  await categoryButton.click();
  await page.locator('#macro-detail-lens').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.workspace.mode-macro').isVisible(), true);
  assert.ok((await page.locator('#macro-detail-lens').innerText()).includes('FOCUS · CATEGORY'));
  await page.locator('[data-lens-action="category-focus"]').click();
  await page.locator('.workspace.mode-split').waitFor({ state: 'visible' });
  const resultText = await page.locator('#condition-bar').innerText();
  assert.ok(resultText.includes('カテゴリー 1'));

  assert.deepEqual(desktop.errors, [], `desktop page errors: ${desktop.errors.join(' | ')}`);
  await desktop.context.close();

  // Mobile keeps the normal list/gantt model; Macro and Lens must not replace the mobile workspace.
  const mobile = await openFresh({ width: 390, height: 844, touch: true });
  assert.equal(await mobile.page.locator('#ux-macro-indicator').isHidden(), true);
  assert.equal(await mobile.page.locator('#macro-detail-lens').isHidden(), true);
  const dims = await mobile.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  assert.ok(dims.scrollWidth <= dims.innerWidth + 1, `mobile overflow: ${JSON.stringify(dims)}`);
  assert.deepEqual(mobile.errors, [], `mobile page errors: ${mobile.errors.join(' | ')}`);
  await mobile.context.close();

  console.log('public macro overview + detail lens suite passed');
} finally {
  await browser.close();
}
