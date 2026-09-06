'use strict';
// Real gap found live 2026-09-03: AI Studio's WORLD_NAVIGATOR_ENTRYPOINT/
// WORLD_SANDBOX_ENTRYPOINT env vars (from the separate Cloud Run wrapper
// patch) do nothing against this plain server.js, since it never read them -
// "/" always hard-redirected to "/apps/catalog/" regardless of any env var.
// This adds ONE shared WORLD_ENTRYPOINT (not two parallel slot-specific
// systems) with a safe whitelist and a fallback to the exact previous
// behavior when unset/invalid, so it can't break any existing deployment
// that doesn't set it.
//
// PORT must be set before require() - server.js reads process.env.PORT once
// at module load and calls server.listen() unconditionally as a side effect
// of require(), so this test needs an isolated port picked before that
// happens (same pattern already used elsewhere in this project for
// module-level env capture).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const TEST_PORT = 0; // OS-assigned ephemeral port prevents parallel-AI collisions
process.env.PORT = String(TEST_PORT);
delete process.env.WORLD_ENTRYPOINT;

const { server, resolveEntrypoint, DEFAULT_ENTRYPOINT, ENTRYPOINT_WHITELIST } = require('../server.js');

test.after(() => { server.close(); });

function getRedirect() {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: server.address().port, path: '/' }, (res) => {
      res.resume();
      resolve({ statusCode: res.statusCode, location: res.headers.location });
    });
    req.on('error', reject);
  });
}

test('resolveEntrypoint(): DEFAULT_ENTRYPOINT is the existing /apps/catalog/ behavior', () => {
  assert.equal(DEFAULT_ENTRYPOINT, '/apps/catalog/');
});

test('resolveEntrypoint(): whitelist contains both the default and the real Navigator app', () => {
  assert.ok(ENTRYPOINT_WHITELIST.has('/apps/catalog/'));
  assert.ok(ENTRYPOINT_WHITELIST.has('/apps/dark-void-scene/'));
});

test('resolveEntrypoint(): no WORLD_ENTRYPOINT set -> falls back to /apps/catalog/ (unchanged existing behavior)', () => {
  delete process.env.WORLD_ENTRYPOINT;
  assert.equal(resolveEntrypoint(), '/apps/catalog/');
});

test('resolveEntrypoint(): WORLD_ENTRYPOINT=/apps/dark-void-scene/ redirects to the real Navigator', () => {
  process.env.WORLD_ENTRYPOINT = '/apps/dark-void-scene/';
  assert.equal(resolveEntrypoint(), '/apps/dark-void-scene/');
  delete process.env.WORLD_ENTRYPOINT;
});

test('resolveEntrypoint(): an unrecognized value safely falls back to /apps/catalog/, not an arbitrary redirect', () => {
  process.env.WORLD_ENTRYPOINT = '/apps/some-unregistered-app/';
  assert.equal(resolveEntrypoint(), '/apps/catalog/');
  delete process.env.WORLD_ENTRYPOINT;
});

test('resolveEntrypoint(): an external URL is never accepted as an entrypoint (whitelist rejects it, no open-redirect)', () => {
  process.env.WORLD_ENTRYPOINT = 'https://evil.example/';
  assert.equal(resolveEntrypoint(), '/apps/catalog/');
  delete process.env.WORLD_ENTRYPOINT;
});

test('GET / with no WORLD_ENTRYPOINT set redirects to /apps/catalog/ (real HTTP request, unchanged behavior)', async () => {
  delete process.env.WORLD_ENTRYPOINT;
  const { statusCode, location } = await getRedirect();
  assert.equal(statusCode, 302);
  assert.equal(location, '/apps/catalog/');
});

test('GET / with WORLD_ENTRYPOINT=/apps/dark-void-scene/ redirects to the real Navigator (real HTTP request)', async () => {
  process.env.WORLD_ENTRYPOINT = '/apps/dark-void-scene/';
  try {
    const { statusCode, location } = await getRedirect();
    assert.equal(statusCode, 302);
    assert.equal(location, '/apps/dark-void-scene/');
  } finally {
    delete process.env.WORLD_ENTRYPOINT;
  }
});

test('GET / with an invalid WORLD_ENTRYPOINT still redirects safely to /apps/catalog/ (real HTTP request)', async () => {
  process.env.WORLD_ENTRYPOINT = '/apps/not-a-real-app/';
  try {
    const { statusCode, location } = await getRedirect();
    assert.equal(statusCode, 302);
    assert.equal(location, '/apps/catalog/');
  } finally {
    delete process.env.WORLD_ENTRYPOINT;
  }
});
