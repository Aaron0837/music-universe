import { expect, test, type Page } from '@playwright/test';

async function nav(page: Page, name: string) {
  if (await page.locator('.sidebar').evaluate((element) => element.classList.contains('sidebar--closed'))) await page.getByRole('button', { name: '切换侧栏' }).click();
  await page.getByRole('navigation', { name: '主要区域' }).getByRole('button', { name, exact: true }).click();
}
async function demo(page: Page) {
  await page.getByRole('button', { name: '播放原创示例', exact: true }).click();
  await expect.poll(async () => Number(await page.locator('.waveform-canvas--compact').getAttribute('data-rms'))).toBeGreaterThan(0.01);
}
function audioFile(name = 'Local Garden.wav') {
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
async function importAudio(page: Page, name?: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入本地音乐', exact: true }).first().click();
  await (await chooser).setFiles(audioFile(name));
  await expect(page.getByRole('status')).toContainText('已导入');
}
async function audioState(page: Page) {
  return page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/src/audio/engine/runtime.ts'))?.name ?? '/src/audio/engine/runtime.ts'; const { getMixer } = await import(path);
    const mixer = getMixer();
    return { a: mixer.decks.A.snapshot(), b: mixer.decks.B.snapshot(), rms: mixer.frame().rms, state: mixer.context.state };
  });
}

test('audible demo, separate decks, sync, loops, cues, reverse and game', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /好音乐/ })).toBeVisible();
  await demo(page);
  await nav(page, 'DJ 台 PRO');
  await page.getByRole('button', { name: '载入双 Deck 示例' }).click();
  await expect.poll(async () => (await audioState(page)).b.playing).toBe(true);
  await page.getByRole('button', { name: 'SYNC A → B' }).click();
  await expect(page.getByRole('status')).toContainText('速度与拍点');
  await page.getByTestId('crossfader').fill('0.7');
  await expect(page.getByTestId('crossfader')).toHaveValue('0.7');
  const deck = page.getByTestId('deck-a');
  await deck.getByRole('slider', { name: 'BPM', exact: true }).fill('150');
  await expect.poll(async () => (await audioState(page)).a.bpm).toBe(150);
  await deck.getByRole('slider', { name: 'VOLUME', exact: true }).fill('70');
  await expect.poll(async () => (await audioState(page)).a.volume).toBe(0.7);
  await deck.getByRole('button', { name: /CUE 1/ }).click();
  await expect.poll(async () => (await audioState(page)).a.cues[0]).not.toBeNull();
  await deck.getByLabel('Deck A 循环拍数').selectOption('2');
  await deck.getByRole('button', { name: 'LOOP', exact: true }).click();
  await expect.poll(async () => (await audioState(page)).a.loopEnabled).toBe(true);
  await deck.getByRole('button', { name: 'LOOP', exact: true }).click();
  await deck.getByLabel('Deck A 倒放').click();
  await expect.poll(async () => (await audioState(page)).a.reverse).toBe(true);
  await deck.getByLabel('Deck A 倒放').click();
  await page.getByRole('button', { name: '开始挑战' }).click();
  const highway = page.locator('.note-highway canvas');
  await expect.poll(async () => Number(await highway.getAttribute('data-notes'))).toBeGreaterThan(0);
  await deck.getByLabel('Deck A 播放暂停').click();
  const position = Number(await highway.getAttribute('data-position'));
  await page.waitForTimeout(350);
  expect(Math.abs(Number(await highway.getAttribute('data-position')) - position)).toBeLessThan(0.07);
  await page.getByLabel('放大音游', { exact: true }).click();
  await expect(page.getByTestId('rhythm-game')).toHaveClass(/expanded/);
  await page.keyboard.press('f');
  expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('rhythm-game')).not.toHaveClass(/expanded/);
});

