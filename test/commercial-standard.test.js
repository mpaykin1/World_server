'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const {scoreEntry}=require('../scripts/commercial-score');

const standard=JSON.parse(fs.readFileSync(path.join(process.cwd(),'data','commercial-standard.json'),'utf8'));

test('every commercial rubric sums to 100',()=>{
  for(const p of Object.values(standard.profiles)){
    assert.equal(Object.values(p.criteria).reduce((a,b)=>a+b,0),100);
  }
});

test('100/100 requires full score plus evidence for every criterion',()=>{
  const criteria={};
  for(const k of Object.keys(standard.profiles.surface.criteria))
    criteria[k]={score:1,evidence:['test-evidence']};
  const result=scoreEntry({profile:'surface',criteria},standard);
  assert.equal(result.score,100);
});

test('missing evidence lowers score but does not throw',()=>{
  const criteria={};
  for(const k of Object.keys(standard.profiles.surface.criteria))
    criteria[k]={score:1,evidence:[]};
  const result=scoreEntry({profile:'surface',criteria},standard);
  assert.equal(result.score,50);
});

test('home experiment manager contains no destructive file-delete primitive',()=>{
  const src=fs.readFileSync(path.join(process.cwd(),'scripts','home-experiment-manager.js'),'utf8');
  for(const bad of ['rmSync(','unlinkSync(','rmdirSync(','fs.rm(','fs.unlink(']) assert.equal(src.includes(bad),false,bad);
});
