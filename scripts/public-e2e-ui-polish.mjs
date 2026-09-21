import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = process.env.GANTT_BASE || 'https://silovar-uk.github.io/gantt/';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function openFresh({ width, height, touch = false }) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('[data-action="add"]').first().waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.body.dataset.uiPolish === '20260914-sage3');
  return { context, page, errors };
}

try {
  const desktop = await openFresh({ width: 1440, height: 900 });
  const { page } = desktop;

  assert.equal(await page.locator('#ux-present-bar').isHidden(), true, 'hidden Present HUD must not reserve space');
  const conflict = page.locator('.conflict-banner[hidden]');
  if (await conflict.count()) assert.equal(await conflict.first().isHidden(), true, 'hidden conflict banner must not reserve space');

  const tokens = await page.evaluate(() => ({
    primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    line: getComputedStyle(document.documentElement).getPropertyValue('--line').trim(),
  }));
  assert.equal(tokens.primary.toUpperCase(), '#3E6A5A');
  assert.equal(tokens.line.toUpperCase(), '#E2E5E0');
  assert.ok(await page.locator('.ui-icon').count() >= 3, 'text-symbol controls were not converted to SVG icons');

  await page.locator('#ux-present').click();
  await page.locator('#ux-present-bar').waitFor({ state: 'visible' });
  const presentBox = await page.locator('#ux-present-bar').boundingBox();
  assert.ok(presentBox && presentBox.height <= 40, `desktop Present HUD too tall: ${JSON.stringify(presentBox)}`);
  assert.equal(await page.locator('#ux-present-bar .ux-present-meta').isHidden(), true);
  assert.equal(await page.locator('#ux-present-bar [data-ux-action="exit-present"]').isVisible(), true);

  const workspace = page.locator('#workspace');
  const workspaceBox = await workspace.boundingBox();
  if (workspaceBox) await page.mouse.move(workspaceBox.x + workspaceBox.width / 2, workspaceBox.y + workspaceBox.height / 2);
  await page.waitForTimeout(800);
  assert.equal(await page.locator('body').evaluate((el) => el.classList.contains('is-present-hud-quiet')), true, 'Present HUD did not quiet over the canvas');
  const hudBox = await page.locator('#ux-present-bar').boundingBox();
  if (hudBox) await page.mouse.move(hudBox.x + 10, hudBox.y + hudBox.height / 2);
  await page.waitForTimeout(30);
  assert.equal(await page.locator('body').evaluate((el) => el.classList.contains('is-present-hud-quiet')), false, 'Present HUD did not restore on hover');
  await page.locator('#ux-present-bar [data-ux-action="exit-present"]').click();
  await page.locator('#ux-present-bar').waitFor({ state: 'hidden' });

  assert.deepEqual(desktop.errors, [], `desktop page errors: ${desktop.errors.join(' | ')}`);
  await desktop.context.close();

  const mobile = await openFresh({ width: 390, height: 844, touch: true });
  await mobile.page.locator('#ux-present').click();
  await mobile.page.locator('#ux-present-bar').waitFor({ state: 'visible' });
  const mobileBar = await mobile.page.locator('#ux-present-bar').boundingBox();
  assert.ok(mobileBar && mobileBar.height <= 48, `mobile Present HUD too tall: ${JSON.stringify(mobileBar)}`);
  const exitBox = await mobile.page.locator('#ux-present-bar [data-ux-action="exit-present"]').boundingBox();
  assert.ok(exitBox && exitBox.height >= 44, `mobile Present exit target below 44px: ${JSON.stringify(exitBox)}`);
  const dims = await mobile.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  assert.ok(dims.scrollWidth <= dims.innerWidth + 1, `mobile overflow: ${JSON.stringify(dims)}`);
  assert.deepEqual(mobile.errors, [], `mobile page errors: ${mobile.errors.join(' | ')}`);
  await mobile.context.close();

  console.log('public sage polish + compact present HUD suite passed');
} finally {
  await browser.close();
}
