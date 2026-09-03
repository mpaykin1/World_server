'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  defaultConfig,
  validateConfig,
  verifySlot,
  authWall,
  normalizeHtmlSignature,
  classifyFailure
} = require(path.join(__dirname, '..', 'scripts', 'google-ai-studio-slots.cjs'));

test('slot policy is exactly navigator + sandbox', () => {
  const cfg = defaultConfig();
  assert.deepEqual(Object.keys(cfg.slots).sort(), ['navigator', 'sandbox']);
  assert.equal(cfg.maxActiveDeployments, 2);
  assert.deepEqual(validateConfig(cfg), []);
});

test('third slot is rejected at root cause', () => {
  const cfg = defaultConfig();
  cfg.slots.accidentalThirdSlot = { expectedSlot: 'accidentalThirdSlot', url: '' };
  const errors = validateConfig(cfg);
  assert.ok(errors.some(e => /exactly 2 slots/.test(e)));
});

test('non-https deployment URL is rejected', () => {
  const cfg = defaultConfig();
  cfg.slots.navigator.url = 'http://example.test';
  assert.ok(validateConfig(cfg).some(e => /must use https/.test(e)));
});

test('auth wall detector catches protected deployments', () => {
  assert.equal(authWall({ url: 'https://accounts.google.com/signin', body: '' }), true);
  assert.equal(authWall({ url: 'https://example.test/', body: '<h1>Deployment Protection</h1>' }), true);
  assert.equal(authWall({ url: 'https://example.test/', body: '<h1>Improve World</h1>' }), false);
});

test('semantic HTML signature ignores script payload churn', () => {
  const a = '<html><title>X</title><body>Hello</body><script>abc</script></html>';
  const b = '<html><title>X</title><body>Hello</body><script>different</script></html>';
  assert.equal(normalizeHtmlSignature(a), normalizeHtmlSignature(b));
});

test('real slot verifier passes correct independent runtime', async (t) => {
  const server = http.createServer((req, res) => {
    const json = value => {
      const body = JSON.stringify(value);
      res.writeHead(200, {
        'content-type': 'application/json',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'self'"
      });
      res.end(body);
    };
    if (req.url === '/healthz') return json({ ok: true });
    if (req.url === '/readyz') return json({ ok: true });
    if (req.url === '/api/deployment-meta') return json({ slot: 'navigator', independent: true, buildSha: 'test-sha' });
    if (req.url === '/api/cross-platform-probe') return json({ ok: true, slot: 'navigator' });
    res.writeHead(200, { 'content-type': 'text/html', 'x-content-type-options': 'nosniff' });
    res.end('<!doctype html><title>Improve World</title><main>Navigator</main>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;

  // verifySlot only requires URL object semantics, not https enforcement itself;
  // the isolated local server intentionally tests endpoint behavior over http.
  const result = await verifySlot('navigator', {
    url: `http://127.0.0.1:${port}`,
    expectedSlot: 'navigator'
  });
  const nonHttps = result.checks.find(c => c.id === 'https');
  assert.equal(nonHttps.ok, false);
  const otherHardFails = result.checks.filter(c => !c.ok && c.id !== 'https');
  assert.deepEqual(otherHardFails, []);
  assert.equal(result.independent, true);
});

test('navigator remote bridge can never pass independent production gate', async (t) => {
  const server = http.createServer((req, res) => {
    const payloads = {
      '/healthz': { ok: true },
      '/readyz': { ok: true },
      '/api/deployment-meta': { slot: 'navigator', independent: false, buildSha: 'test' },
      '/api/cross-platform-probe': { ok: true, slot: 'navigator' }
    };
    if (payloads[req.url]) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(payloads[req.url]));
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<title>Navigator</title>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const result = await verifySlot('navigator', { url: `http://127.0.0.1:${port}`, expectedSlot: 'navigator' });
  assert.ok(result.checks.some(c => c.id === 'independent-runtime' && !c.ok));
});


test('remote entrypoint is rejected even if slot URL itself is valid', () => {
  const cfg = defaultConfig();
  cfg.slots.navigator.entrypoint = 'https://dark-void-navigator.vercel.app/';
  assert.ok(validateConfig(cfg).some(e => /entrypoint must be local/.test(e)));
});

test('failure classifier maps performance and access root causes', () => {
  assert.equal(classifyFailure({ id: 'budget-root' }), 'PERFORMANCE_REGRESSION');
  assert.equal(classifyFailure({ id: 'public-access' }), 'ACCESS_OR_TLS');
  assert.equal(classifyFailure({ id: 'slot-identity' }), 'SLOT_CONFIGURATION');
});


test('navigator hard-rejects sandbox fault injection flag', () => {
  const entry = path.join(__dirname, '..', 'google-ai-studio', 'cloudrun-entry.cjs');
  const child = spawnSync(process.execPath, [entry], {
    env: { ...process.env, WORLD_SLOT: 'navigator', WORLD_ENABLE_SANDBOX_FAULTS: '1', PORT: '18999' },
    encoding: 'utf8',
    timeout: 5000
  });
  assert.equal(child.status, 66);
  assert.match(child.stderr, /Fault injection can never be enabled on navigator/);
});
