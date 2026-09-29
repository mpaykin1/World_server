'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

const {
  RULES,
  VERDICT_ACCEPTED,
  normalizeSha,
  parseCertFromComment,
  extractCertRecords,
  validateCertificates,
  run
} = require('../scripts/check-fleet-pre-certificate.cjs');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts', 'check-fleet-pre-certificate.cjs');

const HEAD = '13b129ca5caf43121595c480e707bd57b444d4ec';
const now = Date.now();
const HOUR = 60 * 60 * 1000;

function cert({ sha = HEAD, pr = 122, verdict = VERDICT_ACCEPTED, verifiedAt = now, sourceId = 'issue-80' } = {}) {
  return { certificate: 'FLEET_PRE', pr, exactHeadSha: sha, verdict, verifiedAt, sourceId };
}

function freshVerdict(pr = 122) {
  return { body: `[FLEET][PRE_INTEGRATION_QA][PR_${pr}][EXACT_HEAD_${HEAD}] READY_FOR_OCEAN=YES`, created_at: new Date().toISOString() };
}

function startCommentsServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const payload = handler(req);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function serverBaseUrl(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

test('Fleet PRE cert parser reads the canonical issue #80 comment format (YES and NO)', async () => {
  const yes = parseCertFromComment(
    '[FLEET][PRE_INTEGRATION_QA][PR_122][EXACT_HEAD_13b129ca5caf43121595c480e707bd57b444d4ec] PASS READY_FOR_OCEAN=YES',
    '2026-09-16T00:00:00Z',
    'issue-80'
  )[0];
  assert.ok(yes);
  assert.equal(yes.certificate, 'FLEET_PRE');
  assert.equal(yes.pr, 122);
  assert.equal(yes.exactHeadSha, '13b129ca5caf43121595c480e707bd57b444d4ec');
  assert.equal(yes.verdict, 'YES');
  assert.equal(new Date(yes.verifiedAt).toISOString(), '2026-09-16T00:00:00.000Z');

  const no = parseCertFromComment(
    '[FLEET][PRE_INTEGRATION_QA][PR_117][EXACT_HEAD_13b129ca5caf43121595c480e707bd57b444d4ec] RETURN_TO_BUILDER READY_FOR_OCEAN=NO',
    '2026-09-15T04:32:06Z',
    'issue-80'
  )[0];
  assert.equal(no.pr, 117);
  assert.equal(no.verdict, 'NO');

  assert.equal(parseCertFromComment('no fleet marker here', '2026-09-16T00:00:00Z').length, 0);
  assert.equal(extractCertRecords([freshVerdict()]).length, 1);
});

test('rule 1: no cert / source absent => BLOCK', () => {
  const result = validateCertificates({ records: [], expectedSha: HEAD, pr: 122, now });
  assert.equal(result.ok, false);
  assert.equal(result.reason, RULES.NO_CERT_FOUND);
  const missing = validateCertificates({ records: undefined, expectedSha: HEAD, pr: 122, now });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, RULES.NO_CERT_FOUND);
});

test('rule 2: skipped or empty/invalid cert => BLOCK', () => {
  const skipped = validateCertificates({ records: [cert({ verdict: 'SKIPPED' })], expectedSha: HEAD, pr: 122, now });
  assert.equal(skipped.ok, false);
  assert.equal(skipped.reason, RULES.SKIPPED_OR_INVALID_CERT);

  const emptyVerdict = validateCertificates({ records: [cert({ verdict: '' })], expectedSha: HEAD, pr: 122, now });
  assert.equal(emptyVerdict.ok, false);
  assert.equal(emptyVerdict.reason, RULES.SKIPPED_OR_INVALID_CERT);

  const noTimestamp = validateCertificates({ records: [cert({ verifiedAt: 'not-a-date' })], expectedSha: HEAD, pr: 122, now });
  assert.equal(noTimestamp.ok, false);
  assert.equal(noTimestamp.reason, RULES.SKIPPED_OR_INVALID_CERT);

  const badSha = validateCertificates({ records: [cert({ sha: 'zzz' })], expectedSha: HEAD, pr: 122, now });
  assert.equal(badSha.ok, false);
  assert.equal(badSha.reason, RULES.SKIPPED_OR_INVALID_CERT);
});

