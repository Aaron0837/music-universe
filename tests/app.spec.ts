import { expect, test } from '@playwright/test';

test('plays an audible generated demo and opens the full DJ workspace', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /让每一首歌/ })).toBeVisible();
  await page.getByRole('button', { name: '播放原创示例', exact: true }).first().click();
  await expect(page.getByText('Orbital Signal', { exact: true })).toBeVisible();
  await expect.poll(async () => Number(await page.locator('.waveform-canvas--compact').getAttribute('data-rms'))).toBeGreaterThan(0.01);

  await page.getByRole('button', { name: 'DJ 台 PRO', exact: true }).click();
  await expect(page.getByTestId('deck-a')).toBeVisible();
  await expect(page.getByTestId('deck-b')).toBeVisible();
  await expect(page.getByTestId('rhythm-game')).toBeVisible();
  const game = await page.getByTestId('rhythm-game').boundingBox();
  expect(game?.width).toBeGreaterThan(390);

  await page.getByTestId('crossfader').fill('0.7');
  await expect(page.getByTestId('crossfader')).toHaveValue('0.7');
  await page.getByRole('button', { name: '开始挑战' }).click();
  await expect(page.locator('.game-note').first()).toBeVisible({ timeout: 2500 });
});

test('imports an audio file locally and restores it after reload', async ({ page }) => {
  await page.goto('/');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入本地音乐' }).first().click();
  const chooser = await chooserPromise;
  const header = Buffer.from('RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x40\x1f\x00\x00\x80>\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00', 'binary');
  await chooser.setFiles({ name: 'Local Signal.wav', mimeType: 'audio/wav', buffer: header });
  await page.getByRole('button', { name: '曲库', exact: true }).click();
  await expect(page.getByText('Local Signal', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '曲库', exact: true }).click();
  await expect(page.getByText('Local Signal', { exact: true })).toBeVisible();
});

test('switches theme and lazy-loads visual worlds', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '切换明暗主题' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '可视化' }).click();
  await expect(page.getByRole('heading', { name: '看见音乐正在发生' })).toBeVisible();
  await page.getByRole('button', { name: /Nebula/ }).click();
  await expect(page.locator('.visual-canvas')).toBeVisible();
});