test('imports valid audio, restores offline, analyzes in worker and reloads deck', async ({ page, context }) => {
  await page.goto('/'); await importAudio(page);
  await nav(page, '曲库');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(async () => (await audioState(page)).rms).toBeGreaterThan(0.01);
  await expect.poll(async () => (await audioState(page)).a.analysisPending).toBe(false);
  expect((await audioState(page)).a.grid.bpm).toBeGreaterThan(60);
  await page.reload();
  await nav(page, '曲库');
  await context.setOffline(true);
  await expect(page.getByText('Local Garden', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(async () => (await audioState(page)).rms).toBeGreaterThan(0.01);
  await context.setOffline(false);
  await importAudio(page, 'Second Garden.wav');
  await page.getByRole('button', { name: 'B', exact: true }).first().click();
  await expect.poll(async () => (await audioState(page)).b.trackId).toBeTruthy();
  await page.getByRole('button', { name: '播放或暂停' }).click();
  await expect.poll(async () => (await audioState(page)).b.playing).toBe(true);
  await expect(page.locator('.dock-track')).toContainText('Second Garden');
});

test('pointer field follows mouse, persists off, honors reduced motion and live system theme', async ({ page }) => {
  await page.goto('/');
  const field = page.locator('.ambient-field');
  await expect(field).toHaveAttribute('data-animated', 'true');
  await page.mouse.move(450, 220); await page.waitForTimeout(250);
  const first = await field.getAttribute('style');
  await page.mouse.move(980, 650); await page.waitForTimeout(250);
  expect(await field.getAttribute('style')).not.toBe(first);
  expect(await field.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
  await nav(page, '设置');
  await page.getByLabel('鼠标柔光与粒子').uncheck();
  await expect(field).toBeHidden();
  await page.reload(); await nav(page, '设置');
  await expect(page.getByLabel('鼠标柔光与粒子')).not.toBeChecked();
  await page.getByLabel('鼠标柔光与粒子').check();
  await page.getByRole('button', { name: '自动', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(field).toHaveAttribute('data-animated', 'false');
  await page.getByLabel('延迟补偿').fill('100');
  await page.reload(); await nav(page, '设置');
  await expect(page.getByLabel('延迟补偿')).toHaveValue('100');
});

test('Perfect produces real master output and input typing never hits a lane', async ({ page }) => {
  await page.goto('/'); await demo(page); await nav(page, 'DJ 台 PRO');
  await page.getByRole('button', { name: 'BPM MATCH', exact: true }).click();
  await page.getByRole('button', { name: '开始挑战' }).click();
  const result = await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/src/audio/engine/runtime.ts'))?.name ?? '/src/audio/engine/runtime.ts'; const { getMixer } = await import(path);
    const mixer = getMixer(), deck = mixer.decks.A;
    deck.setVolume(0);
    // Wait for one known whole beat from the same Web Audio clock as the game.
    const beat = 60 / deck.beatGrid.bpm, target = (Math.ceil(deck.position / beat) + 2) * beat;
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (deck.position >= target) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); resolve(); }
        else requestAnimationFrame(tick);
      }; tick();
    });
    let peak = 0;
    for (let i = 0; i < 12; i++) { await new Promise((resolve) => setTimeout(resolve, 10)); peak = Math.max(peak, mixer.frame().rms); }
    return peak;
  });
  expect(result).toBeGreaterThan(0.003);
  await expect(page.locator('.game-stats')).toContainText('001000');
  const score = await page.locator('.game-stats').textContent();
  await page.getByPlaceholder('搜索音乐、歌手或专辑').fill('asdf');
  expect(await page.locator('.game-stats').textContent()).toBe(score);
  expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
});

test('native file drop crosses decorative layer and internal track drop loads B', async ({ page }) => {
  await page.goto('/');
  const file = audioFile('Dropped Garden.wav');
  const data = await page.evaluateHandle(({ bytes, name }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], name, { type: 'audio/wav' })); return transfer;
  }, { bytes: [...file.buffer], name: file.name });
  await page.locator('.hero-panel').dispatchEvent('drop', { dataTransfer: data });
  await nav(page, '曲库');
  await expect(page.getByText('Dropped Garden', { exact: true })).toBeVisible();
  await page.locator('.track-table article').dragTo(page.locator('.deck-drop-row > div').nth(1));
  await expect.poll(async () => (await audioState(page)).b.trackId).toBeTruthy();
  await expect(page.getByRole('status')).not.toContainText('请拖入');
});

