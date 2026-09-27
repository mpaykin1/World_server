'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const ART = path.join(__dirname, '../apps/voxel-world/voxel-art');
const EXPECTED = ['barren', 'city', 'forest', 'volcano', 'energy', 'idea', 'river', 'villager'];

test('voxel art contract supports gameplay aliases, capping, and safe placement', async () => {
  const {voxelType, planVoxelPlacements, validVoxelManifest} =
    await import('../shared/graphics/voxel-art-contract.mjs');
  assert.equal(voxelType('village'), 'city');
  assert.equal(voxelType('power'), 'energy');
  assert.equal(voxelType('dragon'), null);
  assert.deepEqual(planVoxelPlacements({entities: []}), []);
  const entities = [
    {id: 'a', type: 'city', x: 5, z: 12, radius: 34},
    {id: 'a', type: 'city', x: 6, z: 12}, // duplicate
    {id: 'b', type: 'volcano', position: {x: -10, z: 12}},
    {id: 'invalid', type: 'forest', x: Infinity, z: 5},
    {id: 'other', type: 'untrusted', x: 1, z: 1},
  ];
  const planned = planVoxelPlacements({entities}, 8);
  assert.deepEqual(planned.map(item => item.id), ['a', 'b']);
  assert.equal(planned[0].radius, 34);
  assert.equal(planVoxelPlacements({entities}, 1).length, 1);
  assert.equal(planVoxelPlacements({entities}, 0).length, 0);
  assert.equal(validVoxelManifest({schemaVersion: 1, entities: [{type:'city'}]}), false);
});

test('all eight exported original GLB models have consistent hashes and parseable JSON chunks', async t => {
  if (!fs.existsSync(path.join(ART, 'manifest.json'))) {
    return t.skip('Generated assets absent: run npm run voxel-art:generate on Blender host');
  }
  const {validVoxelManifest} = await import('../shared/graphics/voxel-art-contract.mjs');
  const manifest = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8'));
  assert.equal(validVoxelManifest(manifest), true);
  assert.deepEqual(manifest.entities.map(item => item.id).sort(), EXPECTED.sort());
  for (const asset of manifest.entities) {
    const bytes = fs.readFileSync(path.join(ART, asset.file));
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF', asset.id);
    assert.equal(bytes.readUInt32LE(4), 2, asset.id);
    assert.equal(bytes.readUInt32LE(8), bytes.length, asset.id);
    assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, asset.id); // JSON
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8').trim());
    assert.ok(Array.isArray(json.meshes) && json.meshes.length, asset.id);
    assert.equal(asset.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.equal(asset.bytes, bytes.length);
    assert.ok(asset.bytes < 5_000_000, asset.id + ': mobile budget');
    assert.ok(asset.triangles > 0 && asset.triangles < 25000, asset.id + ': polygon budget');
    assert.ok(Array.isArray(json.scenes), asset.id);
    if (asset.clips.length) {
      assert.ok(Array.isArray(json.animations) && json.animations.length,
        asset.id + ': missing promised animation');
    }
  }
});

test('art generator is original source and all paths are static and same-origin', () => {
  const source = fs.readFileSync(path.join(__dirname, '../tools/voxel-art/generate_blender.py'), 'utf8');
  assert.match(source, /def build_city\(/);
  assert.match(source, /def build_forest\(/);
  assert.match(source, /def build_volcano\(/);
  assert.match(source, /bpy\.ops\.export_scene\.gltf/);
  assert.doesNotMatch(source, /download|requests\.get|subprocess/);
  const runtime = fs.readFileSync(path.join(__dirname, '../apps/voxel-world/voxel-art-runtime.mjs'), 'utf8');
  assert.match(runtime, /validVoxelManifest/);
  assert.match(runtime, /worldGroup\.add\(group\)/);
  assert.match(runtime, /matchMedia/);
  assert.match(runtime, /getError/);
});
