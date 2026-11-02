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

test('four-stage tempo combination and repair type must change between games',()=>{
  const tempo={завязка:'медленно',развитие:'ровно',кульминация:'рывком',развязка:'затухает'};
  const old={...a,tempoStages:tempo,repairType:'искупление'};
  const fresh={...b,tempoStages:{...tempo},repairType:'искупление'};
  assert.deepEqual(validateAdjacentGames(old,fresh).errors,[
    'tempoStages: repeated combination','repairType: repeated'
  ]);
  fresh.tempoStages.развязка='нарастающе';
  fresh.repairType='компенсация';
  assert.equal(validateAdjacentGames(old,fresh).ok,true);
});
test('same choice menu and consecutive identical choices are rejected',()=>{
  const previous={...a,choices:[{type:'жертва'},{type:'правду или скрыть'},{type:'кого спасти'}]};
  const next={...b,choices:[{type:'кого спасти'},{type:'правду или скрыть'},{type:'жертва'}]};
  assert.deepEqual(validateAdjacentGames(previous,next).errors,['choices: repeated menu']);
  const bad={...b,choices:[{type:'жертва'},{type:'жертва'},{type:'для атмосферы'},{type:'для атмосферы'}]};
  const errors=validateAdjacentGames(previous,bad).errors;
  assert.ok(errors.includes('choices: adjacent type repeated or missing'));
  assert.ok(errors.includes('choices: too many atmospheric choices'));
});
test('twist type cools down across three games, not forever',()=>{
  const x={...a,twists:[{type:'betrayal'},{type:'identity'}]};
  const y={...b,twists:[{type:'false_victory'},{type:'reversal'}]};
  const z={...a,primaryConflict:'nature',twistType:'motive',endingType:'happy',finalLocation:'forest',interferenceSourceType:'mentor'};
  const candidate={...b,primaryConflict:'technology',twistType:'identity',endingType:'open',finalLocation:'city',interferenceSourceType:'enemy'};
  assert.ok(validateRecentHistory([x,y,z],candidate).errors.includes('twistType: cooldown last three games'));
  assert.equal(validateRecentHistory([y,z],candidate).errors.includes('twistType: cooldown last three games'),false);
});
test('twists cannot duplicate inside one game',()=>{
  const bad={...a,twists:[{type:'betrayal'},{type:'betrayal'}]};
  assert.deepEqual(validateRecentHistory([],bad).errors,['twists: duplicate within game']);
});

test('first game cannot omit required record dimensions',()=>{
  const r=validateRecentHistory([],{});
  assert.equal(r.ok,false);
  assert.equal(r.errors.length,5);
});
