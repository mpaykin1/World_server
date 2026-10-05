'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.join(__dirname,'..');
const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'data/must-finish.json'),'utf8'));

test('MF registry preserves explicit must-finish projects with unique ids',()=>{
  assert.equal(registry.name,'MF');
  assert.ok(Array.isArray(registry.projects));
  assert.ok(registry.projects.length>=2);
  const ids=registry.projects.map(project=>project.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.ok(ids.includes('gothic-destruction-mvp'));
  assert.ok(ids.includes('unified-matter-voxel-runtime'));
});

test('every MF item has a durable handoff and cannot silently self-close',()=>{
  for(const project of registry.projects){
    assert.equal(project.priority,'must-finish');
    assert.equal(project.addedBy,'user-explicit-request');
    assert.ok(project.canonical?.handoff);
    assert.equal(fs.existsSync(path.join(ROOT,project.canonical.handoff)),true);
    assert.equal(project.completionCriteria?.finalOwnerClosure,false);
  }
});

test('fresh-chat bootstrap exposes the MF registry',()=>{
  const start=fs.readFileSync(path.join(ROOT,'AI_START_HERE.md'),'utf8');
  const index=JSON.parse(fs.readFileSync(path.join(ROOT,'.ai/project-context-index.json'),'utf8'));
  assert.match(start,/MF — Must Finish/);
  assert.match(start,/data\/must-finish\.json/);
  assert.ok(index.canonicalContextFiles.includes('MF.md'));
  assert.ok(index.canonicalContextFiles.includes('data/must-finish.json'));
  assert.equal(index.concepts.mustFinish.canonicalFile,'MF.md');
});
