import { expect, test } from '@playwright/test';

// The harness renders pure tones through the real SoundTouch worklet offline and
// measures the fundamental, so a broken key lock fails instead of passing quietly.
test('key lock preserves pitch across tempo while transposing on demand', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tests/keylock-harness.html');
  await page.waitForFunction(
    () => Boolean((window as any).__keyLockResult || (window as any).__keyLockError),
    null,
    { timeout: 240_000 },
  );
  const failure = await page.evaluate(() => (window as any).__keyLockError);
  expect(failure, `key lock probe failed: ${failure}`).toBeFalsy();
  const result = await page.evaluate(() => (window as any).__keyLockResult);
  const at = (key: string) => result[key].frequency as number;

  // Control: a bare source at 1.5x must raise the tone, proving the probe measures pitch.
  expect(at('plain@1.0')).toBeCloseTo(440, -1);
  expect(at('plain@1.5')).toBeCloseTo(660, -1);

  // Tempo changes no longer move the fundamental.
  expect(at('locked@1.0')).toBeCloseTo(440, -1);
  expect(at('locked@1.5')).toBeCloseTo(440, -1);
  expect(at('locked@0.75')).toBeCloseTo(440, -1);

  // Harmony transposes, and stacks with tempo.
  expect(at('locked@1.0+12st')).toBeCloseTo(880, -1);
  expect(at('locked@1.5+2st')).toBeCloseTo(493.9, -1);

  // The rate still changes real duration, so this is a stretch, not a no-op.
  expect(result['locked@1.5'].duration).toBeCloseTo(1 / 1.5, 1);
  expect(result['locked@0.75'].duration).toBeCloseTo(1 / 0.75, 1);

  expect(errors).toEqual([]);
});

// Deck-level wiring: with key lock on, tempo alone decides the transport rate.
test('key lock keeps the transport at tempo and exposes the browser control', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '播放原创示例', exact: true }).click();
  const result = await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/src/audio/engine/runtime.ts'))!.name;
    const { getMixer } = await import(path);
    const mixer = getMixer();
    const deck = mixer.decks.A;
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    // The demo loads asynchronously and install() resets bpm to the analysed value,
    // so a tempo set before it lands is silently overwritten.
    const waitFor = async (predicate: () => boolean, label: string) => {
      for (let i = 0; i < 200; i++) { if (predicate()) return; await wait(20); }
      throw new Error(`timed out waiting for ${label}`);
    };
    await waitFor(() => deck.snapshot().duration > 0, 'the demo buffer to load');
    deck.setTempo(186);
    await waitFor(() => Math.abs(deck.playbackRate - 1.5) < 0.01, 'tempo to reach 1.5x');
    const unlocked = deck.snapshot().keyLock;
    void deck.setKeyLock(true);
    await waitFor(() => deck.snapshot().keyLock && deck.isPlaying && Math.abs(deck.playbackRate - 1.5) < 0.01, 'key lock to engage');
    // Let the restart settle before sampling the rate.
    await wait(120);
    const start = deck.position, at = mixer.context.currentTime;
    await wait(250);
    const ratio = (deck.position - start) / (mixer.context.currentTime - at);
    const locked = deck.snapshot().keyLock;
    deck.setKey(12);
    await waitFor(() => deck.snapshot().keyShift === 12, 'Harmony to apply');
    const transposed = deck.currentBpm;
    // Harmony must not feed back into rate while locked.
    const start2 = deck.position, at2 = mixer.context.currentTime;
    await wait(250);
    const harmonyFreeRatio = (deck.position - start2) / (mixer.context.currentTime - at2);
    void deck.setKeyLock(false);
    await waitFor(() => !deck.snapshot().keyLock, 'key lock to disengage');
    return { unlocked, locked, ratio, transposed, harmonyFreeRatio, afterUnlock: deck.snapshot().keyLock };
  });
  expect(result.unlocked).toBe(false);
  expect(result.locked).toBe(true);
  // Demo source is 124 BPM; 186/124 is pure tempo with no Harmony contribution.
  expect(result.ratio).toBeCloseTo(1.5, 1);
  // Harmony is a key change only: it must not add rate while locked.
  expect(result.harmonyFreeRatio).toBeCloseTo(1.5, 1);
  expect(result.transposed).toBeCloseTo(186, 0);
  expect(result.afterUnlock).toBe(false);

  await page.getByRole('button', { name: 'DJ 台 PRO', exact: true }).click();
  const toggle = page.getByLabel('Deck A 保调变速');
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});