for (const width of [390, 768, 1440, 1920]) {
  test(`layout and core controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator('.dock-track')).toBeVisible();
    await expect(page.getByRole('button', { name: '播放或暂停' })).toBeVisible();
    await nav(page, 'DJ 台 PRO');
    await expect(page.getByTestId('rhythm-game')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width < 650) {
      await page.getByRole('navigation', { name: 'DJ 工作区' }).getByRole('button', { name: 'Deck A', exact: true }).click();
      await expect(page.getByTestId('deck-a')).toBeVisible();
      await expect(page.getByTestId('deck-b')).toBeHidden();
    }
  });
}

test('single AudioContext across pages and graceful decoder failure', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    (window as any).contextCount = 0;
    window.AudioContext = class extends Original { constructor(options?: AudioContextOptions) { super(options); (window as any).contextCount++; } };
  });
  await page.goto('/');
  expect(await page.evaluate(() => (window as any).contextCount)).toBe(0);
  await demo(page);
  for (let i = 0; i < 3; i++) {
    await nav(page, 'DJ 台 PRO'); await nav(page, '设置'); await nav(page, '发现');
  }
  expect(await page.evaluate(() => (window as any).contextCount)).toBe(1);
  const failed = await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/src/audio/engine/runtime.ts'))?.name ?? '/src/audio/engine/runtime.ts'; const { getMixer } = await import(path);
    try { await getMixer().decks.B.load('bad', new Blob(['invalid audio'])); } catch {}
    return getMixer().decks.B.snapshot();
  });
  expect(failed.status).toBe('error'); expect(failed.error).toContain('WAV');
});

test('v1 IndexedDB migration preserves music and playlists', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/src/data/WebLibraryRepository.ts';
    const { MusicDatabase } = await import(path);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('migration-fixture', 10);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('tracks', { keyPath: 'id' });
        db.createObjectStore('playlists', { keyPath: 'id' });
        db.createObjectStore('analyses', { keyPath: 'trackId' });
      };
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(['tracks', 'playlists', 'analyses'], 'readwrite');
        tx.objectStore('tracks').put({ id: 'kept', title: 'Keep me' });
        tx.objectStore('playlists').put({ id: 'list', trackIds: ['kept'] });
        tx.objectStore('analyses').put({ trackId: 'kept', version: 1, bpm: 110 });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    });
    const db = new MusicDatabase('migration-fixture');
    const track = await db.tracks.get('kept'), playlist = await db.playlists.get('list'), analysis = await db.analyses.get('kept');
    db.close(); await db.delete();
    return { track, playlist, analysis };
  });
  expect(result.track.title).toBe('Keep me');
  expect(result.playlist.trackIds).toEqual(['kept']);
  expect(result.analysis.version).toBe(0);
});

test('actual source clock tracks combined tempo and pitch, pause and reverse', async ({ page }) => {
  await page.goto('/'); await demo(page);
  const result = await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/src/audio/engine/runtime.ts'))!.name;
    const { getMixer } = await import(path); const mixer = getMixer(), deck = mixer.decks.A;
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    deck.setTempo(186); deck.setKey(12); await wait(70);
    const start = deck.position, at = mixer.context.currentTime; await wait(180);
    const ratio = (deck.position - start) / (mixer.context.currentTime - at);
    deck.pause(); const frozen = deck.position; await wait(100);
    const pausedDelta = deck.position - frozen;
    deck.seek(5); deck.setReverse(true); await deck.play();
    const backwards = deck.position; await wait(120);
    return { ratio, pausedDelta, reverseDelta: deck.position - backwards };
  });
  expect(result.ratio).toBeCloseTo(3, 1);
  expect(result.pausedDelta).toBe(0);
  expect(result.reverseDelta).toBeLessThan(-0.2);
});

test('FX state survives navigation and every visual preset mounts without errors', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/'); await demo(page); await nav(page, 'DJ 台 PRO');
  await page.getByLabel('Deck A delay', { exact: true }).fill('0.3');
  await page.getByLabel('Deck A reverb', { exact: true }).fill('0.2');
  await page.getByLabel('Deck A flanger', { exact: true }).fill('0.1');
  await nav(page, '设置'); await nav(page, 'DJ 台 PRO');
  await expect(page.getByLabel('Deck A delay', { exact: true })).toHaveValue('0.3');
  await nav(page, '可视化');
  for (let round = 0; round < 2; round++) for (const name of ['Peak', 'Orb', 'Waves', 'Plasma', 'Nebula', 'Gravity', 'Cyber Bloom', 'Hyper Tunnel', 'Aurora Veil']) {
    await page.locator('.visual-selector').getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.locator('.visual-stage canvas')).toHaveCount(1);
    await page.waitForTimeout(80);
  }
  expect(errors).toEqual([]);
});

test('touch layout uses static light and simultaneous Harmony hits do not scroll', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/'); await expect(page.locator('.ambient-field')).toHaveAttribute('data-animated', 'false');
  await demo(page); await nav(page, 'DJ 台 PRO');
  await page.getByRole('button', { name: 'HARMONY', exact: true }).click();
  await page.getByRole('button', { name: '开始挑战' }).click();
  const result = await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/src/audio/engine/runtime.ts'))!.name;
    const { getMixer } = await import(path); const deck = getMixer().decks.A, beat = 60 / deck.beatGrid.bpm;
    const group = Math.ceil(deck.position / (beat * 2)) + 2, target = group * beat * 2;
    const lane = group % 2;
    const scroll = document.querySelector('.page-scroll')!;
    const top = scroll.scrollTop;
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (deck.position < target) return void requestAnimationFrame(tick);
        for (const index of [lane, lane + 2]) document.querySelectorAll('.game-lanes button')[index].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: index + 1 }));
        resolve();
      }; tick();
    });
    return { before: top, after: scroll.scrollTop };
  });
  await expect(page.locator('.game-stats')).toContainText('002000');
  expect(result.after).toBe(result.before);
  expect(await page.locator('.game-lanes button').first().evaluate((element) => getComputedStyle(element).touchAction)).toBe('none');
  await context.close();
});

test('body text and primary action tokens maintain readable contrast', async ({ page }) => {
  await page.goto('/');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, theme);
    const contrasts = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const luminance = (token: string) => {
        const hex = style.getPropertyValue(token).trim().slice(1);
        const c = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
      };
      const bg = luminance('--bg');
      return ['--text', '--muted', '--accent'].map((token) => { const v = luminance(token); return (Math.max(v, bg) + 0.05) / (Math.min(v, bg) + 0.05); });
    });
    for (const ratio of contrasts) expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
  await nav(page, '曲库');
  const colors = await page.locator('.page-heading .primary-action').evaluate((button) => ({
    label: getComputedStyle(button.querySelector('span')!).color,
    background: getComputedStyle(button).backgroundColor,
  }));
  expect(colors.label).not.toBe(colors.background);
});

test('page switching cleans up animation loops and global effect listeners', async ({ page }) => {
  await page.addInitScript(() => {
    const frames = new Set<number>();
    const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      const id = request((time) => { frames.delete(id); callback(time); });
      frames.add(id); return id;
    };
    window.cancelAnimationFrame = (id) => { frames.delete(id); cancel(id); };
    const listeners = new Map<string, Set<unknown>>();
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    const key = (target: EventTarget, type: string) => (target === window || target === document) && ['pointermove', 'visibilitychange', 'keydown'].includes(type) ? (target === window ? 'window:' : 'document:') + type : '';
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      const id = key(this, type);
      if (id) { if (!listeners.has(id)) listeners.set(id, new Set()); listeners.get(id)!.add(listener); }
      add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      const id = key(this, type); if (id) listeners.get(id)?.delete(listener);
      remove.call(this, type, listener, options);
    };
    (window as any).effectMetrics = () => ({ frames: frames.size, listeners: [...listeners.values()].reduce((sum, entries) => sum + entries.size, 0) });
  });
  await page.goto('/'); await page.waitForTimeout(800);
  const baseline = await page.evaluate(() => (window as any).effectMetrics());
  for (let i = 0; i < 4; i++) {
    await nav(page, 'DJ 台 PRO'); await page.getByTestId('rhythm-game').waitFor();
    await nav(page, '可视化'); await page.locator('.visual-canvas').waitFor();
    await nav(page, '设置'); await page.getByRole('heading', { name: '设置', exact: true }).waitFor();
    await nav(page, '发现');
  }
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => (window as any).effectMetrics());
  expect(after.listeners).toBe(baseline.listeners);
  expect(after.frames).toBeLessThanOrEqual(baseline.frames + 1);
});
