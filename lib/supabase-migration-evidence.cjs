'use strict';
// Offline consistency gate for recorded evidence; never connects, restores, or chooses an owner verdict.
const policy = require('../data/supabase-owner-migration-20261016.json');

const REQUIRED_FEATURES = Object.freeze([
  'world_state', 'player_save_load', 'auth_rbac', 'private_memory', 'quality_loop',
  'edge_functions', 'storage', 'scheduler_queues', 'schema_dependencies',
  'browser_desktop', 'browser_mobile', 'security', 'rollback',
]);
const INVENTORY_KINDS = ['tables', 'functions', 'indexes', 'queues', 'cron'];
const METRICS = Object.freeze({
  database_size_bytes: 'bytes', storage_usage_bytes: 'bytes',
  scheduler_duplicate_jobs: 'count', p95_query_latency: 'ms',
});
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const named = value => typeof value === 'string' && value.trim().length > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const rows = value => Array.isArray(value) ? value : [];
const evidence = value => value?.status === 'VERIFIED' && sha(value.evidence_sha256);
const unique = values => new Set(values).size === values.length;

function provenanceValid(p) {
  return p?.scope === 'LIVE' && p.synthetic === false && named(p.project_ref) &&
    named(p.snapshot_id) && named(p.migration_id) && named(p.collector) &&
    Number.isFinite(Date.parse(p.captured_at)) && sha(p.evidence_sha256);
}

function archiveValid(a, p, snapshot) {
  return a?.scope === 'FULL' && a.project_ref === p?.project_ref &&
    a.snapshot_id === snapshot && sha(a.sha256) && a.sha256 === a.observed_sha256 &&
    evidence(a.toc_check) && a.toc_check.archive_sha256 === a.sha256 &&
    evidence(a.restore_rehearsal) && a.restore_rehearsal.archive_sha256 === a.sha256 &&
    a.restore_rehearsal.isolated === true && a.restore_rehearsal.scope === 'FULL' &&
    sha(a.restore_rehearsal.content_sha256) &&
    a.restore_rehearsal.content_sha256 === a.source_content_sha256;
}

function inspectData(input, inventory, source, target) {
  const checks = rows(input.data_checks);
  const byId = new Map(checks.map(x => [x?.id, x]));
  if (!unique(checks.map(x => x?.id))) return 'REGRESSION';
  const tableIds = rows(inventory.tables?.items).map(x => x?.id);
  if (!tableIds.length) return 'UNKNOWN';
  let unknown = false;
  for (const id of tableIds) {
    const c = byId.get(id);
    if (!c || !evidence(c) || c.source_snapshot_id !== source?.snapshot_id ||
      c.target_snapshot_id !== target?.snapshot_id) { unknown = true; continue; }
    if (c.disposition === 'PRESERVE') {
      if (!Number.isSafeInteger(c.source_count) || !Number.isSafeInteger(c.target_count) ||
        c.source_count < 0 || c.target_count < 0 || !sha(c.source_sha256) ||
        !sha(c.target_sha256) || c.digest_method !== 'CANONICAL_FULL_ROWS_SHA256') {
        unknown = true; continue;
      }
      if (c.source_count !== c.target_count || c.source_sha256 !== c.target_sha256) return 'REGRESSION';
    } else if (['ARCHIVE', 'RECREATE'].includes(c.disposition)) {
      if (policy.priority_tables.includes(id)) return 'REGRESSION';
      if (!evidence(c.dependency_review) || !evidence(c.replacement_check)) { unknown = true; continue; }
      if (c.disposition === 'ARCHIVE' && (!sha(c.source_sha256) ||
        c.source_sha256 !== c.archived_sha256 ||
        c.archive_sha256 !== input.archives?.source_full?.sha256 ||
        !evidence(c.learning_preservation))) unknown = true;
    } else unknown = true;
  }
  return unknown ? 'UNKNOWN' : 'VERIFIED';
}

