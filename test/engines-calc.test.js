'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { METHODS, createCalcProfile } = require('../lib/engines/calc.cjs');
const character = { name: 'Ива', birth: '2001-05-12', traits: ['осторожность'], randomSeed: 17 };
test('optional engine skips without a method and never claims predictions', () => {
  assert.equal(createCalcProfile(character), null);
  assert.equal(createCalcProfile({ ...character, method: null }), null);
});
test('each method returns reproducible fictional character-design JSON', () => {
  for (const method of METHODS) {
    const input = { ...character, method };
    const first = createCalcProfile(input);
    assert.deepEqual(first, createCalcProfile(input));
    assert.equal(first.source, method);
    assert.equal(first.disclaimer, 'fictional_character_design');
    assert.equal(first.traits[0], 'осторожность');
    assert.equal(new Set(first.traits).size, first.traits.length);
    assert.deepEqual(first.timeline.map(x => x.stage), ['завязка', 'поворот', 'развязка']);
    assert.equal(first.timeline.length, 3);
    assert.equal(input.traits.length, 1);
  }
});
test('seed and explicit methods change artistic output with no global state', () => {
  const profile = createCalcProfile({ ...character, method: 'socionics' });
  const other = createCalcProfile({ ...character, method: 'natal' });
  assert.notDeepEqual(profile.timeline, other.timeline);
  const mutatedSeed = createCalcProfile({ ...character, randomSeed: 999, method: 'socionics' });
  assert.notDeepEqual(profile, mutatedSeed);
});
test('reject malformed input and invalid Gregorian dates', () => {
  for (const data of [
    null, [], {}, { name: '' }, { name: 'A', method: 'science' },
    { name: 'A', birth: '2023-02-29' }, { name: 'A', birth: '2024-04-31' },
    { name: 'A', birth: 'not-a-date' }, { name: 'A', birth: '2024-13-01' },
    { name: 'A', traits: [''] }, { name: 'A', traits: new Array(17).fill('x') },
    { name: 'A', randomSeed: 1.5 }, { name: 'A', randomSeed: Number.MAX_SAFE_INTEGER + 1 }
  ]) assert.throws(() => createCalcProfile(data));
  assert.equal(createCalcProfile({ name: 'A', birth: '2024-02-29', method: 'natal' }).timeline.length, 3);
});
