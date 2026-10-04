'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'ai3d-worker', 'tools', 'reference3d_blender.py'), 'utf8');

test('REFERENCE3D Blender tool is selection-scoped and active-scene aware', () => {
  assert.match(source, /selected_objects/);
  assert.match(source, /use_selection/);
  assert.match(source, /use_active_scene/);
  assert.match(source, /bpy\.context\.scene\.collection\.children\.link/);
});

test('REFERENCE3D Blender tool verifies its own GLB by isolated re-import', () => {
  assert.match(source, /REFERENCE3D_VERIFY_TEMP/);
  assert.match(source, /bpy\.ops\.import_scene\.gltf/);
  assert.match(source, /fileNonEmpty/);
  assert.match(source, /finiteWorldBounds/);
  assert.match(source, /meshCountStable/);
  assert.match(source, /materialPresence/);
  assert.match(source, /uvPresence/);
  assert.match(source, /animationClipsPreserved/);
});

test('REFERENCE3D Blender tool protects deform-sensitive meshes from destructive optimization', () => {
  assert.match(source, /is_deform_sensitive/);
  assert.match(source, /skipped-deform-sensitive/);
  assert.match(source, /ARMATURE/);
  assert.match(source, /shape_keys/);
});

test('REFERENCE3D Blender tool cannot self-approve user verdict', () => {
  assert.match(source, /"userVerdict": "UNSET"/);
  assert.doesNotMatch(source, /"userVerdict": "(?:SUCCESS|FAILURE)"/);
});
