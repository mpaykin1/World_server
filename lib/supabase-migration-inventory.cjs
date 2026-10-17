'use strict';
// PostgreSQL 17 catalog inventory. Transport MUST wrap every query in BEGIN READ ONLY.
// Definition/command/query text stays on the server: only SHA-256 digests leave it.
const userSchema = alias => `${alias}.nspname !~ '^pg_' AND ${alias}.nspname <> 'information_schema'`;
const digest = expression => `encode(sha256(convert_to((${expression})::text, 'UTF8')), 'hex')`;
const arrayQuery = sql => `SELECT COALESCE(jsonb_agg(to_jsonb(inventory)), '[]'::jsonb) FROM (${sql}) inventory;`;
const ident = value => '"' + String(value).replaceAll('"', '""') + '"';

const CAPABILITY_SQL = `SELECT jsonb_build_object(
  'server_version_num', current_setting('server_version_num')::int,
  'stats_privileged', current_setting('is_superuser') = 'on' OR pg_has_role(current_user, 'pg_read_all_stats', 'MEMBER'),
  'bypass_rls', (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user),
  'schemas', (SELECT COALESCE(jsonb_agg(jsonb_build_object('schema',n.nspname,'usage',has_schema_privilege(n.oid,'USAGE')) ORDER BY n.nspname),'[]') FROM pg_namespace n WHERE ${userSchema('n')}),
  'extensions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname) ORDER BY e.extname),'[]') FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace),
  'relations', (SELECT COALESCE(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'kind',c.relkind,'select',has_table_privilege(c.oid,'SELECT'),'rls_enabled',c.relrowsecurity,'rls_forced',c.relforcerowsecurity,'owner_access',pg_has_role(current_user,c.relowner,'USAGE')) ORDER BY n.nspname,c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${userSchema('n')} AND c.relkind IN ('r','p','v','m','f'))
);`;

function findRelation(capabilities, schema, table) {
  return (capabilities.relations || []).find(r => r.schema === schema && r.table === table);
}
function readable(capabilities, relation) {
  return relation?.select === true && (capabilities.schemas || []).some(s => s.schema === relation.schema && s.usage === true);
}
function optionalStatus(capabilities, schema, table) {
  if (!Array.isArray(capabilities.relations) || !Array.isArray(capabilities.schemas)) return 'UNKNOWN';
  const relation = findRelation(capabilities, schema, table);
  return !relation ? 'NOT_PRESENT' : readable(capabilities, relation) ? 'AVAILABLE' : 'UNREADABLE';
}
function statementRelation(capabilities) {
  const extension = (capabilities.extensions || []).find(e => e.name === 'pg_stat_statements');
  return extension ? findRelation(capabilities, extension.schema, 'pg_stat_statements') : undefined;
}
function countVisibility(capabilities, relation) {
  if (relation.rls_enabled === false || capabilities.bypass_rls === true ||
      (relation.owner_access === true && relation.rls_forced === false)) return 'UNFILTERED_BY_RLS';
  return relation.rls_enabled === true ? 'RLS_FILTERED_OR_POLICY_DEPENDENT' : 'UNKNOWN_RLS_COVERAGE';
}
function describeInventoryCoverage(capabilities = {}) {
  const stats = statementRelation(capabilities);
  const known = Array.isArray(capabilities.relations) && Array.isArray(capabilities.schemas);
  return {
    catalog_scope: 'ALL_NON_SYSTEM_SCHEMAS; metadata only; system schemas excluded',
    server_version_num: capabilities.server_version_num ?? null,
    expected_postgres_major: 17,
    version_compatible: capabilities.server_version_num === undefined ? null : Math.floor(capabilities.server_version_num/10000)===17,
    schema_access: Array.isArray(capabilities.schemas) ? capabilities.schemas.map(s => ({schema:s.schema,status:s.usage ? 'AVAILABLE' : 'UNREADABLE'})) : 'UNKNOWN',
    optional: {
      cron_jobs: optionalStatus(capabilities, 'cron', 'job'),
      cron_history: optionalStatus(capabilities, 'cron', 'job_run_details'),
      pgmq_metadata: optionalStatus(capabilities, 'pgmq', 'meta'),
      statement_statistics: !known || !Array.isArray(capabilities.extensions) ? 'UNKNOWN'
        : !stats ? 'NOT_PRESENT' : readable(capabilities, stats) ? 'AVAILABLE' : 'UNREADABLE'
    },
    protected_counts: known ? (capabilities.relations || []).filter(r => ['auth','storage'].includes(r.schema) && ['r','p','m'].includes(r.kind))
      .map(r => ({ schema: r.schema, table: r.table, status: readable(capabilities, r) ? 'AVAILABLE' : 'UNREADABLE',visibility:countVisibility(capabilities,r) })) : 'UNKNOWN',
    queue_counts: known ? (capabilities.relations || []).filter(r => r.schema==='pgmq' && /^(q_|a_)/.test(r.table) && ['r','p'].includes(r.kind))
      .map(r => ({ schema:r.schema,table:r.table,status:readable(capabilities,r) ? 'AVAILABLE' : 'UNREADABLE',visibility:countVisibility(capabilities,r) })) : 'UNKNOWN',
    statistics_visibility: capabilities.stats_privileged === true ? 'ALL_ROLES' : 'CURRENT_ROLE_OR_PRIVILEGE_FILTERED',
    limitations: [
      'NOT_PRESENT/UNKNOWN/UNREADABLE is not an audited empty result; runtime query errors must be recorded separately',
      'Catalog dependencies omit dynamic SQL, external callers, Edge Functions and platform configuration',
      'Zero index scans and duplicate signatures are review candidates, never authorization to remove an index',
      'Statistics cover their current reset window; no query latency p95 is inferred from aggregate counters',
      'Queue-like relation names are candidates; external queues and schedulers require separate inspection',
      'Exact counts include inherited/partition descendants; do not sum parent and child counts',
      'Auth/storage emit counts only; object bytes, sessions, credentials and provider settings are not exported'
    ]
  };
}

