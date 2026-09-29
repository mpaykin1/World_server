'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_MAX_AGE_MS,
  certificateFingerprint,
  normalizeCert,
  evaluateCertificate,
  scanIssue80Comments,
  selectVerdict,
  loadCertFileResult,
  run
} = require('../scripts/check-fleet-pre-certificate.cjs');

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_HEAD = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function makeCert(overrides = {}) {
  const base = {
    certificate: 'FLEET_PRE',
    pr: '123',
    exactHeadSha: HEAD,
    verdict: 'READY_FOR_OCEAN',
    verifiedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString()
  };
  const merged = { ...base, ...overrides };
  merged.canonicalSha256 = certificateFingerprint(merged);
  return merged;
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-pre-cert-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('no certificate source available => BLOCK', () => {
  const verdict = selectVerdict([{ ok: false, rule: 'source-unavailable', reason: 'absent' }]);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.rule, 'source-unavailable');
});

test('skipped / empty certificate => BLOCK', () => {
  const empty = evaluateCertificate(null, { headSha: HEAD, nowMs: Date.now() });
  assert.equal(empty.ok, false);
  assert.equal(empty.rule, 'empty');
  const emptyFile = withTempDir((dir) => {
    const file = path.join(dir, `${HEAD}.json`);
    fs.writeFileSync(file, '   ', 'utf8');
    return loadCertFileResult(file, { headSha: HEAD, nowMs: Date.now(), maxAgeMs: DEFAULT_MAX_AGE_MS });
  });
  assert.equal(emptyFile.ok, false);
  assert.equal(emptyFile.rule, 'empty');
});

test('exactHeadSha mismatch => BLOCK', () => {
  const cert = makeCert({ exactHeadSha: OTHER_HEAD });
  const result = evaluateCertificate(cert, { headSha: HEAD, nowMs: Date.now() });
  assert.equal(result.ok, false);
  assert.equal(result.rule, 'sha-mismatch');
});

test('verdict not READY_FOR_OCEAN => BLOCK', () => {
  const cert = makeCert({ verdict: 'RETURN_TO_BUILDER' });
  const result = evaluateCertificate(cert, { headSha: HEAD, nowMs: Date.now() });
  assert.equal(result.ok, false);
  assert.equal(result.rule, 'verdict');
});

test('stale certificate older than max-age => BLOCK', () => {
  const cert = makeCert({ verifiedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() });
  const result = evaluateCertificate(cert, { headSha: HEAD, nowMs: Date.now(), maxAgeMs: DEFAULT_MAX_AGE_MS });
  assert.equal(result.ok, false);
  assert.equal(result.rule, 'stale');
});

test('certificate verifiedAt in the future => BLOCK', () => {
  const cert = makeCert({ verifiedAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() });
  const result = evaluateCertificate(cert, { headSha: HEAD, nowMs: Date.now() });
  assert.equal(result.ok, false);
  assert.equal(result.rule, 'future');
});

test('invalid schema (wrong marker, bad sha, bad timestamp) => BLOCK', () => {
  assert.equal(normalizeCert({}).ok, false);
  assert.equal(normalizeCert({ certificate: 'SELF', pr: '1', exactHeadSha: HEAD, verdict: 'READY_FOR_OCEAN', verifiedAt: new Date().toISOString() }).ok, false);
  assert.equal(normalizeCert({ certificate: 'FLEET_PRE', pr: '1', exactHeadSha: 'zz', verdict: 'READY_FOR_OCEAN', verifiedAt: new Date().toISOString() }).ok, false);
  assert.equal(normalizeCert({ certificate: 'FLEET_PRE', pr: '1', exactHeadSha: HEAD, verdict: 'READY_FOR_OCEAN', verifiedAt: 'not-a-date' }).ok, false);
  const badHead = evaluateCertificate(makeCert(), { headSha: 'not-a-sha', nowMs: Date.now() });
  assert.equal(badHead.ok, false);
  assert.equal(badHead.rule, 'schema');
});

test('tampered canonicalSha256 => BLOCK', () => {
  const cert = makeCert();
  cert.canonicalSha256 = 'f'.repeat(64);
  const result = evaluateCertificate(cert, { headSha: HEAD, nowMs: Date.now() });
  assert.equal(result.ok, false);
  assert.equal(result.rule, 'fingerprint');
  assert.equal(normalizeCert(cert).ok, false);
});

test('conflicting certificates for the same exact head => BLOCK', () => {
  const first = normalizeCert(makeCert({ pr: '123' }));
  const second = normalizeCert(makeCert({ pr: '999' }));
  const verdict = selectVerdict([
    { ok: true, cert: first.cert },
    { ok: true, cert: second.cert }
  ]);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.rule, 'ambiguous');
});

