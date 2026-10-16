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
  assert.equal(result.no_production_cutover, true);
  assert.ok(result.groups.every(g => !g.execute_automatically));
});
test('archive space is measured only with complete statistics', () => {
  const result = buildPlan(base, [
    { table: 'public.voxel_worlds', bytes: 1024 },
    { table: 'private.quality_runtime_scores', bytes: 20_000_000 },
    { table: 'public.browser_ai_tasks', bytes: 2048 },
  ]);
  assert.equal(result.groups[1].observed_bytes, 20_000_000);
  assert.equal(result.unknown_size_or_dependency_block, false);
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
