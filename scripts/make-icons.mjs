// Rasterises the source SVG into the PNG sizes browsers and iOS require.
// Chromium does the rendering, so the icons match the browser's own antialiasing.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve('assets/icon.svg');
const output = resolve('public/icons');
const svg = await readFile(source, 'utf8');
await mkdir(output, { recursive: true });
// 浏览器实际加载的是 public/icon.svg（见 index.html），它与 assets/ 里的源本来
// 是两份手工同步的相同文件。这里从同一个源写出去，改源文件就不会漏掉副本。
await writeFile(resolve('public/icon.svg'), svg, 'utf8');
console.log('wrote', 'icon.svg');

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180, padding: 0 },
  // Maskable icons must survive the platform's circular crop, so the artwork
  // sits inside a safe zone with margin to spare.
  { file: 'maskable-512.png', size: 512, maskable: true },
];

const browser = await chromium.launch();
for (const { file, size, maskable } of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const scale = maskable ? 0.72 : 1;
  const inner = Math.round(size * scale);
  const offset = Math.round((size - inner) / 2);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:${maskable ? '#14261f' : 'transparent'};width:${size}px;height:${size}px;overflow:hidden">
    <div style="position:absolute;left:${offset}px;top:${offset}px;width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
  </body></html>`);
  await page.waitForTimeout(80);
  await page.screenshot({ path: resolve(output, file), omitBackground: !maskable });
  await page.close();
  console.log('wrote', file, `${size}x${size}${maskable ? ' (maskable)' : ''}`);
}
await browser.close();
