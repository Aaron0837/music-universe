import { expect, test, type Locator, type Page } from '@playwright/test';

/** A real 12-second WAV, matching the fixture the other suites import. */
function audioFile(name = 'Lyric Garden.wav') {
  const rate = 8000, samples = rate * 12, buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const time = i / rate, phase = time % 0.5;
    buffer.writeInt16LE(Math.round((Math.sin(time * 2 * Math.PI * 110) * 0.14 + Math.sin(i * 0.08) * Math.exp(-phase * 65) * 0.5) * 32767), 44 + i * 2);
  }
  return { name, mimeType: 'audio/wav', buffer };
}

async function importAudio(page: Page) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入本地音乐', exact: true }).first().click();
  await (await chooser).setFiles(audioFile());
  await expect(page.getByRole('status')).toContainText('已导入');
}

async function nav(page: Page, name: string) {
  if (await page.locator('.sidebar').evaluate((element) => element.classList.contains('sidebar--closed'))) await page.getByRole('button', { name: '切换侧栏' }).click();
  await page.getByRole('navigation', { name: '主要区域' }).getByRole('button', { name, exact: true }).click();
}

/** Import one track, play it, and open the immersive player on it. */
async function openNowPlaying(page: Page) {
  await page.goto('/');
  await importAudio(page);
  await nav(page, '曲库');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(async () => Number(await page.locator('.waveform-canvas--compact').getAttribute('data-rms'))).toBeGreaterThan(0.01);
  await page.getByRole('button', { name: '打开播放大屏' }).click();
  await expect(page.getByTestId('now-playing')).toBeVisible();
}

/** The overlay's transport position, read from the seek control the user sees. */
async function seekValue(overlay: Locator): Promise<number> {
  return Number(await overlay.getByRole('slider', { name: '播放大屏进度' }).inputValue());
}

async function writeLyrics(page: Page, text: string) {
  await page.getByRole('button', { name: '添加歌词' }).click();
  await page.getByLabel('歌词文本').fill(text);
  await page.getByRole('button', { name: '保存歌词' }).click();
  await expect(page.getByRole('status')).toContainText(text.trim() ? '歌词已保存' : '歌词已清除');
}

test('immersive player adds synced lyrics, highlights and seeks by line', async ({ page }) => {
  await openNowPlaying(page);
  const overlay = page.getByTestId('now-playing');
  await expect(page.locator('.np-meta')).toContainText('Lyric Garden');

  // Without lyrics the surface says so rather than showing an empty column.
  await expect(page.locator('.np-empty')).toContainText('没有内嵌歌词');

  await writeLyrics(page, '[00:00.00]first line\n[00:03.00]second line\n[00:06.00]third line');
  await expect(overlay).toHaveAttribute('data-synced', 'true');

  const lines = page.locator('.np-line');
  await expect(lines).toHaveCount(3);

  // Rewind so the highlight starts on the first line regardless of import time.
  await overlay.getByRole('slider', { name: '播放大屏进度' }).fill('0');
  await expect(page.locator('.np-line.active')).toContainText('first line');

  // The highlight tracks the transport instead of staying put.
  await expect.poll(async () => await page.locator('.np-line.active').textContent(), { timeout: 9000 }).toContain('second line');

  // Clicking a line seeks the deck to that timestamp.
  await lines.last().click();
  await expect.poll(async () => await seekValue(overlay)).toBeGreaterThan(5.5);
  await expect(page.locator('.np-line.active')).toContainText('third line');
});

test('lyrics survive a reload and can be replaced or cleared', async ({ page }) => {
  await openNowPlaying(page);
  await writeLyrics(page, '[00:00.00]persisted line');

  await page.reload();
  await nav(page, '曲库');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.getByRole('button', { name: '打开播放大屏' }).click();
  await expect(page.getByTestId('now-playing')).toBeVisible();
  await expect(page.locator('.np-line')).toHaveCount(1);
  await expect(page.locator('.np-line')).toContainText('persisted line');

  // Editing replaces the stored text, and clearing removes the track's lyric row.
  await page.getByRole('button', { name: '编辑歌词' }).click();
  await expect(page.getByLabel('歌词文本')).toHaveValue('[00:00.00]persisted line');
  await page.getByLabel('歌词文本').fill('');
  await page.getByRole('button', { name: '保存歌词' }).click();
  await expect(page.getByRole('status')).toContainText('歌词已清除');
  await expect(page.locator('.np-empty')).toContainText('没有内嵌歌词');

  const stored = await page.evaluate(async () => {
    // A variable path keeps TypeScript from resolving this URL as a module.
    const repositoryPath = '/src/data/WebLibraryRepository.ts';
    const { MusicDatabase } = await import(repositoryPath);
    const db = new MusicDatabase();
    const rows = await db.lyrics.toArray();
    const tracks = await db.tracks.toArray();
    db.close();
    return { rows: rows.length, hasLyrics: tracks[0]?.hasLyrics ?? null };
  });
  expect(stored.rows).toBe(0);
  expect(stored.hasLyrics).toBe(false);
});

