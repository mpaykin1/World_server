'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
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

function serverFor({ h4 = false, missingAsset = false, staleAsset = false } = {}) {
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
      const local = fs.readFileSync(path.join(repo, req.url.replace(/^\//, '')), 'utf8');
      const body = staleAsset && req.url === '/shared/world-shape-library.mjs' ? `${local}
// stale-live-copy` : local;
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      return res.end(body);
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
    assert.match(result.stdout, /CANDIDATE_RELEASE_FINGERPRINT [a-f0-9]{64}/);
    assert.match(result.stdout, /LIVE_RELEASE_FINGERPRINT [a-f0-9]{64}/);
    assert.match(result.stdout, /PASS release-fingerprint-match/);
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


test('publish healthcheck fails closed on stale critical module revision', async () => {
  await withServer({ staleAsset: true }, async (url) => {
    const result = await run(url);
    assert.notEqual(result.code, 0);
    assert.match(result.stdout, /FAIL live-revision \/shared\/world-shape-library\.mjs/);
    assert.match(result.stdout, /FAIL release-fingerprint-match/);
    const candidate = result.stdout.match(/CANDIDATE_RELEASE_FINGERPRINT ([a-f0-9]{64})/);
    const live = result.stdout.match(/LIVE_RELEASE_FINGERPRINT ([a-f0-9]{64})/);
    assert.ok(candidate && live);
    assert.notEqual(candidate[1], live[1]);
  });
});

test('fixed Dark Void live-publish false-green stays protected in error prevention registry', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(repo, 'data', 'error-prevention-registry.json'), 'utf8'));
  const entry = registry.knownErrors.find((item) => item.id === 'dark-void-live-publish-false-green');
  assert.ok(entry);
  assert.equal(entry.status, 'protected');
  assert.ok(Array.isArray(entry.protection) && entry.protection.length >= 3);
});
