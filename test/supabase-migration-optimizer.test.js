'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan } = require('../scripts/supabase-migration-optimizer.cjs');

const base = {
  migration_id: 'fixture',
  source: { project_ref: 'source-ref' },
  target: { project_ref: 'target-ref' },
  priority_tables: ['public.voxel_worlds'],
  archive_only_data_tables: ['private.quality_runtime_scores'],
  reset_on_target_data_tables: ['public.browser_ai_tasks'],
};
test('empty stats produce only a dry-run plan and unknown-size blocker', () => {
  const result = buildPlan(base);
  assert.equal(result.mode, 'DRY_RUN');
  assert.equal(result.unknown_size_or_dependency_block, true);
  assert.equal(result.unknown_size_block, true);
  assert.equal(result.size_status, 'INCOMPLETE');
  assert.equal(result.execute_automatically, false);
  assert.equal(result.owner_verdict, 'PENDING');
  assert.equal(result.no_production_cutover, true);
  assert.ok(result.groups.every(g => !g.execute_automatically));
});
test('complete size statistics never establish dependency or backup readiness', () => {
  const result = buildPlan(base, [
    { table: 'public.voxel_worlds', bytes: 1024 },
    { table: 'private.quality_runtime_scores', bytes: 20_000_000 },
    { table: 'public.browser_ai_tasks', bytes: 2048 },
  ]);
  assert.equal(result.groups[1].observed_bytes, 20_000_000);
  assert.equal(result.unknown_size_block, false);
  assert.equal(result.size_status, 'COMPLETE_FOR_CLASSIFIED_TABLES');
  assert.equal(result.unknown_size_or_dependency_block, true);
  assert.equal(result.dependency_audit_status, 'NOT_VERIFIED');
  assert.equal(result.backup_restore_status, 'NOT_VERIFIED');
  assert.equal(result.execute_automatically, false);
  assert.equal(result.owner_verdict, 'PENDING');
});
test('unclassified tables always require review', () => {
  const result = buildPlan(base, [
    { table: 'public.voxel_worlds', bytes: 1024 },
    { table: 'private.quality_runtime_scores', bytes: 100 },
    { table: 'public.browser_ai_tasks', bytes: 0 },
    { table: 'public.new_critical_table', bytes: 999 },
  ]);
  assert.deepEqual(result.unclassified, [{
    table: 'public.new_critical_table', bytes: 999, action: 'inspect_before_migration'
  }]);
  assert.equal(result.unknown_size_or_dependency_block, true);
});
test('refuse overlapping protected and disposable table groups', () => {
  assert.throws(() => buildPlan({ ...base, reset_on_target_data_tables: ['public.voxel_worlds'] }), /multiple groups/);
});
test('refuse suspicious table names or impossible sizes', () => {
  assert.throws(() => buildPlan({ ...base, priority_tables: ['public.users;drop table users'] }), /Unsafe/);
  assert.throws(() => buildPlan(base, [{ table: 'public.voxel_worlds', bytes: -1 }]), /Invalid/);
});
test('known safe byte totals retain exact integer sums', () => {
  const config = { ...base, priority_tables: ['public.voxel_worlds', 'public.voxel_player_states'] };
  const result = buildPlan(config, [
    { table: 'public.voxel_worlds', bytes: Number.MAX_SAFE_INTEGER - 1024 },
    { table: 'public.voxel_player_states', bytes: '1024' },
    { table: 'private.quality_runtime_scores', bytes: '0' },
    { table: 'public.browser_ai_tasks', bytes: 0 },
  ]);
  assert.equal(result.groups[0].observed_bytes, Number.MAX_SAFE_INTEGER);
  assert.equal(result.groups[1].observed_bytes, 0);
  assert.equal(result.groups[2].observed_bytes, 0);
  assert.equal(result.unknown_size_block, false);
  assert.equal(result.unknown_size_or_dependency_block, true);
});
test('individually valid table sizes cannot overflow a group total', () => {
  const config = { ...base, archive_only_data_tables: ['private.quality_runtime_scores', 'private.quality_synthetic_probes'] };
  assert.throws(() => buildPlan(config, [
    { table: 'private.quality_runtime_scores', bytes: Number.MAX_SAFE_INTEGER },
    { table: 'private.quality_synthetic_probes', bytes: 1 },
  ]), /Unsafe total table bytes/);
});
test('reject ambiguous and invalid byte statistics instead of coercing them', () => {
  const invalid = [undefined, null, '', ' ', '\t', true, false, [], [0], {},
    '0x10', '1e3', '1.0', '01', '+1', ' 1', '1 ', 'NaN', 'Infinity',
    NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, '9007199254740992'];
  for (const bytes of invalid) {
    assert.throws(() => buildPlan(base, [{ table: 'public.voxel_worlds', bytes }]), /Invalid table bytes/);
  }
  assert.throws(() => buildPlan(base, null), /Invalid table statistics/);
  assert.throws(() => buildPlan(base, [null]), /Invalid table statistics entry/);
});
test('refuse duplicate table statistics even when byte counts agree', () => {
  assert.throws(() => buildPlan(base, [
    { table: 'public.voxel_worlds', bytes: 0 },
    { table: 'public.voxel_worlds', bytes: 0 },
  ]), /Duplicate table statistics/);
});
