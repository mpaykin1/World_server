'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('MF is discoverable from fresh-chat bootstrap',()=>{
  const start=read('AI_START_HERE.md');
  const index=JSON.parse(read('.ai/project-context-index.json'));
  assert.match(start,/MF — обязательный список Must Finish/);
  assert.match(start,/data\/must-finish-projects\.json/);
  assert.ok(index.canonicalContextFiles.includes('MF.md'));
  assert.ok(index.canonicalContextFiles.includes('data/must-finish-projects.json'));
  assert.equal(index.concepts.mustFinish.canonicalFile,'MF.md');
});

test('MF machine registry preserves current mandatory projects',()=>{
  const mf=JSON.parse(read('data/must-finish-projects.json'));
  const ids=mf.active.map(x=>x.id);
  assert.ok(ids.includes('living-light-cat-3d-v4'));
  assert.ok(ids.includes('gothic-destruction-mvp'));
  assert.equal(mf.policy.completeOrRemove,'explicit_owner_instruction_only');
  assert.equal(mf.policy.ciOrAssistantCannotAutoClose,true);
});

test('Living Light Cat V4 MF checkpoint preserves verdict boundary and requirements',()=>{
  const handoff=read('LIVING_LIGHT_CAT_3D_V4_PROGRESS.md');
  assert.match(handoff,/IN PROGRESS \/ MF \(MUST FINISH\)/);
  assert.match(handoff,/has \*\*not\*\* marked V4 SUCCESS/i);
  assert.match(handoff,/Incomplete outline/);
  assert.match(handoff,/Tail follows the torso/);
  assert.match(handoff,/explicit owner acceptance/);
});
