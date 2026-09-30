'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CHAR_ROOT = path.join(ROOT, 'assets', 'characters', 'kaykit-knight');

function readGlbJson(filePath) {
  const data = fs.readFileSync(filePath);
  assert.equal(data.subarray(0, 4).toString('ascii'), 'glTF');
  const jsonLength = data.readUInt32LE(12);
  return JSON.parse(data.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

test('canonical universal player semantics resolve against vendored Rig_Medium clips', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(CHAR_ROOT, 'manifest.json'), 'utf8'));
  const semantics = JSON.parse(fs.readFileSync(path.join(CHAR_ROOT, 'semantic-actions.json'), 'utf8'));
  const clips = new Set();
  for (const relative of manifest.animationGroups) {
    const json = readGlbJson(path.join(CHAR_ROOT, relative));
    for (const clip of json.animations || []) clips.add(clip.name);
  }

  assert.equal(manifest.id, semantics.characterId);
  assert.equal(clips.size, manifest.compatibleAnimationClipCount);
  for (const required of semantics.requiredCore) {
    const candidates = semantics.actions[required];
    assert.ok(Array.isArray(candidates) && candidates.length, `missing candidates for ${required}`);
    assert.ok(candidates.some((name) => clips.has(name)), `no real Rig_Medium clip resolves semantic ${required}`);
  }
});

test('Roblox Humanoid defaults map only to declared universal-player semantics', () => {
  const semantics = JSON.parse(fs.readFileSync(path.join(CHAR_ROOT, 'semantic-actions.json'), 'utf8'));
  for (const semantic of Object.values(semantics.robloxHumanoidStates)) {
    assert.ok(semantics.actions[semantic], `Humanoid mapping references unknown semantic ${semantic}`);
  }
  for (const semantic of Object.values(semantics.robloxDefaultAnimationAliases)) {
    assert.ok(semantics.actions[semantic], `Roblox animation alias references unknown semantic ${semantic}`);
  }
});

test('verified Roblox MVP consumes the shared universal player runtime rather than a local animation regex', () => {
  const source = fs.readFileSync(path.join(ROOT, 'apps', 'roblox-gothic-rocks', 'client.js'), 'utf8');
  assert.match(source, /loadUniversalPlayer/);
  assert.doesNotMatch(source, /Rig_Medium_MovementBasic\.glb/);
  assert.doesNotMatch(source, /if\(\/idle\//);
});
