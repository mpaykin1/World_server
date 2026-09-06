'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const {protectedLessonPayload,syncProtectedLessons}=require('../lib/collective-brain');

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cb-lessons-'));
  fs.mkdirSync(path.join(root,'data'),{recursive:true});
  fs.writeFileSync(path.join(root,'data','error-prevention-registry.json'),JSON.stringify({knownErrors:[{id:'E1',category:'science',status:'protected',rootCause:'substring matcher accepted embedded keyword',solution:'use token boundaries',protection:['test/routing.test.js'],evidence:['routing-report.json'],lessonHash:'h1'}]},null,2));
  return root;
}

test('protected fix becomes a focused lesson payload',()=>{
  const p=protectedLessonPayload({id:'E1',category:'science',rootCause:'missing causal metric',solution:'fail closed',protection:['test/a.js'],evidence:['report.json']});
  assert.match(p.content,/E1/);assert.match(p.content,/missing causal metric/);assert.match(p.content,/fail closed/);
  assert.equal(p.project,'World_server');assert.ok(p.tags.includes('root-cause'));
});

test('lesson sync is idempotent and re-syncs only changed evidence',async()=>{
  const root=fixture(),state={},saved=[];
  const saveLessonFn=async payload=>{saved.push(payload);return{lesson:{id:'L'+saved.length}}};
  const a=await syncProtectedLessons(root,state,{saveLessonFn});
  const b=await syncProtectedLessons(root,state,{saveLessonFn});
  assert.equal(a.synced,1);assert.equal(b.synced,0);assert.equal(b.skipped,1);assert.equal(saved.length,1);
  const f=path.join(root,'data','error-prevention-registry.json'),j=JSON.parse(fs.readFileSync(f));j.knownErrors[0].solution='use unicode token boundaries';fs.writeFileSync(f,JSON.stringify(j));
  const c=await syncProtectedLessons(root,state,{saveLessonFn});assert.equal(c.synced,1);assert.equal(saved.length,2);
  fs.rmSync(root,{recursive:true,force:true});
});
test('lesson recall drops clearly weak distractors',()=>{
  const {selectRelevantLessons}=require('../lib/collective-brain');
  const got=selectRelevantLessons([{id:'exact',score:.92},{id:'near',score:.70},{id:'noise',score:.39}],8);
  assert.deepEqual(got.map(x=>x.id),['exact','near']);
  assert.deepEqual(selectRelevantLessons([{id:'weak',score:.3}],8),[]);
});