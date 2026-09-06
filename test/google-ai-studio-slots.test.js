'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
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

// --- build-guard: Cloud Run image build-context safety (Dockerfile, .dockerignore, Node version) ---

const SLOTS_CLI = path.join(__dirname, '..', 'scripts', 'google-ai-studio-slots.cjs');

function mkFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'google-slots-build-guard-'));
  fs.mkdirSync(path.join(root, 'google-ai-studio'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fs.writeFileSync(path.join(root, 'server.js'), '// fixture\n');
  fs.writeFileSync(path.join(root, 'shared', 'common.js'), '// fixture\n');
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
  fs.writeFileSync(path.join(root, 'google-ai-studio', 'cloudrun-entry.cjs'), '// fixture\n');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', engines: { node: '24.x' } }, null, 2));
  fs.writeFileSync(
    path.join(root, 'google-ai-studio', 'Dockerfile'),
    'FROM node:24-alpine\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --omit=dev\nCOPY . .\nCMD ["node", "google-ai-studio/cloudrun-entry.cjs"]\n'
  );
  fs.writeFileSync(path.join(root, '.dockerignore'), '.git/\nnode_modules/\n.env*\n!.env.example\n');
  return root;
}

function runBuildGuard(root) {
  const result = spawnSync(process.execPath, [SLOTS_CLI, 'build-guard'], {
    cwd: root,
    env: { ...process.env, WORLD_REPO_ROOT: root },
    encoding: 'utf8',
    timeout: 5000
  });
  return { ...result, json: JSON.parse(result.stdout) };
}

test('build-guard passes on a well-formed Dockerfile/.dockerignore/package.json triple', () => {
  const root = mkFixtureRoot();
  const { status, json } = runBuildGuard(root);
  assert.deepEqual(json.findings, []);
  assert.equal(json.ok, true);
  assert.equal(status, 0);
});

test('build-guard fails when the Dockerfile has no npm ci before COPY . .', () => {
  const root = mkFixtureRoot();
  fs.writeFileSync(
    path.join(root, 'google-ai-studio', 'Dockerfile'),
    'FROM node:24-alpine\nWORKDIR /app\nCOPY . .\nCMD ["node", "google-ai-studio/cloudrun-entry.cjs"]\n'
  );
  const { status, json } = runBuildGuard(root);
  assert.equal(status, 1);
  assert.ok(json.findings.some((f) => f.id === 'dockerfile-missing-npm-ci'));
});

test('build-guard fails when the Dockerfile Node major diverges from package.json engines.node', () => {
  const root = mkFixtureRoot();
  fs.writeFileSync(
    path.join(root, 'google-ai-studio', 'Dockerfile'),
    'FROM node:22-alpine\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --omit=dev\nCOPY . .\nCMD ["node", "google-ai-studio/cloudrun-entry.cjs"]\n'
  );
  const { status, json } = runBuildGuard(root);
  assert.equal(status, 1);
  const finding = json.findings.find((f) => f.id === 'node-version-mismatch');
  assert.ok(finding, 'expected a node-version-mismatch finding');
  assert.match(finding.detail, /node:22-alpine/);
  assert.match(finding.detail, /24\.x/);
});

test('build-guard fails when .dockerignore is missing entirely', () => {
  const root = mkFixtureRoot();
  fs.unlinkSync(path.join(root, '.dockerignore'));
  const { status, json } = runBuildGuard(root);
  assert.equal(status, 1);
  assert.ok(json.findings.some((f) => f.id === 'dockerignore-missing'));
});

test('build-guard fails when .dockerignore shadows a runtime-required file', () => {
  const root = mkFixtureRoot();
  fs.appendFileSync(path.join(root, '.dockerignore'), 'server.js\n');
  const { status, json } = runBuildGuard(root);
  assert.equal(status, 1);
  const finding = json.findings.find((f) => f.id === 'dockerignore-shadows-runtime-path');
  assert.ok(finding);
  assert.match(finding.detail, /server\.js/);
});

test('build-guard fails when the Dockerfile itself is missing', () => {
  const root = mkFixtureRoot();
  fs.unlinkSync(path.join(root, 'google-ai-studio', 'Dockerfile'));
  const { status, json } = runBuildGuard(root);
  assert.equal(status, 1);
  assert.ok(json.findings.some((f) => f.id === 'dockerfile-missing'));
});
