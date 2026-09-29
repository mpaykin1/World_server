'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const gate = require('../scripts/check-fleet-pre-certificate.cjs');
const {
  CERTIFICATE_KIND,
  REQUIRED_VERDICT,
  DEFAULT_MAX_AGE_MS,
  RULE,
  isSha,
  evaluateFleetPreCertificate,
  readCertificates,
} = gate;

const HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'c'.repeat(40);

function nowIso() {
  return new Date().toISOString();
}

function validCert(overrides = {}) {
  return {
    certificate: CERTIFICATE_KIND,
    pr: '#1234',
    exactHeadSha: HEAD,
    verdict: REQUIRED_VERDICT,
    verifiedAt: nowIso(),
    canonicalSha256: 'b'.repeat(64),
    sourceFile: `${HEAD}.json`,
    ...overrides,
  };
}

function evaluate(certs, overrides = {}) {
  return evaluateFleetPreCertificate({ headSha: HEAD, certificates: certs, ...overrides });
}

test('FLEET_PRE: no certificate for the head blocks (source absent/empty)', () => {
  const result = evaluate([]);
  assert.equal(result.ok, false);
  assert.equal(result.rule, RULE.NO_CERT);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-pre-'));
  try {
    assert.deepEqual(readCertificates(path.join(tmp, 'missing-dir')), []);
    assert.deepEqual(readCertificates(tmp), []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('FLEET_PRE: certificate for a different head does not authorize this head', () => {
  const result = evaluate([validCert({ exactHeadSha: OTHER_HEAD, sourceFile: `${OTHER_HEAD}.json` })]);
  assert.equal(result.ok, false);
  assert.equal(result.rule, RULE.NO_CERT);
});

test('FLEET_PRE: certificate file naming the head but contradicting its content blocks (sha-mismatch)', () => {
  const result = evaluate([validCert({ exactHeadSha: OTHER_HEAD, sourceFile: `${HEAD}.json` })]);
  assert.equal(result.ok, false);
  assert.equal(result.rule, RULE.SHA_MISMATCH);
});

test('FLEET_PRE: skipped, empty and non-FLEET_PRE certificates block', () => {
  const notKind = evaluate([validCert({ certificate: 'BUILDER_SELF_CERT' })]);
  assert.equal(notKind.ok, false);
  assert.equal(notKind.rule, RULE.SKIPPED_EMPTY);

  const skipped = evaluate([validCert({ skipped: true })]);
  assert.equal(skipped.ok, false);
  assert.equal(skipped.rule, RULE.SKIPPED_EMPTY);

  const invalid = evaluate([validCert({ valid: false })]);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.rule, RULE.SKIPPED_EMPTY);

  const missingPr = evaluate([validCert({ pr: '' })]);
  assert.equal(missingPr.ok, false);
  assert.equal(missingPr.rule, RULE.SKIPPED_EMPTY);
});

test('FLEET_PRE: any verdict other than READY_FOR_OCEAN blocks', () => {
  for (const verdict of ['RETURN_TO_BUILDER', 'UNKNOWN', 'NOT_READY', '', undefined]) {
    const result = evaluate([validCert({ verdict })]);
    assert.equal(result.ok, false, `verdict "${verdict}" must block`);
    assert.equal(result.rule, RULE.VERDICT_MISMATCH);
  }
});

test('FLEET_PRE: stale, future and invalid verifiedAt timestamps block', () => {
  const stale = evaluate([validCert({ verifiedAt: new Date(Date.now() - DEFAULT_MAX_AGE_MS - 60_000).toISOString() })]);
  assert.equal(stale.ok, false);
  assert.equal(stale.rule, RULE.STALE);

  const future = evaluate([validCert({ verifiedAt: new Date(Date.now() + 3600_000).toISOString() })]);
  assert.equal(future.ok, false);
  assert.equal(future.rule, RULE.STALE);

  const invalid = evaluate([validCert({ verifiedAt: 'not-a-date' })]);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.rule, RULE.STALE);

  const missing = evaluate([validCert({ verifiedAt: undefined })]);
  assert.equal(missing.ok, false);
  assert.equal(missing.rule, RULE.STALE);

  const customMaxAge = evaluate([validCert({ verifiedAt: new Date(Date.now() - 120_000).toISOString() })], { maxAgeMs: 60_000 });
  assert.equal(customMaxAge.ok, false);
  assert.equal(customMaxAge.rule, RULE.STALE);
});

test('FLEET_PRE: conflicting certificates for the same head block (ambiguous)', () => {
  const a = validCert({ verdict: REQUIRED_VERDICT, verifiedAt: nowIso(), sourceFile: `${HEAD}.json` });
  const b = validCert({ verdict: 'RETURN_TO_BUILDER', verifiedAt: nowIso(), sourceFile: `${HEAD}-copy.json` });
  const result = evaluate([a, b]);
  assert.equal(result.ok, false);
  assert.equal(result.rule, RULE.AMBIGUOUS);
});

test('FLEET_PRE: missing or malformed canonicalSha256 blocks', () => {
  const missing = evaluate([validCert({ canonicalSha256: undefined })]);
  assert.equal(missing.ok, false);
  assert.equal(missing.rule, RULE.MALFORMED);

  const short = evaluate([validCert({ canonicalSha256: 'abc' })]);
  assert.equal(short.ok, false);
  assert.equal(short.rule, RULE.MALFORMED);

  const malformedHead = evaluate([validCert()], { headSha: 'not-a-sha' });
  assert.equal(malformedHead.ok, false);
  assert.equal(malformedHead.rule, RULE.MALFORMED);
});

test('FLEET_PRE: an exact fresh certificate for the exact head passes', () => {
  const result = evaluate([validCert()]);
  assert.equal(result.ok, true);
  assert.equal(result.rule, RULE.PASS);
  assert.equal(result.cert.exactHeadSha, HEAD);
  assert.equal(result.cert.verdict, REQUIRED_VERDICT);

  const sameTs = nowIso();
  const duplicateIdentical = evaluate([validCert({ verifiedAt: sameTs }), validCert({ verifiedAt: sameTs, sourceFile: `${HEAD}-copy.json` })]);
  assert.equal(duplicateIdentical.ok, true);
  assert.equal(duplicateIdentical.rule, RULE.PASS);
});

test('FLEET_PRE: CLI exits 0 only with an exact fresh certificate, 1 otherwise', () => {
  const script = path.join(root, 'scripts', 'check-fleet-pre-certificate.cjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-pre-'));
  try {
    const empty = spawnSync(process.execPath, [script, HEAD, '--cert-dir', tmp], { encoding: 'utf8' });
    assert.notEqual(empty.status, 0);
    assert.match(empty.stderr, /BLOCK: no-cert/);

    fs.writeFileSync(path.join(tmp, `${HEAD}.json`), JSON.stringify(validCert({ sourceFile: undefined }), null, 2));
    const good = spawnSync(process.execPath, [script, HEAD, '--cert-dir', tmp], { encoding: 'utf8' });
    assert.equal(good.status, 0);
    assert.match(good.stdout, /"rule": "pass"/);

    fs.writeFileSync(path.join(tmp, `${HEAD}.json`), JSON.stringify(validCert({ verdict: 'RETURN_TO_BUILDER', sourceFile: undefined }), null, 2));
    const blocked = spawnSync(process.execPath, [script, HEAD, '--cert-dir', tmp], { encoding: 'utf8' });
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /BLOCK: verdict-mismatch/);

    fs.rmSync(path.join(tmp, `${HEAD}.json`));
    const missingSha = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.notEqual(missingSha.status, 0);
    assert.match(missingSha.stdout, /usage/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('FLEET_PRE: bypass-class scan — the merge-chain workflow cannot go green without the certificate check', () => {
  const workflowPath = path.join(root, '.github', 'workflows', 'fleet-pre-merge-chain.yml');
  const scriptPath = path.join(root, 'scripts', 'check-fleet-pre-certificate.cjs');
  assert.ok(fs.existsSync(scriptPath), 'check script must exist (gate depends on it)');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /pull_request:\s*\n\s*branches:\s*\[master\]/, 'workflow must run on PRs targeting master');
  assert.match(workflow, /check-fleet-pre-certificate\.cjs/, 'workflow must invoke the exact-SHA certificate check');
  assert.match(workflow, /PR_HEAD_SHA/, 'workflow must feed the exact PR head SHA to the check');

  assert.doesNotMatch(workflow, /\|\|\s*true/, 'no `|| true` bypass is allowed');
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/, 'no continue-on-error bypass is allowed');
  assert.doesNotMatch(workflow, /if:\s*always\(\)/, 'no always-run bypass that could mask a failed check');
  assert.doesNotMatch(workflow, /if:\s*steps\.\w+\.outcome\s*!=\s*'success'/, 'no inverted fallback-green is allowed');
  assert.doesNotMatch(workflow, /test\s+[^;]*\|\|\s*exit\s*0/, 'no bare-shell fallback-green is allowed');
  assert.doesNotMatch(workflow, /exit\s+0/, 'no hidden exit-0 success path is allowed');
});

test('FLEET_PRE: cert-gate tests are permanently part of the required `check` command', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.check, /node --test/, 'required check must run the node --test suite');
  assert.ok(fs.existsSync(path.join(root, 'test', 'fleet-pre-certificate.test.js')), 'this test file must keep existing');

  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'fleet-pre-merge-chain.yml'), 'utf8');
  assert.doesNotMatch(workflow, /run:\s*-?\s*(true|echo|printf|exit)/, 'no fake command may masquerade as the check');

  assert.equal(isSha(HEAD), true);
  assert.equal(isSha('nope'), false);
});