'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const gateScript = path.join(root, 'scripts', 'check-fleet-pre-certificate.js');
const {
  gateCertificateStore,
  validateCertificate,
} = require('../lib/fleet-pre-certificate.js');

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const NOW = Date.parse('2026-09-16T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function fixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-pre-cert-'));
  const write = (name, cert) =>
    fs.writeFileSync(path.join(dir, name), JSON.stringify(cert, null, 2));
  const cleanups = [];
  const cleanup = () => {
    for (const fn of cleanups) fn();
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { dir, write, cleanup };
}

function validCert(extra = {}) {
  return {
    schemaVersion: '1',
    stage: 'PRE_INTEGRATION_QA',
    role: 'FLEET_PRE',
    verdict: 'READY_FOR_OCEAN',
    status: 'yes',
    certificateId: 'fleet-pre-cert-20260916-0001',
    pr: 121,
    headSha: SHA_A,
    baseSha: SHA_B,
    certifier: 'fleet-pre-verifier',
    certifiedAt: new Date(NOW - 1000).toISOString(),
    summary: 'exact head probes pass',
    ...extra,
  };
}

test('missing certificate for the exact head blocks', () => {
  const { dir, cleanup } = fixtures();
  try {
    const result = gateCertificateStore({ dir, headSha: SHA_A, now: NOW });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('MISSING_CERTIFICATE'));
  } finally {
    cleanup();
  }
});

test('certificate file named for the head but declaring a different SHA blocks', () => {
  const { dir, write, cleanup } = fixtures();
  try {
    write(`fleet-pre-${SHA_A}.json`, validCert({ headSha: SHA_B }));
    const result = gateCertificateStore({ dir, headSha: SHA_A, now: NOW });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('SHA_MISMATCH'));
  } finally {
    cleanup();
  }
});

test('certificate for a different SHA under its own name is not found', () => {
  const { dir, write, cleanup } = fixtures();
  try {
    write(`fleet-pre-${SHA_B}.json`, validCert({ headSha: SHA_B }));
    const result = gateCertificateStore({ dir, headSha: SHA_A, now: NOW });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('MISSING_CERTIFICATE'));
  } finally {
    cleanup();
  }
});

test('RETURN_TO_BUILDER verdict blocks', () => {
  const { dir, write, cleanup } = fixtures();
  try {
    write(`fleet-pre-${SHA_A}.json`, validCert({ verdict: 'RETURN_TO_BUILDER' }));
    const result = gateCertificateStore({ dir, headSha: SHA_A, now: NOW });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('NOT_READY_FOR_OCEAN'));
  } finally {
    cleanup();
  }
});

test('skipped/pending status blocks', () => {
  const { dir, write, cleanup } = fixtures();
  try {
    write(`fleet-pre-${SHA_A}.json`, validCert({ status: 'skipped' }));
    const result = gateCertificateStore({ dir, headSha: SHA_A, now: NOW });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('NOT_READY_FOR_OCEAN'));
  } finally {
    cleanup();
  }
});

test('wrong verifying role blocks', () => {
  const { dir, write, cleanup } = fixtures();
  try {
    write(`fleet-pre-${SHA_A}.json`, validCert({ role: 'OCEAN' }));
    const result = gateCertificateStore({ dir, headSha: SHA_A, now: NOW });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('WRONG_ROLE'));
  } finally {
    cleanup();
  }
});

test('wrong verifying stage blocks', () => {
  const { dir, write, cleanup } = fixtures();
  try {
    write(`fleet-pre-${SHA_A}.json`, validCert({ stage: 'POST_INTEGRATION_LIVE_VERIFY' }));
    const result = gateCertificateStore({ dir, headSha: SHA_A, now: NOW });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('WRONG_STAGE'));
  } finally {
    cleanup();
  }
});

test('stale certificate blocks', () => {
  const { dir, write, cleanup } = fixtures();
  try {
    write(
      `fleet-pre-${SHA_A}.json`,
      validCert({ certifiedAt: new Date(NOW - 3 * DAY_MS).toISOString() }),
    );
    const result = gateCertificateStore({ dir, headSha: SHA_A, now: NOW });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('STALE_CERTIFICATE'));
  } finally {
    cleanup();
  }
});

test('future-dated certificate blocks', () => {
  const { dir, write, cleanup } = fixtures();
  try {
    write(`fleet-pre-${SHA_A}.json`, validCert({ certifiedAt: new Date(NOW + DAY_MS).toISOString() }));
    const result = gateCertificateStore({ dir, headSha: SHA_A, now: NOW });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('FUTURE_CERTIFICATE'));
  } finally {
    cleanup();
  }
});

