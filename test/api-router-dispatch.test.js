'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Regression guard for the api/quality.js, api/auth.js, api/generative.js
// routers introduced to stay under the Vercel Hobby serverless function
// limit (see test/vercel-function-limit.test.js). Every route below must
// keep resolving to a real handler, and vercel.json must keep a matching
// rewrite for each one so the original public URLs never change.
const fs = require('node:fs');
const path = require('node:path');

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (b) => { res.body = b; };
  // Vercel's runtime augments res with these helpers; some handlers use them
  // instead of the plain Node http.ServerResponse API.
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (value) => { res.body = JSON.stringify(value); return res; };
  return res;
}

const ROUTERS = {
  features: { file: '../api/features.js', routes: ['community-message', 'community-report', 'feature-vote', 'feedback', 'feedback-roadmap', 'function-admin', 'function-catalog', 'function-install-request', 'function-invoke', 'game-design-spec', 'live-translate-token', 'livekit-token', 'locales', 'rtc-config', 'translate', 'translation-correction'] },
  quality: {
    file: '../api/quality.js',
    routes: [
      'quality-summary', 'quality-profile', 'quality-project-state', 'quality-rollout-config',
      'quality-telemetry', 'quality-telemetry-export', 'quality-trace', 'quality-pattern-evidence',
      'quality-performance-evidence', 'quality-autopilot-nightly', 'quality-autopilot-summary',
      'quality-autopilot-worker', 'procedural-quality-baseline', 'procedural-quality-canary',
      'procedural-quality-certification', 'procedural-quality-device-report', 'procedural-quality-learn',
      'procedural-quality-orchestrate', 'procedural-quality-profile', 'procedural-quality-repair-report',
      'procedural-quality-runtime-health', 'procedural-quality-system-status',
      'quality-probe-ap', 'quality-probe-eu', 'quality-probe-us'
    ]
  },
  auth: { file: '../api/auth.js', routes: ['login', 'logout', 'me', 'register'] },
  generative: { file: '../api/generative.js', routes: ['ai3d', 'ai3d-voxel-generate', 'apng', 'lowfi-25d-scene', 'voxel'] }
};

for (const [name, spec] of Object.entries(ROUTERS)) {
  test(`api/${name}.js resolves every expected route to a real vercel.json rewrite`, () => {
    const vercelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
    const destinations = vercelConfig.rewrites.map(r => r.destination);
    for (const route of spec.routes) {
      const expected = `/api/${name}?__route=${route}`;
      assert.ok(destinations.includes(expected), `vercel.json is missing a rewrite to ${expected}`);
    }
  });
}

test('api/generative.js dispatches a known route and 404s an unknown one', async () => {
  const handler = require('../api/generative.js');
  const known = { method: 'GET', url: '/api/generative?__route=lowfi-25d-scene', query: { __route: 'lowfi-25d-scene' } };
  const res1 = mockRes();
  await handler(known, res1);
  assert.equal(res1.statusCode, 200);

  const unknown = { method: 'GET', url: '/api/generative?__route=does-not-exist', query: { __route: 'does-not-exist' } };
  const res2 = mockRes();
  await handler(unknown, res2);
  assert.equal(res2.statusCode, 404);
});

test('features preserves method rejection through public, Vercel and plain Node routes', async () => {
  const handler = require('../api/features');
  for (const route of ROUTERS.features.routes) {
    for (const req of [
      { url: `/api/${route}` },
      { url: '/api/features', query: { __route: route } },
      { url: `/api/features?__route=${route}` }
    ]) {
      const res = mockRes();
      await handler({ ...req, method: 'TRACE', headers: {} }, res);
      assert.equal(res.statusCode, 405, `${route} via ${req.url}`);
    }
  }
  for (const route of ['unknown', '__proto__', 'constructor']) {
    const res = mockRes();
    await handler({ method: 'GET', url: `/api/features?__route=${route}` }, res);
    assert.equal(res.statusCode, 404);
  }
  const res = mockRes();
  await handler({ method: 'GET', url: '/api/locales?__route=function-admin' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).ok, true);
});

test('api/quality.js and api/auth.js 404 on an unknown route', async () => {
  for (const file of ['../api/quality.js', '../api/auth.js']) {
    const handler = require(file);
    const req = { method: 'GET', url: '/x?__route=does-not-exist', query: { __route: 'does-not-exist' } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 404);
  }
});
