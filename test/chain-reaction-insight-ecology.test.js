'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createWorld,tick}=require('../lib/world-consequence-engine');
function eligibleWorld(ecology){
 const w=createWorld('insight-ecology-gate');
 Object.assign(w.insight,{knowledge:75,leisure:75,cooperation:75,sustainability:75,harmonyTicks:7,illumination:false,illuminationAtTick:null});
 Object.assign(w.resources,{power:95,water:95,food:95,health:95,ecology});
 w.population=80;
 return w;
}
test('sustained insight cannot be earned while ecology is degraded',()=>{
 const after=tick(eligibleWorld(54));
 assert.equal(after.insight.harmonyTicks,0);
 assert.equal(after.insight.illumination,false);
 assert.equal(after.history.some(event=>event.kind==='sustained_insight'),false);
});
test('healthy ecology permits the eighth consecutive harmony tick',()=>{
 const after=tick(eligibleWorld(75));
 assert.equal(after.insight.harmonyTicks,8);
 assert.equal(after.insight.illumination,true);
 assert.equal(after.insight.illuminationAtTick,1);
 assert.equal(after.history.filter(event=>event.kind==='sustained_insight').length,1);
});
