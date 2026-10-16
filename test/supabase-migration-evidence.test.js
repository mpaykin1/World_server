'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../data/supabase-owner-migration-20261016.json');
const { compareMigrationEvidence, buildLearningSummary, REQUIRED_FEATURES } = require('../lib/supabase-migration-evidence.cjs');

const digest = 'a'.repeat(64);
const otherDigest = 'b'.repeat(64);
const verified = () => ({ status: 'VERIFIED', evidence_sha256: digest });
function fixture() {
  // These records exercise the validator; they are never written as live migration evidence.
  const source = { scope: 'LIVE', synthetic: false, project_ref: policy.source.project_ref,
    snapshot_id: 'source-1', migration_id: policy.migration_id, collector: 'authorized-reader',
    captured_at: '2026-10-16T12:00:00Z', evidence_sha256: digest };
  const target = { ...source, project_ref: policy.target.project_ref,
    snapshot_id: 'target-1', before_snapshot_id: 'target-before-1' };
  const archive = (p, snapshot) => ({ scope: 'FULL', project_ref: p.project_ref, snapshot_id: snapshot,
    sha256: digest, observed_sha256: digest, source_content_sha256: digest,
    toc_check: { ...verified(), archive_sha256: digest },
    restore_rehearsal: { ...verified(), archive_sha256: digest, isolated: true,
      scope: 'FULL', content_sha256: digest } });
  const inventory = Object.fromEntries(['tables', 'functions', 'indexes', 'queues', 'cron']
    .map(kind => [kind, { ...verified(), complete: true, scope: 'LIVE',
      source_snapshot_id: source.snapshot_id, target_snapshot_id: target.snapshot_id, items: [] }]));
  inventory.tables.items = policy.priority_tables.map(id => ({ ...verified(), id,
    disposition: 'PRESERVE', dependency_review: verified() }));
  const measured = (name, unit, before, after) => ({ ...verified(), name, unit, before, after,
    scope: 'LIVE', source_snapshot_id: source.snapshot_id, target_snapshot_id: target.snapshot_id,
    workload_id: 'world-save-read-v1', source_workload_id: 'world-save-read-v1',
    target_workload_id: 'world-save-read-v1', environment_id: 'pg17-free-tier',
    source_environment_id: 'pg17-free-tier', target_environment_id: 'pg17-free-tier' });
  return { provenance: { source, target },
    archives: { source_full: archive(source, source.snapshot_id), target_before: archive(target, target.before_snapshot_id) },
    inventory, features: REQUIRED_FEATURES.map(id => ({ ...verified(), id, scope: 'LIVE',
      source_snapshot_id: source.snapshot_id, target_snapshot_id: target.snapshot_id,
      source_evidence_sha256: digest, target_evidence_sha256: digest, contract_id: id + '-v1' })),
    data_checks: inventory.tables.items.map(({ id }) => ({ ...verified(), id, disposition: 'PRESERVE',
      source_snapshot_id: source.snapshot_id, target_snapshot_id: target.snapshot_id,
      source_count: 3, target_count: 3, source_sha256: digest, target_sha256: digest,
      digest_method: 'CANONICAL_FULL_ROWS_SHA256' })),
    source_untouched: { ...verified(), read_only: true, project_ref: source.project_ref,
      before_sha256: digest, after_sha256: digest },
    rollback: { ...verified(), rehearsed: true, source_retained: true,
      source_project_ref: source.project_ref, target_project_ref: target.project_ref },
    metrics: [measured('database_size_bytes', 'bytes', 1000, 800),
      measured('storage_usage_bytes', 'bytes', 0, 0), measured('scheduler_duplicate_jobs', 'count', 2, 0)],
  };
}
const compare = mutation => { const input = fixture(); mutation(input); return compareMigrationEvidence(input); };

test('complete internally consistent evidence only prepares owner review, never PASS/cutover', () => {
  const result = compareMigrationEvidence(fixture());
  assert.equal(result.status, 'READY_FOR_OWNER_REVIEW');
  assert.equal(result.owner_verdict, 'PENDING');
  assert.equal(result.production_cutover_authorized, false);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.metrics.find(m => m.name === 'p95_query_latency').status, 'UNKNOWN');
});

test('empty evidence remains UNKNOWN and cannot invent success, sizes or latency', () => {
  const result = compareMigrationEvidence();
  assert.equal(result.status, 'NOT_READY');
  assert.ok(Object.values(result.gates).every(s => s === 'UNKNOWN'));
  assert.ok(result.metrics.every(m => m.status === 'UNKNOWN'));
});

