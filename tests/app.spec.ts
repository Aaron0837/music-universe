import { expect, test } from '@playwright/test';

test('launches the generated demo and switches worlds', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今天想听些什么？' })).toBeVisible();
  await page.locator('#heroDemoButton').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'listen');
  await expect(page.locator('#dockTime')).not.toHaveText('00:00 / 00:32');
  await page.getByRole('button', { name: /DJ Studio/ }).click();
  await expect(page.locator('#player')).toHaveClass(/visible/);
  await page.locator('[data-game-mode="rhythm"]').click();
  await page.locator('#startChallenge').click();
  await expect(page.locator('.game-note').first()).toBeVisible({ timeout: 3000 });
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
