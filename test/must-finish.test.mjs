import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('MF registry is durable, user-controlled and contains Gothic Destruction and Trinity',()=>{
  const data=JSON.parse(read('data/must-finish.json'));
  assert.equal(data.name,'MF');
  assert.equal(data.policy.notAutomation,true);
  assert.equal(data.policy.noNewAKATask,true);
  assert.equal(data.policy.removalRequiresUserApproval,true);
  const gothic=data.projects.find(project=>project.id==='gothic-destruction-mvp');
  assert.ok(gothic);
  assert.equal(gothic.priority,'must-finish');
  assert.equal(gothic.mfStatus,'in-progress');
  assert.equal(gothic.acceptedProgress.userConfirmedFragmentation,true);
  assert.equal(gothic.provenance.acceptedSourceSha,'769abc1095aa4d000d49befea102841802793f54');
  const trinity=data.projects.find(project=>project.id==='trinity-lab');
  assert.ok(trinity);
  assert.equal(trinity.priority,'must-finish');
  assert.equal(trinity.mfStatus,'in-progress');
  assert.equal(trinity.provenance.acceptedSourceSha,'98c9ddd2c0f09474fc2a199d4c640fae6e925314');
  assert.equal(trinity.acceptedProgress.unifiedTrinityUserConfirmedSuccess,true);
  assert.equal(trinity.completionCriteria.dynamicLocationStreaming,false);
  assert.equal(trinity.completionCriteria.weaponSwitching,false);
  assert.equal(trinity.completionCriteria.finalOwnerClosure,false);
});

test('MF is discoverable from new-chat bootstrap files',()=>{
  const start=read('AI_START_HERE.md');
  const agents=read('AGENTS.md');
  const index=JSON.parse(read('.ai/project-context-index.json'));
  assert.match(start,/\bMF\b/);
  assert.match(start,/data\/must-finish\.json/);
  assert.match(start,/TRINITY_LAB_MF_HANDOFF/);
  assert.match(agents,/\bMF\b/);
  assert.match(agents,/data\/must-finish\.json/);
  assert.equal(index.concepts.mustFinish.canonicalFile,'MF.md');
  assert.ok(index.canonicalContextFiles.includes('MF.md'));
  assert.ok(index.canonicalContextFiles.includes('data/must-finish.json'));
  assert.ok(index.canonicalContextFiles.includes('docs/TRINITY_LAB_MF_HANDOFF.md'));
  assert.ok(index.freshChatMandatoryReads.projectQuestion.includes('MF.md'));
  assert.ok(index.freshChatMandatoryReads.projectQuestion.includes('data/must-finish.json'));
});

test('Gothic Destruction handoff points to accepted source and stable recovery mirror',()=>{
  const handoff=read('docs/GOTHIC_DESTRUCTION_MVP_HANDOFF.md');
  assert.match(handoff,/769abc1095aa4d000d49befea102841802793f54/);
  assert.match(handoff,/mpaykin1\.github\.io\/scratch-chain-reaction\/apps\/gothic-destruction-mvp/);
});

test('Trinity handoff preserves accepted checkpoint and unfinished next stage',()=>{
  const handoff=read('docs/TRINITY_LAB_MF_HANDOFF.md');
  assert.match(handoff,/98c9ddd2c0f09474fc2a199d4c640fae6e925314/);
  assert.match(handoff,/TRINITY_LAB_UNIFIED_SUCCESS_2026-10-04/);
  assert.match(handoff,/FIRE/);
  assert.match(handoff,/SWITCH/);
  assert.match(handoff,/deep-black/);
  assert.match(handoff,/dynamic location streaming: \*\*MISSING\*\*/);
});