test('duplicate certificates for the same head block', () => {
  const { dir, write, cleanup } = fixtures();
  try {
    write(`fleet-pre-${SHA_A}.json`, validCert());
    write(`fleet-pre-${SHA_A}-copy.json`, validCert());
    const result = gateCertificateStore({ dir, headSha: SHA_A, now: NOW });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('DUPLICATE_CERTIFICATE'));
  } finally {
    cleanup();
  }
});

test('self-certified certificate blocks when certifier equals PR head author', () => {
  const { dir, write, cleanup } = fixtures();
  try {
    write(`fleet-pre-${SHA_A}.json`, validCert({ certifier: 'the-builder' }));
    const result = gateCertificateStore({
      dir,
      headSha: SHA_A,
      now: NOW,
      certifierMustNotEqual: 'the-builder',
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('SELF_CERTIFIED'));
  } finally {
    cleanup();
  }
});

test('base SHA mismatch blocks', () => {
  const { dir, write, cleanup } = fixtures();
  try {
    write(`fleet-pre-${SHA_A}.json`, validCert({ baseSha: SHA_A }));
    const result = gateCertificateStore({ dir, headSha: SHA_A, baseSha: SHA_B, now: NOW });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('BASE_SHA_MISMATCH'));
  } finally {
    cleanup();
  }
});

test('invalid certificate id blocks', () => {
  const { dir, write, cleanup } = fixtures();
  try {
    write(`fleet-pre-${SHA_A}.json`, validCert({ certificateId: 'short' }));
    const result = gateCertificateStore({ dir, headSha: SHA_A, now: NOW });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('INVALID_CERTIFICATE_ID'));
  } finally {
    cleanup();
  }
});

test('unparseable certificate blocks', () => {
  const { dir, write, cleanup } = fixtures();
  try {
    write('fleet-pre-junk.json', 'not json{');
    const result = gateCertificateStore({ dir, headSha: SHA_A, now: NOW });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.startsWith('UNPARSEABLE_CERTIFICATE')));
  } finally {
    cleanup();
  }
});

test('exactly one valid Fleet PRE READY certificate for the exact head passes', () => {
  const { dir, write, cleanup } = fixtures();
  try {
    write(`fleet-pre-${SHA_A}.json`, validCert());
    const result = gateCertificateStore({
      dir,
      headSha: SHA_A,
      baseSha: SHA_B,
      now: NOW,
      certifierMustNotEqual: 'the-builder',
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.certificate.certificateId, 'fleet-pre-cert-20260916-0001');
  } finally {
    cleanup();
  }
});

test('validateCertificate rejects non-object certificates', () => {
  const result = validateCertificate({ headSha: SHA_A, cert: null, now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('MISSING_CERTIFICATE'));
});

test('merge-chain gate is wired into CI with the exact head SHA', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.ok(workflow.includes('fleet-pre-cert'));
  assert.ok(workflow.includes('scripts/check-fleet-pre-certificate.js'));
  assert.ok(workflow.includes('github.event.pull_request.head.sha'));
  assert.ok(workflow.includes('github.event.pull_request.base.sha'));
  assert.ok(workflow.includes('github.event.pull_request.head.user.login'));
});

test('CLI gate exits 1 with BLOCKED on a missing certificate and 0 on a valid one', () => {
  const { dir, write, cleanup } = fixtures();
  try {
    const missing = spawnSync(
      process.execPath,
      [gateScript, '--head-sha', SHA_A, '--cert-dir', dir],
      { encoding: 'utf8' },
    );
    assert.equal(missing.status, 1);
    assert.ok(missing.stderr.includes('MISSING_CERTIFICATE'));

    write(
      `fleet-pre-${SHA_A}.json`,
      validCert({ certifiedAt: new Date(Date.now() - 5000).toISOString() }),
    );
    const good = spawnSync(
      process.execPath,
      [
        gateScript,
        '--head-sha',
        SHA_A,
        '--base-sha',
        SHA_B,
        '--cert-dir',
        dir,
        '--max-age-seconds',
        '3600',
        '--certifier-must-not-equal',
        'the-builder',
      ],
      { encoding: 'utf8' },
    );
    assert.equal(good.status, 0);
    assert.ok(good.stdout.includes('READY_FOR_OCEAN certificate'));
  } finally {
    cleanup();
  }
});

test('CLI gate rejects an invalid --head-sha argument', () => {
  const bad = spawnSync(process.execPath, [gateScript, '--head-sha', 'not-a-sha'], {
    encoding: 'utf8',
  });
  assert.equal(bad.status, 2);
  assert.ok(bad.stderr.includes('--head-sha <40-hex> is required'));
});