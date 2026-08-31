'use strict';
const fs = require('fs');
const path = require('path');

const REQUIRED = [
  'lib/world-procedural-live-supabase.js',
  'lib/world-procedural-navigator-commit.js',
  'lib/world-procedural-grammar.js',
  'lib/world-procedural-sparse-voxel.js',
  'lib/world-procedural-distributed-cache.js',
  'lib/world-procedural-gpu-visibility.js',
  'lib/world-procedural-audio-runtime.js',
  'lib/world-procedural-telemetry-tournament.js',
  'lib/world-procedural-native-contract.js',
  'native/godot/world_procedural_contract.gd',
  'supabase/migrations/20260831072856_world_procedural_recipe_atomic_commit_v3.sql'
];
function run(root = process.cwd()) {
  const checks = [];
  for (const rel of REQUIRED) checks.push({ id: `exists:${rel}`, ok: fs.existsSync(path.join(root, rel)) });
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260831072856_world_procedural_recipe_atomic_commit_v3.sql'), 'utf8').toLowerCase();
  checks.push({ id: 'migration:no-new-table', ok: !/create\s+table/.test(migration) });
  checks.push({ id: 'migration:security-invoker', ok: /security\s+invoker/.test(migration) && !/security\s+definer/.test(migration) });
  checks.push({ id: 'migration:no-anon-exec', ok: /revoke all on function[\s\S]+from anon/.test(migration) && /from authenticated/.test(migration) });
  checks.push({ id: 'migration:service-only', ok: /grant execute on function[\s\S]+to service_role/.test(migration) });
  checks.push({ id: 'migration:no-realtime-schema-write', ok: !/realtime\s*\./.test(migration) });
  const failed = checks.filter((c) => !c.ok);
  const report = { system: 'WORLD_PROCEDURAL_RECIPE_ENGINE_V3', pass: checks.length - failed.length, fail: failed.length, checks };
  if (process.argv.includes('--write')) fs.writeFileSync(path.join(root, 'WORLD_PROCEDURAL_V3_AUDIT.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (failed.length) process.exitCode = 1;
  return report;
}
if (require.main === module) run();
module.exports = { run };
