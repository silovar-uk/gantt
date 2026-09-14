import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/';
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

try {
  const desktop = await openFresh();
  const { page } = desktop;

  assert.equal(await page.locator('body').getAttribute('data-gpt-add-prompt-version'), '20260914-gptadd1');
  assert.equal(await page.evaluate(() => typeof globalThis.ganttGptAddPrompt?.build), 'function');

  await page.locator('[data-action="add"]').first().click();
  await page.locator('[data-gpt-add-bridge]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-action="add-via-gpt"]').isVisible(), true);
  assert.ok((await page.locator('[data-gpt-add-bridge]').innerText()).includes('日付を勝手に補完せず'));

  await page.locator('[data-action="add-via-gpt"]').click();
  await page.locator('#input-source').waitFor({ state: 'visible' });
  await page.locator('#input-source').fill('9/19 東京V戦 広報素材入稿\n翌日 SNS投稿');
  await page.locator('#input-year').fill('2026');
  await page.locator('#input-base-date').fill('2026-09-14');
  await page.locator('#input-category').fill('広報');
  await page.locator('[data-action="build-input-prompt"]').click();

  const prompt = await page.locator('#input-prompt').inputValue();
  for (const needle of [
    '判断の優先順位',
    '原文にない準備工程',
    'カテゴリー名を創作しない',
    '出力前の自己監査',
    '"handoffVersion": 1',
    '既定カテゴリー: 広報',
    '9/19 東京V戦 広報素材入稿',
    '翌日 SNS投稿',
  ]) {
    assert.ok(prompt.includes(needle), `planning prompt missing: ${needle}`);
  }
  assert.ok(prompt.includes('基準日: 2026-09-14'));
  assert.ok(prompt.includes('対象年: 2026'));
  assert.ok(prompt.includes('needsReview'));
  assert.ok(prompt.includes('ユーザーへ質問文を返さない'));

  const direct = await page.evaluate(() => globalThis.ganttGptAddPrompt.build({
    sourceText: '来週月曜に提出',
    baseDate: '2026-09-14',
  }));
  assert.ok(direct.includes('相対日付は、基準日から一意に計算できる場合だけ確定する'));
  assert.ok(direct.includes('来週月曜に提出'));

  assert.deepEqual(desktop.errors, [], `desktop page errors: ${desktop.errors.join(' | ')}`);
  await desktop.context.close();

  const mobile = await openFresh({ width: 390, height: 844, touch: true });
  await mobile.page.locator('[data-action="add"]').first().click();
  const gptButton = mobile.page.locator('[data-action="add-via-gpt"]');
  assert.equal(await gptButton.isVisible(), true);
  const box = await gptButton.boundingBox();
  assert.ok(box && box.height >= 32, `GPT add button is too small: ${JSON.stringify(box)}`);
  const dims = await mobile.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  assert.ok(dims.scrollWidth <= dims.innerWidth + 1, `mobile horizontal overflow: ${JSON.stringify(dims)}`);
  assert.deepEqual(mobile.errors, [], `mobile page errors: ${mobile.errors.join(' | ')}`);
  await mobile.context.close();

  console.log('GPT add planning prompt E2E passed');
} finally {
  await browser.close();
}
