'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { diagnose, scanCdnImports } = require('../scripts/browser-cdn-preflight.cjs');

test('distinguishes browser policy, certificate and DNS blockers', () => {
  assert.equal(diagnose('net::ERR_BLOCKED_BY_ADMINISTRATOR'), 'BROWSER_POLICY_BLOCK');
  assert.equal(diagnose('net::ERR_CERT_AUTHORITY_INVALID'), 'BROWSER_TLS_TRUST_FAILURE');
  assert.equal(diagnose('net::ERR_NAME_NOT_RESOLVED'), 'DNS_FAILURE');
  assert.equal(diagnose('net::ERR_CONNECTION_RESET'), 'CONNECTION_FAILURE');
  assert.equal(diagnose("Executable doesn't exist"), 'BROWSER_UNAVAILABLE');
  assert.equal(diagnose('', true), 'BROWSER_MODULE_OK');
});

test('scans only source HTML/JS without modifying files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cdn-preflight-'));
  try {
    fs.mkdirSync(path.join(root, 'sub'));
    fs.mkdirSync(path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, 'sub', 'index.html'), '<script src="https://unpkg.com/pkg"></script>\nimport "https://esm.sh/pkg";');
    fs.writeFileSync(path.join(root, 'node_modules', 'skip.js'), 'https://unpkg.com/ignored');
    fs.writeFileSync(path.join(root, 'note.txt'), 'https://unpkg.com/ignored');
    assert.deepEqual(scanCdnImports(root), [
      { file: 'sub/index.html', line: 1, count: 1 },
      { file: 'sub/index.html', line: 2, count: 1 }
    ]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('refuses explicitly disabled TLS instead of silently accepting it', () => {
  const entry = path.resolve(__dirname, '../scripts/browser-cdn-preflight.cjs');
  const child = spawnSync(process.execPath, [entry, '--scan-only'], {
    encoding: 'utf8', env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' }
  });
  assert.equal(child.status, 3);
  assert.match(child.stderr, /TLS_BYPASS_DETECTED/);
});
