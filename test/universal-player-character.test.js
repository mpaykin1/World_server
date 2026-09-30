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
  let clipCount = 0;
  for (const relative of manifest.animationGroups) {
    const json = readGlbJson(path.join(CHAR_ROOT, relative));
    for (const clip of json.animations || []) {
      clipCount++;
      clips.add(clip.name);
    }
  }

  assert.equal(manifest.id, semantics.characterId);
  assert.equal(clipCount, manifest.compatibleAnimationClipCount);
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


test('Roblox importer selects the canonical universal player character for Humanoid ports', () => {
  const { importRbxlx } = require('../lib/roblox-importer');
  const xml = `<?xml version="1.0" encoding="utf-8"?><roblox version="4"><Item class="Workspace" referent="W"><Properties><string name="Name">Workspace</string></Properties><Item class="Model" referent="C"><Properties><string name="Name">Character</string></Properties><Item class="Humanoid" referent="H"><Properties><string name="Name">Humanoid</string></Properties></Item><Item class="LocalScript" referent="S"><Properties><string name="Name">Animate</string><ProtectedString name="Source"><![CDATA[local h=script.Parent:FindFirstChildOfClass("Humanoid")]]></ProtectedString></Properties></Item></Item></Item></roblox>`;
  const result = importRbxlx(xml);
  assert.equal(result.adapters.character.mode, 'replace-standard-humanoid');
  assert.equal(result.adapters.character.characterId, 'kaykit-knight-rig-medium');
  assert.equal(result.adapters.character.canonical, 'shared/universal-player-character.mjs');
  assert.equal(result.recipe.player.characterId, 'kaykit-knight-rig-medium');
});
