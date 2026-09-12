import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';

// Isolates the WebGL canvas: element screenshots capture the composited surface,
// which is the only reliable way to prove rendering when preserveDrawingBuffer is off.
const output = 'test-results/canvas-proof';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:4173');
await page.getByRole('button', { name: '播放原创示例', exact: true }).click();
await page.waitForTimeout(900);
if (await page.locator('.sidebar').evaluate((element) => element.classList.contains('sidebar--closed'))) await page.getByLabel('切换侧栏').click();
await page.getByRole('navigation', { name: '主要区域' }).getByRole('button', { name: '可视化', exact: true }).click();
await page.waitForTimeout(700);

const analysis = await browser.newPage();
await analysis.goto('about:blank');
const measure = async (path) => {
  const base64 = (await readFile(path)).toString('base64');
  return analysis.evaluate(async (data) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + data;
    await image.decode();
    const width = 360, height = Math.max(1, Math.round(image.height * 360 / image.width));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);
    const { data: px } = ctx.getImageData(0, 0, width, height);
    let sum = 0, sumSq = 0, min = 255, max = 0, bright = 0;
    const count = width * height;
    for (let i = 0; i < count; i++) {
      const p = i * 4;
      const lum = 0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2];
      sum += lum; sumSq += lum * lum;
      min = Math.min(min, lum); max = Math.max(max, lum);
      if (lum > 40) bright++;
    }
    const mean = sum / count;
    return {
      mean: +mean.toFixed(2),
      std: +Math.sqrt(Math.max(0, sumSq / count - mean * mean)).toFixed(2),
      min: +min.toFixed(1), max: +max.toFixed(1),
      brightRatio: +(bright / count).toFixed(4),
    };
  }, base64);
};

const presets = ['Nebula', 'Gravity', 'Cyber Bloom', 'Hyper Tunnel', 'Aurora Veil'];
const rows = [];
for (const name of presets) {
  await page.locator('.visual-selector').getByRole('button', { name: new RegExp(name) }).click();
  await page.waitForTimeout(1400);
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '-');
  const file = `${output}/${slug}.png`;
  await page.locator('.visual-stage canvas').screenshot({ path: file });
  const stats = await measure(file);
  rows.push({ name, ...stats });
  console.log(`${name.padEnd(14)} mean=${String(stats.mean).padStart(6)} std=${String(stats.std).padStart(6)} min=${String(stats.min).padStart(5)} max=${String(stats.max).padStart(5)} bright=${stats.brightRatio}`);
}
await browser.close();

// A rendering canvas must show dark space plus bright emitter pixels: high spread.
const blank = rows.filter((row) => row.std < 3 || row.max < 30);
console.log(`\npage errors: ${errors.length ? errors.join(' | ') : 'none'}`);
console.log(blank.length ? `BLANK: ${blank.map((row) => row.name).join(', ')}` : 'All WebGL presets render lit content on the canvas.');
if (errors.length || blank.length) process.exitCode = 1;
