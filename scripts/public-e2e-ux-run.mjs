import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = 'https://silovar-uk.github.io/gantt/';
const ORIGIN = 'https://silovar-uk.github.io';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function openFresh({ width = 1440, height = 900, touch = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
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

async function taskId(page, name) {
  return page.locator('input.inline-name').evaluateAll((inputs, target) => inputs.find((el) => el.value === target)?.dataset.inlineName || null, name);
}

async function taskRow(page, name) {
  const id = await taskId(page, name);
  assert.ok(id, `task not found: ${name}`);
  return { id, row: page.locator(`[data-task-row="${id}"]`) };
}

async function openIO(page, action) {
  await page.locator('[data-toggle-menu="io-menu"]').click();
  await page.locator(`#io-menu [data-action="${action}"]`).click();
  await page.locator('.modal-layer').waitFor({ state: 'visible' });
}

async function openMore(page, action) {
  await page.locator('[data-toggle-menu="ux-more-menu"]').click();
  await page.locator(`#ux-more-menu [data-action="${action}"]`).click();
  await page.locator('.modal-layer').waitFor({ state: 'visible' });
}

try {
  const desktop = await openFresh();
  const { page } = desktop;

  // Core chrome reflects the timeline-first product shape.
  await page.locator('#ux-ai-json').waitFor({ state: 'visible' });
  await page.locator('#ux-present').waitFor({ state: 'visible' });
  await page.locator('#ux-view-controls').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#io-menu [data-action="chat-input"]').isHidden(), true);
  assert.equal(await page.locator('#io-menu [data-action="chat-output"]').isHidden(), true);

  // Create a task using the normal editor.
  await page.locator('[data-action="add"]').first().click();
  await page.locator('#task-form [name="name"]').fill('UX E2E タスク');
  await page.locator('#task-form [name="start"]').fill('2026-09-10');
  await page.locator('#task-form [name="end"]').fill('2026-09-12');
  await page.locator('[data-action="save-task"]').click();
  await waitSaved(page);
  let task = await taskRow(page, 'UX E2E タスク');
  assert.ok(await task.row.isVisible());

  // The compact list must never overlap the timeline or block its own detail button.
  const listBox = await page.locator('.task-panel').boundingBox();
  const timelineBox = await page.locator('.timeline-panel').boundingBox();
  assert.ok(listBox && timelineBox && listBox.x + listBox.width <= timelineBox.x + 2);
  await task.row.locator('[data-action="details"]').click();
  await page.locator('.modal-layer').waitFor({ state: 'visible' });
  await page.locator('[data-action="close-modal"]').click();

  // AI handoff is JSON-only and contains a return contract for external AI.
  await page.locator('#ux-ai-json').click();
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent?.includes('AI用JSONをコピーしました'));
  const aiPayload = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(aiPayload.format, 'gantt-desk-ai-input');
  assert.equal(aiPayload.version, 1);
  assert.ok(aiPayload.tasks.some((item) => item.name === 'UX E2E タスク'));
  assert.equal(aiPayload.returnContract.schema.handoffVersion, 1);

  // Continuous zoom changes day width without switching to a separate screen.
  const widthBefore = await page.locator('.timeline-inner').evaluate((el) => Number.parseFloat(el.style.getPropertyValue('--day-width')));
  await page.locator('[data-ux-action="zoom-in"]').click();
  const widthAfter = await page.locator('.timeline-inner').evaluate((el) => Number.parseFloat(el.style.getPropertyValue('--day-width')));
  assert.ok(widthAfter > widthBefore, `zoom did not increase day width: ${widthBefore} -> ${widthAfter}`);

  // Direct timeline drag moves the task by two days.
  task = await taskRow(page, 'UX E2E タスク');
  const bar = page.locator(`[data-timeline-task="${task.id}"]`);
  await bar.waitFor({ state: 'visible' });
  const barBox = await bar.boundingBox();
  const dayWidth = await page.locator('.timeline-inner').evaluate((el) => Number.parseFloat(el.style.getPropertyValue('--day-width')));
  assert.ok(barBox && dayWidth > 0);
  await page.mouse.move(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(barBox.x + barBox.width / 2 + dayWidth * 2, barBox.y + barBox.height / 2, { steps: 6 });
  await page.mouse.up();
  await waitSaved(page);
  task = await taskRow(page, 'UX E2E タスク');
  assert.equal(await task.row.locator('[data-inline-start]').inputValue(), '2026-09-12');
  assert.equal(await task.row.locator('[data-inline-end]').inputValue(), '2026-09-14');

  // Fit remains a one-click way back to the whole project.
  await page.locator('#ux-view-controls [data-action="fit"]').click();
  await page.locator(`[data-timeline-task="${task.id}"]`).waitFor({ state: 'visible' });

  // Display settings live in the overflow menu, not the primary toolbar.
  await openMore(page, 'display-settings');
  await page.locator('#setting-list-width').fill('420');
  await page.locator('[data-action="apply-display-settings"]').click();
  assert.equal(await page.locator('.modal-layer').count(), 0);

  // Present mode removes editing chrome and can return cleanly.
  await page.locator('#ux-present').click();
  assert.equal(await page.locator('body').evaluate((el) => el.classList.contains('is-present-mode')), true);
  await page.locator('#ux-present-bar').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.toolbar').isHidden(), true);
  await page.locator('[data-ux-action="exit-present"]').click();
  assert.equal(await page.locator('body').evaluate((el) => el.classList.contains('is-present-mode')), false);

  // External-AI return JSON still imports through the strict handoff contract.
  await openIO(page, 'import');
  const handoff = {
    handoffVersion: 1,
    tasks: [{ name: 'AI戻り予定', start: '2026-10-01', end: '2026-10-03', categoryName: '外部AI', note: '', milestone: false }],
    needsReview: [],
  };
  await page.locator('#import-input').fill(JSON.stringify(handoff));
  await page.locator('[data-action="validate-import"]').click();
  await page.locator('.validation-ok').waitFor({ state: 'visible' });
  await page.locator('[data-action="apply-import"]').click();
  await waitSaved(page);
  assert.ok(await taskId(page, 'AI戻り予定'));

  assert.deepEqual(desktop.errors, [], `desktop page errors: ${desktop.errors.join(' | ')}`);
  await desktop.context.close();

  // Mobile must remain usable and free from document-level horizontal overflow.
  const mobile = await openFresh({ width: 390, height: 844, touch: true });
  const dims = await mobile.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  assert.ok(dims.scrollWidth <= dims.innerWidth + 1, `mobile overflow: ${JSON.stringify(dims)}`);
  assert.equal(await mobile.page.locator('#ux-ai-json').isHidden(), true);
  const addBox = await mobile.page.locator('[data-action="add"]').first().boundingBox();
  assert.ok(addBox && addBox.height >= 44);
  await mobile.page.locator('[data-action="add"]').first().click();
  const modalBox = await mobile.page.locator('.modal-card').boundingBox();
  assert.ok(modalBox && modalBox.width <= 390 && modalBox.height <= 844);
  assert.deepEqual(mobile.errors, [], `mobile page errors: ${mobile.errors.join(' | ')}`);
  await mobile.context.close();

  // Clipboard failure must not report a false success.
  const failure = await openFresh();
  await failure.page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async () => { throw new Error('denied'); },
    });
  });
  await failure.page.locator('#ux-ai-json').click();
  await failure.page.waitForFunction(() => document.querySelector('#toast')?.textContent?.includes('コピーできませんでした'));
  const toastText = await failure.page.locator('#toast').innerText();
  assert.ok(toastText.includes('コピーできませんでした'));
  assert.ok(!toastText.includes('AI用JSONをコピーしました'));
  assert.deepEqual(failure.errors, [], `clipboard failure errors: ${failure.errors.join(' | ')}`);
  await failure.context.close();

  console.log('public UX interaction suite passed');
} finally {
  await browser.close();
}
