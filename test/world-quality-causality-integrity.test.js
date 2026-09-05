'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {compare}=require('../scripts/world-quality-causality');

const completeBase={visual:90,fps:45,frameP95:22,memory:512,controls:1,collisions:1,mobile:1};

test('counterfactual comparison fails closed when required evidence is missing',()=>{
  const r=compare({},{});
  assert.equal(r.evidenceComplete,false);
  assert.equal(r.winner,false);
  assert.deepEqual(r.missingMetrics.sort(),['collisions','controls','fps','frameP95','memory','mobile','visual'].sort());
});

test('complete non-regressing counterfactual remains promotable',()=>{
  const candidate={...completeBase,visual:91,fps:46,frameP95:21,memory:500};
  const r=compare(completeBase,candidate);
  assert.equal(r.evidenceComplete,true);
  assert.deepEqual(r.missingMetrics,[]);
  assert.deepEqual(r.regressions,[]);
  assert.equal(r.winner,true);
});

test('complete regression remains rejected',()=>{
  const r=compare(completeBase,{...completeBase,fps:44});
  assert.equal(r.evidenceComplete,true);
  assert.deepEqual(r.regressions,['fps']);
  assert.equal(r.winner,false);
});