test('caller cannot supply a PASS owner verdict or synthetic provenance as live readiness', () => {
  assert.equal(compare(x => { x.owner_verdict = 'PASS'; }).owner_verdict, 'PENDING');
  for (const field of ['scope', 'synthetic', 'evidence_sha256', 'captured_at', 'project_ref', 'migration_id']) {
    const result = compare(x => { x.provenance.target[field] = field === 'synthetic' ? true : 'fixture'; });
    assert.equal(result.gates.live_provenance, 'UNKNOWN', field);
    assert.equal(result.status, 'NOT_READY');
  }
});

test('all required capabilities, tables and audited dependency categories need evidence', () => {
  for (const mutate of [
    x => { x.features.pop(); }, x => { x.features[0].scope = 'FIXTURE'; },
    x => { x.features[0].target_snapshot_id = 'old'; },
    x => { delete x.inventory.queues; }, x => { x.inventory.tables.items.pop(); },
    x => { delete x.inventory.functions.complete; },
    x => { x.inventory.cron.scope = 'FIXTURE'; },
    x => { x.inventory.indexes.target_snapshot_id = 'stale'; },
    x => { x.features.push({ id: 'another-existing-feature', status: 'UNKNOWN' }); },
    x => { x.features.push({ ...x.features[0] }); },
  ]) assert.equal(compare(mutate).status, 'NOT_READY');
  assert.equal(compare(x => { x.features[0].status = 'REGRESSION'; }).gates.functional_parity, 'REGRESSION');
});

test('malformed JSON values cannot produce a ready report or crash the offline gate', () => {
  for (const value of [null, false, [], 'ready']) assert.equal(compareMigrationEvidence(value).status, 'NOT_READY');
  for (const mutate of [x => { x.features.push(null); }, x => { x.metrics.push(null); },
    x => { x.inventory.functions.items.push(null); }, x => { x.data_checks = [null]; }]) {
    assert.equal(compare(mutate).status, 'NOT_READY');
  }
});

test('counts alone, partial fingerprints or same counts with different content do not prove data identity', () => {
  assert.equal(compare(x => { delete x.data_checks[0].source_sha256; }).gates.data_identity, 'UNKNOWN');
  assert.equal(compare(x => { x.data_checks[0].digest_method = 'ROW_COUNT'; }).gates.data_identity, 'UNKNOWN');
  assert.equal(compare(x => { x.data_checks[0].target_sha256 = otherDigest; }).gates.data_identity, 'REGRESSION');
  assert.equal(compare(x => { x.data_checks[0].target_count = 0; }).gates.data_identity, 'REGRESSION');
  assert.equal(compare(x => { x.data_checks.pop(); }).gates.data_identity, 'UNKNOWN');
});

test('must-keep data cannot be removed by assigning ARCHIVE/RECREATE', () => {
  for (const disposition of ['ARCHIVE', 'RECREATE']) {
    assert.equal(compare(x => { x.data_checks[0].disposition = disposition; }).gates.data_identity, 'REGRESSION');
  }
});

test('large history needs restored archive, exact content and learning preservation evidence', () => {
  const input = fixture(), id = 'private.quality_runtime_scores';
  input.inventory.tables.items.push({ ...verified(), id, disposition: 'ARCHIVE', dependency_review: verified() });
  input.data_checks.push({ ...verified(), id, disposition: 'ARCHIVE',
    source_snapshot_id: 'source-1', target_snapshot_id: 'target-1', source_sha256: digest,
    archived_sha256: digest, archive_sha256: digest, dependency_review: verified(),
    replacement_check: verified(), learning_preservation: verified() });
  assert.equal(compareMigrationEvidence(input).status, 'READY_FOR_OWNER_REVIEW');
  input.data_checks.at(-1).archived_sha256 = otherDigest;
  assert.equal(compareMigrationEvidence(input).gates.data_identity, 'UNKNOWN');
});

test('tampered archive, list-only verification, selective restore and no target backup block readiness', () => {
  for (const mutate of [
    x => { x.archives.source_full.observed_sha256 = otherDigest; },
    x => { delete x.archives.source_full.restore_rehearsal; },
    x => { x.archives.source_full.restore_rehearsal.scope = 'SELECTIVE'; },
    x => { x.archives.source_full.restore_rehearsal.content_sha256 = otherDigest; },
    x => { x.archives.source_full.restore_rehearsal.archive_sha256 = otherDigest; },
    x => { delete x.archives.target_before; },
    x => { x.archives.target_before.snapshot_id = 'after-migration'; },
  ]) assert.equal(compare(mutate).status, 'NOT_READY');
});

