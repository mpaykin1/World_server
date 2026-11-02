'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAdjacentGames, validateRecentHistory } = require('../lib/engines/nonrepeat.cjs');
const a = {primaryConflict:'self',twistType:'betrayal',endingType:'tragic',finalLocation:'ruins',interferenceSourceType:'friend'};
const b = {primaryConflict:'society',twistType:'false_victory',endingType:'redemption',finalLocation:'cave',interferenceSourceType:'stranger'};
test('two successive games differ in all five mandatory dimensions', () => {
  assert.equal(validateAdjacentGames(a,b).ok,true);
  for(const key of Object.keys(a)) {
    const bad = {...b,[key]:a[key]};
    assert.deepEqual(validateAdjacentGames(a,bad).errors,[key+': repeated']);
  }
});
test('conflict cannot recur within last three games', () => {
  const history = [a,b,{...a,primaryConflict:'nature',twistType:'identity',endingType:'open',finalLocation:'forest',interferenceSourceType:'mentor'}];
  const candidate = {...b,primaryConflict:'self',twistType:'reversal',endingType:'happy',finalLocation:'garden',interferenceSourceType:'enemy'};
  assert.deepEqual(validateRecentHistory(history,candidate).errors,['primaryConflict: used in last three']);
});
test('missing fields fail closed and first game needs no predecessor', () => {
  assert.equal(validateAdjacentGames(a,{...b,endingType:''}).ok,false);
  assert.equal(validateRecentHistory([],b).ok,true);
  assert.throws(()=>validateRecentHistory(null,b),TypeError);
});
