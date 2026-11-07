'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { CAPABILITY_SQL, buildInventoryQueries, describeInventoryCoverage } = require('../lib/supabase-migration-inventory.cjs');
const { connection } = require('../lib/supabase-migration-postgres.cjs');
const { collect, fingerprints } = require('../scripts/supabase-owner-migration.cjs');
const policy = require('../data/supabase-owner-migration-20261016.json');

const capabilities = {
  server_version_num: 170006, stats_privileged: true,
  schemas: ['cron','pgmq','extensions','auth','storage'].map(schema => ({schema,usage:true})),
  extensions: [{name:'pg_stat_statements',schema:'extensions',version:'1.11'}],
  relations: [
    ...['job','job_run_details'].map(table => ({schema:'cron',table,kind:'r',select:true})),
    ...['meta','q_work','a_work'].map(table => ({schema:'pgmq',table,kind:'r',select:true})),
    {schema:'extensions',table:'pg_stat_statements',kind:'v',select:true},
    {schema:'auth',table:'users',kind:'r',select:true},
    {schema:'auth',table:'sessions',kind:'r',select:false},
    {schema:'storage',table:'objects',kind:'r',select:true}
  ]
};
test('capability discovery uses catalog permissions without reading protected rows', () => {
  assert.match(CAPABILITY_SQL,/has_schema_privilege/);
  assert.match(CAPABILITY_SQL,/has_table_privilege/);
  assert.doesNotMatch(CAPABILITY_SQL,/FROM (auth|storage|cron|pgmq)\./);
});
test('unknown capabilities do not pretend cron, queues or SQL statistics were audited', () => {
  const queries = buildInventoryQueries();
  for (const name of ['cron_jobs','cron_history','pgmq_metadata','queue_counts','statement_statistics','protected_counts']) assert.equal(queries[name],undefined);
  assert.ok(Object.values(describeInventoryCoverage().optional).every(value => value==='UNKNOWN'));
  const absent = describeInventoryCoverage({schemas:[],relations:[],extensions:[]});
  assert.ok(Object.values(absent.optional).every(value => value==='NOT_PRESENT'));
  assert.match(absent.limitations[0],/not an audited empty result/);
});
test('optional inventories require both schema usage and SELECT permission', () => {
  const changed = structuredClone(capabilities);
  changed.schemas.find(s => s.schema==='cron').usage=false;
  changed.relations.find(r => r.table==='pg_stat_statements').select=false;
  const queries=buildInventoryQueries(changed);
  assert.equal(queries.cron_jobs,undefined);
  assert.equal(queries.cron_history,undefined);
  assert.equal(queries.statement_statistics,undefined);
  assert.equal(describeInventoryCoverage(changed).optional.cron_jobs,'UNREADABLE');
  assert.equal(describeInventoryCoverage(changed).optional.statement_statistics,'UNREADABLE');
});
test('all inventories are SELECT-only and preserve sensitive definitions as hashes', () => {
  const queries=buildInventoryQueries(capabilities);
  for (const [name,sql] of Object.entries(queries)) {
    assert.match(sql,/^SELECT /,name);
    assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|EXECUTE)\b/i,name);
  }
  assert.match(queries.functions,/sha256\(convert_to\(\(CASE WHEN p.prokind/);
  assert.match(queries.cron_jobs,/AS command_sha256/);
  assert.doesNotMatch(queries.cron_jobs,/SELECT jobid,jobname,schedule,active,\s*command\s*[,\n]/);
  assert.match(queries.statement_statistics,/AS query_sha256/);
  assert.doesNotMatch(queries.statement_statistics,/s\.query\s+AS\s+(?!query_sha256)/);
  assert.doesNotMatch(queries.cron_history,/return_message|command/);
});
test('auth/storage and queue payloads are only counted and inaccessible tables are explicit', () => {
  const queries=buildInventoryQueries(capabilities);
  assert.match(queries.protected_counts,/count\(\*\)::bigint AS rows FROM "auth"\."users"/);
  assert.match(queries.protected_counts,/"storage"\."objects"/);
  assert.doesNotMatch(queries.protected_counts,/"auth"\."sessions"/);
  assert.match(queries.queue_counts,/count\(\*\)::bigint AS rows FROM "pgmq"\."q_work"/);
  assert.doesNotMatch(queries.queue_counts,/message|payload|SELECT \*/);
  assert.equal(describeInventoryCoverage(capabilities).protected_counts.find(r=>r.table==='sessions').status,'UNREADABLE');
});
test('untrusted catalog names are safely quoted as identifiers and string labels', () => {
  const altered=structuredClone(capabilities);
  altered.relations.push({schema:'auth',table:'odd\'"; SELECT sensitive --',kind:'r',select:true});
  const query=buildInventoryQueries(altered).protected_counts;
  assert.ok(query.includes('FROM "auth"."odd\'""; SELECT sensitive --"'));
  assert.ok(query.includes("'odd''\"; SELECT sensitive --'::text AS table"));
});
test('duplicate index/job signatures remain review candidates with removal forbidden', () => {
  const queries=buildInventoryQueries(capabilities);
  assert.match(queries.indexes,/same_database_signature_sha256/);
  assert.match(queries.indexes,/exact_duplicate_candidate/);
  assert.match(queries.indexes,/supporting_constraints/);
  assert.match(queries.indexes,/false AS automatic_removal_authorized/);
  assert.match(queries.cron_jobs,/false AS automatic_removal_authorized/);
  assert.match(describeInventoryCoverage({...capabilities,stats_privileged:false}).statistics_visibility,/FILTERED/);
});
test('inventory covers dependencies, partitions, RLS, constraints and extension configuration', () => {
  const queries=buildInventoryQueries();
  for (const key of ['relations','partitions','views','sequences','columns','policies','constraints','functions','aggregates','triggers','dependencies','shared_dependencies','indexes','extensions','privileges','default_privileges']) assert.ok(queries[key],key);
  assert.match(queries.dependencies,/pg_identify_object/);
  assert.match(queries.relations,/rls_forced/);
  assert.match(queries.constraints,/referenced_columns/);
  assert.match(queries.extensions,/configuration_tables/);
  assert.match(queries.relations,/n\.nspname !~ '\^pg_'/);
});
test('count visibility exposes RLS filtering instead of claiming complete data parity', () => {
  const altered=structuredClone(capabilities);
  const users=altered.relations.find(r=>r.schema==='auth' && r.table==='users');
  users.rls_enabled=true;
  users.rls_forced=true;
  users.owner_access=true;
  assert.equal(describeInventoryCoverage(altered).protected_counts.find(r=>r.table==='users').visibility,'RLS_FILTERED_OR_POLICY_DEPENDENT');
  assert.match(buildInventoryQueries(altered).protected_counts,/'RLS_FILTERED_OR_POLICY_DEPENDENT'::text AS visibility/);
  altered.bypass_rls=true;
  assert.equal(describeInventoryCoverage(altered).protected_counts.find(r=>r.table==='users').visibility,'UNFILTERED_BY_RLS');
  assert.equal(describeInventoryCoverage({...altered,server_version_num:160000}).version_compatible,false);
});

// Opt-in, Unix-socket-only integration: creates/drops its own disposable database.
// Example: WS_INVENTORY_FIXTURE_SOCKET=/tmp/ws-inventory-fixture.XXXXXX node --test ...
test('PostgreSQL17 executes every catalog/optional query without exposing fixture secrets', {
  skip: !process.env.WS_INVENTORY_FIXTURE_SOCKET
}, () => {
  const socket=fs.realpathSync(process.env.WS_INVENTORY_FIXTURE_SOCKET);
  assert.ok(fs.statSync(socket+'/.s.PGSQL.55418').isSocket());
  const database='ws_migration_fixture_inventory_test_'+process.pid;
  const env={...process.env};
  for(const key of Object.keys(env)) if(/^PG/.test(key)) delete env[key];
  function pg(sql,db=database) {
    const result=spawnSync('psql',['-h',socket,'-p','55418','-d',db,'-X','-w','-q','-t','-A','-v','ON_ERROR_STOP=1'],{env,input:sql,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    return result.stdout.trim();
  }
  pg('CREATE DATABASE '+database+' TEMPLATE template0;','postgres');
  try {
    pg(`CREATE SCHEMA private; CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE SCHEMA cron; CREATE SCHEMA pgmq; CREATE SCHEMA extensions;
      CREATE TABLE public.worlds(id int PRIMARY KEY,value text DEFAULT 'PRIVATE_SENTINEL_DEFAULT');
      INSERT INTO public.worlds VALUES(1,'PRIVATE_SENTINEL_ROW');
      CREATE INDEX world_value_a ON public.worlds(value); CREATE INDEX world_value_b ON public.worlds(value);
      CREATE TABLE private.events(id int,world_id int REFERENCES public.worlds(id)) PARTITION BY RANGE(id);
      CREATE TABLE private.events_a PARTITION OF private.events FOR VALUES FROM (0) TO (100);
      CREATE VIEW private.world_view AS SELECT id,'PRIVATE_SENTINEL_VIEW'::text AS value FROM public.worlds;
      CREATE SEQUENCE private.sequence_fixture;
      CREATE FUNCTION public.world_function() RETURNS text LANGUAGE sql AS $$SELECT 'PRIVATE_SENTINEL_FUNCTION'::text$$;
      CREATE AGGREGATE public.fixture_sum(int)(SFUNC=int4pl,STYPE=int,INITCOND='0');
      CREATE FUNCTION public.world_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.value:='PRIVATE_SENTINEL_TRIGGER'; RETURN NEW; END$$;
      CREATE TRIGGER world_insert BEFORE INSERT ON public.worlds FOR EACH ROW EXECUTE FUNCTION public.world_trigger();
      ALTER TABLE public.worlds ENABLE ROW LEVEL SECURITY;
      CREATE POLICY world_policy ON public.worlds USING(value <> 'PRIVATE_SENTINEL_POLICY');
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO PUBLIC;
      CREATE TABLE auth.users(id int,secret text); INSERT INTO auth.users VALUES(1,'PRIVATE_SENTINEL_AUTH');
      CREATE TABLE storage.objects(secret text); INSERT INTO storage.objects VALUES('PRIVATE_SENTINEL_STORAGE');
      CREATE TABLE cron.job(jobid bigint,jobname text,schedule text,active boolean,command text,database text,username text,nodename text,nodeport int);
      INSERT INTO cron.job VALUES(1,'one','* * * * *',true,'SELECT PRIVATE_SENTINEL_COMMAND','fixture','agent','localhost',5432),
        (2,'two','* * * * *',true,'SELECT PRIVATE_SENTINEL_COMMAND','fixture','agent','localhost',5432);
      CREATE TABLE cron.job_run_details(jobid bigint,status text,start_time timestamptz,end_time timestamptz,command text,return_message text);
      INSERT INTO cron.job_run_details VALUES(1,'failed',now()-interval '2 seconds',now(),'PRIVATE_SENTINEL_COMMAND','PRIVATE_SENTINEL_ERROR');
      CREATE TABLE pgmq.meta(queue_name text,is_partitioned boolean,is_unlogged boolean,created_at timestamptz);
      INSERT INTO pgmq.meta VALUES('work',false,false,now());
      CREATE TABLE pgmq.q_work(msg_id bigint,message jsonb); INSERT INTO pgmq.q_work VALUES(1,'{"secret":"PRIVATE_SENTINEL_QUEUE"}');
      CREATE TABLE pgmq.a_work(msg_id bigint,message jsonb);
      CREATE TABLE extensions.pg_stat_statements(dbid oid,userid oid,queryid bigint,toplevel boolean,query text,calls bigint,total_exec_time double precision);
      INSERT INTO extensions.pg_stat_statements SELECT oid,(SELECT oid FROM pg_roles WHERE rolname=current_user),1,true,
        'SELECT PRIVATE_SENTINEL_QUERY',4,20 FROM pg_database WHERE datname=current_database();
      CREATE TABLE extensions.pg_stat_statements_info(stats_reset timestamptz,dealloc bigint);
      INSERT INTO extensions.pg_stat_statements_info VALUES(now(),0);`);
    const read = sql => JSON.parse(pg('BEGIN READ ONLY;SET LOCAL search_path=pg_catalog;'+sql+'COMMIT;'));
    const caps=read(CAPABILITY_SQL);
    assert.equal(Math.floor(caps.server_version_num/10000),17);
    // Optional table stubs exercise extension SQL shape without requiring third-party binaries.
    caps.extensions.push({name:'pg_stat_statements',schema:'extensions',version:'fixture'});
    const result=Object.fromEntries(Object.entries(buildInventoryQueries(caps)).map(([name,sql])=>[name,read(sql)]));
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE_SENTINEL/);
    const duplicates=result.indexes.filter(i=>['world_value_a','world_value_b'].includes(i.name));
    assert.equal(duplicates.length,2);
    assert.ok(duplicates.every(i=>i.exact_duplicate_candidate && !i.automatic_removal_authorized));
    assert.ok(result.cron_jobs.every(j=>j.exact_duplicate_candidate && !j.automatic_removal_authorized));
    assert.equal(result.cron_history[0].runs,1);
    assert.equal(result.protected_counts.find(t=>t.schema==='auth').rows,1);
    assert.equal(result.queue_counts.find(t=>t.table==='q_work').rows,1);
    assert.equal(result.aggregates.length,1);
    assert.match(result.aggregates[0].definition_sha256,/^[a-f0-9]{64}$/);
    assert.equal(result.default_privileges.length,1);
    assert.equal(result.partitions.length,1);
    // pg_monitor is built-in, non-superuser and cannot SELECT the optional tables.
    const restricted=JSON.parse(pg('BEGIN READ ONLY;SET LOCAL ROLE pg_monitor;SET LOCAL search_path=pg_catalog;'+CAPABILITY_SQL+'COMMIT;'));
    assert.equal(describeInventoryCoverage(restricted).optional.cron_jobs,'UNREADABLE');
    assert.equal(buildInventoryQueries(restricted).cron_jobs,undefined);
    assert.equal(describeInventoryCoverage(restricted).protected_counts.find(t=>t.schema==='auth').status,'UNREADABLE');
  } finally { pg('DROP DATABASE '+database+';','postgres'); }
});

test('PostgreSQL17 transport rejects filtered fingerprints and normalizes timestamp hashes', {
  skip: !process.env.WS_INVENTORY_FIXTURE_SOCKET
}, () => {
  const socket=fs.realpathSync(process.env.WS_INVENTORY_FIXTURE_SOCKET);
  assert.ok(fs.statSync(socket+'/.s.PGSQL.55418').isSocket());
  const source='ws_migration_fixture_fingerprints_'+process.pid+'_source';
  const target='ws_migration_fixture_fingerprints_'+process.pid+'_target';
  const reader='ws_inventory_reader_'+process.pid;
  const env={...process.env};
  for(const key of Object.keys(env)) if(/^PG/.test(key)) delete env[key];
  function pg(sql,db='postgres') {
    const r=spawnSync('psql',['-h',socket,'-p','55418','-d',db,'-X','-w','-q','-t','-A','-v','ON_ERROR_STOP=1'],{env,input:sql,encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);
    return r.stdout.trim();
  }
  const admin=pg('SELECT current_user;');
  const conn=(database,user=admin)=>connection('source',{
    WS_MIGRATION_SCOPE:'LOCAL_FIXTURE',
    WS_SOURCE_DATABASE_URL:'postgres://'+encodeURIComponent(user)+'@127.0.0.1:55418/'+database
  });
  pg('CREATE DATABASE '+source+' TEMPLATE template0;CREATE DATABASE '+target+' TEMPLATE template0;CREATE ROLE '+reader+' LOGIN;');
  try {
    for(const[database,value,timezone]of[[source,'old','UTC'],[target,'new','Europe/Moscow']]) {
      pg('CREATE SCHEMA private;'+policy.priority_tables.map(table=>'CREATE TABLE '+table+'(id int,value text,at timestamptz);').join('')+
        `INSERT INTO public.voxel_worlds VALUES(1,'${value}',NULL);
        ALTER TABLE public.voxel_worlds ENABLE ROW LEVEL SECURITY;
        CREATE POLICY invisible ON public.voxel_worlds USING(false);
        INSERT INTO public.game_player_states VALUES(1,'same','2026-10-16T10:00:00Z');
        GRANT USAGE ON SCHEMA public,private TO ${reader};
        GRANT SELECT ON ALL TABLES IN SCHEMA public,private TO ${reader};
        ALTER DATABASE ${database} SET TimeZone='${timezone}';`,database);
    }
    const old=fingerprints(conn(source)),updated=fingerprints(conn(target));
    const table=(report,name)=>Object.values(report.sections).find(section=>section.data?.table===name);
    assert.notEqual(table(old,'public.voxel_worlds').data.sha256,table(updated,'public.voxel_worlds').data.sha256);
    assert.equal(table(old,'public.game_player_states').data.sha256,table(updated,'public.game_player_states').data.sha256);
    const hidden=fingerprints(conn(source,reader));
    assert.equal(hidden.sections.table_aa.status,'UNAVAILABLE');
    assert.equal(hidden.sections.table_aa.sqlstate,'42501');
    assert.equal(hidden.collection_complete,false);
    const isolated=collect(conn(source),{
      absent:"SELECT jsonb_build_object('rows',count(*)) FROM public.does_not_exist;",
      later:"SELECT jsonb_build_object('ran',true);"
    });
    assert.equal(isolated.sections.absent.status,'UNAVAILABLE');
    assert.equal(isolated.sections.later.status,'COLLECTED');
    assert.equal(isolated.sections.later.data.ran,true);
  } finally { pg('DROP DATABASE '+source+';DROP DATABASE '+target+';DROP ROLE '+reader+';'); }
});
