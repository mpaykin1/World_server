'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const policy = require('../data/supabase-owner-migration-20261016.json');

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const BINARIES = new Set(['psql', 'pg_dump', 'pg_restore']);
const FORBIDDEN_PARAMETERS = new Set(['host', 'hostaddr', 'port', 'user', 'password', 'dbname', 'options', 'service', 'sslpassword', 'sslcert', 'sslkey']);

function connection(which, env = process.env) {
  if (!['source', 'target'].includes(which)) throw new Error('Unknown database role');
  const name = 'WS_' + which.toUpperCase() + '_DATABASE_URL';
  const value = env[name];
  if (!value || /[\r\n\0]/.test(value)) throw new Error(name + ' is missing or invalid');
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(name + ' must be a Postgres URI'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname.slice(1)) {
    throw new Error(name + ' must identify a Postgres host and database');
  }
  for (const key of parsed.searchParams.keys()) {
    if (FORBIDDEN_PARAMETERS.has(key.toLowerCase())) throw new Error(name + ' contains an ambiguous connection override');
    if (!['sslmode', 'sslrootcert'].includes(key)) throw new Error(name + ' contains an unsupported connection option');
  }
  const scope = env.WS_MIGRATION_SCOPE || 'LIVE';
  if (!['LIVE', 'LOCAL_FIXTURE'].includes(scope)) throw new Error('Unknown migration scope');
  const local = LOOPBACK.has(parsed.hostname);
  const projectRef = policy[which].project_ref;
  if (scope === 'LOCAL_FIXTURE') {
    if (!local || parsed.password || !/^\/ws_migration_fixture_[a-z0-9_]+$/.test(parsed.pathname)) {
      throw new Error('LOCAL_FIXTURE requires a password-free loopback fixture database');
    }
    parsed.searchParams.set('sslmode', 'disable');
    parsed.searchParams.delete('sslrootcert');
  } else {
    const direct = parsed.hostname === 'db.' + projectRef + '.supabase.co';
    const pooler = /\.pooler\.supabase\.com$/.test(parsed.hostname) && decodeURIComponent(parsed.username).endsWith('.' + projectRef);
    if (!direct && !pooler) throw new Error(name + ' does not attest the configured ' + which + ' project');
    // URI parameters override environment defaults, so replace rather than
    // merely set PGSSLMODE. Preserve certificate and hostname verification.
    parsed.searchParams.set('sslmode', 'verify-full');
    parsed.searchParams.set('sslrootcert', env.WS_PG_SSLROOTCERT || env.SSL_CERT_FILE || '/etc/ssl/certs/ca-certificates.crt');
    if (parsed.port === '6543') throw new Error('Use a direct or session-pooler connection, not transaction pooling');
  }
  return Object.freeze({ role: which, scope, project_ref: scope === 'LIVE' ? projectRef : null, dsn: parsed.toString() });
}

function pgEnvironment(conn) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^PG/.test(key)) delete env[key];
  Object.assign(env, {
    PGCONNECT_TIMEOUT: '15',
    PGGSSENCMODE: 'disable',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=2000',
    PGAPPNAME: 'world-server-migration-read-only'
  });
  if (conn) {
    // libpq does not expand a URI supplied through PGDATABASE alone. Split
    // the validated URI into private variables instead of exposing it in argv.
    const uri = new URL(conn.dsn);
    Object.assign(env, {
      PGHOST: uri.hostname.replace(/^\[|\]$/g, ''), PGPORT: uri.port || '5432',
      PGDATABASE: decodeURIComponent(uri.pathname.slice(1)),
      PGSSLMODE: uri.searchParams.get('sslmode')
    });
    if (uri.username) env.PGUSER = decodeURIComponent(uri.username);
    if (uri.password) env.PGPASSWORD = decodeURIComponent(uri.password);
    if (uri.searchParams.has('sslrootcert')) env.PGSSLROOTCERT = uri.searchParams.get('sslrootcert');
  }
  return env;
}

function pgBinary(binary) {
  return process.env.WS_PG_BIN_DIR ? path.join(process.env.WS_PG_BIN_DIR, binary) : binary;
}

