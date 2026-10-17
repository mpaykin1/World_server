#!/usr/bin/env node
'use strict';
// Audit and archive only. No live restore, exclusion, cleanup or cutover commands.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const pg = require('../lib/supabase-migration-postgres.cjs');
const inventory = require('../lib/supabase-migration-inventory.cjs');
const archives = require('../lib/supabase-migration-archive.cjs');
const evidence = require('../lib/supabase-migration-evidence.cjs');
const policy = require('../data/supabase-owner-migration-20261016.json');
const root = path.resolve(__dirname, '..');

function argumentsFor(argv) {
  const command = argv[0];
  const allowed = ['audit-source', 'audit-target', 'backup', 'backup-source', 'backup-target', 'verify', 'verify-archive', 'readiness', 'learning-summary'];
  if (!allowed.includes(command)) throw new Error('Use ' + allowed.join('|'));
  const options = {};
  for (let i = 1; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!['--output-dir', '--label', '--evidence-file', '--input-file'].includes(flag) || !argv[i + 1] || Object.hasOwn(options, flag)) {
      throw new Error('Invalid or repeated migration option');
    }
    options[flag] = argv[i + 1];
  }
  return { command, options };
}
function directory(options) {
  return pg.privateDirectory(options['--output-dir'] || process.env.WS_MIGRATION_ARCHIVE_DIR ||
    path.join(os.homedir(), '.local', 'share', 'WorldServerAI', 'archives', policy.migration_id), root);
}
function writeEvidence(folder, label, value) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$/.test(label)) throw new Error('Unsafe evidence label');
  const file = path.join(folder, label + '.json');
  const body = JSON.stringify(value, null, 2) + '\n';
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, body); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return { file, sha256: crypto.createHash('sha256').update(body).digest('hex') };
}
function toolchain() {
  const versions = {};
  for (const binary of ['psql', 'pg_dump', 'pg_restore']) {
    const value = pg.execPg(binary, ['--version'], null).trim();
    if (!/\b17\.\d+\b/.test(value)) throw new Error('PostgreSQL 17 client tools are required');
    versions[binary] = value;
  }
  return versions;
}
function section(name, query) {
  // Each catalog query runs in one consistent read-only transaction. A denied
  // optional catalog is recorded without aborting the remaining independent
  // sections or forwarding raw diagnostics (cron SQL may contain credentials).
  if (!/^[a-z_]+$/.test(name)) throw new Error('Unsafe inventory section');
  const expression = query.trim().replace(/;$/, '');
  return [
    'SAVEPOINT inventory_section;',
    '\\set ON_ERROR_STOP off',
    "SELECT jsonb_build_object('section','" + name + "','status','COLLECTED','data',(" + expression + '));',
    '\\if :ERROR',
    '\\set inventory_error_state :SQLSTATE',
    '\\set ON_ERROR_STOP on',
    'ROLLBACK TO SAVEPOINT inventory_section;',
    "SELECT jsonb_build_object('section','" + name + "','status','UNAVAILABLE','sqlstate', :'inventory_error_state');",
    '\\else', '\\set ON_ERROR_STOP on', '\\endif',
    'RELEASE SAVEPOINT inventory_section;'
  ].join('\n');
}
function collect(conn, queries, options = {}) {
  const provenance = "SELECT jsonb_build_object('section','provenance','status','COLLECTED','data',jsonb_build_object('postgres_snapshot',pg_current_snapshot()::text,'captured_at',transaction_timestamp(),'database_oid',(SELECT oid FROM pg_database WHERE datname=current_database()),'server_version_num',current_setting('server_version_num')::int));";
  const output = pg.readSql(conn, [provenance, ...Object.entries(queries).map(([name, query]) => section(name, query))], options);
  let results;
  try { results = output.trim().split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row)); }
  catch { throw new Error('Invalid catalog collection output'); }
  const sections = Object.fromEntries(results.map(row => [row.section, row]));
  for (const name of Object.keys(queries)) if (!sections[name]) throw new Error('Inventory query did not execute: ' + name);
  return { scope: conn.scope, project_ref: conn.project_ref, migration_id: policy.migration_id,
    snapshot_id: crypto.randomUUID(), captured: sections.provenance.data, sections,
    collection_complete: Object.values(sections).every(row => row.status === 'COLLECTED'),
    external_dependencies: 'NOT_AUDITED_BY_SQL_CATALOGS', owner_verdict: 'PENDING' };
}
async function audit(conn) {
  return pg.withSnapshot(conn, snapshot => {
    const options = { snapshot: snapshot.exported_snapshot };
    const capabilities = pg.jsonQuery(conn, inventory.CAPABILITY_SQL, options);
    if (Math.floor(capabilities.server_version_num / 10000) !== 17) throw new Error('Unexpected PostgreSQL server major version');
    const report = collect(conn, inventory.buildInventoryQueries(capabilities), options);
    report.exported_snapshot = snapshot.exported_snapshot;
    report.capabilities = capabilities;
    report.coverage = inventory.describeInventoryCoverage(capabilities);
    return report;
  });
}
function quotedTable(table) {
  if (!/^(public|private)\.[a-z0-9_]+$/.test(table)) throw new Error('Unsafe priority table');
  return table.split('.').map(part => '"' + part + '"').join('.');
}
function fingerprints(conn) {
  const queries = {};
  policy.priority_tables.forEach((table, i) => {
    const relation = quotedTable(table);
    // Stable JSONB field ordering and a sorted multiset preserve duplicates and
    // detect changed rows even when row counts happen to match.
    const rowHash = "encode(sha256(convert_to(to_jsonb(row_value)::text,'UTF8')),'hex')";
    queries['table_' + String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + i % 26)] =
      "SELECT jsonb_build_object('table','" + table + "','count',count(*),'sha256',encode(sha256(convert_to(COALESCE(string_agg(row_sha256,'' ORDER BY row_sha256 COLLATE \"C\"),''),'UTF8')),'hex'),'digest_method','CANONICAL_FULL_ROWS_SHA256') FROM (SELECT " +
      rowHash + ' AS row_sha256 FROM ' + relation + ' row_value) canonical_rows;';
  });
  return collect(conn, queries);
}
async function backup(conn, options, versions) {
  const folder = directory(options);
  const label = options['--label'] || conn.role + '-full-' + Date.now();
  // pg_dump imports the exact exported repeatable-read snapshot while its
  // exporter remains open. No second selective snapshot or pre-gate exclusions.
  const result = await pg.withSnapshot(conn, snapshot => archives.backupArchive({
    directory: folder, label, repositoryRoot: root,
    metadata: { scope: conn.scope, snapshot: snapshot.exported_snapshot, toolVersion: versions.pg_dump,
      project_ref: conn.project_ref || 'LOCAL_FIXTURE', migration_id: policy.migration_id },
    runPg: (binary, args) => pg.execPg(binary, binary === 'pg_dump'
      ? [...args, '--snapshot=' + snapshot.exported_snapshot] : args, binary === 'pg_dump' ? conn : null)
  }));
  console.log(JSON.stringify({ phase: conn.role + '_full_backup', scope: conn.scope,
    project_ref: conn.project_ref, manifest_file: result.manifestPath,
    bytes: result.manifest.archive.bytes, sha256: result.manifest.archive.sha256,
    restore_rehearsal: 'NOT_RUN', owner_verdict: 'PENDING' }, null, 2));
}
function loadJson(file) {
  if (!file) throw new Error('An evidence input file is required');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error('Cannot read evidence JSON'); }
}
async function main(argv = process.argv.slice(2)) {
  const { command, options } = argumentsFor(argv);
  if (command === 'readiness') {
    const result = evidence.compareMigrationEvidence(loadJson(options['--evidence-file']));
    console.log(JSON.stringify(result, null, 2));
    return result.status === 'READY_FOR_OWNER_REVIEW' ? 0 : 1;
  }
  if (command === 'learning-summary') {
    const result = evidence.buildLearningSummary(loadJson(options['--input-file']));
    const output = writeEvidence(directory(options), options['--label'] || 'learning-' + Date.now(), result);
    console.log(JSON.stringify({ phase: 'learning_summary', ...output, observation_count: result.observation_count, owner_verdict: 'PENDING' }));
    return 0;
  }
  if (command === 'verify-archive') {
    if (!options['--label']) throw new Error('--label is required');
    toolchain();
    const result = await archives.verifyArchive({ directory: directory(options), label: options['--label'],
      repositoryRoot: root, runPg: (binary, args) => pg.execPg(binary, args, null) });
    console.log(JSON.stringify({ phase: 'archive_integrity', sha256: result.manifest.archive.sha256, restore_rehearsal: 'NOT_RUN' }));
    return 0;
  }
  if (command === 'verify') {
    const source = pg.connection('source'), target = pg.connection('target');
    if (source.dsn === target.dsn) throw new Error('Source and target must be different databases');
    toolchain();
    const before = fingerprints(source), after = fingerprints(target);
    const a = Object.values(before.sections).filter(row => row.section !== 'provenance');
    const b = new Map(Object.values(after.sections).filter(row => row.section !== 'provenance').map(row => [row.section, row]));
    const comparisons = a.map((row, index) => {
      const other = b.get(row.section);
      return { table: row.data?.table || policy.priority_tables[index],
        status: row.status !== 'COLLECTED' || other?.status !== 'COLLECTED' ? 'UNAVAILABLE'
          : row.data.count === other.data.count && row.data.sha256 === other.data.sha256 ? 'IDENTICAL' : 'DIFFERENT' };
    });
    const report = { source: before, target: after, comparisons, owner_verdict: 'PENDING',
      readiness: 'NOT_ESTABLISHED', limitation: 'Snapshot identities are independent; verify archive/delta provenance and all functional contracts before cutover.' };
    const output = writeEvidence(directory(options), options['--label'] || 'compare-' + Date.now(), report);
    const mismatches = comparisons.filter(row => row.status !== 'IDENTICAL').length;
    console.log(JSON.stringify({ phase: 'data_fingerprints', ...output, checked: comparisons.length, mismatches, owner_verdict: 'PENDING', readiness: 'NOT_ESTABLISHED' }, null, 2));
    return mismatches ? 1 : 0;
  }
  const role = command.endsWith('target') ? 'target' : 'source';
  const conn = pg.connection(role);
  const versions = toolchain();
  if (command.startsWith('backup')) { await backup(conn, options, versions); return 0; }
  const report = await audit(conn);
  report.tool_versions = versions;
  const output = writeEvidence(directory(options), options['--label'] || role + '-audit-' + Date.now(), report);
  console.log(JSON.stringify({ phase: role + '_inventory', scope: conn.scope, ...output,
    sections: Object.keys(report.sections).length, collection_complete: report.collection_complete,
    external_dependencies: report.external_dependencies, owner_verdict: 'PENDING' }, null, 2));
  return report.collection_complete ? 0 : 1;
}
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(error => {
  console.error('MIGRATION_NOT_READY: ' + error.message); process.exitCode = 1;
});
module.exports = { main, argumentsFor, collect, audit, fingerprints };