function inspectInventory(inventory, source, target) {
  let unknown = false;
  for (const kind of INVENTORY_KINDS) {
    const group = inventory[kind];
    if (!evidence(group) || group.complete !== true || !Array.isArray(group.items) ||
      group.scope !== 'LIVE' || group.source_snapshot_id !== source?.snapshot_id ||
      group.target_snapshot_id !== target?.snapshot_id) {
      unknown = true; continue;
    }
    if (!unique(group.items.map(x => x?.id))) return 'REGRESSION';
    for (const item of group.items) {
      if (!named(item?.id) || !evidence(item) || !evidence(item.dependency_review) ||
        !['PRESERVE', 'ARCHIVE', 'RECREATE'].includes(item.disposition)) unknown = true;
    }
  }
  const tableIds = rows(inventory.tables?.items).map(x => x?.id);
  if (policy.priority_tables.some(id => !tableIds.includes(id))) unknown = true;
  return unknown ? 'UNKNOWN' : 'VERIFIED';
}

function inspectFeatures(input, source, target) {
  const features = rows(input.features);
  if (!unique(features.map(x => x?.id))) return 'REGRESSION';
  if (features.some(x => !named(x?.id))) return 'UNKNOWN';
  const byId = new Map(features.map(x => [x?.id, x]));
  if (features.some(x => x?.status === 'REGRESSION')) return 'REGRESSION';
  const required = [...new Set([...REQUIRED_FEATURES, ...rows(input.required_features), ...features.map(x => x.id)])];
  return required.every(id => {
    const f = byId.get(id);
    return evidence(f) && f.scope === 'LIVE' && f.source_snapshot_id === source?.snapshot_id &&
      f.target_snapshot_id === target?.snapshot_id && sha(f.source_evidence_sha256) &&
      sha(f.target_evidence_sha256) && named(f.contract_id);
  }) ? 'VERIFIED' : 'UNKNOWN';
}

function inspectMetric(m, source, target) {
  const result = { name: m.name, status: 'UNKNOWN', before: null, after: null, delta: null };
  if (!Object.hasOwn(METRICS, m.name) || m.unit !== METRICS[m.name] ||
    !finite(m.before) || !finite(m.after) || !evidence(m) || m.scope !== 'LIVE' ||
    m.source_snapshot_id !== source?.snapshot_id || m.target_snapshot_id !== target?.snapshot_id ||
    !named(m.workload_id) || !named(m.environment_id) ||
    m.source_workload_id !== m.workload_id || m.target_workload_id !== m.workload_id ||
    m.source_environment_id !== m.environment_id || m.target_environment_id !== m.environment_id) return result;
  if (m.unit !== 'ms' && (!Number.isSafeInteger(m.before) || !Number.isSafeInteger(m.after))) return result;
  if (m.name === 'p95_query_latency') {
    const a = rows(m.source_samples_ms), b = rows(m.target_samples_ms);
    if (a.length < 20 || b.length < 20 || !a.every(finite) || !b.every(finite) ||
      !sha(m.raw_samples_sha256)) return result;
    const p95 = samples => [...samples].sort((x, y) => x - y)[Math.ceil(samples.length * 0.95) - 1];
    if (m.before !== p95(a) || m.after !== p95(b)) return result;
  }
  result.before = m.before;
  result.after = m.after;
  result.delta = m.after - m.before;
  result.status = m.after > m.before ? 'REGRESSION' : m.after < m.before ? 'IMPROVED' : 'UNCHANGED';
  // A zero baseline has no percentage improvement; never divide by zero or invent a score.
  result.reduction_percent = m.before > 0 ? 100 * (m.before - m.after) / m.before : null;
  return result;
}

