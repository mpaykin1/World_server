import test from 'node:test';
import assert from 'node:assert/strict';
import {effectBudget} from '../apps/ai3d-voxel-city/cinematic-cpu-effects.mjs';
import {budgetFor} from '../apps/ai3d-voxel-city/cinematic-cpu-atmosphere.mjs';

test('all cinematic effects stay within a capped sprite/draw-call budget',()=>{
  for(const tier of ['low','balanced','high','ultra']){
    const e=effectBudget(tier),b=budgetFor(tier);
    assert.ok(e.halo>0&&e.haze>0&&e.plume>0);
    assert.ok(e.halo+e.haze+e.plume+1+b.steamCount<=55,
      tier+' effect overdraw budget exceeded');
  }
});
test('mobile has fewer sprites and fewer CPU sky pixels than high tier',()=>{
  const mobile=effectBudget('low'),high=effectBudget('high');
  assert.ok(mobile.plume<high.plume);
  assert.ok(mobile.halo<high.halo);
  assert.ok(budgetFor('low').width*budgetFor('low').height<
    budgetFor('high').width*budgetFor('high').height);
});
test('unknown tier defaults to balanced bounded effects',()=>{
  assert.deepEqual(effectBudget('unrecognized'),effectBudget('balanced'));
});
