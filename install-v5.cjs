#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const PATCH = __dirname;
const ROOT = process.cwd();
const PAYLOAD = path.join(PATCH, 'payload');

function fail(message) {
  console.error(`[DREAM_AUTOPILOT_V5] ERROR: ${message}`);
  process.exit(2);
}
if (!fs.existsSync(path.join(ROOT, 'package.json')) || !fs.existsSync(path.join(ROOT, 'server.js'))) {
  fail('Run this installer from the World_server repository root.');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(ROOT, '.dream-autopilot-v5-backup', stamp);
fs.mkdirSync(backupRoot, { recursive: true });

function backup(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return;
  const dst = path.join(backupRoot, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyTree(src, dst, rel = '') {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const nextRel = path.join(rel, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyTree(from, to, nextRel);
    } else {
      backup(nextRel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      console.log(`[DREAM_AUTOPILOT_V5] installed ${nextRel.replaceAll('\\', '/')}`);
    }
  }
}

backup('package.json');
backup('DESKTOP_AI_INSTALL_AND_VERIFY.md');
backup('WORK_IN_PROGRESS.md');
copyTree(PAYLOAD, ROOT);

const packagePath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.scripts ||= {};
Object.assign(pkg.scripts, {
  'runtime:proof': 'node scripts/runtime-proof.js',
  'quality:dream': 'node scripts/dream-readiness.js',
  'quality:dream-orchestrator': 'node scripts/world-quality-orchestrator.js',
  'quality:dream:extended': 'node scripts/world-quality-orchestrator.js --extended',
  'quality:dream:self-heal': 'node scripts/world-quality-orchestrator.js --apply-safe-fixes',
  'quality:dream-agent': 'playwright test e2e/ai-gameplay-agent.spec.js --project=desktop-chromium',
  'quality:physics-guardian': 'playwright test e2e/physics-guardian.spec.js --project=desktop-chromium',
  'quality:motion': 'node scripts/character-motion-validator.js',
  'quality:animation': 'node scripts/animation-quality-validator.js',
  'quality:performance:capture': 'playwright test e2e/performance-telemetry.spec.js --project=desktop-chromium',
  'quality:performance-budget': 'node scripts/performance-budget-gate.js',
  'quality:chaos': 'node scripts/network-chaos-runner.js',
  'quality:swarm': 'node scripts/multiplayer-swarm.js',
  'quality:cv-player': 'node scripts/cv-gameplay-agent.js',
  'quality:device-farm': 'node services/device-farm/runner.js',
  'quality:roblox-bridge': 'node services/roblox-test-bridge/runner.js',
  'quality:canary-rollback': 'node scripts/canary-rollback-gate.js',
  'quality:telemetry': 'playwright test e2e/runtime-telemetry.spec.js --project=desktop-chromium',
  'quality:godot-runtime': 'node scripts/godot-runtime-smoke.js',
  'quality:device:probe': 'node scripts/world-device-provider-probe.js',
  'quality:texture-baker:smoke': 'node scripts/semantic-texture-baker-smoke.js',
  'quality:meshlets': 'playwright test e2e/webgpu-meshlet-experiment.spec.js --project=desktop-chromium',
  'quality:winner-pr:guard': 'node scripts/winner-only-pr-guard.js',
  'quality:v5:repair': 'node scripts/quality-repair-loop-v5.js --apply-safe',
  'quality:system:v5': 'node scripts/system-readiness-v5.js',
  'quality:world:v5': 'node scripts/world-quality-v5.js'
});
if (pkg.scripts['release:gate']) {
  let gate = pkg.scripts['release:gate'];
  gate = gate.replace(/npm run quality:world(?!:)/g, 'npm run quality:world:v5');
  if (!gate.includes('npm run runtime:proof')) gate += ' && npm run runtime:proof';
  if (!gate.includes('npm run quality:system:v5')) gate += ' && npm run quality:system:v5';
  pkg.scripts['release:gate'] = gate;
}
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

const desktopPath = path.join(ROOT, 'DESKTOP_AI_INSTALL_AND_VERIFY.md');
if (fs.existsSync(desktopPath)) {
  let s = fs.readFileSync(desktopPath, 'utf8');
  const marker = '## 13. Dream Autopilot V5 CPU — repair-until-PASS rule';
  if (!s.includes(marker)) {
    s += `

${marker}

After installing V5 Desktop AI MUST run:

- \`npm run runtime:proof\`
- \`npm run quality:dream-agent\`
- \`npm run quality:physics-guardian\`
- \`npm run quality:performance:capture\`
- \`npm run quality:performance-budget -- --require\`
- \`npm run quality:texture-baker:smoke\`
- \`npm run quality:meshlets\`
- \`npm run quality:device:probe\`
- \`npm run quality:world:v5\`
- \`npm run quality:system:v5\`
- \`npm run release:gate\`

Mandatory rule: **DO NOT STOP while any fixable discovered error remains.** Repeat root-cause -> fix -> regression test -> all affected tests until PASS. If a physical device, Roblox, CV provider, or another external runtime is unavailable, record BLOCKED/NOT_CONFIGURED/NOT_VERIFIED; never count it as PASS. Never lower accepted graphics, gameplay, physics, controls, animation, or performance thresholds merely to make a test pass.
`;
    fs.writeFileSync(desktopPath, s);
  }
}

const wipPath = path.join(ROOT, 'WORK_IN_PROGRESS.md');
if (fs.existsSync(wipPath)) {
  let s = fs.readFileSync(wipPath, 'utf8');
  const marker = '## DREAM AUTOPILOT V5 CPU';
  if (!s.includes(marker)) {
    s += `

${marker}

- Task: integrate strict Runtime Proof, physical-device runtime evidence, measured telemetry -> feedback, CPU semantic PBR baking, WebGPU meshlet experiment, winner-only PR automation, CV/Roblox/swarm/canary bridges.
- Preserve: all accepted Golden graphics/assets, controls, collisions, mobile behavior, current World Quality Autopilot V4 adaptive runtime and all working gameplay.
- Tests: runtime proof, AI gameplay, Physics Guardian, measured performance, texture-baker smoke, meshlet experiment, V5 world/system readiness, release gate.
- Completion rule: do not stop until every fixable discovered error is corrected, regression-protected and all affected tests PASS. External unavailable runtimes remain explicit blockers and never false PASS.
`;
    fs.writeFileSync(wipPath, s);
  }
}

console.log(`[DREAM_AUTOPILOT_V5] installed. backup=${path.relative(ROOT, backupRoot)}`);
console.log('[DREAM_AUTOPILOT_V5] next: npm run runtime:proof && npm run release:gate');
