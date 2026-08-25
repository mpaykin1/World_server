'use strict';
const test=require('node:test'),assert=require('node:assert/strict');

function priority({impact,confidence,reuse,effort}){
  return Math.round((impact*confidence*reuse/Math.max(1,effort))*100)/100;
}
test('high impact reusable low effort task ranks higher',()=>{
  const a=priority({impact:20,confidence:.9,reuse:1.5,effort:2});
  const b=priority({impact:10,confidence:.9,reuse:1,effort:5});
  assert.ok(a>b);
});
test('zero effort is clamped',()=>{
  assert.ok(Number.isFinite(priority({impact:10,confidence:1,reuse:1,effort:0})));
});
test('low confidence external integration is discounted',()=>{
  const external=priority({impact:50,confidence:.55,reuse:1.1,effort:9});
  const local=priority({impact:20,confidence:.95,reuse:1.5,effort:2});
  assert.ok(local>external);
});
