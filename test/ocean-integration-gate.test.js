'use strict';
// Regression guard for the fail-open Ocean integration gate.
//
// Before this guard, `.github/workflows/fleet-pre-exact-sha.yml` decided
// READY_FOR_OCEAN with `test -n "$CERTIFIED"; test "$CERTIFIED" = "$EXPECTED"`:
// no canonical-base binding and no parsing of the Fleet PRE certificate
// artifact. Reproduced on 2026-09-26 with that exact snippet: with the
// canonical base advanced and the head unchanged, and with a certificate whose
// sha and verdict are both wrong, the gate still exited 0 and printed
// READY_FOR_OCEAN=YES.
//
// These tests execute the real CLI as a child process against real certificate
// files. Nothing here asserts on a string alone.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..');
const gate = require(path.join(root, 'lib/ocean-integration-gate.js'));
const cli = path.join(root, 'scripts/ocean-integration-gate.cjs');

const HEAD = '791e641f3e1ac79947a20dedbd3b17fc9711e32c';
const BASE = '809b0292b26edb1ea320e61144f1b1dfed772922';
const ADVANCED_BASE = '142200812d3d57a1b79aaaba2af628168acc648e';

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-gate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function runCli(args) {
  const result = cp.spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: String(result.stdout || ''), stderr: String(result.stderr || '') };
}

function writeCertificate(t, certificate) {
  const file = path.join(tempDir(t), 'fleet-pre-evidence.json');
  fs.writeFileSync(file, typeof certificate === 'string' ? certificate : JSON.stringify(certificate));
  return file;
}

test('CLI certifies the exact head and canonical base, then accepts only that pair', t => {
  const out = path.join(tempDir(t), 'fleet-pre-evidence.json');
  const certified = runCli(['certify', '--head', HEAD, '--canonical-base', BASE,
    '--pr-base', BASE, '--run', '36209510757', '--out', out]);
  assert.equal(certified.status, 0, certified.stderr);
  const certificate = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(certificate.kind, 'FLEET_PRE');
  assert.equal(certificate.sha, HEAD);
  assert.equal(certificate.baseSha, BASE);
  assert.equal(certificate.verdict, 'PASS');

  const accepted = runCli(['eligibility', '--certificate', out,
    '--expected-head', HEAD, '--canonical-base', BASE]);
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
  assert.match(accepted.stdout, /READY_FOR_OCEAN=YES/);
  assert.match(accepted.stdout, new RegExp('HEAD=' + HEAD));
  assert.match(accepted.stdout, new RegExp('CANONICAL_BASE=' + BASE));
});

test('regression: a canonical-base advance invalidates an unchanged head', t => {
  const out = path.join(tempDir(t), 'fleet-pre-evidence.json');
  assert.equal(runCli(['certify', '--head', HEAD, '--canonical-base', BASE, '--out', out]).status, 0);

  // The historical fail-open: head unchanged, canonical base moved on.
  const stale = runCli(['eligibility', '--certificate', out,
    '--expected-head', HEAD, '--canonical-base', ADVANCED_BASE]);
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /READY_FOR_OCEAN=NO/);
  assert.match(stale.stdout, /REASON=canonical_base_advanced_after_certification/);
});

test('regression: certificate artifact contents are validated, not assumed', t => {
  const decisions = [
    ['wrong head certified', { kind: 'FLEET_PRE', sha: ADVANCED_BASE, baseSha: BASE, verdict: 'PASS' },
      'certificate_head_does_not_match_candidate_head'],
    ['BLOCK verdict', { kind: 'FLEET_PRE', sha: HEAD, baseSha: BASE, verdict: 'BLOCK' },
      'certificate_verdict_is_not_pass'],
    ['foreign certificate kind', { kind: 'FLEET_POST', sha: HEAD, baseSha: BASE, verdict: 'PASS' },
      'certificate_is_not_fleet_pre'],
    ['legacy certificate without canonical base', { kind: 'FLEET_PRE', sha: HEAD, verdict: 'PASS' },
      'certificate_canonical_base_missing_or_invalid'],
    ['malformed json', '{not json', 'malformed_fleet_pre_certificate']
  ];
  for (const [label, certificate, reason] of decisions) {
    const file = writeCertificate(t, certificate);
    const result = runCli(['eligibility', '--certificate', file,
      '--expected-head', HEAD, '--canonical-base', BASE]);
    assert.equal(result.status, 1, label + ' must not be eligible');
    assert.match(result.stdout, new RegExp('REASON=' + reason), label);
  }
});

