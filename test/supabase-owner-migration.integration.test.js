'use strict';
// Opt-in real PostgreSQL17 rehearsal. All writes are to a disposable local
// fixture cluster; the migration CLI itself remains audit/archive-only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const transport = require('../lib/supabase-migration-postgres.cjs');
const policy = require('../data/supabase-owner-migration-20261016.json');

const repository = path.resolve(__dirname, '..');
const bin = process.env.WS_PG_BIN_DIR;
const required = ['psql', 'pg_dump', 'pg_restore', 'initdb', 'pg_ctl', 'postgres'];
const unavailable = !bin || required.some(name => !fs.existsSync(path.join(bin, name)));
const port = 55432;
const user = 'ws_fixture_admin';
const databases = {
  source: 'ws_migration_fixture_source', target: 'ws_migration_fixture_occupied',
  staging: 'ws_migration_fixture_staging'
};
const uri = database => `postgresql://${user}@127.0.0.1:${port}/${database}?sslmode=disable`;
const table = value => value.split('.').map(part => '"' + part + '"').join('.');

function environment(overrides = {}) {
  const result = { ...process.env };
  for (const key of Object.keys(result)) if (/^PG/.test(key)) delete result[key];
  return { ...result, WS_MIGRATION_SCOPE: 'LOCAL_FIXTURE', WS_PG_BIN_DIR: bin,
    WS_SOURCE_DATABASE_URL: uri(databases.source), WS_TARGET_DATABASE_URL: uri(databases.target), ...overrides };
}
function run(binary, args, options = {}) {
  const result = spawnSync(path.join(bin, binary), args, {
    env: environment(options.env), input: options.input, encoding: 'utf8',
    timeout: 120000, maxBuffer: 16 * 1024 * 1024
  });
  assert.equal(result.error, undefined, binary + ' must execute');
  assert.equal(result.status, 0, binary + ': ' + result.stderr);
  return result.stdout.trim();
}
function sql(database, input) {
  return run('psql', ['--dbname=' + uri(database), '-X', '-w', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input });
}
function cli(command, folder, label, expected = 0, overrides = {}) {
  const started = performance.now();
  const result = spawnSync(process.execPath, [path.join(repository, 'scripts/supabase-owner-migration.cjs'),
    command, '--output-dir', folder, '--label', label], {
    env: environment(overrides), encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024
  });
  assert.equal(result.error, undefined, 'CLI must execute');
  assert.equal(result.status, expected, command + ': ' + result.stderr);
  return { report: expected === 0 || command === 'verify' ? JSON.parse(result.stdout) : null,
    stderr: result.stderr, elapsed_ms: Math.round((performance.now() - started) * 100) / 100 };
}
function json(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function fixtureSql() {
  const definitions = policy.priority_tables.map(name => `CREATE TABLE ${table(name)}
    (id integer PRIMARY KEY,payload jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT '2026-10-16T00:00:00Z');
    INSERT INTO ${table(name)}(id,payload) VALUES(1,'{"label":"valuable","score":1}'),(2,'{"label":"negative-result","score":-1}');`);
  return `CREATE SCHEMA private; CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE SCHEMA cron; CREATE SCHEMA pgmq; CREATE SCHEMA history; CREATE SCHEMA extensions;
    CREATE EXTENSION pg_stat_statements WITH SCHEMA extensions;
    ${definitions.join('\n')}
    INSERT INTO public.voxel_worlds(id,payload)
      SELECT value,jsonb_build_object('label','valuable-'||(value%17),'score',value%5) FROM generate_series(3,2050) value;
    ALTER TABLE private.stories OWNER TO ws_fixture_owner;
    GRANT USAGE ON SCHEMA private TO ws_fixture_owner,ws_fixture_reader;
    GRANT SELECT ON public.voxel_worlds TO ws_fixture_reader;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ws_fixture_reader;
    CREATE FUNCTION private.fixture_read_story() RETURNS text LANGUAGE sql SECURITY DEFINER
      SET search_path=pg_catalog AS $$SELECT payload->>'label' FROM private.stories WHERE id=1$$;
    ALTER FUNCTION private.fixture_read_story() OWNER TO ws_fixture_owner;
    REVOKE ALL ON FUNCTION private.fixture_read_story() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION private.fixture_read_story() TO ws_fixture_reader;
    CREATE FUNCTION public.fixture_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;
    CREATE TRIGGER fixture_updated BEFORE UPDATE ON public.voxel_worlds FOR EACH ROW EXECUTE FUNCTION public.fixture_trigger();
    ALTER TABLE public.voxel_worlds ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_reader ON public.voxel_worlds FOR SELECT TO ws_fixture_reader USING(id>0);
    CREATE INDEX fixture_payload_a ON public.voxel_worlds((payload->>'label'));
    CREATE INDEX fixture_payload_b ON public.voxel_worlds((payload->>'label'));
    CREATE TABLE history.learning_results(id integer PRIMARY KEY,outcome text,evidence jsonb);
    INSERT INTO history.learning_results VALUES(1,'OWNER_PENDING','{"improvement":2}'),(2,'OWNER_PENDING','{"error":"fixture"}');
    CREATE TABLE private.quality_runtime_scores(id bigint,score integer);
    INSERT INTO private.quality_runtime_scores SELECT value,value%5 FROM generate_series(1,1000) value;
    CREATE TABLE auth.users(id integer,fixture_secret text);
    INSERT INTO auth.users VALUES(1,'PRIVATE_FIXTURE_AUTH_SENTINEL');
    CREATE TABLE auth.sessions(id integer,fixture_secret text);
    INSERT INTO auth.sessions VALUES(1,'PRIVATE_FIXTURE_SESSION_SENTINEL');
    CREATE TABLE storage.objects(id integer,fixture_secret text);
    INSERT INTO storage.objects VALUES(1,'PRIVATE_FIXTURE_STORAGE_SENTINEL');
    CREATE TABLE cron.job(jobid bigint,jobname text,schedule text,active boolean,command text,database text,username text,nodename text,nodeport integer);
    INSERT INTO cron.job VALUES(1,'first','* * * * *',true,'SELECT PRIVATE_FIXTURE_COMMAND_SENTINEL','fixture','fixture','localhost',5432),
      (2,'second','* * * * *',true,'SELECT PRIVATE_FIXTURE_COMMAND_SENTINEL','fixture','fixture','localhost',5432);
    CREATE TABLE cron.job_run_details(jobid bigint,status text,start_time timestamptz,end_time timestamptz,command text,return_message text);
    INSERT INTO cron.job_run_details VALUES(1,'failed','2026-10-16T00:00:00Z','2026-10-16T00:00:02Z','PRIVATE_FIXTURE_COMMAND_SENTINEL','PRIVATE_FIXTURE_ERROR_SENTINEL');
    CREATE TABLE pgmq.meta(queue_name text,is_partitioned boolean,is_unlogged boolean,created_at timestamptz);
    INSERT INTO pgmq.meta VALUES('work',false,false,'2026-10-16T00:00:00Z');
    CREATE TABLE pgmq.q_work(msg_id bigint,message jsonb); INSERT INTO pgmq.q_work VALUES(1,'{"fixture":"PRIVATE_FIXTURE_QUEUE_SENTINEL"}');
    CREATE TABLE pgmq.a_work(msg_id bigint,message jsonb);
    CREATE TABLE private.partitioned_history(id integer,payload jsonb) PARTITION BY RANGE(id);
    CREATE TABLE private.partitioned_history_first PARTITION OF private.partitioned_history FOR VALUES FROM(0) TO(100);
    INSERT INTO private.partitioned_history VALUES(1,'{"retained":true}');
    CREATE VIEW private.fixture_view AS SELECT id,payload FROM public.voxel_worlds;
    CREATE SEQUENCE private.fixture_sequence;
    CREATE AGGREGATE public.fixture_sum(integer)(SFUNC=int4pl,STYPE=integer,INITCOND='0');
    GRANT USAGE ON SCHEMA public,private TO ws_fixture_rls_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA public,private TO ws_fixture_rls_reader;`;
}
function rowDigest(database) {
  const relations = JSON.parse(sql(database, `SELECT json_agg(format('%I.%I',n.nspname,c.relname) ORDER BY n.nspname,c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN('public','private','auth','storage','cron','pgmq','history') AND c.relkind='r';`));
  return relations.map(relation => sql(database, `SELECT '${relation}',count(*),md5(COALESCE(string_agg(to_jsonb(r)::text,'' ORDER BY to_jsonb(r)::text),'')) FROM ${relation} r;`));
}
function restoredContracts(database) {
  return JSON.parse(sql(database, `SELECT json_build_object(
    'function_owner',(SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='private.fixture_read_story()'::regprocedure),
    'security_definer',(SELECT prosecdef FROM pg_proc WHERE oid='private.fixture_read_story()'::regprocedure),
    'table_owner',(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='private.stories'::regclass),
    'reader_select',has_table_privilege('ws_fixture_reader','public.voxel_worlds','SELECT'),
    'reader_execute',has_function_privilege('ws_fixture_reader','private.fixture_read_story()','EXECUTE'),
    'default_acl',(SELECT count(*) FROM pg_default_acl),
    'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.voxel_worlds'::regclass),
    'policies',(SELECT count(*) FROM pg_policy WHERE polrelid='public.voxel_worlds'::regclass));`));
}

test('PostgreSQL17 full archive and read-only migration CLI rehearse against isolated local fixtures', {
  skip: unavailable ? 'Set WS_PG_BIN_DIR to PostgreSQL17 client/server binaries for the local fixture rehearsal' : false,
  timeout: 180000
}, async t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-migration-integration-'));
  const data = path.join(folder, 'cluster'), socket = path.join(folder, 'socket');
  const archives = path.join(folder, 'archives');
  fs.mkdirSync(socket, { mode: 0o700 }); fs.mkdirSync(archives, { mode: 0o700 });
  let running = false;
  t.after(() => {
    if (running) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    fs.rmSync(folder, { recursive: true, force: true });
  });
  for (const name of required) assert.match(run(name, ['--version']), /\b17\.\d+\b/);
  run('initdb', ['-D', data, '-U', user, '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', path.join(folder, 'postgres.log'), '-w', 'start', '-o',
    `-h 127.0.0.1 -p ${port} -k ${socket} -c shared_preload_libraries=pg_stat_statements`]);
  running = true;
  sql('postgres', 'CREATE ROLE ws_fixture_owner NOLOGIN; CREATE ROLE ws_fixture_reader NOLOGIN; CREATE ROLE ws_fixture_rls_reader LOGIN;');
  for (const database of Object.values(databases)) {
    assert.match(database, /^ws_migration_fixture_[a-z0-9_]+$/);
    sql('postgres', `CREATE DATABASE ${database} TEMPLATE template0;`);
  }
  sql(databases.source, fixtureSql());
  sql(databases.target, `CREATE TABLE public.occupied_target_history(id integer PRIMARY KEY,payload text);
    INSERT INTO public.occupied_target_history VALUES(1,'must remain retained');`);
  const sourceBefore = rowDigest(databases.source), targetBefore = rowDigest(databases.target);
  const metrics = { scope: 'LOCAL_FIXTURE', owner_verdict: 'PENDING', live_migration: 'NOT_RUN', phases_ms: {} };

  await t.test('audits all optional fixture catalogs without reading protected values or mutating rows', () => {
    for (const role of ['source', 'target']) {
      const result = cli('audit-' + role, archives, role + '-audit');
      metrics.phases_ms['audit_' + role] = result.elapsed_ms;
      assert.equal(result.report.collection_complete, true);
      const audit = json(result.report.file);
      assert.equal(audit.scope, 'LOCAL_FIXTURE'); assert.equal(audit.project_ref, null);
      assert.equal(audit.owner_verdict, 'PENDING');
      assert.ok(Object.values(audit.sections).every(section => section.status === 'COLLECTED'));
      assert.doesNotMatch(JSON.stringify(audit), /PRIVATE_FIXTURE_/);
      if (role === 'source') {
        for (const section of ['cron_jobs','cron_history','pgmq_metadata','protected_counts','queue_counts','statement_statistics']) assert.ok(audit.sections[section], section);
        assert.equal(audit.sections.cron_jobs.data.filter(job => job.exact_duplicate_candidate).length, 2);
        assert.equal(audit.sections.indexes.data.filter(index => index.name.startsWith('fixture_payload_') && index.exact_duplicate_candidate).length, 2);
        assert.ok(audit.sections.indexes.data.every(index => index.automatic_removal_authorized === false));
        metrics.source_inventory_sections = Object.keys(audit.sections).length;
      }
    }
    assert.deepEqual(rowDigest(databases.source), sourceBefore);
    assert.deepEqual(rowDigest(databases.target), targetBefore);
  });
  await t.test('full source and occupied target are archived before restore, with TOC/digest checks', () => {
    for (const role of ['source', 'target']) {
      const result = cli('backup-' + role, archives, role + '-full');
      metrics.phases_ms['backup_' + role] = result.elapsed_ms;
      const manifest = json(result.report.manifest_file);
      assert.deepEqual(manifest.contract, { format: 'custom', scope: 'whole_database', schemas: 'all', data: 'all', ownership: 'preserved', privileges: 'preserved', exclusions: 'none' });
      assert.match(manifest.metadata.snapshot, /^[0-9A-F-]+$/i);
      assert.equal(manifest.metadata.scope, 'LOCAL_FIXTURE');
      assert.equal(fs.statSync(path.join(archives, role + '-full.dump')).mode & 0o777, 0o600);
      assert.equal(cli('verify-archive', archives, role + '-full').report.restore_rehearsal, 'NOT_RUN');
      metrics[role + '_archive_bytes'] = manifest.archive.bytes;
    }
    const toc = fs.readFileSync(path.join(archives, 'source-full.toc'), 'utf8');
    for (const pattern of [/TABLE auth users/, /TABLE storage objects/, /TABLE cron job/, /TABLE history learning_results/, /TABLE DATA private quality_runtime_scores/, /FUNCTION private fixture_read_story\(\) ws_fixture_owner/, /ACL public TABLE voxel_worlds/]) assert.match(toc, pattern);
    assert.match(fs.readFileSync(path.join(archives, 'target-full.toc'), 'utf8'), /TABLE DATA public occupied_target_history/);
    assert.deepEqual(rowDigest(databases.source), sourceBefore);
    assert.deepEqual(rowDigest(databases.target), targetBefore);
  });
  await t.test('direct restore into fresh staging preserves all rows, grants and SECURITY DEFINER owners', () => {
    assert.equal(sql(databases.staging, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r';"), '0');
    const started = performance.now();
    run('pg_restore', ['--exit-on-error', '--dbname=' + uri(databases.staging), path.join(archives, 'source-full.dump')]);
    metrics.phases_ms.restore_fresh_staging = Math.round((performance.now() - started) * 100) / 100;
    assert.deepEqual(rowDigest(databases.staging), sourceBefore);
    assert.deepEqual(restoredContracts(databases.staging), restoredContracts(databases.source));
    const contracts = restoredContracts(databases.staging);
    assert.equal(contracts.function_owner, 'ws_fixture_owner'); assert.equal(contracts.security_definer, true);
    assert.equal(contracts.reader_select, true); assert.equal(contracts.reader_execute, true);
    assert.ok(contracts.default_acl > 0); assert.equal(contracts.rls, true); assert.equal(contracts.policies, 1);
    assert.equal(sql(databases.staging, 'SET ROLE ws_fixture_reader; SELECT private.fixture_read_story();'), 'valuable');
    const result = cli('verify', archives, 'identical', 0, { WS_TARGET_DATABASE_URL: uri(databases.staging) });
    assert.equal(result.report.checked, policy.priority_tables.length); assert.equal(result.report.mismatches, 0);
    assert.ok(json(result.report.file).comparisons.every(comparison => comparison.status === 'IDENTICAL'));
    metrics.priority_tables_identical = result.report.checked;
    assert.deepEqual(rowDigest(databases.target), targetBefore);
  });
  await t.test('known fixture duplicate index removal on staging measures storage savings without row/query changes', () => {
    const size = () => Number(sql(databases.staging, "SELECT pg_total_relation_size('public.voxel_worlds');"));
    const query = "SELECT id FROM public.voxel_worlds WHERE payload->>'label'='valuable-1' ORDER BY id;";
    const beforeBytes = size(), beforeRows = rowDigest(databases.staging);
    const beforeResult = sql(databases.staging, query);
    sql(databases.staging, 'DROP INDEX public.fixture_payload_b;');
    const afterBytes = size();
    assert.ok(afterBytes < beforeBytes, 'removing the known local duplicate must reclaim index bytes');
    assert.deepEqual(rowDigest(databases.staging), beforeRows);
    assert.equal(sql(databases.staging, query), beforeResult);
    const plan = sql(databases.staging, "SET enable_seqscan=off; EXPLAIN(FORMAT JSON) " + query);
    assert.match(plan, /fixture_payload_a/);
    const comparison = cli('verify', archives, 'optimized-identical', 0, { WS_TARGET_DATABASE_URL: uri(databases.staging) });
    assert.equal(comparison.report.mismatches, 0);
    assert.equal(comparison.report.checked, policy.priority_tables.length);
    assert.deepEqual(rowDigest(databases.source), sourceBefore);
    metrics.fixture_only_duplicate_index = { relation_bytes_before: beforeBytes,
      relation_bytes_after: afterBytes, bytes_reclaimed: beforeBytes - afterBytes,
      matched_query_rows: beforeResult.split('\n').length,
      data_fingerprints_identical: comparison.report.checked, live_world_improvement: 'NOT_ESTABLISHED' };
  });
  await t.test('RLS-hidden rows cannot be reported as identical empty data', () => {
    const rlsUri = database => uri(database).replace(user + '@', 'ws_fixture_rls_reader@');
    assert.equal(run('psql', ['--dbname=' + rlsUri(databases.source), '-X', '-w', '-q', '-t', '-A'], {
      input: 'SELECT count(*) FROM public.voxel_worlds;'
    }), '0');
    const comparison = cli('verify', archives, 'rls-hidden', 1, {
      WS_SOURCE_DATABASE_URL: rlsUri(databases.source), WS_TARGET_DATABASE_URL: rlsUri(databases.staging)
    });
    assert.equal(json(comparison.report.file).comparisons.find(row => row.table === 'public.voxel_worlds').status, 'UNAVAILABLE');
  });
  await t.test('same-count changed rows fail fingerprints and the transport rejects INSERT', () => {
    sql(databases.staging, `UPDATE public.voxel_worlds SET payload='{"label":"changed","score":1}' WHERE id=1;`);
    const result = cli('verify', archives, 'changed-row', 1, { WS_TARGET_DATABASE_URL: uri(databases.staging) });
    assert.equal(result.report.checked, policy.priority_tables.length); assert.equal(result.report.mismatches, 1);
    assert.equal(json(result.report.file).comparisons.find(row => row.table === 'public.voxel_worlds').status, 'DIFFERENT');
    const conn = transport.connection('source', environment());
    assert.throws(() => transport.readSql(conn, ["INSERT INTO public.voxel_worlds(id,payload) VALUES(3,'{}');"]), /psql failed/);
    assert.deepEqual(rowDigest(databases.source), sourceBefore);
  });
  await t.test('existing labels and tampered archives/TOCs cannot verify successfully', () => {
    const original = fs.readFileSync(path.join(archives, 'source-full.dump'));
    assert.match(cli('backup-source', archives, 'source-full', 1).stderr, /already exists/);
    assert.deepEqual(fs.readFileSync(path.join(archives, 'source-full.dump')), original);
    for (const name of ['tampered-archive', 'tampered-toc']) {
      const manifest = json(path.join(archives, 'source-full.manifest.json')); manifest.label = name;
      for (const extension of ['dump','toc']) fs.writeFileSync(path.join(archives, name + '.' + extension), fs.readFileSync(path.join(archives, 'source-full.' + extension)), { mode: 0o600 });
      if (name === 'tampered-archive') fs.appendFileSync(path.join(archives, name + '.dump'), 'corruption');
      else {
        const tocFile = path.join(archives, name + '.toc');
        fs.appendFileSync(tocFile, '\n999999; 0 0 TABLE public invented ws_fixture_owner\n');
        const bytes = fs.readFileSync(tocFile);
        manifest.toc = { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
      }
      fs.writeFileSync(path.join(archives, name + '.manifest.json'), JSON.stringify(manifest), { mode: 0o600 });
      assert.match(cli('verify-archive', archives, name, 1).stderr, name === 'tampered-archive' ? /digest mismatch/ : /TOC changed/);
    }
  });
  t.diagnostic('Sanitized fixture measurements: ' + JSON.stringify(metrics));
});
