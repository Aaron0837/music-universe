import { expect, test, type Page } from '@playwright/test';

async function nav(page: Page, name: string) {
  if (await page.locator('.sidebar').evaluate((element) => element.classList.contains('sidebar--closed'))) await page.getByRole('button', { name: '切换侧栏' }).click();
  await page.getByRole('navigation', { name: '主要区域' }).getByRole('button', { name, exact: true }).click();
}

function audioFile(name: string, frequency: number, seconds = 6) {
  const rate = 8000, samples = rate * seconds, buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const time = i / rate, phase = time % 0.5;
    buffer.writeInt16LE(Math.round((Math.sin(time * 2 * Math.PI * frequency) * 0.2 + Math.sin(i * 0.07) * Math.exp(-phase * 60) * 0.5) * 32767), 44 + i * 2);
  }
  return { name, mimeType: 'audio/wav', buffer };
}

async function importThree(page: Page) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入本地音乐', exact: true }).first().click();
  await (await chooser).setFiles([audioFile('Alpha.wav', 220), audioFile('Beta.wav', 330), audioFile('Gamma.wav', 440)]);
  await expect(page.getByRole('status')).toContainText('已导入');
}

test('playlist add, reorder, remove and play in order end to end', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await importThree(page);
  await nav(page, '播放列表');

  await expect(page.getByRole('heading', { name: '播放列表', exact: true })).toBeVisible();
  await expect(page.getByText('还没有播放列表')).toBeVisible();

  // Create, then add all three via the picker.
  await page.getByLabel('新歌单名称').fill('夜间通勤');
  await page.getByRole('button', { name: '新建歌单' }).click();
  await expect(page.getByLabel('歌单名称', { exact: true })).toHaveValue('夜间通勤');

  const picker = page.locator('.playlist-picker');
  if (!(await picker.evaluate((element) => (element as HTMLDetailsElement).open))) await picker.locator('summary').click();
  for (const title of ['Alpha', 'Beta', 'Gamma']) {
    await page.getByRole('button', { name: `加入 ${title}` }).click();
    await expect(page.locator('.playlist-tracks li')).toHaveCount(['Alpha', 'Beta', 'Gamma'].indexOf(title) + 1);
  }

  const titles = () => page.locator('.playlist-tracks li strong').allTextContents();
  expect(await titles()).toEqual(['Alpha', 'Beta', 'Gamma']);

  // Reorder: move the third entry up, then the first one down.
  await page.getByRole('button', { name: '上移 Gamma' }).click();
  await expect.poll(titles).toEqual(['Alpha', 'Gamma', 'Beta']);
  await page.getByRole('button', { name: '下移 Alpha' }).click();
  await expect.poll(titles).toEqual(['Gamma', 'Alpha', 'Beta']);

  // The first entry cannot move up, the last cannot move down.
  await expect(page.getByRole('button', { name: '上移 Gamma' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '下移 Beta' })).toBeDisabled();

  // Removing one leaves the rest in order.
  await page.getByRole('button', { name: '从歌单移除 Alpha' }).click();
  await expect.poll(titles).toEqual(['Gamma', 'Beta']);

  // Persistence: the edit survives leaving and returning to the page.
  await nav(page, '曲库');
  await nav(page, '播放列表');
  await expect.poll(titles).toEqual(['Gamma', 'Beta']);
  await expect(page.getByLabel('歌单名称', { exact: true })).toHaveValue('夜间通勤');

  // Playing the queue loads its first track onto Deck A.
  await page.locator('.playlist-wall article').first().getByRole('button', { name: /播放歌单/ }).click();
  await expect.poll(async () => page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/src/audio/engine/runtime.ts'))!.name;
    const { getMixer } = await import(path);
    const deck = getMixer().decks.A.snapshot();
    return { trackId: deck.trackId, playing: deck.playing, status: deck.status };
  })).toMatchObject({ playing: true, status: 'ready' });

  // The queue marks the playing row.
  await expect(page.locator('.playlist-tracks li.playing')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('an empty playlist refuses to start and says so', async ({ page }) => {
  await page.goto('/');
  await nav(page, '播放列表');
  await page.getByLabel('新歌单名称').fill('空歌单');
  await page.getByRole('button', { name: '新建歌单' }).click();
  await expect(page.getByText('这个歌单还是空的')).toBeVisible();
  await page.locator('.playlist-wall article').first().getByRole('button', { name: /播放歌单/ }).click();
  await expect(page.getByRole('status')).toContainText('还没有音乐');
});
