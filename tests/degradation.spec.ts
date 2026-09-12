import { expect, test } from '@playwright/test';

/**
 * Guards the graceful-degradation path.
 *
 * The SoundTouch package declares `class SoundTouchNode extends AudioWorkletNode`
 * at module scope, so a static import of it throws in any browser without
 * AudioWorklet — which previously blanked the entire app before React mounted.
 * These tests simulate such browsers and prove the app still starts.
 */

async function hideGlobals(page: import('@playwright/test').Page, keys: string[]) {
  await page.addInitScript((names: string[]) => {
    for (const name of names) {
      Object.defineProperty(window, name, { get: () => undefined, configurable: true });
    }
  }, keys);
}

test('starts and disables key lock when AudioWorklet is missing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await hideGlobals(page, ['AudioWorkletNode']);

  await page.goto('/');
  // The shell must render, not white-screen.
  await expect(page.getByRole('heading', { name: /好音乐/ })).toBeVisible();

  await page.getByRole('button', { name: 'DJ 台 PRO', exact: true }).click();
  const toggle = page.getByLabel('Deck A 保调变速');
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeDisabled();
  await expect(toggle).toContainText('不可用');
  expect(errors).toEqual([]);
});

test('still starts on a browser with no Web Audio at all', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await hideGlobals(page, ['AudioContext', 'webkitAudioContext', 'AudioWorkletNode']);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /好音乐/ })).toBeVisible();
  // Pages that touch audio must stay reachable and render, not crash the router.
  for (const name of ['曲库', '播放列表', 'DJ 台 PRO', '可视化', '设置']) {
    if (await page.locator('.sidebar').evaluate((element) => element.classList.contains('sidebar--closed'))) {
      await page.getByRole('button', { name: '切换侧栏' }).click();
    }
    await page.getByRole('navigation', { name: '主要区域' }).getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.page')).toBeVisible();
  }
  expect(errors).toEqual([]);
});
