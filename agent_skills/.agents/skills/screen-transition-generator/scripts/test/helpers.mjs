// 統合テスト用: お試しアプリ（examples）の静的ファイルを Node の http サーバで配信する
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXAMPLE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../examples/screen-transition-generator');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

export function serveStatic(root, overrides = {}) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (overrides[path]) {
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'text/plain' });
      res.end(overrides[path]);
      return;
    }
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>Not Found</h1>');
    }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

/** app と external を起動し、app の config.js を external の URL に差し替える */
export async function startExample() {
  const external = await serveStatic(join(EXAMPLE_DIR, 'external'));
  const app = await serveStatic(join(EXAMPLE_DIR, 'app'), { '/config.js': `window.APP_CONFIG = { externalUrl: '${external.url}' };` });
  return { app, external, close: () => Promise.all([app.server.close(), external.server.close()]) };
}

export async function exampleConfig(baseUrl, overrides = {}) {
  const raw = JSON.parse(await readFile(join(EXAMPLE_DIR, 'config.json'), 'utf8'));
  return { ...raw, baseUrl, ...overrides };
}