test('plain-text lyrics render without a timeline and are not clickable to seek', async ({ page }) => {
  await openNowPlaying(page);
  const overlay = page.getByTestId('now-playing');
  await writeLyrics(page, 'no timestamps here\nsecond row');

  await expect(overlay).toHaveAttribute('data-synced', 'false');
  await expect(page.locator('.np-lyric-head')).toContainText('纯文本');
  await expect(page.locator('.np-line')).toHaveCount(2);
  await expect(page.locator('.np-line.active')).toHaveCount(0);

  // Let playback get clear of zero, then confirm a click does not rewind it.
  await expect.poll(async () => await seekValue(overlay)).toBeGreaterThan(1.5);
  const before = await seekValue(overlay);
  await page.locator('.np-line').first().click();
  await page.waitForTimeout(300);
  expect(await seekValue(overlay)).toBeGreaterThanOrEqual(before - 0.25);
});

test('immersive player transports, closes with Escape and reopens with V', async ({ page }) => {
  await openNowPlaying(page);
  const overlay = page.getByTestId('now-playing');
  await expect(overlay).toHaveAttribute('data-playing', 'true');

  await overlay.getByRole('button', { name: '播放或暂停' }).click();
  await expect(overlay).toHaveAttribute('data-playing', 'false');

  await overlay.getByRole('slider', { name: '播放大屏进度' }).fill('4');
  await expect.poll(async () => await seekValue(overlay)).toBeGreaterThan(3.5);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('now-playing')).toBeHidden();

  // The "V" shortcut reopens it, matching the launcher button.
  await page.keyboard.press('v');
  await expect(page.getByTestId('now-playing')).toBeVisible();
});

test('artwork colour themes the interface and stays readable in both modes', async ({ page }) => {
  await page.goto('/');
  await importAudio(page);

  // Give the track a saturated cover, the way a real embedded PNG would arrive.
  const stored = await page.evaluate(async () => {
    const repositoryPath = '/src/data/WebLibraryRepository.ts';
    const { MusicDatabase } = await import(repositoryPath);
    const db = new MusicDatabase();
    const tracks = await db.tracks.toArray();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#12306b';
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = '#1f8fd0';
    context.fillRect(0, 0, 32, 64);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), 'image/png'));
    await db.artworks.put({ trackId: tracks[0].id, blob });
    await db.tracks.update(tracks[0].id, { artwork: blob });
    db.close();
    return tracks[0].id;
  });
  expect(stored).toBeTruthy();

  await page.reload();
  await nav(page, '曲库');
  await page.getByRole('button', { name: '播放', exact: true }).click();

  // The accent is derived from the blue cover rather than the green default.
  await expect(page.locator('html')).toHaveAttribute('data-artwork-theme', /.+/);
  const accents = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return { accent: style.getPropertyValue('--accent').trim(), glow: style.getPropertyValue('--glow').trim(), defaultAccent: '#39745e' };
  });
  expect(accents.accent).not.toBe(accents.defaultAccent);
  expect(accents.glow).toBeTruthy();

  // Flipping to dark mode recomputes the palette instead of reusing the light one.
  const lightAccent = accents.accent;
  await page.getByRole('button', { name: '切换明暗主题' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(async () => await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).not.toBe(lightAccent);

  // In both modes the derived accent must still clear the contrast floor.
  for (const theme of ['light', 'dark']) {
    const ratio = await page.evaluate(async (mode) => {
      document.documentElement.dataset.theme = mode;
      const themePath = '/src/theme/artworkTheme.ts';
      const palettePath = '/src/theme/palette.ts';
      const { applyArtworkTheme } = await import(themePath);
      applyArtworkTheme();
      const { contrastRatio } = await import(palettePath);
      const parse = (hex: string) => {
        const value = hex.trim().replace('#', '');
        return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) };
      };
      const style = getComputedStyle(document.documentElement);
      return contrastRatio(parse(style.getPropertyValue('--accent')), parse(style.getPropertyValue('--bg')));
    }, theme);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
});
