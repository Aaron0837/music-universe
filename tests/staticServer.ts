import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const DIST = join(process.cwd(), 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Serves the built `dist/` folder so the offline test exercises the real
 * production bundle, including its service worker, rather than the dev server.
 */
export async function serveDist(): Promise<{ server: Server; url: string; origin: string }> {
  const server = createServer(async (request, response) => {
    const urlPath = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const safePath = normalize(urlPath).replace(/^([/\\]|\.\.[/\\])+/, '');
    let filePath = safePath ? join(DIST, safePath) : join(DIST, 'index.html');
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, 'index.html');
      const body = await readFile(filePath);
      response.writeHead(200, {
        'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      response.end(body);
    } catch {
      try {
        response.writeHead(200, { 'Content-Type': MIME['.html'] });
        response.end(await readFile(join(DIST, 'index.html')));
      } catch {
        response.writeHead(404);
        response.end('not found');
      }
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { server, url: `http://127.0.0.1:${port}/`, origin: `http://127.0.0.1:${port}` };
}
