'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { backupArchive, verifyArchive } = require('../lib/supabase-migration-archive.cjs');

const listing = '; Archive created at fixture time\n1; 2615 2200 SCHEMA - public postgres\n2; 0 0 ACL public TABLE accounts postgres\n';
const body = Buffer.from('PGDMP\x01\x10\x00 fixture including auth storage cron queues and grants');
function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-archive-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const options = {
    directory: path.join(root, 'private'), label: 'source-full',
    repositoryRoot: path.resolve(__dirname, '..'),
    metadata: { label: 'source', toolVersion: 'pg_dump 17.6', scope: 'full', snapshot: 'read-only backup' },
    runPg: async (binary, args, executionOptions) => {
      calls.push({ binary, args, executionOptions });
      if (binary === 'pg_dump') {
        fs.writeFileSync(args.find(arg => arg.startsWith('--file=')).slice(7), body);
        return '';
      }
      assert.equal(binary, 'pg_restore');
      assert.equal(args[0], '--list');
      return { stdout: listing };
    },
    ...overrides
  };
  return { root, options, calls };
}
function rewriteManifest(result, change) {
  const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
  change(manifest);
  fs.writeFileSync(result.manifestPath, JSON.stringify(manifest));
}

test('full archive preserves every schema, ownership and grants with durable private evidence', async t => {
  const { options, calls } = fixture(t);
  const result = await backupArchive(options);
  assert.deepEqual(calls.map(call => call.binary), ['pg_dump', 'pg_restore']);
  assert.deepEqual(calls[0].args, ['--format=custom', '--file=' + result.archivePath]);
  assert.deepEqual(calls[0].executionOptions, { capture: true });
  assert.deepEqual(calls[1].args, ['--list', result.archivePath]);
  assert.equal(result.manifest.contract.schemas, 'all');
  assert.equal(result.manifest.contract.data, 'all');
  assert.equal(result.manifest.contract.ownership, 'preserved');
  assert.equal(result.manifest.contract.privileges, 'preserved');
  assert.equal(result.manifest.contract.exclusions, 'none');
  assert.deepEqual(result.manifest.restore_rehearsal, { status: 'NOT_RUN' });
  assert.equal(fs.statSync(options.directory).mode & 0o777, 0o700);
  for (const name of ['source-full.dump', 'source-full.toc', 'source-full.manifest.json']) {
    assert.equal(fs.statSync(path.join(options.directory, name)).mode & 0o777, 0o600);
  }
  assert.equal(result.manifest.archive.sha256, crypto.createHash('sha256').update(body).digest('hex'));
  const verified = await verifyArchive(options);
  assert.deepEqual(verified.manifest, result.manifest);
  assert.equal(calls.filter(call => call.binary === 'pg_restore').length, 2);
});

test('target label uses the same complete backup contract', async t => {
  const { options } = fixture(t, { label: 'target-before-transfer', metadata: { label: 'target' } });
  const result = await backupArchive(options);
  assert.match(result.archivePath, /target-before-transfer\.dump$/);
  assert.equal(result.manifest.contract.scope, 'whole_database');
});

test('existing dump, TOC or manifest cannot be replaced', async t => {
  for (const suffix of ['dump', 'toc', 'manifest.json']) {
    const { options, calls } = fixture(t);
    fs.mkdirSync(options.directory, { mode: 0o700 });
    const existing = path.join(options.directory, options.label + '.' + suffix);
    fs.writeFileSync(existing, 'prior evidence', { mode: 0o600 });
    await assert.rejects(backupArchive(options), /already exists/);
    assert.equal(fs.readFileSync(existing, 'utf8'), 'prior evidence');
    assert.equal(calls.length, 0);
  }
});

test('partial dump failure keeps partial evidence without a success manifest or secret diagnostics', async t => {
  const { options } = fixture(t);
  options.runPg = async (binary, args) => {
    fs.writeFileSync(args[1].slice(7), 'partial');
    throw new Error('postgresql://private-user:private-password@private-host/private-db');
  };
  await assert.rejects(backupArchive(options), error => {
    assert.match(error.message, /pg_dump failed/);
    assert.doesNotMatch(error.message, /private-user|private-password|private-host|postgresql:/);
    return true;
  });
  assert.equal(fs.readFileSync(path.join(options.directory, 'source-full.dump'), 'utf8'), 'partial');
  assert.equal(fs.existsSync(path.join(options.directory, 'source-full.manifest.json')), false);
  await assert.rejects(backupArchive(options), /already exists/);
});

test('empty dump and bad custom archive signature cannot produce a manifest', async t => {
  for (const bytes of ['', 'not a PostgreSQL archive']) {
    const { options } = fixture(t);
    options.runPg = async (binary, args) => {
      fs.writeFileSync(args[1].slice(7), bytes);
      return '';
    };
    await assert.rejects(backupArchive(options), /empty|signature/);
    assert.equal(fs.existsSync(path.join(options.directory, 'source-full.manifest.json')), false);
  }
});

