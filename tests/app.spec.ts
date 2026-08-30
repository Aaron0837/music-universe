import { expect, test } from '@playwright/test';

test('launches the generated demo and switches worlds', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今天想听些什么？' })).toBeVisible();
  await page.locator('#heroDemoButton').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'listen');
  await expect(page.locator('#dockTime')).not.toHaveText('00:00 / 00:32');
  await page.getByRole('button', { name: /DJ Studio/ }).click();
  await expect(page.locator('#player')).toHaveClass(/visible/);
  await expect(page.locator('[data-game-mode="rhythm"]')).toHaveClass(/active/);
  const tempoKnob = await page.locator('#tempoKnob').boundingBox();
  const volumeKnob = await page.locator('#volumeKnob').boundingBox();
  expect(tempoKnob?.width).toBeGreaterThanOrEqual(110);
  expect(volumeKnob?.width).toBeGreaterThanOrEqual(110);
  await page.locator('#tempoA').evaluate((element) => { const input = element as HTMLInputElement; input.value = '132'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#volume').evaluate((element) => { const input = element as HTMLInputElement; input.value = '.4'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('#tempoValue')).toHaveText('132');
  await expect(page.locator('#levelOutput')).toHaveText('OUTPUT · 40%');
  await expect(page.locator('#sourceBpm')).toContainText('1.10×');
  await page.locator('#startChallenge').click();
  await expect(page.locator('.game-note').first()).toBeVisible({ timeout: 4000 });
  await expect(page.locator('.note-highway .lane').first()).toHaveAttribute('aria-label', 'Hit lane A');
  await page.getByRole('tab', { name: /GRAVITY WELL/ }).click();
  await expect(page.getByRole('tab', { name: /GRAVITY WELL/ })).toHaveAttribute('aria-selected', 'true');
});

test('language and reduced-motion controls are keyboard accessible', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-theme="mint"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'mint');
  await page.getByRole('button', { name: /DJ Studio/ }).click();
  await page.locator('#reducedButton').click();
  await expect(page.locator('#reducedButton')).toHaveAttribute('aria-pressed', 'true');
});