test('a real reduction needs consistent units, environment, workload and bound snapshots', () => {
  for (const mutate of [
    x => { x.metrics[0].unit = 'MB'; }, x => { x.metrics[0].before = '1000'; },
    x => { x.metrics[0].before = NaN; }, x => { x.metrics[0].scope = 'FIXTURE'; },
    x => { x.metrics[0].source_environment_id = 'different-tier'; },
    x => { x.metrics[0].source_workload_id = 'simpler-query'; },
    x => { x.metrics[0].source_snapshot_id = 'stale'; },
    x => { x.metrics[0].before = Number.MAX_SAFE_INTEGER + 1; },
    x => { x.metrics.push({ name: 'invented_score', before: 1, after: 100 }); },
  ]) assert.equal(compare(mutate).status, 'NOT_READY');
});

test('zero baseline never invents percentage reduction and worsened metrics prevent review readiness', () => {
  const unchanged = compare(x => { x.metrics.forEach(m => { m.before = 0; m.after = 0; }); });
  assert.equal(unchanged.gates.measured_improvement, 'UNKNOWN');
  assert.ok(unchanged.metrics.filter(m => m.before === 0).every(m => m.reduction_percent === null));
  const worse = compare(x => { x.metrics[1].after = 1; });
  assert.equal(worse.gates.no_measured_regression, 'REGRESSION');
  assert.equal(worse.status, 'NOT_READY');
});

test('latency must be recomputable p95 from comparable measured sample series', () => {
  const input = fixture();
  const metric = { ...input.metrics[0], name: 'p95_query_latency', unit: 'ms',
    before: 20, after: 10, source_samples_ms: Array(20).fill(20),
    target_samples_ms: Array(20).fill(10), raw_samples_sha256: digest };
  input.metrics.push(metric);
  assert.equal(compareMigrationEvidence(input).metrics.at(-1).status, 'IMPROVED');
  for (const mutate of [m => { m.after = 1; }, m => { m.source_samples_ms = [20]; },
    m => { m.target_samples_ms[0] = -1; }, m => { delete m.raw_samples_sha256; }]) {
    const altered = structuredClone(input); mutate(altered.metrics.at(-1));
    assert.equal(compareMigrationEvidence(altered).metrics.at(-1).status, 'UNKNOWN');
    assert.equal(compareMigrationEvidence(altered).status, 'NOT_READY');
  }
});

test('source modification or unrehearsed rollback cannot be compensated by faster metrics', () => {
  assert.equal(compare(x => { x.source_untouched.after_sha256 = otherDigest; }).status, 'NOT_READY');
  assert.equal(compare(x => { x.rollback.rehearsed = false; }).status, 'NOT_READY');
});

test('learning summary preserves exact positive/negative/error evidence and recorded owner decisions', () => {
  const observations = [
    { id: 'success-observation', outcome: { observed: true, latency_ms: 12 }, owner_verdict: 'PENDING', evidence_sha256: digest },
    { id: 'negative-observation', outcome: false, owner_verdict: 'FAIL', evidence_sha256: otherDigest, error: 'timeout' },
    { id: 'approved-observation', outcome: 'no regression observed', owner_verdict: 'PASS', evidence_sha256: digest },
  ];
  const summary = buildLearningSummary(observations);
  assert.deepEqual(summary.observations, observations);
  assert.equal(summary.owner_verdict, 'PENDING');
  assert.equal(summary.observation_count, 3);
  summary.observations[0].outcome.latency_ms = 1;
  assert.equal(observations[0].outcome.latency_ms, 12);
});

test('learning summaries reject missing outcome, evidence or owner status without relabeling', () => {
  for (const row of [
    { id: 'x', outcome: false, owner_verdict: 'PENDING' },
    { id: 'x', evidence_sha256: digest, owner_verdict: 'PENDING' },
    { id: 'x', evidence_sha256: digest, outcome: false },
    { id: 'x', evidence_sha256: digest, outcome: false, owner_verdict: 'AI_APPROVED' },
  ]) assert.throws(() => buildLearningSummary([row]));
  assert.throws(() => buildLearningSummary('rows'), /array/);
});
