import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Serve only the local production artifacts, under a Pages-like repository prefix.
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const prefix = '/music-universe/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const target = resolve(root, pathname.slice(prefix.length) || 'index.html');
  if (!pathname.startsWith(prefix) || !target.startsWith(resolve(root) + sep)) { response.writeHead(404).end(); return; }
  try {
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream' }).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const failures = [], external = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400 && !response.url().endsWith('favicon.ico')) failures.push(response.url()); });
  page.on('request', (request) => { if (/^https?:/.test(request.url()) && !request.url().startsWith(origin)) external.push(request.url()); });
  await page.goto(origin + prefix);
  await page.getByRole('button', { name: '播放原创示例', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('.waveform-canvas--compact')?.getAttribute('data-rms')) > 0.01);
  await page.getByRole('button', { name: 'DJ 台 PRO', exact: true }).click();
  await page.getByTestId('deck-a').waitFor();
  await page.getByRole('button', { name: '可视化', exact: true }).click();
  await page.locator('.visual-canvas').waitFor();
  await page.reload(); await page.getByRole('heading', { name: /好音乐/ }).waitFor();
  const result = { prefix, failures, externalRequests: external, audibleDemo: true, refresh: true };
  console.log(JSON.stringify(result));
  if (failures.length || external.length) process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
