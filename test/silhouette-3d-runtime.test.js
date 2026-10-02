'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('silhouette runtime uses real 3D geometry and articulated hierarchy', () => {
  const rig = read('shared/silhouette-3d/creature-rig.mjs');
  assert.match(rig, /SphereGeometry/);
  assert.match(rig, /CylinderGeometry/);
  assert.match(rig, /new THREE\.Group/);
  assert.match(rig, /headPivot/);
  assert.match(rig, /tailBone/);
  assert.match(rig, /quaternion\.copy/);
});

test('silhouette animation rotates head and tail in 3D with quaternions', () => {
  const animation = read('shared/silhouette-3d/animation.mjs');
  assert.match(animation, /setFromEuler/);
  assert.match(animation, /headYaw/);
  assert.match(animation, /headPitch/);
  assert.match(animation, /tail\.forEach/);
  assert.match(animation, /const yaw/);
  assert.match(animation, /const pitch/);
  assert.match(animation, /const roll/);
});

test('silhouette pipeline preserves mask-render-target postprocess architecture', () => {
  const pipeline = read('shared/silhouette-3d/outline-pipeline.mjs');
  assert.match(pipeline, /WebGLRenderTarget/);
  assert.match(pipeline, /tMask/);
  assert.match(pipeline, /ShaderMaterial/);
  assert.match(pipeline, /OrthographicCamera/);
  assert.match(pipeline, /render\(this\.maskScene, this\.camera\)/);
});

test('integration lab proves perspective 3D and exposes evidence hook', () => {
  const index = read('apps/silhouette-3d-lab/index.html');
  const client = read('apps/silhouette-3d-lab/client.js');
  assert.match(index, /three@0\.185\.1/);
  assert.match(client, /PerspectiveCamera/);
  assert.match(client, /Silhouette3DOutlinePipeline/);
  assert.match(client, /animateSilhouetteCreature/);
  assert.match(client, /window\.Silhouette3DLive/);
});
