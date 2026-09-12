import { expect, test, type Page } from '@playwright/test';
import { serveDist } from './staticServer';

/** Waits for an activated service worker; `.ready` resolves once one controls scope. */
async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    return registration.active?.state === 'activated';
  }, null, { timeout: 60_000 });
}

test.describe('installable app shell', () => {
  let server: Awaited<ReturnType<typeof serveDist>>;

  test.beforeAll(async () => { server = await serveDist(); });
  test.afterAll(async () => { await new Promise<void>((resolve) => server.server.close(() => resolve())); });

  test('ships a manifest, icons and an activated service worker', async ({ page, request }) => {
    await page.goto(server.url);
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();

    const manifest = await request.get(new URL(manifestHref!, server.url).href);
    expect(manifest.ok()).toBe(true);
    const body = await manifest.json();
    expect(body.name).toBe('Music Universe');
    expect(body.display).toBe('standalone');
    expect(body.start_url).toBe('./');
    // A maskable icon is what stops Android from cropping the artwork badly.
    expect(body.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(true);

    for (const icon of body.icons) {
      const response = await request.get(new URL(icon.src, server.url).href);
      expect(response.ok(), `${icon.src} should resolve`).toBe(true);
      expect(Number((await response.body()).length)).toBeGreaterThan(1000);
    }

    await waitForServiceWorker(page);
    const shell = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return { scope: registration.scope, active: registration.active?.state ?? null };
    });
    expect(shell.active).toBe('activated');
    expect(shell.scope).toContain(server.origin);
  });

  test('cold-starts offline from the cache', async ({ page, context, browserName }) => {
    // Playwright's WebKit build throws "WebKit encountered an internal error" when
    // navigating under setOffline, so offline emulation cannot be exercised there.
    // The cold start is still proven on Chromium and Firefox, and WebKit still
    // covers the manifest, icon and service-worker assertions above.
    test.skip(browserName === 'webkit', 'Playwright WebKit cannot emulate offline navigation');

    await page.goto(server.url);
    await waitForServiceWorker(page);
    // The first load is not controlled; a reload puts the page under the worker.
    await page.reload();
    await expect(page.getByRole('heading', { name: /好音乐/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

    // Cut the network, then open a brand-new page: this is the offline cold start.
    await context.setOffline(true);
    const reopened = await context.newPage();
    await reopened.goto(server.url);
    await expect(reopened.getByRole('heading', { name: /好音乐/ })).toBeVisible({ timeout: 30_000 });
    await expect(reopened.getByRole('button', { name: '播放原创示例', exact: true })).toBeVisible();

    await context.setOffline(false);
    await reopened.close();
  });
});