test('missing, unreadable and empty evidence fail closed', t => {
  const dir = tempDir(t);
  const absent = runCli(['eligibility', '--certificate', path.join(dir, 'nope.json'),
    '--expected-head', HEAD, '--canonical-base', BASE]);
  assert.equal(absent.status, 1);
  assert.match(absent.stdout, /REASON=missing_fleet_pre_certificate/);

  const empty = writeCertificate(t, '');
  const blank = runCli(['eligibility', '--certificate', empty,
    '--expected-head', HEAD, '--canonical-base', BASE]);
  assert.equal(blank.status, 1);
  assert.match(blank.stdout, /REASON=missing_fleet_pre_certificate/);

  const none = runCli(['eligibility', '--expected-head', HEAD, '--canonical-base', BASE]);
  assert.equal(none.status, 1);
  assert.match(none.stdout, /REASON=missing_fleet_pre_certificate/);
});

test('unusable candidate identity fails closed instead of comparing undefined', t => {
  const file = writeCertificate(t, gate.buildFleetPreCertificate({ headSha: HEAD, canonicalBaseSha: BASE }));
  const noHead = runCli(['eligibility', '--certificate', file, '--canonical-base', BASE]);
  assert.equal(noHead.status, 1);
  assert.match(noHead.stdout, /REASON=candidate_head_missing_or_invalid/);

  const noBase = runCli(['eligibility', '--certificate', file, '--expected-head', HEAD]);
  assert.equal(noBase.status, 1);
  assert.match(noBase.stdout, /REASON=canonical_base_missing_or_invalid/);
});

test('a certificate that does not certify a real 40-character commit is rejected', () => {
  const decision = gate.decideOceanEligibility({
    certificate: JSON.stringify({ kind: 'FLEET_PRE', sha: 'not-a-sha', baseSha: BASE, verdict: 'PASS' }),
    expectedHeadSha: HEAD,
    canonicalBaseSha: BASE
  });
  assert.equal(decision.readyForOcean, false);
  assert.equal(decision.reason, gate.REJECTION.MISSING_HEAD);
});

test('formatEligibility never prints a YES line for a non-ready decision', () => {
  for (const reason of Object.values(gate.REJECTION)) {
    const line = gate.formatEligibility({ readyForOcean: false, reason });
    assert.match(line, /^READY_FOR_OCEAN=NO REASON=/);
  }
  assert.equal(gate.formatEligibility({ readyForOcean: false }).includes('READY_FOR_OCEAN=YES'), false);
  assert.equal(gate.formatEligibility(null).includes('READY_FOR_OCEAN=YES'), false);
});

test('workflow delegates eligibility to the tested gate and re-resolves the canonical base', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/fleet-pre-exact-sha.yml'), 'utf8');
  // The fail-open comparison must be gone, including its unconditional YES line.
  assert.equal(workflow.includes('echo "READY_FOR_OCEAN=YES'), false);
  assert.equal(/test "\$CERTIFIED" = "\$EXPECTED"/.test(workflow), false);
  // The certificate must be produced and consumed by the same module.
  assert.match(workflow, /scripts\/ocean-integration-gate\.cjs certify/);
  assert.match(workflow, /--canonical-base "\$CERTIFIED_BASE"/);
  assert.match(workflow, /actions\/download-artifact@v4/);
  assert.match(workflow, /--certificate fleet-pre\/fleet-pre-evidence\.json/);
  assert.match(workflow, /--resolve-canonical-base/);
  // Independent Fleet evidence still has to be produced at the exact head.
  assert.match(workflow, /npm run check:fast/);
  assert.match(workflow, /node --test test\/world-emergence\.test\.js/);
});

test('certification refuses to emit an identity it could never certify', t => {
  const out = path.join(tempDir(t), 'fleet-pre-evidence.json');
  const result = runCli(['certify', '--head', 'not-a-sha', '--canonical-base', BASE, '--out', out]);
  assert.equal(result.status, 1);
  const certificate = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(certificate.sha, '');
  const eligibility = runCli(['eligibility', '--certificate', out,
    '--expected-head', HEAD, '--canonical-base', BASE]);
  assert.equal(eligibility.status, 1);
  assert.match(eligibility.stdout, /REASON=certificate_head_missing_or_invalid/);
});
