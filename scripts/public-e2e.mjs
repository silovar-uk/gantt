import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const BASE = 'https://silovar-uk.github.io/gantt/';
const ORIGIN = 'https://silovar-uk.github.io';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function openFresh({ width = 1440, height = 900, touch = false, initScript = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('[data-action="add"]').first().waitFor({ state: 'visible' });
  return { context, page, errors };
}

async function waitSaved(page) {
  await page.locator('#save-status').waitFor({ state: 'attached' });
  await page.waitForFunction(() => {
    const text = document.querySelector('#save-status')?.textContent || '';
    return text.includes('保存済み');
  }, null, { timeout: 10000 });
}

async function taskIdByName(page, name) {
  return page.locator('input.inline-name').evaluateAll((inputs, target) => {
    const input = inputs.find((item) => item.value === target);
    return input?.dataset.inlineName || null;
  }, name);
}

async function rowByName(page, name) {
  const id = await taskIdByName(page, name);
  assert.ok(id, `task not found: ${name}`);
  return { id, row: page.locator(`[data-task-row="${id}"]`) };
}

async function openIO(page, action) {
  await page.locator('[data-toggle-menu="io-menu"]').click();
  await page.locator(`[data-action="${action}"]`).click();
  await page.locator('.modal-layer').waitFor({ state: 'visible' });
}

async function closeModal(page) {
  const modal = page.locator('.modal-layer');
  if (await modal.count()) {
    await page.locator('.modal-layer [data-action="close-modal"]').first().click();
    await modal.waitFor({ state: 'detached' });
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

try {
  const { context, page, errors } = await openFresh();

  // T01: create and persist a task; selected state must render immediately.
  await page.locator('[data-action="add"]').first().click();
  await page.locator('#task-form [name="name"]').fill('E2E タスク');
  await page.locator('#task-form [name="start"]').fill('2026-09-10');
  await page.locator('#task-form [name="end"]').fill('2026-09-12');
  await page.locator('[data-action="save-task"]').click();
  await waitSaved(page);
  let task = await rowByName(page, 'E2E タスク');
  await expectClass(task.row, 'is-selected');

  // T02: changing start alone keeps end fixed.
  const startInput = task.row.locator('[data-inline-start]');
  await startInput.evaluate((el) => {
    el.value = '2026-09-11';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await waitSaved(page);
  task = await rowByName(page, 'E2E タスク');
  assert.equal(await task.row.locator('[data-inline-start]').inputValue(), '2026-09-11');
  assert.equal(await task.row.locator('[data-inline-end]').inputValue(), '2026-09-12');

  // T03: explicit period movement preserves duration.
  await task.row.locator('[data-action="details"]').click();
  await page.locator('[data-action="move-period"]').click();
  await page.locator('#move-start').fill('2026-09-20');
  await page.locator('[data-action="apply-move"]').click();
  assert.equal(await page.locator('#task-form [name="start"]').inputValue(), '2026-09-20');
  assert.equal(await page.locator('#task-form [name="end"]').inputValue(), '2026-09-21');
  await closeModal(page);
  await waitSaved(page);

  // T17: complete, hide, reveal through filter, then unhide.
  task = await rowByName(page, 'E2E タスク');
  await task.row.locator('[data-task-complete]').check();
  await waitSaved(page);
  task = await rowByName(page, 'E2E タスク');
  await expectClass(task.row, 'is-completed');
  await task.row.locator('[data-action="details"]').click();
  await page.locator('#task-form [name="isHidden"]').check();
  await page.locator('[data-action="save-task"]').click();
  await waitSaved(page);
  assert.equal(await taskIdByName(page, 'E2E タスク'), null, 'hidden task should leave default list');
  await page.locator('[data-action="filter"]').click();
  await page.locator('[data-filter="includeHidden"]').check();
  await closeModal(page);
  task = await rowByName(page, 'E2E タスク');
  await expectClass(task.row, 'is-hidden-task');
  await task.row.locator('[data-action="details"]').click();
  await page.locator('#task-form [name="isHidden"]').uncheck();
  await page.locator('[data-action="save-task"]').click();
  await waitSaved(page);

  // Search and inline edit; T01/T17 plus Undo/Redo behavior.
  await page.locator('#search-input').fill('E2E');
  assert.equal(await page.locator('.task-row').count(), 1);
  await page.locator('#search-input').fill('');
  task = await rowByName(page, 'E2E タスク');
  await task.row.locator('[data-inline-name]').fill('E2E renamed');
  await task.row.locator('[data-inline-name]').blur();
  await waitSaved(page);
  assert.ok(await taskIdByName(page, 'E2E renamed'));
  await page.locator('[data-action="undo"]').click();
  await waitSaved(page);
  assert.ok(await taskIdByName(page, 'E2E タスク'));
  await page.locator('[data-action="redo"]').click();
  await waitSaved(page);
  assert.ok(await taskIdByName(page, 'E2E renamed'));

  // Set a non-default view value before backup so restore persistence can be checked.
  await page.locator('[data-action="display-settings"]').click();
  await page.locator('#setting-list-width').fill('520');
  await page.locator('[data-action="apply-display-settings"]').click();

  // Backup, TSV and XLSX outputs.
  await openIO(page, 'export');
  const backupDownloadPromise = page.waitForEvent('download');
  await page.locator('[data-action="download-backup"]').click();
  const backupDownload = await backupDownloadPromise;
  const backupPath = '/tmp/public-e2e-backup.json';
  await backupDownload.saveAs(backupPath);
  const backupText = await fs.readFile(backupPath, 'utf8');
  const backup = JSON.parse(backupText);
  assert.equal(backup.schemaVersion, 1);
  assert.equal(backup.viewSettings.listWidth, 520);
  assert.ok(backup.tasks.some((item) => item.name === 'E2E renamed'));

  await page.locator('input[name="export-target"][value="all"]').check();
  const tsvDownloadPromise = page.waitForEvent('download');
  await page.locator('[data-action="download-tsv"]').click();
  const tsvDownload = await tsvDownloadPromise;
  const tsvPath = '/tmp/public-e2e.tsv';
  await tsvDownload.saveAs(tsvPath);
  assert.match(await fs.readFile(tsvPath, 'utf8'), /E2E renamed/);

  const xlsxDownloadPromise = page.waitForEvent('download');
  await page.locator('[data-action="download-xlsx"]').click();
  const xlsxDownload = await xlsxDownloadPromise;
  const xlsxPath = '/tmp/public-e2e.xlsx';
  await xlsxDownload.saveAs(xlsxPath);
  const xlsxBytes = await fs.readFile(xlsxPath);
  assert.equal(xlsxBytes[0], 0x50);
  assert.equal(xlsxBytes[1], 0x4b);
  assert.ok(xlsxBytes.length > 1000);
  await closeModal(page);

  // T12/T13: URL encoding and successful copy are exact; no external ChatGPT page is needed.
  await openIO(page, 'chat-input');
  await page.locator('#input-source').fill('10月1日 A&B #確認 + 😀');
  await page.locator('[data-action="build-input-prompt"]').click();
  const prompt = await page.locator('#input-prompt').inputValue();
  assert.ok(prompt.includes('原文にない日付・年・期間を推測しない'));
  const encodedUrl = await page.evaluate((value) => chatGPTUrl(value), '日本語\nA&B # + 😀');
  const decoded = new URL(encodedUrl).searchParams.get('prompt');
  assert.equal(decoded, '日本語\nA&B # + 😀');
  await page.locator('[data-action="copy-input-prompt"]').click();
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent?.includes('全文をコピーしました'));
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), prompt);
  await closeModal(page);

  // T07: malformed JSON is rejected without changing tasks.
  const countBeforeInvalid = await page.locator('.task-row').count();
  await openIO(page, 'import');
  await page.locator('#import-input').fill('{oops');
  await page.locator('[data-action="validate-import"]').click();
  await page.locator('.validation-errors').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-action="apply-import"]').isDisabled(), true);
  await closeModal(page);
  assert.equal(await page.locator('.task-row').count(), countBeforeInvalid);

  // T08/T09/T10/T11: valid handoff, pending review conversion and duplicate guard.
  const handoff = {
    handoffVersion: 1,
    tasks: [{ name: '取り込み予定', start: '2026-10-01', end: '2026-10-03', categoryName: '取込', note: '', milestone: false }],
    needsReview: [{ sourceText: '来月に確認', reason: '日付が未確定', missingFields: ['start', 'end'], name: '保留予定', categoryName: '取込' }],
  };
  await importJSON(page, handoff);
  assert.ok(await taskIdByName(page, '取り込み予定'));
  await page.locator('[data-action="pending"]').click();
  await page.locator('[data-pending-form] [name="name"]').fill('保留から登録');
  await page.locator('[data-pending-form] [name="start"]').fill('2026-10-10');
  await page.locator('[data-pending-form] [name="end"]').fill('2026-10-11');
  await page.locator('[data-action="register-pending"]').click();
  await waitSaved(page);
  assert.ok(await taskIdByName(page, '保留から登録'));
  assert.equal(await page.locator('[data-action="pending"]').count(), 0);

  await openIO(page, 'import');
  await page.locator('#import-input').fill(JSON.stringify(handoff));
  await page.locator('[data-action="validate-import"]').click();
  await page.locator('.duplicate-warning').waitFor({ state: 'visible' });
  await page.locator('[data-action="apply-import"]').click();
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent?.includes('同じ内容を取り込み済み'));
  assert.equal(await page.locator('.modal-layer').count(), 1, 'duplicate import should remain blocked');
  await page.locator('#duplicate-confirm').check();
  await page.locator('[data-action="apply-import"]').click();
  await page.locator('.modal-layer').waitFor({ state: 'detached' });
  await waitSaved(page);

  // T24/T05: restore backup, then reload; project and view setting must survive.
  await page.locator('[data-action="display-settings"]').click();
  await page.locator('#setting-list-width').fill('400');
  await page.locator('[data-action="apply-display-settings"]').click();
  await importJSON(page, backup, 'restore');
  assert.ok(await taskIdByName(page, 'E2E renamed'));
  assert.equal(await taskIdByName(page, '取り込み予定'), null);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-action="add"]').first().waitFor({ state: 'visible' });
  assert.ok(await taskIdByName(page, 'E2E renamed'));
  await page.locator('[data-action="display-settings"]').click();
  assert.equal(await page.locator('#setting-list-width').inputValue(), '520');
  await closeModal(page);

  // T16: another tab receives a conflict signal and blocks silent overwrite.
  const page2 = await context.newPage();
  await page2.goto(BASE, { waitUntil: 'networkidle' });
  await page2.locator('[data-action="add"]').first().waitFor({ state: 'visible' });
  task = await rowByName(page, 'E2E renamed');
  await task.row.locator('[data-inline-name]').fill('E2E conflict source');
  await task.row.locator('[data-inline-name]').blur();
  await waitSaved(page);
  await page2.locator('#conflict-banner').waitFor({ state: 'visible', timeout: 10000 });
  assert.match(await page2.locator('#conflict-banner').innerText(), /別のタブで予定が更新されています/);
  await page2.close();

  assert.deepEqual(errors, [], `desktop page errors: ${errors.join(' | ')}`);
  await context.close();

  // T19/T20: mobile viewport boots without page-level horizontal overflow; touch controls meet 44px target.
  const mobileRun = await openFresh({ width: 390, height: 844, touch: true });
  const mobile = mobileRun.page;
  const overflow = await mobile.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  assert.ok(overflow.scrollWidth <= overflow.innerWidth + 1, `mobile page overflow: ${JSON.stringify(overflow)}`);
  assert.equal(await mobile.locator('[data-mode="split"]').isHidden(), true);
  const addBox = await mobile.locator('[data-action="add"]').first().boundingBox();
  assert.ok(addBox && addBox.height >= 44, `mobile add target too small: ${JSON.stringify(addBox)}`);
  await mobile.locator('[data-action="add"]').first().click();
  const modalBox = await mobile.locator('.modal-card').boundingBox();
  assert.ok(modalBox && modalBox.width <= 390 && modalBox.height <= 844, `mobile modal overflow: ${JSON.stringify(modalBox)}`);
  const saveBox = await mobile.locator('[data-action="save-task"]').boundingBox();
  assert.ok(saveBox && saveBox.height >= 44, `mobile save target too small: ${JSON.stringify(saveBox)}`);
  assert.deepEqual(mobileRun.errors, [], `mobile page errors: ${mobileRun.errors.join(' | ')}`);
  await mobileRun.context.close();

  // T22: legacy v2 data migrates on first v5 load and source data is backed up first.
  const legacy = {
    version: 3,
    id: 'legacy-project',
    title: '旧案件',
    memo: '旧メモ',
    categories: ['未分類', '旧カテゴリ'],
    tasks: [{ id: 'legacy-task', name: '旧予定', start: '2026-11-01', end: '2026-11-02', category: '旧カテゴリ', color: 'blue', completed: false, milestone: false, deadline: false, note: '旧ノート' }],
    view: { start: '2026-10-25', end: '2026-11-10', dayWidth: 24, rowHeight: 40, panelWidth: 500, showCompleted: true },
  };
  const legacyRun = await openFresh({ initScript: ({ payload }) => {
    try {
      localStorage.setItem('gantt-desk:v2:project', JSON.stringify(payload));
    } catch {}
  }.bind(null, { payload: legacy }) });
  assert.ok(await taskIdByName(legacyRun.page, '旧予定'));
  assert.equal(await legacyRun.page.locator('#project-title-button').innerText(), '旧案件');
  const backupKeys = await legacyRun.page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('gantt-desk:v5:legacy-backup:')));
  assert.ok(backupKeys.length >= 1, 'legacy source backup should exist');
  assert.deepEqual(legacyRun.errors, [], `legacy page errors: ${legacyRun.errors.join(' | ')}`);
  await legacyRun.context.close();

  // T13 failure path: clipboard denial must never show a false success and should select the manual-copy textarea.
  const failureRun = await openFresh();
  const failurePage = failureRun.page;
  await openIO(failurePage, 'chat-input');
  await failurePage.locator('#input-source').fill('コピー失敗確認');
  await failurePage.locator('[data-action="build-input-prompt"]').click();
  await failurePage.evaluate(() => {
    try {
      navigator.clipboard.writeText = async () => { throw new Error('denied'); };
    } catch {}
  });
  await failurePage.locator('[data-action="copy-input-prompt"]').click();
  await failurePage.waitForFunction(() => document.querySelector('#toast')?.textContent?.includes('コピーできませんでした'));
  assert.equal(await failurePage.evaluate(() => document.querySelector('#toast')?.textContent?.includes('コピーしました')), false);
  assert.equal(await failurePage.evaluate(() => document.activeElement?.id), 'input-prompt');
  assert.deepEqual(failureRun.errors, [], `clipboard failure page errors: ${failureRun.errors.join(' | ')}`);
  await failureRun.context.close();

  console.log('public v5 interaction smoke passed');
} finally {
  await browser.close();
}

async function expectClass(locator, className) {
  const classes = (await locator.getAttribute('class')) || '';
  assert.ok(classes.split(/\s+/).includes(className), `expected class ${className}, got ${classes}`);
}
