'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { connection, execPg, readSql } = require('../lib/supabase-migration-postgres.cjs');

const source = 'postgres://postgres:confidential@db.iphfwxjuhsucvdyluink.supabase.co/postgres';
test('live connections attest the project and enforce certificate and hostname verification', () => {
  const c = connection('source', { WS_SOURCE_DATABASE_URL: source + '?sslmode=disable' });
  assert.equal(new URL(c.dsn).searchParams.get('sslmode'), 'verify-full');
  assert.ok(new URL(c.dsn).searchParams.get('sslrootcert'));
  assert.throws(() => connection('target', { WS_TARGET_DATABASE_URL: source }), /configured target/);
});
test('pooler identity is verified and transaction pooling is refused', () => {
  const uri = 'postgres://postgres.iphfwxjuhsucvdyluink:x@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
  assert.equal(connection('source', { WS_SOURCE_DATABASE_URL: uri }).project_ref, 'iphfwxjuhsucvdyluink');
  assert.throws(() => connection('source', { WS_SOURCE_DATABASE_URL: uri.replace('5432', '6543') }), /transaction pooling/);
});
test('ambiguous libpq overrides cannot redirect an attested connection', () => {
  for (const override of ['host=other', 'hostaddr=1.2.3.4', 'user=other', 'options=write', 'service=elsewhere']) {
    assert.throws(() => connection('source', { WS_SOURCE_DATABASE_URL: source + '?' + override }), /ambiguous/);
  }
});
test('fixture scope cannot reach real projects or password-bearing/non-fixture databases', () => {
  for (const uri of [source, 'postgres://agent@127.0.0.1/live', 'postgres://agent:x@localhost/ws_migration_fixture_source']) {
    assert.throws(() => connection('source', { WS_SOURCE_DATABASE_URL: uri, WS_MIGRATION_SCOPE: 'LOCAL_FIXTURE' }), /LOCAL_FIXTURE/);
  }
  const c = connection('source', { WS_SOURCE_DATABASE_URL: 'postgres://agent@127.0.0.1/ws_migration_fixture_source', WS_MIGRATION_SCOPE: 'LOCAL_FIXTURE' });
  assert.equal(c.project_ref, null);
});
test('read-only queries use a repeatable snapshot, no DSN argv and no inherited libpq override', () => {
  const c = connection('source', { WS_SOURCE_DATABASE_URL: source });
  const saved = process.env.PGHOST;
  process.env.PGHOST = 'untrusted-route';
  try {
    const result = readSql(c, ['SELECT 1;'], { spawn(binary, args, options) {
      assert.match(binary, /(?:^|[\\/])psql$/);
      assert.ok(!args.some(arg => arg.includes('confidential')));
      assert.equal(options.env.PGHOST, 'db.iphfwxjuhsucvdyluink.supabase.co');
      assert.equal(options.env.PGDATABASE, 'postgres');
      assert.equal(options.env.PGUSER, 'postgres');
      assert.equal(options.env.PGPASSWORD, 'confidential');
      assert.equal(options.env.PGSSLMODE, 'verify-full');
      assert.equal(options.env.PGGSSENCMODE, 'disable');
      assert.ok(options.env.PGOPTIONS.includes('default_transaction_read_only=on'));
      assert.ok(options.input.startsWith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;'));
      assert.ok(options.input.includes('SET LOCAL row_security=off;'));
      assert.ok(options.input.includes("SET LOCAL TimeZone='UTC';"));
      return { status: 0, stdout: '1\n' };
    } });
    assert.equal(result, '1\n');
  } finally { if (saved === undefined) delete process.env.PGHOST; else process.env.PGHOST = saved; }
});
test('errors never disclose credentials and restore mutations are unavailable', () => {
  assert.throws(() => execPg('psql', [], null, { spawn: () => ({ status: 1, stderr: source, error: new Error(source) }) }), error => !error.message.includes('confidential'));
  assert.throws(() => execPg('pg_restore', ['--clean', 'file.dump'], null), /does not restore/);
  assert.throws(() => execPg('pg_dump', ['--dbname=' + source], null), /private process environment/);
});
test('pg_restore version discovery remains read-only and available', () => {
  const output = execPg('pg_restore', ['--version'], null, { spawn: () => ({ status: 0, stdout: 'pg_restore (PostgreSQL) 17.11\n' }) });
  assert.match(output, /17\.11/);
});
