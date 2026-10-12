'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluate}=require('../scripts/task-integrity.cjs');
const NOW=Date.parse('2026-10-12T12:00:00Z');
function row(lane,minutes=30,id='run-00001',changes={}){
  const end=NOW-10*60000;
  const e={id,lane,kind:lane==='CLEAN_SERVER'?'pr_closed':'playable',
    started_at:new Date(end-minutes*60000).toISOString(),
    finished_at:new Date(end).toISOString(),productive_minutes:minutes,
    evidence_ref:'https://github.com/mpaykin1/World_server/pull/492',
    evidence_sha:'a'.repeat(40),...changes};
  return {id,author_association:'OWNER',
    created_at:new Date(end+60000).toISOString(),
    body:'[TASK_INTEGRITY_EVENT_V1]\n'+JSON.stringify(e)};
}
test('balanced telemetry never self-certifies Fleet or owner PASS',()=>{
  const r=evaluate([row('CLEAN_SERVER'),row('GRAPHICS-DEMO-001',30,'run-00002')],NOW);
  assert.equal(r.status,'TELEMETRY_BALANCED_UNVERIFIED');
  assert.equal(r.owner_verdict,'UNSET');
  assert.equal(r.independent_fleet_visual_score,'UNKNOWN');
});
test('unequal minutes produce debt',()=>{
  const r=evaluate([row('CLEAN_SERVER',45),row('GRAPHICS-DEMO-001',15,'run-00002')],NOW);
  assert.equal(r.status,'MISSED_QUOTA');
  assert.equal(r.debt_minutes['GRAPHICS-DEMO-001'],15);
});
test('missing telemetry and one missing lane fail closed',()=>{
  assert.equal(evaluate([],NOW).status,'NO_TELEMETRY');
  assert.equal(evaluate([row('CLEAN_SERVER')],NOW).status,'TASK_STARVATION');
});
test('stale, duplicate, impossible and planning events fail closed',()=>{
  const a=row('CLEAN_SERVER'),b=row('GRAPHICS-DEMO-001',30,'run-00002');
  assert.equal(evaluate([a,b,b],NOW).status,'INVALID_TELEMETRY');
  assert.equal(evaluate([a,row('GRAPHICS-DEMO-001',30,'run-00002',
    {kind:'planning'})],NOW).status,'INVALID_TELEMETRY');
  assert.equal(evaluate([a,row('GRAPHICS-DEMO-001',30,'run-00002',
    {productive_minutes:61})],NOW).status,'INVALID_TELEMETRY');
  assert.equal(evaluate([a,row('GRAPHICS-DEMO-001',30,'run-00002',
    {evidence_ref:'https://github.com/mpaykin1/World_server/issues/80'})],NOW).status,
    'INVALID_TELEMETRY');
  const old=row('CLEAN_SERVER',30,'run-oldxx',
    {started_at:'2026-10-10T03:00:00Z',finished_at:'2026-10-10T03:30:00Z'});
  assert.equal(evaluate([old],NOW).status,'NO_TELEMETRY');
});
test('untrusted comments cannot alter the result',()=>{
  const a=row('CLEAN_SERVER'),b=row('GRAPHICS-DEMO-001',30,'run-00002');
  const forged={...row('CLEAN_SERVER',30,'run-forge'),author_association:'NONE'};
  assert.equal(evaluate([a,b,forged],NOW).status,'TELEMETRY_BALANCED_UNVERIFIED');
});
