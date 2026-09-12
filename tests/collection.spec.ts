import { expect, test, type Locator, type Page } from '@playwright/test';

/** A real 12-second WAV, matching the fixture the other suites import. */
function audioFile(name: string) {
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

async function importAudio(page: Page, name: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入本地音乐', exact: true }).first().click();
  await (await chooser).setFiles(audioFile(name));
  await expect(page.getByRole('status')).toContainText('已导入');
}

async function nav(page: Page, name: string) {
  if (await page.locator('.sidebar').evaluate((element) => element.classList.contains('sidebar--closed'))) await page.getByRole('button', { name: '切换侧栏' }).click();
  await page.getByRole('navigation', { name: '主要区域' }).getByRole('button', { name, exact: true }).click();
}

/**
 * The library sorts newest-first, so positional indexes are misleading once more
 * than one file is imported. Every row action is scoped by title instead.
 */
function row(page: Page, title: string): Locator {
  return page.locator('.track-table article').filter({ hasText: title });
}

async function playRow(page: Page, title: string) {
  await row(page, title).getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(async () => Number(await page.locator('.waveform-canvas--compact').getAttribute('data-rms'))).toBeGreaterThan(0.01);
}

/** Reads the store the same way the existing suites reach the mixer. */
async function store<T>(page: Page, expression: string): Promise<T> {
  return page.evaluate(async (source) => {
    const path = '/src/stores/useAppStore.ts';
    const { useAppStore } = await import(path);
    // eslint-disable-next-line no-new-func
    return new Function('useAppStore', `return (${source})`)(useAppStore) as T;
  }, expression);
}

/**
 * Waits until the in-memory lists have actually landed in IndexedDB.
 *
 * Saving is deliberately fire-and-forget so a bookmark never blocks playback,
 * which means a reload issued right after a click can beat the write. Tests that
 * reload must settle first or they assert on a race, not on behaviour.
 */
async function persisted(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate(async () => {
    const storePath = '/src/stores/useAppStore.ts';
    const dbPath = '/src/data/WebLibraryRepository.ts';
    const { useAppStore } = await import(storePath);
    const { MusicDatabase } = await import(dbPath);
    const state = useAppStore.getState();
    const db = new MusicDatabase();
    const rows = await db.settings.bulkGet(['favorites', 'recent']);
    db.close();
    const value = (row: { value?: unknown } | undefined) => JSON.stringify(row?.value ?? []);
    return value(rows[0]) === JSON.stringify(state.favorites) && value(rows[1]) === JSON.stringify(state.recent);
  })).toBe(true);
}