function compareMigrationEvidence(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  const source = input.provenance?.source, target = input.provenance?.target;
  const inventory = input.inventory || {};
  const gates = {};
  const compatible = provenanceValid(source) && provenanceValid(target) &&
    source.project_ref === policy.source.project_ref && target.project_ref === policy.target.project_ref &&
    source.project_ref !== target.project_ref && source.migration_id === target.migration_id &&
    source.migration_id === policy.migration_id;
  gates.live_provenance = compatible ? 'VERIFIED' : 'UNKNOWN';
  gates.source_full_archive_restored = archiveValid(input.archives?.source_full, source, source?.snapshot_id)
    ? 'VERIFIED' : 'UNKNOWN';
  gates.target_existing_data_backed_up = named(target?.before_snapshot_id) &&
    archiveValid(input.archives?.target_before, target, target?.before_snapshot_id) ? 'VERIFIED' : 'UNKNOWN';
  gates.complete_dependency_inventory = inspectInventory(inventory, source, target);
  gates.functional_parity = inspectFeatures(input, source, target);
  gates.data_identity = inspectData(input, inventory, source, target);
  gates.source_untouched = evidence(input.source_untouched) && input.source_untouched.read_only === true &&
    input.source_untouched.project_ref === source?.project_ref &&
    input.source_untouched.before_sha256 === input.source_untouched.after_sha256 &&
    sha(input.source_untouched.before_sha256) ? 'VERIFIED' : 'UNKNOWN';
  gates.rollback = evidence(input.rollback) && input.rollback.source_project_ref === source?.project_ref &&
    input.rollback.target_project_ref === target?.project_ref && input.rollback.rehearsed === true &&
    input.rollback.source_retained === true ? 'VERIFIED' : 'UNKNOWN';
  const submitted = rows(input.metrics);
  const metrics = Object.keys(METRICS).map(name => {
    const found = submitted.filter(m => m?.name === name);
    return found.length === 1 ? inspectMetric(found[0], source, target) : { name, status: 'UNKNOWN' };
  });
  const required = ['database_size_bytes', 'storage_usage_bytes', 'scheduler_duplicate_jobs'];
  gates.measured_improvement = metrics.some(m => m.status === 'IMPROVED') ? 'VERIFIED' : 'UNKNOWN';
  gates.no_measured_regression = metrics.some(m => m.status === 'REGRESSION') ? 'REGRESSION' :
    required.every(name => metrics.some(m => m.name === name && ['IMPROVED', 'UNCHANGED'].includes(m.status))) &&
    submitted.every(m => Object.hasOwn(METRICS, m?.name) &&
      metrics.some(x => x.name === m.name && x.status !== 'UNKNOWN')) ? 'VERIFIED' : 'UNKNOWN';
  const ready = Object.values(gates).every(value => value === 'VERIFIED');
  return {
    schema_version: 1, status: ready ? 'READY_FOR_OWNER_REVIEW' : 'NOT_READY',
    owner_verdict: 'PENDING', production_cutover_authorized: false,
    gates, metrics, blockers: Object.entries(gates).filter(([, s]) => s !== 'VERIFIED').map(([id, status]) => ({ id, status })),
    limitations: ['Offline consistency checks cannot authenticate evidence collectors or replace live verification.',
      'An unmeasured p95 remains UNKNOWN; no latency improvement is claimed.'],
  };
}

function buildLearningSummary(inputRows = []) {
  if (!Array.isArray(inputRows)) throw new TypeError('Learning evidence must be an array');
  const seen = new Set();
  const observations = inputRows.map(row => {
    if (!row || !named(row.id) || seen.has(row.id) || !sha(row.evidence_sha256) ||
      !Object.hasOwn(row, 'outcome') || !Object.hasOwn(row, 'owner_verdict')) {
      throw new Error('Each observation needs a unique id, evidence SHA256, exact outcome and owner verdict');
    }
    if (!['PENDING', 'PASS', 'FAIL'].includes(row.owner_verdict)) throw new Error('Invalid recorded owner verdict');
    seen.add(row.id);
    // Clone the complete observation rather than reclassifying a negative/positive outcome by a heuristic.
    return structuredClone(row);
  });
  return { schema_version: 1, owner_verdict: 'PENDING', observations, observation_count: observations.length,
    policy: 'EXACT_OUTCOME_EVIDENCE_PRESERVED_NO_AUTOMATIC_VERDICT' };
}

module.exports = { compareMigrationEvidence, buildLearningSummary, REQUIRED_FEATURES };
