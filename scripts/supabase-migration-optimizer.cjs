#!/usr/bin/env node
'use strict';
// Dry-run only: inventory World Server Supabase migration cleanup candidates.
// Never performs DELETE, DROP, UPDATE, data restore, deploy, or secret handling.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const policy = require('../data/supabase-owner-migration-20261016.json');

function assertTableName(value) {
  if (!/^(public|private)\.[a-z0-9_]+$/.test(value)) {
    throw new Error('Unsafe or unsupported table name');
  }
}
function buildPlan(config, tableStats = []) {
  const groups = [
    ['preserve', config.priority_tables],
    ['archive_candidate', config.archive_only_data_tables],
    ['reset_candidate', config.reset_on_target_data_tables],
  ];
  const seen = new Set();
  for (const [group, tables] of groups) {
    if (!Array.isArray(tables)) throw new Error('Missing table group: ' + group);
    for (const table of tables) {
      assertTableName(table);
      if (seen.has(table)) throw new Error('Table appears in multiple groups: ' + table);
      seen.add(table);
    }
  }
  const statistics = new Map();
  for (const entry of tableStats) {
    const name = entry.table;
    assertTableName(name);
    if (statistics.has(name)) throw new Error('Duplicate table statistics: ' + name);
    const bytes = Number(entry.bytes);
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid table bytes for ' + name);
    statistics.set(name, bytes);
  }
  const addSize = tables => {
    if (!tables.every(x => statistics.has(x))) return null;
    return tables.reduce((sum, x) => sum + statistics.get(x), 0);
  };
  const classified = groups.map(([action, tables]) => ({
    action,
    tables,
    observed_bytes: addSize(tables),
    requires_dependency_audit: action !== 'preserve',
    execute_automatically: false,
  }));
  const unclassified = [...statistics].filter(([name]) => !seen.has(name))
    .map(([table, bytes]) => ({ table, bytes, action: 'inspect_before_migration' }));
  return {
    mode: 'DRY_RUN',
    project: config.migration_id,
    source: config.source.project_ref,
    target: config.target.project_ref,
    groups: classified,
    unclassified,
    unknown_size_or_dependency_block: classified.some(g => g.observed_bytes === null) || unclassified.length > 0,
    no_deletion_without_backup: true,
    no_production_cutover: true,
    required_gates: [
      'FULL_ARCHIVE_RESTORE_TESTED',
      'DEPENDENCY_GRAPH_REVIEWED',
      'TARGET_EXISTING_DATA_BACKED_UP',
      'RLS_FK_AND_AUTH_MAPPINGS_VERIFIED',
      'SCHEDULED_JOBS_INVENTORIED_WITHOUT_DUPLICATES',
      'WORLD_AND_PLAYER_SAVE_LOAD_REAL_TESTS',
      'EDGE_FUNCTIONS_RUNTIME_VERIFIED',
      'QUALITY_LEARNING_KEEPS_PROVEN_KNOWLEDGE',
      'NO_REGRESSION_IN_FUNCTIONALITY_AND_USER_VISIBILITY',
      'COMPARABLE_SIZE_QUERY_LATENCY_AND_RUNTIME_METRICS',
      'ROLLBACK_VERIFIED',
      'USER_PASS_OR_FAIL_PENDING'
    ],
    proposed_improvements: [
      'Copy current world and player state, not obsolete temporary worker leases',
      'Archive historical scoring/probes/gap evidence and derive compact proven learning summaries',
      'Consolidate duplicate cron jobs and repeated queues only after reference check',
      'Replace redundant indexes or slow queries only after EXPLAIN and benchmark',
      'Deploy only function versions exercised by the live system and validate each public contract',
      'Keep the smallest compatible schema while preserving RLS and dependent SQL functions',
      'Prevent new telemetry growth using retention policies validated against learning requirements'
    ],
  };
}
function sourceStats() {
  if (!process.env.WS_SOURCE_DATABASE_URL) {
    throw new Error('WS_SOURCE_DATABASE_URL missing; no source statistics collected');
  }
  const sql = "SELECT COALESCE(json_agg(json_build_object('table',schemaname||'.'||relname,'bytes',pg_total_relation_size(relid))), '[]'::json) FROM pg_stat_user_tables WHERE schemaname IN ('public','private');";
  try {
    const out = execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
      env: { ...process.env, PGDATABASE: process.env.WS_SOURCE_DATABASE_URL, PGSSLMODE: 'require' },
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000,
      maxBuffer: 1024 * 1024
    });
    return JSON.parse(out.trim());
  } catch {
    throw new Error('Read-only source table statistics unavailable. No changes applied.');
  }
}
if (require.main === module) {
  try {
    const mode = process.argv[2] || 'plan';
    if (!['plan', 'source-plan'].includes(mode)) throw new Error('Use plan or source-plan');
    const stats = mode === 'source-plan' ? sourceStats() : [];
    console.log(JSON.stringify(buildPlan(policy, stats), null, 2));
  } catch (e) {
    console.error('OPTIMIZATION_BLOCKED: ' + e.message);
    process.exitCode = 1;
  }
}
module.exports = { buildPlan };