function coreQueries() {
  return {
    database: `SELECT jsonb_build_object('database_bytes',pg_database_size(current_database()),'server_version_num',current_setting('server_version_num')::int,'stats_reset',(SELECT stats_reset FROM pg_stat_database WHERE datname=current_database()),'captured_at',transaction_timestamp());`,
    relations: arrayQuery(`SELECT c.oid AS object_id,n.nspname AS schema,c.relname AS table,c.relkind AS kind,
      c.relispartition AS is_partition,c.relpersistence AS persistence,am.amname AS access_method,
      c.reltuples AS planner_rows,s.n_live_tup AS estimated_live_rows,s.n_dead_tup AS estimated_dead_rows,
      pg_total_relation_size(c.oid) AS total_bytes,pg_relation_size(c.oid) AS relation_bytes,
      pg_indexes_size(c.oid) AS index_bytes,c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS rls_forced,
      has_schema_privilege(n.oid,'USAGE') AS schema_access,has_table_privilege(c.oid,'SELECT') AS select_access,
      s.seq_scan,s.idx_scan,s.n_tup_ins,s.n_tup_upd,s.n_tup_del,s.n_tup_hot_upd,
      s.last_vacuum,s.last_autovacuum,s.last_analyze,s.last_autoanalyze,
      c.relname ~* '(queue|task|job|lease|heartbeat|telemetry|probe|evidence|score|log)' AS growth_or_queue_candidate
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_am am ON am.oid=c.relam
      LEFT JOIN pg_stat_all_tables s ON s.relid=c.oid WHERE ${userSchema('n')} AND c.relkind IN ('r','p','m','f') ORDER BY n.nspname,c.relname`),
    partitions: arrayQuery(`SELECT p.oid AS parent_id,pn.nspname AS parent_schema,p.relname AS parent_table,
      c.oid AS child_id,cn.nspname AS child_schema,c.relname AS child_table,i.inhseqno,
      ${digest('pg_get_expr(c.relpartbound,c.oid)')} AS bound_sha256,
      CASE WHEN p.relkind='p' THEN ${digest('pg_get_partkeydef(p.oid)')} END AS partition_key_sha256
      FROM pg_inherits i JOIN pg_class p ON p.oid=i.inhparent JOIN pg_namespace pn ON pn.oid=p.relnamespace
      JOIN pg_class c ON c.oid=i.inhrelid JOIN pg_namespace cn ON cn.oid=c.relnamespace
      WHERE ${userSchema('pn')} OR ${userSchema('cn')} ORDER BY pn.nspname,p.relname,cn.nspname,c.relname`),
    views: arrayQuery(`SELECT c.oid AS object_id,n.nspname AS schema,c.relname AS name,c.relkind AS kind,
      c.relispopulated AS populated,pg_get_userbyid(c.relowner) AS owner,
      COALESCE('security_barrier=true'=ANY(c.reloptions),false) AS security_barrier,
      COALESCE('security_invoker=true'=ANY(c.reloptions),false) AS security_invoker,
      ${digest('pg_get_viewdef(c.oid)')} AS definition_sha256 FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${userSchema('n')} AND c.relkind IN ('v','m') ORDER BY n.nspname,c.relname`),
    sequences: arrayQuery(`SELECT c.oid AS object_id,n.nspname AS schema,c.relname AS name,
      format_type(s.seqtypid,NULL) AS type,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle,
      has_sequence_privilege(c.oid,'USAGE') AS usage_access,has_sequence_privilege(c.oid,'SELECT') AS select_access
      FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE ${userSchema('n')} ORDER BY n.nspname,c.relname`),
    columns: arrayQuery(`SELECT c.oid AS relation_id,n.nspname AS schema,c.relname AS table,a.attnum AS position,a.attname AS column,
      format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,a.attidentity AS identity,a.attgenerated AS generated,
      a.attstattarget AS statistics_target,a.attstorage AS storage,a.attcompression AS compression,
      ad.oid IS NOT NULL AS has_default,${digest('pg_get_expr(ad.adbin,ad.adrelid)')} AS default_sha256
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef ad ON ad.adrelid=c.oid AND ad.adnum=a.attnum
      WHERE ${userSchema('n')} AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped ORDER BY n.nspname,c.relname,a.attnum`),
    policies: arrayQuery(`SELECT p.oid AS object_id,n.nspname AS schema,c.relname AS table,p.polname AS name,p.polcmd AS command,
      p.polpermissive AS permissive,ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END FROM unnest(p.polroles) r) AS roles,
      ${digest('pg_get_expr(p.polqual,p.polrelid)')} AS using_sha256,${digest('pg_get_expr(p.polwithcheck,p.polrelid)')} AS check_sha256
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${userSchema('n')} ORDER BY n.nspname,c.relname,p.polname`),
    constraints: arrayQuery(`SELECT k.oid AS object_id,n.nspname AS schema,c.relname AS table,k.conname AS name,k.contype AS kind,
      k.convalidated AS validated,k.condeferrable AS deferrable,k.condeferred AS initially_deferred,k.conparentid AS parent_constraint_id,
      k.conindid AS supporting_index_id,rn.nspname AS referenced_schema,rc.relname AS referenced_table,k.confupdtype,k.confdeltype,k.confmatchtype,
      ARRAY(SELECT a.attname FROM unnest(k.conkey) WITH ORDINALITY x(num,pos) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.num ORDER BY x.pos) AS columns,
      ARRAY(SELECT a.attname FROM unnest(k.confkey) WITH ORDINALITY x(num,pos) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=x.num ORDER BY x.pos) AS referenced_columns,
      ${digest('pg_get_constraintdef(k.oid)')} AS definition_sha256
      FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace LEFT JOIN pg_class c ON c.oid=k.conrelid
      LEFT JOIN pg_class rc ON rc.oid=k.confrelid LEFT JOIN pg_namespace rn ON rn.oid=rc.relnamespace WHERE ${userSchema('n')} ORDER BY n.nspname,c.relname,k.conname`),
    functions: arrayQuery(`SELECT p.oid AS object_id,n.nspname AS schema,p.proname AS name,p.prokind AS kind,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments,pg_get_function_result(p.oid) AS result_type,
      l.lanname AS language,p.prosecdef AS security_definer,p.provolatile AS volatility,p.proparallel AS parallel,
      p.proisstrict AS strict,p.proleakproof AS leakproof,p.procost AS planner_cost,p.prorows AS planner_rows,
      pg_get_userbyid(p.proowner) AS owner,${digest("CASE WHEN p.prokind<>'a' THEN pg_get_functiondef(p.oid) END")} AS definition_sha256,
      ${digest('p.proconfig::text')} AS configuration_sha256,
      st.calls AS tracked_calls,st.total_time AS tracked_total_ms,st.self_time AS tracked_self_ms
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
      LEFT JOIN pg_stat_user_functions st ON st.funcid=p.oid WHERE ${userSchema('n')} ORDER BY n.nspname,p.proname,p.oid`),
    aggregates: arrayQuery(`SELECT p.oid AS object_id,n.nspname AS schema,p.proname AS name,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments,a.aggkind AS kind,
      a.aggtransfn::regprocedure::text AS transition_function,a.aggfinalfn::regprocedure::text AS final_function,
      a.aggcombinefn::regprocedure::text AS combine_function,a.aggtranstype::regtype::text AS transition_type,
      ${digest("jsonb_build_array(p.oid::regprocedure::text,a.aggkind,a.aggnumdirectargs,a.aggtransfn::regprocedure::text,a.aggfinalfn::regprocedure::text,a.aggcombinefn::regprocedure::text,a.aggserialfn::regprocedure::text,a.aggdeserialfn::regprocedure::text,a.aggmtransfn::regprocedure::text,a.aggminvtransfn::regprocedure::text,a.aggmfinalfn::regprocedure::text,a.aggfinalextra,a.aggmfinalextra,a.aggfinalmodify,a.aggmfinalmodify,a.aggsortop::regoperator::text,a.aggtranstype::regtype::text,a.aggtransspace,a.aggmtranstype::regtype::text,a.aggmtransspace,a.agginitval,a.aggminitval)")} AS definition_sha256
      FROM pg_aggregate a JOIN pg_proc p ON p.oid=a.aggfnoid JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE ${userSchema('n')} ORDER BY n.nspname,p.proname,p.oid`),
    triggers: arrayQuery(`SELECT t.oid AS object_id,n.nspname AS schema,c.relname AS table,t.tgname AS name,t.tgenabled AS enabled,
      t.tgisinternal AS internal,t.tgparentid AS parent_trigger_id,t.tgconstraint AS constraint_id,t.tgfoid AS function_id,
      fn.nspname AS function_schema,p.proname AS function_name,${digest('pg_get_triggerdef(t.oid)')} AS definition_sha256,
      ${digest("encode(t.tgargs,'hex')")} AS argument_sha256
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace fn ON fn.oid=p.pronamespace WHERE ${userSchema('n')} ORDER BY n.nspname,c.relname,t.tgname`),
    dependencies: arrayQuery(`SELECT d.classid::regclass::text AS object_catalog,d.objid AS object_id,d.objsubid AS subobject_id,
      o.type AS object_type,o.schema AS object_schema,o.name AS object_name,
      d.refclassid::regclass::text AS referenced_catalog,d.refobjid AS referenced_id,d.refobjsubid AS referenced_subobject_id,
      r.type AS referenced_type,r.schema AS referenced_schema,r.name AS referenced_name,d.deptype AS dependency_type
      FROM pg_depend d CROSS JOIN LATERAL pg_identify_object(d.classid,d.objid,d.objsubid) o
      CROSS JOIN LATERAL pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid) r
      WHERE (o.schema !~ '^pg_' AND o.schema <> 'information_schema') OR (r.schema !~ '^pg_' AND r.schema <> 'information_schema')
      ORDER BY d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid`),
    shared_dependencies: arrayQuery(`WITH local_dependencies AS MATERIALIZED
      (SELECT * FROM pg_shdepend WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()))
      SELECT d.classid::regclass::text AS object_catalog,d.objid AS object_id,d.objsubid AS subobject_id,
      o.type AS object_type,o.schema AS object_schema,o.name AS object_name,
      d.refclassid::regclass::text AS referenced_catalog,d.refobjid AS referenced_id,d.deptype AS dependency_type
      FROM local_dependencies d CROSS JOIN LATERAL pg_identify_object(d.classid,d.objid,d.objsubid) o
      WHERE o.schema !~ '^pg_' AND o.schema <> 'information_schema'
      ORDER BY d.classid,d.objid,d.refclassid,d.refobjid`),
    indexes: indexQuery(),
    privileges: privilegeQuery(),
    default_privileges: arrayQuery(`SELECT d.oid AS object_id,n.nspname AS schema,pg_get_userbyid(d.defaclrole) AS owner,
      d.defaclobjtype AS object_kind,pg_get_userbyid(x.grantor) AS grantor,
      CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee,x.privilege_type,x.is_grantable
      FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) x
      WHERE n.oid IS NULL OR ${userSchema('n')} ORDER BY d.oid,x.grantor,x.grantee,x.privilege_type`),
    extensions: arrayQuery(`SELECT e.extname AS name,e.extversion AS version,n.nspname AS schema,e.extrelocatable AS relocatable,
      ARRAY(SELECT c::regclass::text FROM unnest(e.extconfig) c) AS configuration_tables,
      ${digest('e.extcondition::text')} AS configuration_condition_sha256
      FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY e.extname`)
  };
}

