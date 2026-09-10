import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const BASE = 'https://silovar-uk.github.io/gantt/';
const ORIGIN = 'https://silovar-uk.github.io';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function openFresh({ width = 1440, height = 900, touch = false, legacyData = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  if (legacyData) {
    await context.addInitScript((payload) => {
      try { localStorage.setItem('gantt-desk:v2:project', JSON.stringify(payload)); } catch {}
    }, legacyData);
  }
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
  return page.locator(`[data-task-row="${id}"]`);
}

async function openIO(page, action) {
  await page.locator('[data-toggle-menu="io-menu"]').click();
  await page.locator(`[data-action="${action}"]`).click();
  await page.locator('.modal-layer').waitFor({ state: 'visible' });
}

async function closeModal(page) {
  if (await page.locator('.modal-layer').count()) {
    await page.locator('.modal-layer [data-action="close-modal"]').first().click();
    await page.locator('.modal-layer').waitFor({ state: 'detached' });
  }
}

async function importJSON(page, value, mode = 'append') {
  await openIO(page, 'import');
  await page.locator('#import-input').fill(typeof value === 'string' ? value : JSON.stringify(value));
  await page.locator('[data-action="validate-import"]').click();
  await page.locator('.validation-ok').waitFor({ state: 'visible' });
  if (mode !== 'append') await page.locator(`input[name="import-mode"][value="${mode}"]`).check();
  await page.locator('[data-action="apply-import"]').click();
  await page.locator('.modal-layer').waitFor({ state: 'detached' });
  await waitSaved(page);
}

async function hasClass(locator, name) {
  const value = (await locator.getAttribute('class')) || '';
  return value.split(/\s+/).includes(name);
}

try {
  const desktop = await openFresh();
  const { context, page } = desktop;

  // Create, select, save.
  await page.locator('[data-action="add"]').first().click();
  await page.locator('#task-form [name="name"]').fill('E2E タスク');
  await page.locator('#task-form [name="start"]').fill('2026-09-10');
  await page.locator('#task-form [name="end"]').fill('2026-09-12');
  await page.locator('[data-action="save-task"]').click();
  await waitSaved(page);
  let row = await taskRow(page, 'E2E タスク');
  assert.ok(await hasClass(row, 'is-selected'));

  // Start-only edit keeps end unchanged.
  await row.locator('[data-inline-start]').evaluate((el) => {
    el.value = '2026-09-11';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await waitSaved(page);
  row = await taskRow(page, 'E2E タスク');
  assert.equal(await row.locator('[data-inline-start]').inputValue(), '2026-09-11');
  assert.equal(await row.locator('[data-inline-end]').inputValue(), '2026-09-12');

  // Explicit period move preserves the two-day duration.
  await row.locator('[data-action="details"]').click();
  await page.locator('[data-action="move-period"]').click();
  await page.locator('#move-start').fill('2026-09-20');
  await page.locator('[data-action="apply-move"]').click();
  assert.equal(await page.locator('#task-form [name="start"]').inputValue(), '2026-09-20');
  assert.equal(await page.locator('#task-form [name="end"]').inputValue(), '2026-09-21');
  await closeModal(page);
  await waitSaved(page);

  // Complete / hide / include-hidden / unhide.
  row = await taskRow(page, 'E2E タスク');
  await row.locator('[data-task-complete]').check();
  await waitSaved(page);
  row = await taskRow(page, 'E2E タスク');
  assert.ok(await hasClass(row, 'is-completed'));
  await row.locator('[data-action="details"]').click();
  await page.locator('#task-form [name="isHidden"]').check();
  await page.locator('[data-action="save-task"]').click();
  await waitSaved(page);
  assert.equal(await taskId(page, 'E2E タスク'), null);
  await page.locator('[data-action="filter"]').click();
  await page.locator('[data-filter="includeHidden"]').check();
  await closeModal(page);
  row = await taskRow(page, 'E2E タスク');
  assert.ok(await hasClass(row, 'is-hidden-task'));
  await row.locator('[data-action="details"]').click();
  await page.locator('#task-form [name="isHidden"]').uncheck();
  await page.locator('[data-action="save-task"]').click();
  await waitSaved(page);

  // Search plus Undo/Redo around inline rename.
  await page.locator('#search-input').fill('E2E');
  assert.equal(await page.locator('.task-row').count(), 1);
  await page.locator('#search-input').fill('');
  row = await taskRow(page, 'E2E タスク');
  await row.locator('[data-inline-name]').fill('E2E renamed');
  await row.locator('[data-inline-name]').blur();
  await waitSaved(page);
  assert.ok(await taskId(page, 'E2E renamed'));
  await page.locator('[data-action="undo"]').click();
  await waitSaved(page);
  assert.ok(await taskId(page, 'E2E タスク'));
  await page.locator('[data-action="redo"]').click();
  await waitSaved(page);
  assert.ok(await taskId(page, 'E2E renamed'));

  // Put a non-default view value in the backup.
  await page.locator('[data-action="display-settings"]').click();
  await page.locator('#setting-list-width').fill('520');
  await page.locator('[data-action="apply-display-settings"]').click();

  // Backup / TSV / XLSX downloads.
  await openIO(page, 'export');
  let pendingDownload = page.waitForEvent('download');
  await page.locator('[data-action="download-backup"]').click();
  const backupDownload = await pendingDownload;
  const backupPath = '/tmp/public-e2e-backup.json';
  await backupDownload.saveAs(backupPath);
  const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  assert.equal(backup.schemaVersion, 1);
  assert.equal(backup.viewSettings.listWidth, 520);
  assert.ok(backup.tasks.some((item) => item.name === 'E2E renamed'));

  await page.locator('input[name="export-target"][value="all"]').check();
  pendingDownload = page.waitForEvent('download');
  await page.locator('[data-action="download-tsv"]').click();
  const tsvDownload = await pendingDownload;
  await tsvDownload.saveAs('/tmp/public-e2e.tsv');
  assert.match(await fs.readFile('/tmp/public-e2e.tsv', 'utf8'), /E2E renamed/);

  pendingDownload = page.waitForEvent('download');
  await page.locator('[data-action="download-xlsx"]').click();
  const xlsxDownload = await pendingDownload;
  await xlsxDownload.saveAs('/tmp/public-e2e.xlsx');
  const xlsx = await fs.readFile('/tmp/public-e2e.xlsx');
  assert.equal(xlsx[0], 0x50);
  assert.equal(xlsx[1], 0x4b);
  assert.ok(xlsx.length > 1000);
  await closeModal(page);

  // ChatGPT handoff: prompt contract, URL round-trip and clipboard copy.
  await openIO(page, 'chat-input');
  await page.locator('#input-source').fill('10月1日 A&B #確認 + 😀');
  await page.locator('[data-action="build-input-prompt"]').click();
  const prompt = await page.locator('#input-prompt').inputValue();
  assert.ok(prompt.includes('原文にない日付・年・期間を推測しない'));
  const encoded = await page.evaluate((text) => chatGPTUrl(text), '日本語\nA&B # + 😀');
  assert.equal(new URL(encoded).searchParams.get('prompt'), '日本語\nA&B # + 😀');
  await page.locator('[data-action="copy-input-prompt"]').click();
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent?.includes('全文をコピーしました'));
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), prompt);
  await closeModal(page);

  // Invalid JSON changes nothing.
  const beforeInvalid = await page.locator('.task-row').count();
  await openIO(page, 'import');
  await page.locator('#import-input').fill('{oops');
  await page.locator('[data-action="validate-import"]').click();
  await page.locator('.validation-errors').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-action="apply-import"]').isDisabled(), true);
  await closeModal(page);
  assert.equal(await page.locator('.task-row').count(), beforeInvalid);

  // Valid handoff + pending item + pending-to-task.
  const handoff = {
    handoffVersion: 1,
    tasks: [{ name: '取り込み予定', start: '2026-10-01', end: '2026-10-03', categoryName: '取込', note: '', milestone: false }],
    needsReview: [{ sourceText: '来月に確認', reason: '日付が未確定', missingFields: ['start', 'end'], name: '保留予定', categoryName: '取込' }],
  };
  await importJSON(page, handoff);
  assert.ok(await taskId(page, '取り込み予定'));
  await page.locator('[data-action="pending"]').click();
  await page.locator('[data-pending-form] [name="name"]').fill('保留から登録');
  await page.locator('[data-pending-form] [name="start"]').fill('2026-10-10');
  await page.locator('[data-pending-form] [name="end"]').fill('2026-10-11');
  await page.locator('[data-action="register-pending"]').click();
  await waitSaved(page);
  assert.ok(await taskId(page, '保留から登録'));

  // Duplicate guard must require explicit opt-in.
  await openIO(page, 'import');
  await page.locator('#import-input').fill(JSON.stringify(handoff));
  await page.locator('[data-action="validate-import"]').click();
  await page.locator('.duplicate-warning').waitFor({ state: 'visible' });
  await page.locator('[data-action="apply-import"]').click();
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent?.includes('同じ内容を取り込み済み'));
  assert.equal(await page.locator('.modal-layer').count(), 1);
  assert.equal(await page.locator('#duplicate-confirm').isChecked(), false);
  await closeModal(page);

  // Restore the backup and verify restored view survives reload.
  await page.locator('[data-action="display-settings"]').click();
  await page.locator('#setting-list-width').fill('400');
  await page.locator('[data-action="apply-display-settings"]').click();
  await importJSON(page, backup, 'restore');
  assert.ok(await taskId(page, 'E2E renamed'));
  assert.equal(await taskId(page, '取り込み予定'), null);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-action="add"]').first().waitFor({ state: 'visible' });
  assert.ok(await taskId(page, 'E2E renamed'));
  await page.locator('[data-action="display-settings"]').click();
  assert.equal(await page.locator('#setting-list-width').inputValue(), '520');
  await closeModal(page);

  // A second tab must detect the newer revision instead of silently overwriting.
  const second = await context.newPage();
  await second.goto(BASE, { waitUntil: 'networkidle' });
  await second.locator('[data-action="add"]').first().waitFor({ state: 'visible' });
  row = await taskRow(page, 'E2E renamed');
  await row.locator('[data-inline-name]').fill('E2E conflict source');
  await row.locator('[data-inline-name]').blur();
  await waitSaved(page);
  await second.locator('#conflict-banner').waitFor({ state: 'visible', timeout: 10000 });
  assert.match(await second.locator('#conflict-banner').innerText(), /別のタブで予定が更新されています/);
  await second.close();
  assert.deepEqual(desktop.errors, [], `desktop page errors: ${desktop.errors.join(' | ')}`);
  await context.close();

  // Mobile: no document-level horizontal overflow, no split mode, 44px primary targets, full-screen modal fits.
  const mobile = await openFresh({ width: 390, height: 844, touch: true });
  const dims = await mobile.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  assert.ok(dims.scrollWidth <= dims.innerWidth + 1, `mobile overflow: ${JSON.stringify(dims)}`);
  assert.equal(await mobile.page.locator('[data-mode="split"]').isHidden(), true);
  const addBox = await mobile.page.locator('[data-action="add"]').first().boundingBox();
  assert.ok(addBox && addBox.height >= 44);
  await mobile.page.locator('[data-action="add"]').first().click();
  const modalBox = await mobile.page.locator('.modal-card').boundingBox();
  const saveBox = await mobile.page.locator('[data-action="save-task"]').boundingBox();
  assert.ok(modalBox && modalBox.width <= 390 && modalBox.height <= 844);
  assert.ok(saveBox && saveBox.height >= 44);
  assert.deepEqual(mobile.errors, [], `mobile page errors: ${mobile.errors.join(' | ')}`);
  await mobile.context.close();

  // Legacy v2 migration must preserve known data and create a pre-migration backup.
  const legacyData = {
    version: 3,
    id: 'legacy-project',
    title: '旧案件',
    memo: '旧メモ',
    categories: ['未分類', '旧カテゴリ'],
    tasks: [{ id: 'legacy-task', name: '旧予定', start: '2026-11-01', end: '2026-11-02', category: '旧カテゴリ', color: 'blue', completed: false, milestone: false, deadline: false, note: '旧ノート' }],
    view: { start: '2026-10-25', end: '2026-11-10', dayWidth: 24, rowHeight: 40, panelWidth: 500, showCompleted: true },
  };
  const legacy = await openFresh({ legacyData });
  assert.ok(await taskId(legacy.page, '旧予定'));
  assert.equal(await legacy.page.locator('#project-title-button').innerText(), '旧案件');
  const legacyBackups = await legacy.page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('gantt-desk:v5:legacy-backup:')));
  assert.ok(legacyBackups.length >= 1);
  assert.deepEqual(legacy.errors, [], `legacy page errors: ${legacy.errors.join(' | ')}`);
  await legacy.context.close();

  // Clipboard failure must show failure, focus/select manual text, and never be overwritten by a false success.
  const failure = await openFresh();
  await openIO(failure.page, 'chat-input');
  await failure.page.locator('#input-source').fill('コピー失敗確認');
  await failure.page.locator('[data-action="build-input-prompt"]').click();
  await failure.page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async () => { throw new Error('denied'); },
    });
  });
  await failure.page.locator('[data-action="copy-input-prompt"]').click();
  await failure.page.waitForFunction(() => document.querySelector('#toast')?.textContent?.includes('コピーできませんでした'));
  const toastText = await failure.page.locator('#toast').innerText();
  assert.ok(toastText.includes('コピーできませんでした'));
  assert.ok(!toastText.includes('コピーしました'));
  assert.equal(await failure.page.evaluate(() => document.activeElement?.id), 'input-prompt');
  assert.deepEqual(failure.errors, [], `clipboard failure errors: ${failure.errors.join(' | ')}`);
  await failure.context.close();

  console.log('public v5 interaction suite passed');
} finally {
  await browser.close();
}
