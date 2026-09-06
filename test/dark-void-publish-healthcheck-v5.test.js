'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { execFile } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const checker = path.join(repo, 'scripts', 'dark-void-publish-healthcheck.cjs');

function run(url) {
  return new Promise((resolve) => {
    execFile(process.execPath, [checker, repo, url], { cwd: repo }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });
}

function serverFor({ h4 = false, missingAsset = false } = {}) {
  const js = 'export const ok = true;';
  return http.createServer((req, res) => {
    if (req.url === '/apps/dark-void-scene/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html lang="en"><body><h1>Dark Void Navigator</h1>${h4 ? '<h2>H4</h2>' : '<h2>H1</h2><h2>H2</h2><h2>H3</h2>'}</body></html>`);
    }
    if (missingAsset && req.url === '/shared/world-shape-library.mjs') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('missing');
    }
    if (
      req.url === '/apps/dark-void-scene/client.js' ||
      req.url === '/shared/navigator-dialog.mjs' ||
      req.url === '/shared/world-manifestation-engine.mjs' ||
      req.url === '/shared/world-command-parser.mjs' ||
      req.url === '/shared/world-shape-library.mjs' ||
      req.url === '/shared/dark-void-science-evidence.mjs'
    ) {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      return res.end(js);
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
}

async function withServer(options, fn) {
  const server = serverFor(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    await fn(`http://127.0.0.1:${port}/apps/dark-void-scene/`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('publish healthcheck verifies the live V5 page and all critical modules', async () => {
  await withServer({}, async (url) => {
    const result = await run(url);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS live-no-H4/);
    assert.match(result.stdout, /PASS live-asset \/shared\/world-shape-library\.mjs/);
    assert.match(result.stdout, /FINAL_URL/);
  });
});

test('publish healthcheck fails closed when a critical live module is unavailable', async () => {
  await withServer({ missingAsset: true }, async (url) => {
    const result = await run(url);
    assert.notEqual(result.code, 0);
    assert.match(result.stdout, /FAIL live-asset \/shared\/world-shape-library\.mjs 404/);
  });
});

test('publish healthcheck fails closed on public H4 exposure', async () => {
  await withServer({ h4: true }, async (url) => {
    const result = await run(url);
    assert.notEqual(result.code, 0);
    assert.match(result.stdout, /FAIL live-no-H4/);
  });
});
