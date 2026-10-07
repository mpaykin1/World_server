'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CHAR_ROOT = path.join(ROOT, 'assets', 'characters', 'actionforge-quaternius');

function readGlbJson(filePath) {
  const data = fs.readFileSync(filePath);
  assert.equal(data.subarray(0, 4).toString('ascii'), 'glTF');
  const jsonLength = data.readUInt32LE(12);
  return JSON.parse(data.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

test('ActionForge vendor pack contains the real current CC0 export', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(CHAR_ROOT, 'manifest.json'), 'utf8'));
  const groups = manifest.animationGroups.map((relative) => readGlbJson(path.join(CHAR_ROOT, relative)));
  const rig = readGlbJson(path.join(CHAR_ROOT, manifest.model));
  const names = groups.flatMap((group) => (group.animations || []).map((clip) => clip.name));

  assert.equal(manifest.license, 'CC0-1.0');
  assert.equal(manifest.sourceSkeleton, 'default');
  assert.equal(names.length, 85);
  assert.equal(new Set(names).size, 85);
  assert.equal(manifest.compatibleAnimationClipCount, names.length);
  assert.ok(groups.every((group) => (group.meshes || []).length === 0));
  assert.equal((rig.meshes || []).length, 1);
  assert.equal((rig.skins || []).length, 1);
});

test('ActionForge required semantics resolve only to clips actually present', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(CHAR_ROOT, 'manifest.json'), 'utf8'));
  const semantics = JSON.parse(fs.readFileSync(path.join(CHAR_ROOT, 'semantic-actions.json'), 'utf8'));
  const groups = manifest.animationGroups.map((relative) => readGlbJson(path.join(CHAR_ROOT, relative)));
  const clips = new Set(groups.flatMap((group) => (group.animations || []).map((clip) => clip.name)));

  assert.equal(manifest.id, semantics.characterId);
  for (const required of semantics.requiredCore) {
    const candidates = semantics.actions[required];
    assert.ok(Array.isArray(candidates) && candidates.length, `missing candidates for ${required}`);
    assert.ok(candidates.some((name) => clips.has(name)), `no real ActionForge clip resolves ${required}`);
  }
});

test('licence boundary excludes ActionForge code and Mixamo reference skeleton', () => {
  const notice = fs.readFileSync(path.join(CHAR_ROOT, 'THIRD-PARTY-NOTICES.txt'), 'utf8');
  const readme = fs.readFileSync(path.join(CHAR_ROOT, 'README.md'), 'utf8');
  const runtime = fs.readFileSync(path.join(ROOT, 'shared', 'universal-player-character.mjs'), 'utf8');

  assert.match(notice, /THE ANIMATIONS, THE RIG AND THE PROPS/);
  assert.match(notice, /CC0 1\.0 Universal/);
  assert.match(notice, /Mixamo reference skeleton[\s\S]*NOT covered/);
  assert.match(readme, /application code is \*\*not\*\* copied/i);
  assert.match(runtime, /loadActionForgePlayer/);
});