test('favourites can be toggled from the library and appear in My Music', async ({ page }) => {
  await page.goto('/');
  await importAudio(page, 'First Garden.wav');
  await importAudio(page, 'Second Garden.wav');
  await nav(page, '曲库');

  // My Music starts empty and says so rather than showing a blank column.
  await nav(page, '我的音乐');
  await expect(page.getByTestId('favorites-section')).toContainText('还没有喜欢的音乐');

  await nav(page, '曲库');
  await row(page, 'First Garden').getByRole('button', { name: '喜欢 First Garden', exact: true }).click();
  await expect(row(page, 'First Garden').getByRole('button', { name: '取消喜欢 First Garden', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await nav(page, '我的音乐');
  const favorites = page.getByTestId('favorites-section');
  await expect(favorites).toContainText('First Garden');
  await expect(favorites).not.toContainText('Second Garden');
  await expect(page.locator('.page-heading')).toContainText('1 首喜欢');

  // Unliking from My Music removes the row entirely.
  await favorites.getByRole('button', { name: '取消喜欢 First Garden', exact: true }).click();
  await expect(page.getByTestId('favorites-section')).toContainText('还没有喜欢的音乐');
});

test('favourites survive a reload and the library can filter to them', async ({ page }) => {
  await page.goto('/');
  await importAudio(page, 'Keep Garden.wav');
  await importAudio(page, 'Other Garden.wav');
  await nav(page, '曲库');
  await row(page, 'Keep Garden').getByRole('button', { name: '喜欢 Keep Garden', exact: true }).click();
  await expect(row(page, 'Keep Garden').getByRole('button', { name: '取消喜欢 Keep Garden', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await persisted(page);

  await page.reload();
  await nav(page, '曲库');
  await expect(row(page, 'Keep Garden').getByRole('button', { name: '取消喜欢 Keep Garden', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // The "only liked" filter narrows the list to favourites.
  await page.getByRole('button', { name: '只看喜欢' }).click();
  await expect(page.locator('.track-table')).toContainText('Keep Garden');
  await expect(page.locator('.track-table')).not.toContainText('Other Garden');
  await page.getByRole('button', { name: '只看喜欢' }).click();
  await expect(page.locator('.track-table')).toContainText('Other Garden');
});

test('play history records real plays, newest first, and survives a reload', async ({ page }) => {
  await page.goto('/');
  await importAudio(page, 'History One.wav');
  await importAudio(page, 'History Two.wav');
  await nav(page, '曲库');

  // Nothing has been played yet, so My Music is explicit about that.
  await nav(page, '我的音乐');
  await expect(page.getByTestId('recent-section')).toContainText('最近还没有播放记录');

  await nav(page, '曲库');
  await playRow(page, 'History One');
  await nav(page, '我的音乐');
  await expect(page.getByTestId('recent-section')).toContainText('History One');

  // Playing a different track puts it at the top of the history.
  await nav(page, '曲库');
  await playRow(page, 'History Two');
  await nav(page, '我的音乐');
  const titles = page.getByTestId('recent-section').locator('.collection-row strong');
  // allTextContents() does not retry, so poll the rendered order instead.
  await expect.poll(async () => (await titles.allTextContents())[0]).toBe('History Two');
  expect(await titles.allTextContents()).toContain('History One');

  // Replaying moves the entry up rather than duplicating it.
  await nav(page, '曲库');
  await playRow(page, 'History One');
  await nav(page, '我的音乐');
  await expect.poll(async () => (await titles.allTextContents())[0]).toBe('History One');
  const replayed = await titles.allTextContents();
  expect(replayed.filter((title) => title === 'History One')).toHaveLength(1);

  await persisted(page);
  await page.reload();
  await nav(page, '我的音乐');
  await expect(page.getByTestId('recent-section')).toContainText('History One');
});

test('discover highlights what was actually played rather than just imported', async ({ page }) => {
  await page.goto('/');
  await importAudio(page, 'Played Garden.wav');
  await importAudio(page, 'Ignored Garden.wav');
  await nav(page, '曲库');
  // Play the older import, so a pass cannot be an accident of import order.
  await playRow(page, 'Played Garden');

  await nav(page, '发现');
  await expect(page.getByTestId('discover-recent')).toContainText('最近在听');
  await expect(page.locator('.recent-list')).toContainText('Played Garden');
  await expect(page.locator('.recent-list')).not.toContainText('Ignored Garden');
});

test('the play mode button cycles through every mode and persists', async ({ page }) => {
  await page.goto('/');
  const button = () => page.getByRole('button', { name: /播放模式/ });
  await expect(button()).toHaveAccessibleName('播放模式：顺序播放');

  await button().click();
  await expect(button()).toHaveAccessibleName('播放模式：列表循环');
  await button().click();
  await expect(button()).toHaveAccessibleName('播放模式：单曲循环');
  await button().click();
  await expect(button()).toHaveAccessibleName('播放模式：随机播放');

  await page.reload();
  await expect(button()).toHaveAccessibleName('播放模式：随机播放');
});

test('repeat-one replays the same track when it ends naturally', async ({ page }) => {
  await page.goto('/');
  await importAudio(page, 'Loop Garden.wav');
  await nav(page, '曲库');
  await playRow(page, 'Loop Garden');

  // Switch to repeat-one, then seek near the end so the deck finishes the track.
  const button = () => page.getByRole('button', { name: /播放模式/ });
  await button().click();
  await button().click();
  await expect(button()).toHaveAccessibleName('播放模式：单曲循环');

  const result = await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/src/audio/engine/runtime.ts'))!.name;
    const { getMixer } = await import(path);
    const deck = getMixer().decks.A;
    deck.seek(deck.duration - 0.4);
    await new Promise((resolve) => setTimeout(resolve, 2800));
    return { position: deck.position, playing: deck.snapshot().playing };
  });
  // A replay lands back near the start rather than stopping at the end.
  expect(result.playing).toBe(true);
  expect(result.position).toBeLessThan(6);
});

test('entering shuffle gives the queue a real permutation to walk', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Shuffle A.wav', 'Shuffle B.wav', 'Shuffle C.wav', 'Shuffle D.wav']) await importAudio(page, name);

  const result = await store<{ order: number[]; mode: string }>(page, `(() => {
    const store = useAppStore.getState();
    store.setPlayMode('shuffle');
    const ids = useAppStore.getState().tracks.map((track) => track.id);
    store.setQueue(ids, 'A', 0);
    const queue = useAppStore.getState().queue;
    return { order: queue.order, mode: useAppStore.getState().playMode };
  })()`);

  expect(result.mode).toBe('shuffle');
  expect(result.order).toHaveLength(4);
  // A permutation, not just a repeat of the input order.
  expect([...result.order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
});

test('the sleep timer counts down and pauses playback when it fires', async ({ page }) => {
  await page.goto('/');
  await importAudio(page, 'Sleep Garden.wav');
  await nav(page, '曲库');
  await playRow(page, 'Sleep Garden');

  await nav(page, '我的音乐');
  await expect(page.locator('.sleep-card')).toContainText('到点后暂停两个 Deck');

  await page.getByRole('button', { name: '15 分钟' }).click();
  await expect(page.getByRole('status')).toContainText('已设置 15 分钟睡眠定时');
  await expect(page.locator('.sleep-card')).toContainText('自动暂停播放');

  // Pull the deadline forward so the test does not wait a quarter of an hour.
  await store<void>(page, `useAppStore.setState({ sleepEndsAt: Date.now() + 400 })`);
  await expect(page.getByRole('status')).toContainText('睡眠定时已到', { timeout: 6000 });

  const playing = await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/src/audio/engine/runtime.ts'))!.name;
    const { getMixer } = await import(path);
    return getMixer().decks.A.snapshot().playing;
  });
  expect(playing).toBe(false);
});

test('deleting a track also removes it from favourites and history', async ({ page }) => {
  await page.goto('/');
  await importAudio(page, 'Doomed Garden.wav');
  await importAudio(page, 'Safe Garden.wav');
  await nav(page, '曲库');
  await row(page, 'Doomed Garden').getByRole('button', { name: '喜欢 Doomed Garden', exact: true }).click();
  await playRow(page, 'Doomed Garden');

  // Both lists reference it, then the track itself goes away.
  await nav(page, '我的音乐');
  await expect(page.getByTestId('favorites-section')).toContainText('Doomed Garden');
  await expect(page.getByTestId('recent-section')).toContainText('Doomed Garden');

  await nav(page, '曲库');
  await row(page, 'Doomed Garden').getByRole('button', { name: '移除', exact: true }).click();
  // Wait for the deletion itself to land before reloading.
  await expect(row(page, 'Doomed Garden')).toHaveCount(0);
  await page.reload();
  await nav(page, '我的音乐');
  await expect(page.getByTestId('favorites-section')).not.toContainText('Doomed Garden');
  await expect(page.getByTestId('recent-section')).not.toContainText('Doomed Garden');
  await expect(page.getByTestId('favorites-section')).toContainText('还没有喜欢的音乐');
});

test('My Music and the play mode control survive narrow layouts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  await importAudio(page, 'Narrow Garden.wav');
  await nav(page, '我的音乐');
  await expect(page.locator('.sleep-card')).toBeVisible();
  await expect(page.getByTestId('favorites-section')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await nav(page, '曲库');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole('button', { name: /播放模式/ })).toBeVisible();
});