function indexQuery() {
  return arrayQuery(`WITH catalog AS (SELECT ic.oid AS object_id,n.nspname AS schema,t.relname AS table,ic.relname AS name,
    am.amname AS method,i.indisunique AS "unique",i.indisprimary AS "primary",i.indisexclusion AS exclusion,
    i.indisvalid AS valid,i.indisready AS ready,i.indislive AS live,i.indisreplident AS replica_identity,
    i.indnullsnotdistinct AS nulls_not_distinct,i.indnkeyatts AS key_count,i.indnatts AS attribute_count,
    pg_relation_size(ic.oid) AS bytes,s.idx_scan,s.idx_tup_read,s.idx_tup_fetch,
    ARRAY(SELECT k.conname FROM pg_constraint k WHERE k.conindid=ic.oid) AS supporting_constraints,
    ${digest('pg_get_indexdef(ic.oid)')} AS definition_sha256,
    ${digest("jsonb_build_array(n.nspname,t.relname,am.amname,i.indisunique,i.indisexclusion,i.indisvalid,i.indisready,i.indislive,i.indisreplident,i.indnullsnotdistinct,i.indkey::text,i.indclass::text,i.indcollation::text,i.indoption::text,i.indnkeyatts,i.indnatts,ic.reloptions,ic.reltablespace,pg_get_expr(i.indexprs,i.indrelid),pg_get_expr(i.indpred,i.indrelid))")} AS same_database_signature_sha256
    FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_am am ON am.oid=ic.relam
    LEFT JOIN pg_stat_all_indexes s ON s.indexrelid=ic.oid WHERE ${userSchema('n')})
    SELECT catalog.*,count(*) OVER (PARTITION BY same_database_signature_sha256)>1 AS exact_duplicate_candidate,
    idx_scan=0 AND NOT "primary" AND NOT "unique" AND NOT exclusion AND cardinality(supporting_constraints)=0 AS zero_scan_review_candidate,
    false AS automatic_removal_authorized FROM catalog ORDER BY schema,"table",name`);
}