test('rule 3: exactHeadSha mismatch => BLOCK', () => {
  const result = validateCertificates({
    records: [cert({ sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })],
    expectedSha: HEAD,
    pr: 122,
    now
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, RULES.EXACT_SHA_MISMATCH);
});

test('rule 3b: exact SHA for a different PR => BLOCK (PR mismatch)', () => {
  const result = validateCertificates({
    records: [cert({ pr: 999 })],
    expectedSha: HEAD,
    pr: 122,
    now
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, RULES.PR_MISMATCH);
});

test('rule 4: verdict is not READY_FOR_OCEAN => BLOCK', () => {
  const result = validateCertificates({
    records: [cert({ verdict: 'RETURN_TO_BUILDER' })],
    expectedSha: HEAD,
    pr: 122,
    now
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, RULES.VERDICT_NOT_READY_FOR_OCEAN);
});

test('rule 5: stale certificate older than max-age => BLOCK', () => {
  const result = validateCertificates({
    records: [cert({ verifiedAt: now - 48 * HOUR })],
    expectedSha: HEAD,
    pr: 122,
    now,
    maxAgeMs: 24 * HOUR
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, RULES.STALE_CERTIFICATE);
});

test('rule 6: ambiguous certificates (same sha, same time, conflicting verdicts) => BLOCK', () => {
  const at = now - 1000;
  const result = validateCertificates({
    records: [
      cert({ verdict: VERDICT_ACCEPTED, verifiedAt: at }),
      cert({ verdict: 'RETURN_TO_BUILDER', verifiedAt: at })
    ],
    expectedSha: HEAD,
    pr: 122,
    now
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, RULES.AMBIGUOUS_CERT);
});

test('rule 7: exact fresh cert => PASS', () => {
  const result = validateCertificates({ records: [cert()], expectedSha: HEAD, pr: 122, now });
  assert.equal(result.ok, true);
  assert.equal(result.reason, RULES.FRESH_EXACT_SHA_CERTIFICATE);
  assert.equal(result.record.exactHeadSha, HEAD);
  assert.equal(result.record.verdict, VERDICT_ACCEPTED);
});

test('CLI end-to-end: fresh exact-SHA cert on the authoritative issue source => exit 0 PASS (offline fixture)', async () => {
  const server = await startCommentsServer(() => [freshVerdict()]);
  try {
    const spawned = spawnSync(process.execPath, [script, HEAD, '--pr', '122', '--api-base', serverBaseUrl(server), '--issue', '80'], {
      encoding: 'utf8'
    });
    assert.equal(spawned.status, 0, spawned.stderr);
    assert.match(spawned.stdout, /FLEET-PRE-MERGE-CHAIN\] PASS: FRESH_EXACT_SHA_CERTIFICATE/);
    assert.match(spawned.stdout, new RegExp(`head=${HEAD}`));
  } finally {
    server.close();
  }
});

test('rule 6: unavailable cert source => BLOCK (exit nonzero, never green)', async () => {
  const spawned = spawnSync(process.execPath, [script, HEAD, '--pr', '122', '--api-base', 'http://127.0.0.1:1', '--issue', '80'], {
    encoding: 'utf8'
  });
  assert.notEqual(spawned.status, 0);
  assert.ok(!spawned.stdout.includes('PASS'));
  assert.match(spawned.stderr, new RegExp(RULES.CERT_SOURCE_UNAVAILABLE));
});

test('checked-in data/fleet-pre-certificates file is NOT authoritative and can never green the gate', async () => {
  const server = await startCommentsServer(() => []);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-pre-cert-'));
  try {
    const certDir = path.join(dir, 'data', 'fleet-pre-certificates');
    fs.mkdirSync(certDir, { recursive: true });
    fs.writeFileSync(path.join(certDir, `${HEAD}.json`), JSON.stringify({
      certificate: 'FLEET_PRE',
      pr: 122,
      exactHeadSha: HEAD,
      verdict: VERDICT_ACCEPTED,
      verifiedAt: new Date().toISOString(),
      canonicalSha256: '0000000000000000000000000000000000000000000000000000000000000000'
    }));
    const spawned = spawnSync(process.execPath, [script, HEAD, '--pr', '122', '--api-base', serverBaseUrl(server), '--issue', '80'], {
      encoding: 'utf8',
      cwd: dir
    });
    assert.notEqual(spawned.status, 0);
    assert.ok(!spawned.stdout.includes('PASS'));
    assert.match(spawned.stderr, new RegExp(RULES.CERT_FILE_NOT_AUTHORITATIVE));
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bypass-class scan: fleet-pre-merge-chain workflow cannot report green without the exact-SHA cert check', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'fleet-pre-merge-chain.yml'), 'utf8');
  assert.ok(workflow.includes('scripts/check-fleet-pre-certificate.cjs'));
  assert.match(workflow, /github\.event\.pull_request\.head\.sha/);
  assert.match(workflow, /github\.event\.pull_request\.number/);
  assert.match(workflow, /fleet-pre-merge-chain:/);

  assert.ok(!workflow.includes('continue-on-error'), 'workflow must not use continue-on-error');
  assert.ok(!workflow.includes('if: always()'), 'workflow must not use if: always()');
  assert.ok(!workflow.includes('|| exit 0'), 'workflow must not neutralize the cert gate');
  assert.ok(!workflow.includes('|| true'), 'workflow must not have a skip-anyway fallback');
  assert.ok(!workflow.includes('Netlify'), 'workflow must not have a Netlify fallback-green path');
  assert.ok(!workflow.includes('|| echo'), 'workflow must not fake success');
  assert.ok(workflow.includes('set -euo pipefail'), 'workflow must fail on script error');
  assert.ok(workflow.includes('GH_TOKEN'), 'workflow keeps read-only authenticated issue access');

  const source = fs.readFileSync(path.join(root, 'scripts', 'check-fleet-pre-certificate.cjs'), 'utf8');
  assert.ok(source.includes('module.exports'), 'script must export pure logic for offline tests');
  assert.ok(!source.includes('node_modules'), 'script must be dependency-free (pure Node)');
});

test('CLI rejects malformed input before any source lookup (fail-closed usage)', () => {
  const noSha = spawnSync(process.execPath, [script, '--pr', '122'], { encoding: 'utf8' });
  assert.equal(noSha.status, 2);

  const badPr = spawnSync(process.execPath, [script, HEAD, '--pr', 'abc'], { encoding: 'utf8' });
  assert.equal(badPr.status, 2);

  const hexOk = normalizeSha('13B129CA5CAF43121595C480E707BD57B444D4EC');
  assert.equal(hexOk, HEAD);
});