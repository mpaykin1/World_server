const test = require('node:test');
const assert = require('node:assert/strict');
const { isDeployableFile } = require('../scripts/check-vercel-ignore.js');

test('isDeployableFile correctly identifies non-deployable paths', () => {
  const nonDeployable = [
    '.ai/bridge/tasks.jsonl',
    '.ai/bridge/results.jsonl',
    '.github/workflows/ci.yml',
    '.github/workflows/ai-bridge.yml',
    'docs/AI3D_WALKABLE_REQUIREMENTS.md',
    'docs/CLOUD_AI_HANDOFF.md',
    'test/auth.test.js',
    'test/vercel-ignore.test.js',
    'e2e/golden-release.spec.js',
    'godot/world-client/main.tscn',
    'policy/collective-brain.rego',
    'templates/godot-voxel-game-starter/README.md',
    'README.md',
    'AGENTS.md',
    'FIX_NPM_INSTALL.txt',
    '.gitignore',
    '.env.example',
    'ai3d-final-delivery.json',
    'QUALITY_REPORT.json',
    'COLLECTIVE_BRAIN_RUNTIME_EVIDENCE.json',
    'OPENHUMAN_LAUNCH_CHECK.json',
    'ANYTHINGLLM_HEALTH_CHECK.json',
    'WORLD_RUNTIME_QUALITY_REPORT.json',
    'TECHNOLOGY_AUDIT.json',
    'EVIDENCE_QUALITY_REPORT.json'
  ];

  for (const filepath of nonDeployable) {
    assert.equal(
      isDeployableFile(filepath),
      false,
      `Expected ${filepath} to be non-deployable`
    );
  }
});

test('isDeployableFile correctly identifies deployable runtime and application paths', () => {
  const deployable = [
    'api/apps.js',
    'api/config.js',
    'apps/voxel-world/index.html',
    'apps/voxel-world/client.js',
    'lib/env.js',
    'lib/ai-bridge.js',
    'shared/common.js',
    'shared/dark-void-manifestation.mjs',
    'supabase/migrations/20260824000000_initial_schema.sql',
    'server.js',
    'vercel.json',
    'package.json',
    'package-lock.json',
    'scripts/check-vercel-ignore.js',
    'scripts/inject-sentry-runtime.js'
  ];

  for (const filepath of deployable) {
    assert.equal(
      isDeployableFile(filepath),
      true,
      `Expected ${filepath} to be deployable`
    );
  }
});