function privilegeQuery() {
  const role = `CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee`;
  return arrayQuery(`SELECT 'schema'::text AS object_kind,n.oid AS object_id,n.nspname AS schema,n.nspname AS name,
    pg_get_userbyid(x.grantor) AS grantor,${role},x.privilege_type,x.is_grantable
    FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) x WHERE ${userSchema('n')}
    UNION ALL SELECT 'relation',c.oid,n.nspname,c.relname,pg_get_userbyid(x.grantor),${role},x.privilege_type,x.is_grantable
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) x
    WHERE ${userSchema('n')} AND c.relkind IN ('r','p','v','m','f','S')
    UNION ALL SELECT 'function',p.oid,n.nspname,p.proname,pg_get_userbyid(x.grantor),${role},x.privilege_type,x.is_grantable
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x WHERE ${userSchema('n')}
    ORDER BY object_kind,object_id,grantee,privilege_type`);
}

function countQuery(relations, capabilities) {
  return arrayQuery(relations.map(r => `SELECT '${r.schema}'::text AS schema,${"'" + r.table.replaceAll("'", "''") + "'"}::text AS table,
    '${countVisibility(capabilities,r)}'::text AS visibility,count(*)::bigint AS rows FROM ${ident(r.schema)}.${ident(r.table)}`).join(' UNION ALL '));
}
function cronQueries(queries, capabilities) {
  if (optionalStatus(capabilities, 'cron', 'job') === 'AVAILABLE') {
    queries.cron_jobs = arrayQuery(`WITH jobs AS (SELECT jobid,jobname,schedule,active,
      ${digest('command')} AS command_sha256,
      ${digest('jsonb_build_array(schedule,command,database,username,nodename,nodeport)')} AS schedule_command_sha256
      FROM cron.job) SELECT jobs.*,count(*) OVER (PARTITION BY schedule_command_sha256)>1 AS exact_duplicate_candidate,
      false AS automatic_removal_authorized FROM jobs ORDER BY jobid`);
  }
  if (optionalStatus(capabilities, 'cron', 'job_run_details') === 'AVAILABLE') {
    queries.cron_history = arrayQuery(`SELECT jobid,status,count(*)::bigint AS runs,min(start_time) AS first_start,max(start_time) AS latest_start,
      max(end_time) AS latest_end,count(*) FILTER (WHERE end_time IS NULL) AS unfinished_runs,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (end_time-start_time))*1000) AS duration_p50_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (end_time-start_time))*1000) AS duration_p95_ms
      FROM cron.job_run_details GROUP BY jobid,status ORDER BY jobid,status`);
  }
}
function buildInventoryQueries(capabilities = {}) {
  const queries = coreQueries();
  cronQueries(queries, capabilities);
  if (optionalStatus(capabilities, 'pgmq', 'meta') === 'AVAILABLE') {
    queries.pgmq_metadata = arrayQuery(`SELECT to_jsonb(m)->>'queue_name' AS queue_name,
      to_jsonb(m)->>'is_partitioned' AS is_partitioned,to_jsonb(m)->>'is_unlogged' AS is_unlogged,
      to_jsonb(m)->>'created_at' AS created_at FROM pgmq.meta m ORDER BY queue_name`);
  }
  const relations = capabilities.relations || [];
  const protectedTables = relations.filter(r => ['auth','storage'].includes(r.schema) && ['r','p','m'].includes(r.kind) && readable(capabilities,r));
  if (protectedTables.length) queries.protected_counts = countQuery(protectedTables,capabilities);
  const queues = relations.filter(r => r.schema === 'pgmq' && /^(q_|a_)/.test(r.table) && ['r','p'].includes(r.kind) && readable(capabilities,r));
  if (queues.length) queries.queue_counts = countQuery(queues,capabilities);
  const statement = statementRelation(capabilities);
  if (readable(capabilities,statement)) {
    const number = key => `(to_jsonb(s)->>'${key}')::numeric AS ${key}`;
    queries.statement_statistics = arrayQuery(`SELECT s.dbid,s.userid,s.queryid,s.toplevel,
      CASE WHEN s.query IS NOT NULL AND s.query <> '<insufficient privilege>' THEN ${digest('s.query')} END AS query_sha256,
      ${['calls','plans','total_plan_time','total_exec_time','min_exec_time','max_exec_time','mean_exec_time','stddev_exec_time','rows','shared_blks_hit','shared_blks_read','shared_blks_dirtied','shared_blks_written','temp_blks_read','temp_blks_written','wal_records','wal_bytes'].map(number).join(',')}
      FROM ${ident(statement.schema)}.${ident(statement.table)} s WHERE s.dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) ORDER BY s.queryid`);
    const info=findRelation(capabilities,statement.schema,'pg_stat_statements_info');
    if (readable(capabilities,info)) queries.statement_statistics_info=arrayQuery(`SELECT to_jsonb(s)->'stats_reset' AS stats_reset,to_jsonb(s)->'dealloc' AS dealloc FROM ${ident(info.schema)}.${ident(info.table)} s`);
  }
  return queries;
}

module.exports = { CAPABILITY_SQL, buildInventoryQueries, describeInventoryCoverage };
