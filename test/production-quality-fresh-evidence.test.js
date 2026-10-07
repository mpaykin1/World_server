'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluate}=require('../scripts/production-quality-pull.js');
const budgets={catalog:{minimumFps:30,canvasVisibleMs:8000}};

test('fresh production violations remain blocking evidence',()=>{
  const r=evaluate({ok:true,apps:{catalog:{sessions:4,p10Fps:12,p95LoadMs:13230,errors:0}}},budgets);
  assert.equal(r.sessions,4);
  assert.deepEqual(r.violations.map(v=>v.type),['production-fps','production-load']);
});

test('zero fresh sessions are distinguishable from a healthy window',()=>{
  const r=evaluate({ok:true,apps:{catalog:{sessions:0,p10Fps:null,p95LoadMs:null,errors:0}}},budgets);
  assert.equal(r.sessions,0);
  assert.deepEqual(r.violations,[]);
});

test('unavailable summary cannot become healthy evidence',()=>{
  const r=evaluate({ok:false,error:'offline'},budgets);
  assert.equal(r.sessions,0);
  assert.equal(r.violations[0].type,'summary-unavailable');
});
test('unbudgeted app sessions cannot satisfy fresh evidence',()=>{
  const r=evaluate({ok:true,apps:{unknown:{sessions:9,p10Fps:60,p95LoadMs:100,errors:0}}},budgets);
  assert.equal(r.sessions,0);
  assert.deepEqual(r.violations,[]);
});
