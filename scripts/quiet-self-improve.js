#!/usr/bin/env node
'use strict';

const cp = require('child_process');
const path = require('path');
const ROOT = process.cwd();

function run(label, file, { optional = false, args = [], env = {} } = {}) {
  console.log(`\n[QUIET_SELF_IMPROVE] ${label}`);
  const result = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', file), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env }
  });
  if (result.status !== 0 && !optional) process.exit(result.status || 1);
  return result.status === 0;
}

// Evidence first: production violations are signals for the planner, not a reason to abort learning.
run('production evidence', 'production-quality-pull.js', { optional: true });
run('asset inventory and delivery pressure', 'asset-quality-pipeline.js');
run('deterministic certified renderer integration', 'integrate-runtime-adapters.js', { args: ['--apply'] });
run('runtime renderer/rig integration discovery', 'runtime-integration-discovery.js');
run('semantic animation system gate', 'check-animation-quality-system.js');
run('knowledge graph', 'quality-knowledge-graph.js');
run('impact graph', 'quality-impact-graph.js');
run('risk prediction', 'quality-risk-predictor.js');
run('root-cause analysis', 'quality-root-cause.js');
run('visual critic', 'ai-visual-critic.js', { optional: true });
run('cost/performance optimizer', 'quality-cost-optimizer.js');
run('GPU autoscaler', 'gpu-autoscaler.js');
run('growth engine', 'quality-growth-engine.js');
run('improvement plan', 'quality-improvement-planner.js');
run('enrich plan with PWA/device/animation/graphics/asset policy', 'enrich-improvement-plan.js');

// Prefer independently generated and sandbox-verified alternatives; keep single-candidate fallback.
run('patch tournament', 'quality-patch-tournament.js', { optional: true });
run('single patch fallback', 'quality-patch-synthesizer.js', { optional: true });
run('apply sandbox-verified candidate', 'apply-verified-quality-patch.js');

// Independent deterministic lane may improve safe known patterns even when no model endpoint exists.
run('deterministic safe fixes', 'quality-autofix.js', { args: ['--apply'] });

// Final candidate-specific gates before the workflow even attempts build/deploy.
run('PWA readiness gate', 'check-pwa-system.js');
run('semantic animation gate after changes', 'check-animation-quality-system.js');
run('asset quality report after changes', 'asset-quality-pipeline.js');
run('candidate auto-merge risk classification', 'self-improvement-risk.js');
run('convergence quick gate', 'quality-convergence-loop.js');

console.log('\n[QUIET_SELF_IMPROVE] candidate prepared; release gate + deployed preview + post-deploy smoke are still mandatory');
