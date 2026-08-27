'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');

// Regression guard: server.js (the local dev server used by `npm start` and
// every Playwright spec via playwright.config.js's webServer) went silently
// broken by the api/ router consolidation -- it hardcoded require('./api/login')
// etc. for files that had moved to lib/api-handlers/, so it threw
// MODULE_NOT_FOUND at boot and every E2E spec would have failed to even
// start a server. Fixed by deriving handlers from the real api/ directory
// and vercel.json's own rewrites instead of a hand-maintained list. This
// test actually boots the server and hits real HTTP routes rather than only
// checking the file exists, since that's exactly what silently broke last time.

test('server.js boots and every consolidated-router rewrite resolves to a real (non-404) response', async () => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'test-key';
  delete require.cache[require.resolve(path.join(__dirname, '..', 'server.js'))];
  const { server } = require('../server.js');

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  try {
    const port = server.address().port;
    const paths = [
      '/api/config', '/api/login', '/api/logout', '/api/me', '/api/register',
      '/api/quality-summary', '/api/quality-telemetry',
      '/api/ai3d', '/api/ai3d-voxel-generate', '/api/voxel', '/api/apng', '/api/lowfi-25d-scene',
      '/api/game'
    ];
    for (const p of paths) {
      const status = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}${p}`, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
      });
      assert.notEqual(status, 404, `${p} must not 404 locally -- check server.js's routedHandlers/directHandlers derivation and vercel.json's rewrites`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
