'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createReference3DAgentState,
  registerReferenceViews,
  chooseReconstructionLane,
  buildReference3DPlan,
  inspectScene,
  exportVerificationContract,
  recordTaskResult,
  buildContextManifest
} = require('../lib/reference-3d-agent');
const { createWorldDNA } = require('../lib/world-factory');

const view = (role, projection = 'orthographic') => ({
  id: role,
  role,
  projection,
  width: 64,
  height: 64,
  pixelArt: true,
  landmarks: [{ label: 'roof-spire', x: 0.5, y: 0.15, prominence: 0.92 }]
});

test('two orthographic pixel-art views choose deterministic Pixel2World visual hull', () => {
  const state = createReference3DAgentState();
  registerReferenceViews(state, [view('front'), view('right')]);
  assert.equal(state.phase, 'inspect');
  assert.equal(state.ambiguity.cameraCalibrationRequired, false);
  assert.equal(chooseReconstructionLane(state).id, 'pixel2world-visual-hull');
  assert.equal(state.identityFeatures[0].label, 'roof-spire');
});

test('perspective references require calibration and use the AI3D lane', () => {
  const state = createReference3DAgentState();
  registerReferenceViews(state, [view('front', 'perspective'), view('right', 'perspective')]);
  const plan = buildReference3DPlan(state);
  assert.equal(state.ambiguity.cameraCalibrationRequired, true);
  assert.equal(plan.lane.id, 'ai3d-multiview');
  assert.equal(plan.tasks.find((task) => task.id === 'camera-calibration').status, 'pending');
});

test('plan reuses existing cleanup, UV, material, export and render-back systems', () => {
  const state = createReference3DAgentState();
  registerReferenceViews(state, [view('front'), view('right')]);
  const plan = buildReference3DPlan(state, { includeAnimation: true });
  const ids = plan.tasks.map((task) => task.id);
  for (const required of ['mesh-cleanup','retopology','uv-unwrap','pbr-materials','rig-animation','export-glb','reimport-verify','render-back-compare']) {
    assert.ok(ids.includes(required), required);
  }
  assert.match(plan.tasks.find((task) => task.id === 'rig-animation').adapter, /ActionForge/);
});

test('scene inspection is evidence and technical verification cannot set owner verdict', () => {
  const state = createReference3DAgentState();
  registerReferenceViews(state, [view('front'), view('right')]);
  buildReference3DPlan(state);
  const inspection = inspectScene(state, { objectCount: 3, meshCount: 2, faceCount: 4200, materialCount: 2, uvLayerCount: 1, bounds: [-1,-1,0,1,1,3] });
  assert.equal(inspection.meshCount, 2);
  for (const task of state.tasks) recordTaskResult(state, { id: task.id, status: 'verified', evidence: [{ type: 'test' }] });
  assert.equal(state.phase, 'technically-verified');
  assert.equal(state.userVerdict, 'UNSET');
});

test('export contract requires active-scene scoped export and isolated re-import verification', () => {
  const contract = exportVerificationContract({ expectAnimations: true });
  assert.equal(contract.useActiveScene, true);
  assert.equal(contract.reimportRequired, true);
  assert.equal(contract.reimportIsolation, 'temporary-collection-in-active-scene');
  assert.equal(contract.checks.animationClipsPreserved, true);
});

test('context manifest never exposes local paths', () => {
  const manifest = buildContextManifest([{ name: 'front.png', path: 'C:/secret/front.png', bytes: 123, sha256: 'a'.repeat(64) }]);
  assert.deepEqual(Object.keys(manifest[0]).sort(), ['bytes','extension','name','sha256']);
  assert.equal(JSON.stringify(manifest).includes('C:/secret'), false);
});

test('World Factory embeds the reusable REFERENCE3D_AGENT state', () => {
  const loreBible = { worlds: {} };
  const dna = createWorldDNA({ idea: 'pixel reference castle', requestId: '123e4567-e89b-42d3-a456-426614174000', loreBible });
  assert.equal(dna.referencePipeline.agent3d.capability, 'REFERENCE3D_AGENT');
  assert.equal(dna.referencePipeline.agent3d.userVerdict, 'UNSET');
});
