const test=require('node:test');
const assert=require('node:assert/strict');
const verdict=require('../data/trinity-lab-user-verdict.json');

test('Trinity user verdict is authoritative and mode-specific',()=>{
  assert.match(verdict.policy,/user-owned/i);
  assert.equal(verdict.source,'explicit-user-verdict-after-unified-MVP-review');
  assert.equal(verdict.overallResult,'SUCCESS');
  for(const mode of ['KRIEGER','INK','CUBE']){
    assert.equal(verdict.verdicts[mode].result,'SUCCESS');
    assert.ok(verdict.verdicts[mode].userDecision);
  }
});

test('earlier visual failures remain recorded without overriding the new user verdict',()=>{
  const previous=verdict.history.find(entry=>entry.recordedAt==='2026-10-03');
  assert.ok(previous,'previous user verdict must remain in history');
  assert.equal(previous.verdicts.KRIEGER.result,'SUCCESS');
  for(const mode of ['INK','CUBE']){
    assert.equal(previous.verdicts[mode].result,'FAILURE');
    assert.ok(previous.verdicts[mode].technicalCapabilitiesStillReal.length>0);
  }
  assert.match(previous.verdicts.INK.knownContributors.join(' '),/technical renderer gates/i);
  assert.match(previous.verdicts.CUBE.knownContributors.join(' '),/technical growth gates/i);
});
