'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Living Light Cat V4 is durable MF work',()=>{
  const mf=JSON.parse(read('data/must-finish.json'));
  const cat=mf.projects.find(project=>project.id==='living-light-cat-3d-v4');
  assert.ok(cat);
  assert.equal(cat.mfStatus,'in-progress');
  assert.equal(cat.priority,'must-finish');
  assert.equal(cat.canonical.handoff,'docs/LIVING_LIGHT_CAT_V4_MF_HANDOFF.md');
  assert.equal(cat.completionCriteria.finalOwnerClosure,false);
});

test('V4 handoff preserves V2 success and unfinished V4 requirements',()=>{
  const handoff=read('docs/LIVING_LIGHT_CAT_V4_MF_HANDOFF.md');
  assert.match(handoff,/V2 is a user-approved SUCCESS/);
  assert.match(handoff,/has \*\*not\*\* explicitly marked V4 SUCCESS/);
  assert.match(handoff,/Tail follows the torso/);
  assert.match(handoff,/body contour visibly incomplete/);
});
