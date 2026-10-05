import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('MF registry is durable, user-controlled and contains Gothic Destruction',()=>{
  const data=JSON.parse(read('data/must-finish.json'));
  assert.equal(data.name,'MF');
  assert.equal(data.policy.notAutomation,true);
  assert.equal(data.policy.noNewAKATask,true);
  assert.equal(data.policy.removalRequiresUserApproval,true);
  const item=data.projects.find(project=>project.id==='gothic-destruction-mvp');
  assert.ok(item);
  assert.equal(item.priority,'must-finish');
  assert.equal(item.mfStatus,'in-progress');
  assert.equal(item.acceptedProgress.userConfirmedFragmentation,true);
  assert.equal(item.provenance.acceptedSourceSha,'769abc1095aa4d000d49befea102841802793f54');
  assert.equal(item.completionCriteria.worldServerProductionCertified,false);
  assert.equal(item.completionCriteria.finalOwnerClosure,false);
});

test('MF is discoverable from new-chat bootstrap files',()=>{
  const start=read('AI_START_HERE.md');
  const agents=read('AGENTS.md');
  const index=JSON.parse(read('.ai/project-context-index.json'));
  assert.match(start,/\bMF\b/);
  assert.match(start,/data\/must-finish\.json/);
  assert.match(agents,/\bMF\b/);
  assert.equal(index.concepts.mustFinish.canonicalFile,'MF.md');
  assert.ok(index.canonicalContextFiles.includes('MF.md'));
  assert.ok(index.canonicalContextFiles.includes('data/must-finish.json'));
});

test('Gothic Destruction handoff points to the accepted source and stable recovery mirror',()=>{
  const handoff=read('docs/GOTHIC_DESTRUCTION_MVP_HANDOFF.md');
  assert.match(handoff,/769abc1095aa4d000d49befea102841802793f54/);
  assert.match(handoff,/mpaykin1\.github\.io\/scratch-chain-reaction\/apps\/gothic-destruction-mvp/);
  assert.match(handoff,/камни разлетаются хорошо/);
});


test('Living Watercolor is a durable MF project',()=>{
  const data=JSON.parse(read('data/must-finish.json'));
  const item=data.projects.find(project=>project.id==='living-watercolor-3d');
  assert.ok(item);
  assert.equal(item.priority,'must-finish');
  assert.equal(item.mfStatus,'in-progress');
  assert.equal(item.acceptedProgress.kayKitMotionTransfer,true);
  assert.equal(item.acceptedProgress.sourceClipCount,139);
  assert.equal(item.acceptedProgress.uniqueMotionCount,132);
  assert.equal(item.acceptedProgress.finalWorkerVisualAccepted,false);
  assert.equal(item.completionCriteria.finalOwnerClosure,false);
  const handoff=read(item.canonical.handoff);
  assert.match(handoff,/4f73c56fbd7fb5893876b38bd50db2c60cf31505/);
  assert.match(handoff,/139 source clips \/ 132 unique motions/);
});
