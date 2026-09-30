#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { loadReferenceFidelityPolicy, assessReferenceFidelity } = require('../lib/reference-fidelity-policy');

const root = path.resolve(__dirname, '..');
let failed = false;
function ok(condition, message) {
  if (!condition) {
    failed = true;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`OK: ${message}`);
  }
}
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const policy = loadReferenceFidelityPolicy();
ok(policy.schema === 'reference-fidelity-policy-v1', 'reference fidelity policy v1 active');
ok(policy.minimumFinalSimilarityPercent === 85, 'final similarity floor is 85%');
ok(policy.principles.noSilentTechnologyDowngrade === true, 'silent technology downgrade forbidden');
ok(policy.classes['volumetric-fps'].forbiddenAsFinal.includes('raycaster-2.5d'), 'raycaster final substitute forbidden');
ok(policy.classes['volumetric-fps'].forbiddenAsFinal.includes('billboard-enemy'), 'billboard enemy final substitute forbidden');
ok(policy.classes['volumetric-fps'].forbiddenAsFinal.includes('hud-canvas-weapon'), 'HUD/canvas weapon final substitute forbidden');
ok(policy.krieger.buildRequirements.autonomousSingleFile === true, 'Krieger single-file requirement active');
ok(policy.krieger.buildRequirements.externalRuntimeSubresources === 0, 'Krieger external runtime dependency count is zero');

const bad = assessReferenceFidelity({
  referenceClass: 'volumetric-fps',
  requireAutonomousSingleFile: true,
  finalClaim: true,
  candidate: {
    renderer: 'raycaster-2.5d',
    environment: 'true-3d-depth-tested',
    weapon: 'hud-canvas-weapon',
    enemies: 'billboard-enemy',
    lighting: 'screen-space-only',
    camera: 'perspective-3d',
    renderScale: 0.5,
    autonomousSingleFile: true,
    visualSimilarityPercent: 92,
    freshSideBySideEvidence: true,
    behavioralSmokePassed: true
  }
});
ok(bad.pass === false && bad.reasons.length >= 5, 'known Krieger downgrade is rejected even with a high self-score');

const good = assessReferenceFidelity({
  referenceClass: 'volumetric-fps',
  requireAutonomousSingleFile: true,
  finalClaim: true,
  candidate: {
    renderer: 'webgl2',
    environment: 'true-3d-depth-tested',
    weapon: 'true-3d-depth-tested',
    enemies: 'true-3d-volumetric',
    lighting: 'scene-reactive',
    camera: 'perspective-3d',
    renderScale: 1,
    autonomousSingleFile: true,
    visualSimilarityPercent: 85,
    freshSideBySideEvidence: true,
    behavioralSmokePassed: true
  }
});
ok(good.pass === true, 'fully volumetric candidate can pass at the evidence floor');

for (const rel of [
  'docs/REFERENCE_DIMENSIONAL_FIDELITY.md',
  'scripts/verify-kkrieger-standalone.js',
  '.github/workflows/build-kkrieger-standalone.yml'
]) ok(fs.existsSync(path.join(root, rel)), `${rel} exists`);

const agents = read('AGENTS.md').toLowerCase();
for (const phrase of [
  'reference dimensional fidelity',
  'raycaster',
  'billboard',
  'hud/canvas weapon',
  'scene-reactive lighting',
  'side-by-side'
]) ok(agents.includes(phrase), `AGENTS.md includes fidelity rule: ${phrase}`);

const errors = JSON.parse(read('data/error-prevention-registry.json'));
const protectedError = (errors.knownErrors || []).find((e) => e.id === 'reference-3d-silently-downgraded-to-2d');
ok(Boolean(protectedError), 'confirmed Krieger downgrade error registered');
ok(protectedError?.status === 'protected', 'confirmed Krieger downgrade error is protected');

const pkg = JSON.parse(read('package.json'));
ok(pkg.scripts?.['fidelity:check'] === 'node scripts/check-reference-fidelity-policy.js', 'package fidelity:check wired');
ok(pkg.scripts?.check?.includes('npm run fidelity:check'), 'npm check includes fidelity guard');

const ci = read('.github/workflows/ci.yml');
ok(ci.includes('Reference dimensional fidelity (hard)'), 'CI names hard reference fidelity gate');
ok(ci.includes('npm run fidelity:check'), 'CI executes hard reference fidelity gate');

const workflow = read('.github/workflows/build-kkrieger-standalone.yml');
ok(workflow.includes('3bf0ff017372e640e966c2785a4d95a998cec242'), 'Krieger build pins reviewed upstream commit');
ok(workflow.includes('SINGLE_FILE'), 'Krieger build enables Emscripten SINGLE_FILE');
ok(workflow.includes('--embed-file'), 'Krieger build embeds data files');
ok(workflow.includes('verify-kkrieger-standalone.js'), 'Krieger build runs single-file verifier');

if (failed) process.exit(1);
console.log('\nREFERENCE FIDELITY POLICY PASSED');
