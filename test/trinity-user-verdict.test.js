const test=require('node:test');
const assert=require('node:assert/strict');
const verdict=require('../data/trinity-lab-user-verdict.json');

test('Trinity user verdict is authoritative and mode-specific',()=>{
  assert.match(verdict.policy,/Do not change/);
  assert.equal(verdict.verdicts.KRIEGER.result,'SUCCESS');
  assert.equal(verdict.verdicts.INK.result,'FAILURE');
  assert.equal(verdict.verdicts.CUBE.result,'FAILURE');
});

test('technical pass cannot be used as visual acceptance for rejected modes',()=>{
  assert.ok(verdict.verdicts.INK.technicalCapabilitiesStillReal.length>0);
  assert.ok(verdict.verdicts.CUBE.technicalCapabilitiesStillReal.length>0);
  assert.match(verdict.verdicts.INK.knownContributors.join(' '),/technical renderer gates/i);
  assert.match(verdict.verdicts.CUBE.knownContributors.join(' '),/technical growth gates/i);
});
