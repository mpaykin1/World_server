'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('LIGHT has a canonical public API and profile', () => {
  const api = read('shared/light/index.mjs');
  const profile = read('shared/light/profile.mjs');
  assert.match(api, /LightPipeline/);
  assert.match(api, /livingGoldProfile/);
  assert.match(api, /createLightWhiskerBundle/);
  assert.match(profile, /id: 'living-gold'/);
  assert.match(profile, /coreGain/);
  assert.match(profile, /bloomGain/);
});

test('LIGHT captures real 3D normal and depth evidence', () => {
  const capture = read('shared/light/capture.mjs');
  assert.match(capture, /MeshNormalMaterial/);
  assert.match(capture, /MeshDepthMaterial/);
  assert.match(capture, /HalfFloatType/);
  assert.match(capture, /overrideMaterial/);
});

test('LIGHT edge shader includes rim distance depth and stable filaments', () => {
  const shader = read('shared/light/shaders.mjs');
  assert.match(shader, /approximateDistance/);
  assert.match(shader, /fresnel/);
  assert.match(shader, /depthEdge/);
  assert.match(shader, /filament/);
  assert.match(shader, /uCoreColor/);
  assert.match(shader, /uGoldColor/);
  assert.match(shader, /uAmberColor/);
});

test('LIGHT has motion-aware temporal stabilization and bloom', () => {
  const shader = read('shared/light/shaders.mjs');
  const pipeline = read('shared/light/pipeline.mjs');
  assert.match(shader, /motionReject/);
  assert.match(shader, /KAWASE_FRAGMENT/);
  assert.match(pipeline, /#stabilize/);
  assert.match(pipeline, /#bloom/);
  assert.match(pipeline, /HalfFloatType/);
});

test('silhouette 3D lab is integrated through LIGHT', () => {
  const lab = read('apps/silhouette-3d-lab/client.js');
  assert.match(lab, /\/shared\/light\/index\.mjs/);
  assert.match(lab, /new LightPipeline/);
  assert.match(lab, /window\.LIGHT/);
});

test('LIGHT cross-chat handoff preserves user decision boundaries', () => {
  const docs = read('docs/LIGHT_SYSTEM.md');
  assert.match(docs, /Canonical name: \*\*LIGHT\*\*/);
  assert.match(docs, /3D silhouette system as SUCCESS/);
  assert.match(docs, /plain line quality as \*\*FAILURE\*\*/);
  assert.match(docs, /must be shown to the user/);
});
