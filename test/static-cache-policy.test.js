'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

async function waitFor(url) {
  for (let i = 0; i < 40; i += 1) {
    try { const r = await fetch(url); if (r.ok) return r; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not become ready: ${url}`);
}

test('Cloud Run static assets are cacheable while HTML revalidates', async (t) => {
  const port = 39000 + Math.floor(Math.random() * 1000);
  const root = path.resolve(__dirname, '..');
  const child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const js = await waitFor(`${base}/shared/sentry-runtime.js`);
  assert.equal(js.headers.get('cache-control'), 'public, max-age=300, stale-while-revalidate=86400');
  assert.ok(js.headers.get('last-modified'));
  const html = await fetch(`${base}/apps/dark-void-scene/`);
  assert.equal(html.status, 200);
  assert.equal(html.headers.get('cache-control'), 'no-cache');
});