function execPg(binary, args, conn, options = {}) {
  if (!BINARIES.has(binary) || !Array.isArray(args) || args.some(arg => typeof arg !== 'string' || /\0/.test(arg))) {
    throw new Error('Unsupported PostgreSQL invocation');
  }
  if (args.some(arg => /^postgres(?:ql)?:\/\//i.test(arg) || /^--(?:dbname|host|username|password|no-password)(?:=|$)/.test(arg))) {
    throw new Error('Database connections belong in the private process environment');
  }
  if (binary === 'pg_restore' && !args.includes('--list') && !(args.length === 1 && args[0] === '--version')) throw new Error('This transport does not restore or modify any database');
  // Ignore ambient libpq routing/service overrides. Use only the validated
  // DSN, trust root and noninteractive, bounded, read-only session settings.
  const result = (options.spawn || spawnSync)(pgBinary(binary), args, {
    env: pgEnvironment(conn), encoding: 'utf8', input: options.input,
    stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: options.maxBuffer || 32 * 1024 * 1024,
    timeout: options.timeout || (binary === 'pg_dump' ? 15 * 60 * 1000 : 150000)
  });
  // libpq/pg_dump diagnostics can contain passwords, SQL rows or endpoints.
  // Do not forward raw stdout/stderr on error, including spawn errors.
  if (result.error || result.status !== 0) {
    const reason = result.error?.code === 'ENOENT' ? 'not installed' : result.error?.code === 'ETIMEDOUT' ? 'timed out' : 'failed';
    throw new Error(binary + ' ' + reason + '; diagnostics suppressed to protect credentials');
  }
  return result.stdout || '';
}

function readSql(conn, statements, options = {}) {
  if (!Array.isArray(statements) || !statements.length) throw new Error('No read-only queries supplied');
  if (options.snapshot && !/^[0-9a-f-]+$/i.test(options.snapshot)) throw new Error('Invalid exported snapshot identifier');
  const sql = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n' +
    (options.snapshot ? "SET TRANSACTION SNAPSHOT '" + options.snapshot + "';\n" : '') +
    "SET LOCAL search_path=pg_catalog;\nSET LOCAL row_security=off;\nSET LOCAL TimeZone='UTC';\nSET LOCAL DateStyle='ISO,YMD';\nSET LOCAL IntervalStyle='iso_8601';\nSET LOCAL extra_float_digits=3;\nSET LOCAL bytea_output='hex';\n" + statements.join('\n') + '\nCOMMIT;\n';
  return execPg('psql', ['-X', '--no-psqlrc', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], conn, { ...options, input: sql });
}

function jsonQuery(conn, sql, options = {}) {
  const result = readSql(conn, [sql], options).trim();
  try { return JSON.parse(result); } catch { throw new Error('PostgreSQL returned invalid audit JSON'); }
}

function privateDirectory(directory, repositoryRoot) {
  const root = fs.realpathSync(repositoryRoot);
  const absolute = path.resolve(directory);
  // Resolve the existing ancestry before creating anything, then recheck to
  // prevent an ignored symlink from placing confidential artifacts in Git.
  let ancestor = absolute;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const resolved = path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, absolute));
  if (resolved === root || resolved.startsWith(root + path.sep)) throw new Error('Confidential output must be outside the checkout');
  fs.mkdirSync(absolute, { recursive: true, mode: 0o700 });
  const real = fs.realpathSync(absolute);
  if (real !== resolved || (fs.statSync(real).mode & 0o077)) throw new Error('Confidential output requires a private directory');
  return real;
}

async function withSnapshot(conn, callback) {
  const child = spawn(pgBinary('psql'), ['-X', '--no-psqlrc', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], {
    env: pgEnvironment(conn), stdio: ['pipe', 'pipe', 'pipe']
  });
  child.stderr.resume();
  child.stdin.on('error', () => {});
  let output = '';
  try {
    const snapshot = await new Promise((resolve, reject) => {
      const fail = () => { cleanup(); reject(new Error('Cannot export read-only database snapshot; diagnostics suppressed')); };
      const timer = setTimeout(fail, 20000);
      const cleanup = () => { clearTimeout(timer); child.off('error', fail); child.off('exit', fail); child.stdin.off('error', fail); };
      child.once('error', fail);
      child.once('exit', fail);
      child.stdin.once('error', fail);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', value => {
        output += value;
        if (output.length > 8192) { cleanup(); fail(); return; }
        if (!output.includes('\n')) return;
        try {
          const result = JSON.parse(output.trim());
          if (!/^[0-9a-f-]+$/i.test(result.exported_snapshot)) throw new Error('Invalid snapshot');
          cleanup(); resolve(result);
        } catch { cleanup(); fail(); }
      });
      child.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT json_build_object('exported_snapshot',pg_export_snapshot(),'postgres_snapshot',pg_current_snapshot()::text,'captured_at',transaction_timestamp(),'database',current_database());\n");
    });
    return await callback(snapshot);
  } finally {
    if (child.exitCode === null && child.stdin.writable) child.stdin.end('ROLLBACK;\n\\q\n');
    if (child.exitCode === null) await new Promise(resolve => {
      const timer = setTimeout(() => { child.kill('SIGTERM'); resolve(); }, 2000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}

module.exports = { connection, execPg, readSql, jsonQuery, privateDirectory, withSnapshot };