test('exact fresh unambiguous certificate => PASS', () => {
  const normalized = normalizeCert(makeCert());
  assert.equal(normalized.ok, true);
  const result = evaluateCertificate(normalized.cert, { headSha: HEAD, nowMs: Date.now() });
  assert.equal(result.ok, true);
  const verdict = selectVerdict([result]);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.cert.exactHeadSha, HEAD);
});

test('issue #80 comment scan extracts an exact fresh certificate', () => {
  const nowIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const comment = `[FLEET][PRE_INTEGRATION_QA][PR_#123][EXACT_HEAD_${HEAD}] READY\nREADY_FOR_OCEAN=YES\nverifiedAt=${nowIso}\nexact head only`;
  const scan = scanIssue80Comments(comment, HEAD);
  assert.equal(scan.ok, true);
  assert.equal(scan.candidates.length, 1);
  const evaluated = scan.candidates.map((cert) => evaluateCertificate(cert, { headSha: HEAD, nowMs: Date.now() }));
  assert.equal(evaluated[0].ok, true);
  const verdict = selectVerdict(evaluated);
  assert.equal(verdict.ok, true);
});

test('issue #80 comment without a verifiedAt fails closed', () => {
  const comment = `[FLEET][PRE_INTEGRATION_QA][PR_#123][EXACT_HEAD_${HEAD}] READY\nREADY_FOR_OCEAN=YES\nno timestamp here`;
  const scan = scanIssue80Comments(comment, HEAD);
  assert.equal(scan.ok, true);
  assert.equal(scan.candidates.length, 0);
  const verdict = selectVerdict([{ ok: false, rule: 'source-unavailable', reason: 'no timestamp' }]);
  assert.equal(verdict.ok, false);
});

test('issue #80 comment with READY_FOR_OCEAN=NO or wrong head never certifies', () => {
  const commentNo = `[FLEET][PRE_INTEGRATION_QA][PR_#123][EXACT_HEAD_${HEAD}] VERDICT\nREADY_FOR_OCEAN=NO\nverifiedAt=${new Date().toISOString()}`;
  assert.equal(scanIssue80Comments(commentNo, HEAD).candidates.length, 0);
  const wrongHead = `[FLEET][PRE_INTEGRATION_QA][PR_#123][EXACT_HEAD_${OTHER_HEAD}] READY\nREADY_FOR_OCEAN=YES\nverifiedAt=${new Date().toISOString()}`;
  assert.equal(scanIssue80Comments(wrongHead, HEAD).candidates.length, 0);
});

test('CLI run(): missing head => usage exit 2, missing cert => BLOCK exit 1, fresh cert => PASS exit 0', () => {
  const usage = run({ help: false, headSha: '', certFiles: [], certDir: os.tmpdir(), source: 'file', issue80TextFile: '' }, {}, () => {});
  assert.equal(usage.ok, false);
  assert.equal(usage.exit, 2);

  const blocked = run({ help: false, headSha: HEAD, certFiles: [], certDir: path.join(os.tmpdir(), 'no-such-fleet-dir'), source: 'file', issue80TextFile: '' }, {}, () => {});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.exit, 1);

  withTempDir((dir) => {
    const file = path.join(dir, `${HEAD}.json`);
    fs.writeFileSync(file, JSON.stringify(makeCert(), null, 2), 'utf8');
    const passed = run({ help: false, headSha: HEAD, certFiles: [], certDir: dir, source: 'file', issue80TextFile: '' }, {}, () => {});
    assert.equal(passed.ok, true);
    assert.equal(passed.exit, 0);
  });
});

test('bypass-class scan: the merge-chain workflow cannot go green without the certificate gate', () => {
  const root = path.resolve(__dirname, '..');
  const workflow = path.join(root, '.github', 'workflows', 'fleet-pre-merge-chain.yml');
  const source = fs.readFileSync(workflow, 'utf8');
  assert.ok(source.includes('scripts/check-fleet-pre-certificate.cjs'), 'workflow invokes the certificate checker');
  assert.ok(source.includes('--head'), 'workflow passes the exact head sha');
  assert.ok(source.includes('fleet-pre-merge-chain:'), 'job exposes the fleet-pre-merge-chain check');
  assert.ok(source.includes('exit 1'), 'workflow preserves a fail-closed exit path');
  assert.ok(!/\|\s*true/.test(source), 'no shell fallback-green (|| true) in the workflow');
  assert.ok(!source.includes('continue-on-error: true'), 'no continue-on-error in the workflow');
  const gateBlock = source.slice(source.indexOf('- name: Run fail-closed Fleet PRE certificate gate'), source.indexOf('node scripts/check-fleet-pre-certificate.cjs'));
  assert.ok(!gateBlock.includes('if:'), 'certificate gate step is unconditional (no skip)');
  assert.ok(!/Verify Netlify PR fallback/i.test(source), 'no Netlify fallback-green branch survives');
});