test('failed or invalid TOC listing never counts as a completed backup', async t => {
  for (const output of ['', '; comments only', 'not a TOC']) {
    const { options } = fixture(t);
    const original = options.runPg;
    options.runPg = async (binary, ...rest) => binary === 'pg_restore' ? output : original(binary, ...rest);
    await assert.rejects(backupArchive(options), /valid object listing/);
    assert.equal(fs.existsSync(path.join(options.directory, 'source-full.manifest.json')), false);
  }
});

test('verify rehashes archive contents and checks the archive signature', async t => {
  for (const position of [0, body.length - 1]) {
    const { options, calls } = fixture(t);
    const result = await backupArchive(options);
    const altered = Buffer.from(body);
    altered[position] ^= 1;
    fs.writeFileSync(result.archivePath, altered);
    await assert.rejects(verifyArchive(options), /signature|digest mismatch/);
    assert.equal(calls.length, 2, 'tampered archive is rejected before another tool invocation');
  }
});

test('verify rejects stored TOC tampering and reruns listing at use time', async t => {
  const first = fixture(t);
  await backupArchive(first.options);
  fs.appendFileSync(path.join(first.options.directory, 'source-full.toc'), '3; 0 0 TABLE public forged postgres\n');
  await assert.rejects(verifyArchive(first.options), /digest mismatch/);
  const second = fixture(t);
  await backupArchive(second.options);
  second.options.runPg = async () => listing.replace('accounts', 'different');
  await assert.rejects(verifyArchive(second.options), /TOC changed/);
});

test('verify tolerates tool comment changes without treating TOC listing as a restore', async t => {
  const { options } = fixture(t);
  await backupArchive(options);
  options.runPg = async () => listing.replace('fixture time', 'new tool comment');
  const result = await verifyArchive(options);
  assert.deepEqual(result.manifest.restore_rehearsal, { status: 'NOT_RUN' });
});

test('verify rejects forged selective scope or restore success in a manifest', async t => {
  for (const change of [manifest => { manifest.contract.data = 'selected'; },
    manifest => { manifest.restore_rehearsal.status = 'PASS'; },
    manifest => { manifest.archive.sha256 = 'invalid'; }]) {
    const { options } = fixture(t);
    const result = await backupArchive(options);
    rewriteManifest(result, change);
    await assert.rejects(verifyArchive(options), /manifest/);
  }
});

test('unsafe labels, checkout paths and symlink paths are rejected before dumping', async t => {
  for (const label of ['../escape', 'source/full', '', '-option', 'a'.repeat(65)]) {
    const { options, calls } = fixture(t, { label });
    await assert.rejects(backupArchive(options), /label/);
    assert.equal(calls.length, 0);
  }
  const { root, options, calls } = fixture(t);
  await assert.rejects(backupArchive({ ...options, directory: path.join(options.repositoryRoot, 'archives') }), /outside the checkout/);
  fs.mkdirSync(path.join(root, 'real'), { mode: 0o700 });
  fs.symlinkSync(path.join(root, 'real'), path.join(root, 'alias'));
  await assert.rejects(backupArchive({ ...options, directory: path.join(root, 'alias', 'archives') }), /symlink/);
  fs.symlinkSync(options.repositoryRoot, path.join(root, 'checkout-alias'));
  await assert.rejects(backupArchive({ ...options, directory: path.join(root, 'checkout-alias', 'archives') }), /symlink/);
  assert.equal(calls.length, 0);
});

test('archive directory and every evidence file must remain private', async t => {
  const insecure = fixture(t);
  fs.mkdirSync(insecure.options.directory, { mode: 0o755 });
  fs.chmodSync(insecure.options.directory, 0o755);
  await assert.rejects(backupArchive(insecure.options), /private/);
  for (const suffix of ['dump', 'toc', 'manifest.json']) {
    const { options } = fixture(t);
    await backupArchive(options);
    fs.chmodSync(path.join(options.directory, options.label + '.' + suffix), 0o644);
    await assert.rejects(verifyArchive(options), /private/);
  }
});

test('verification rejects symlinked and hard-linked evidence', async t => {
  for (const kind of ['symlink', 'hardlink']) {
    const { root, options } = fixture(t);
    const result = await backupArchive(options);
    const original = path.join(root, 'original.dump');
    fs.renameSync(result.archivePath, original);
    if (kind === 'symlink') fs.symlinkSync(original, result.archivePath);
    else fs.linkSync(original, result.archivePath);
    await assert.rejects(verifyArchive(options), /ELOOP|private/);
  }
});

test('only bounded noncredential metadata strings are accepted', async t => {
  for (const metadata of [{ password: 'redacted' }, { snapshot: { nested: 'object' } },
    { scope: 'postgresql://user:password@host/db' }, { label: 'sb_secret_example' },
    { label: 'a\nsecond line' }, { label: 'a'.repeat(257) }]) {
    const { options, calls } = fixture(t, { metadata });
    await assert.rejects(backupArchive(options), /metadata/);
    assert.equal(calls.length, 0);
    assert.equal(fs.existsSync(options.directory), false);
  }
});
