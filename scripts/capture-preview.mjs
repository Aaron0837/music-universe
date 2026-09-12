import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Generated fixtures and review media remain in the ignored test-results folder.
const output = 'test-results/review';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: output, size: { width: 1440, height: 1000 } } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const nav = async (name) => {
  if (await page.locator('.sidebar').evaluate((element) => element.classList.contains('sidebar--closed'))) await page.getByLabel('切换侧栏').click();
  await page.getByRole('navigation', { name: '主要区域' }).getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(450);
};
const shot = async (name) => { await page.waitForTimeout(250); await page.screenshot({ path: output + '/' + name + '.png' }); };
await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:4173');
await page.waitForTimeout(500);
await shot('home-1440');
for (const [x, y] of [[400, 250], [900, 260], [1280, 490], [650, 680], [350, 440], [1150, 290]]) {
  await page.mouse.move(x, y, { steps: 45 }); await page.waitForTimeout(650);
}
await page.locator('.page-scroll').evaluate((element) => { element.scrollTop = 480; });
await shot('home-collection');
await page.locator('.page-scroll').evaluate((element) => { element.scrollTop = 0; });
const video = page.video();
await context.close();
await video.saveAs(output + '/pointer-follow.webm');

const review = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await review.newPage();
p.on('pageerror', (error) => errors.push(error.message));
await p.goto('http://127.0.0.1:4173');
// Small, valid, original WAV fixtures: not downloaded music or user library data.
function fixture(name, frequency) {
  const rate = 8000, count = rate * 12, buffer = Buffer.alloc(44 + count * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) buffer.writeInt16LE(Math.round(Math.sin(i / rate * Math.PI * 2 * frequency) * 7000), 44 + i * 2);
  return { name: name + '.wav', mimeType: 'audio/wav', buffer };
}
const choose = p.waitForEvent('filechooser');
await p.getByRole('button', { name: '导入本地音乐', exact: true }).first().click();
await (await choose).setFiles([fixture('Morning Light · 晨光', 220), fixture('Open Air · 微风', 330), fixture('Blue Hour · 蓝调时刻', 440)]);
await p.getByRole('status').filter({ hasText: '已导入' }).waitFor();
await p.waitForTimeout(3400);
await p.setViewportSize({ width: 1440, height: 1200 });
for (const [name, file] of [['曲库', 'library-1440'], ['设置', 'settings-1440'], ['播放列表', 'playlists-1440'], ['发现', 'home-library-1440']]) {
  await p.getByRole('navigation', { name: '主要区域' }).getByRole('button', { name, exact: true }).click();
  await p.waitForTimeout(550); await p.screenshot({ path: output + '/' + file + '.png' });
}
await p.getByRole('navigation', { name: '主要区域' }).getByRole('button', { name: 'DJ 台 PRO', exact: true }).click();
await p.getByRole('button', { name: '载入双 Deck 示例' }).click();
await p.getByRole('button', { name: '开始挑战' }).click();
for (const width of [1920, 1440]) {
  await p.setViewportSize({ width, height: 1400 });
  await p.locator('.page-scroll').evaluate((element) => { element.scrollTop = 0; });
  await p.waitForTimeout(650);
  await p.screenshot({ path: output + '/dj-' + width + '.png' });
}
await p.getByLabel('放大音游', { exact: true }).click();
await p.waitForTimeout(300);
await p.evaluate(async () => {
  const path = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/src/audio/engine/runtime.ts')).name;
  const { getMixer } = await import(path);
  const deck = getMixer().decks.A, beat = 60 / deck.beatGrid.bpm;
  const target = (Math.ceil(deck.position / beat) + 2) * beat;
  const lane = [0, 2, 1, 2, 0, 3, 1, 2][Math.round(target / (beat / 2)) % 8];
  await new Promise((resolve) => {
    const tick = () => {
      if (deck.position < target) return void requestAnimationFrame(tick);
      document.querySelectorAll('.game-lanes button')[lane].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      resolve();
    }; tick();
  });
});
await p.screenshot({ path: output + '/game-expanded.png' });
await p.getByLabel('退出放大音游').click();
await p.getByRole('navigation', { name: '主要区域' }).getByRole('button', { name: '发现', exact: true }).click();
await p.setViewportSize({ width: 1920, height: 1080 }); await p.waitForTimeout(550);
await p.screenshot({ path: output + '/home-1920.png' });
await review.close();
for (const width of [390, 768]) {
  const mobile = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: true, hasTouch: true });
  const m = await mobile.newPage(); await m.goto('http://127.0.0.1:4173'); await m.waitForTimeout(550);
  await m.screenshot({ path: output + '/home-' + width + '.png' });
  await m.getByLabel('切换侧栏').click(); await m.getByRole('button', { name: 'DJ 台 PRO', exact: true }).click();
  await m.waitForTimeout(550); await m.screenshot({ path: output + '/dj-' + width + '.png' });
  if (width === 390) {
    await m.getByRole('navigation', { name: 'DJ 工作区' }).getByRole('button', { name: 'Deck A', exact: true }).click();
    await m.screenshot({ path: output + '/deck-390.png' });
  }
  await mobile.close();
}
await browser.close();
console.log(JSON.stringify({ output, errors }));
if (errors.length) process.exitCode = 1;
