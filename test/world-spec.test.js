'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWorldSpec, mergeWorldSpecs } = require('../lib/world-spec');

function story(overrides = {}) {
  return Object.assign({
    id: 'story-a',
    answers: { format: 'game', chars: [{ name: 'Hero' }], worlds: [{ name: 'Citadel' }] },
    blueprint: { title: 'A', mode: 'Игра', scene: 'Scene A' }
  }, overrides);
}

test('buildWorldSpec carries the story blueprint, characters and worlds through unchanged', () => {
  const spec = buildWorldSpec(story());
  assert.equal(spec.title, 'A');
  assert.equal(spec.scene, 'Scene A');
  assert.deepEqual(spec.characters, [{ name: 'Hero' }]);
  assert.deepEqual(spec.worlds, [{ name: 'Citadel' }]);
  assert.deepEqual(spec.provenance.sourceStoryIds, ['story-a']);
});

test('buildWorldSpec never throws on a story missing answers/blueprint', () => {
  const spec = buildWorldSpec({ id: 'x' });
  assert.equal(spec.title, 'Новая история');
  assert.deepEqual(spec.characters, []);
});

test('mergeWorldSpecs A+B tags every character/world with its source world id (provenance)', () => {
  const specA = buildWorldSpec(story({ id: 'story-a' }));
  const specB = buildWorldSpec(story({ id: 'story-b', blueprint: { title: 'B', mode: 'Игра', scene: 'Scene B' }, answers: { chars: [{ name: 'Villain' }], worlds: [{ name: 'Ruins' }] } }));
  const merged = mergeWorldSpecs(specA, specB, { aWorldId: 'w-a', bWorldId: 'w-b' });

  assert.equal(merged.characters.length, 2);
  assert.equal(merged.characters[0]._sourceWorldId, 'w-a');
  assert.equal(merged.characters[1]._sourceWorldId, 'w-b');
  assert.deepEqual(merged.provenance.sourceWorldIds, ['w-a', 'w-b']);
  assert.deepEqual(merged.provenance.sourceStoryIds, ['story-a', 'story-b']);
  assert.match(merged.scene, /Scene A/);
  assert.match(merged.scene, /Scene B/);
});

test('mergeWorldSpecs never mutates its inputs', () => {
  const specA = buildWorldSpec(story({ id: 'story-a' }));
  const specB = buildWorldSpec(story({ id: 'story-b' }));
  const beforeA = JSON.stringify(specA);
  const beforeB = JSON.stringify(specB);
  mergeWorldSpecs(specA, specB, { aWorldId: 'w-a', bWorldId: 'w-b' });
  assert.equal(JSON.stringify(specA), beforeA);
  assert.equal(JSON.stringify(specB), beforeB);
});

test('folding AB+C preserves A and B provenance alongside C (the ABC merge chain)', () => {
  const specA = buildWorldSpec(story({ id: 'story-a' }));
  const specB = buildWorldSpec(story({ id: 'story-b' }));
  const specC = buildWorldSpec(story({ id: 'story-c', answers: { chars: [{ name: 'Third' }], worlds: [] } }));
  const ab = mergeWorldSpecs(specA, specB, { aWorldId: 'w-a', bWorldId: 'w-b' });
  const abc = mergeWorldSpecs(ab, specC, { aWorldId: 'w-ab', bWorldId: 'w-c' });

  assert.deepEqual(abc.provenance.sourceStoryIds, ['story-a', 'story-b', 'story-c']);
  // AB's own two characters (tagged w-a/w-b from the first merge) survive
  // untouched inside the ABC merge, plus C's new character tagged w-c.
  assert.equal(abc.characters.length, 3);
  assert.equal(abc.characters[0]._sourceWorldId, 'w-a');
  assert.equal(abc.characters[1]._sourceWorldId, 'w-b');
  assert.equal(abc.characters[2]._sourceWorldId, 'w-c');
});
