'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../lib/world-consequence-engine');
test('seed and command replay identical',()=>{const a=E.createWorld('abc'),b=E.createWorld('abc');assert.deepEqual(a,b);assert.deepEqual(E.tick(a),E.tick(b))});
test('one volcano has distinct intention projects',()=>{const types=['геотермальная электроэнергия','туризм и экскурсии','теплицы на вулканических почвах'].map(s=>E.interpretIntent(s).goal);assert.deepEqual(types,['geothermal','tourism','volcanic_farm'])});
test('geothermal pays first and electricity arrives only after construction',()=>{let w=E.createWorld('test');w.land.volcano=true;w.resources.budget=200;const i=E.interpretIntent('электричество после исследования');const p=E.preview(w,i);assert(p.feasible);w=E.commit(w,i);assert.equal(w.resources.budget,200-p.cost);const original=w.resources.power;for(let j=0;j<p.buildTicks;j++)w=E.tick(w);assert(w.resources.power<=original);w=E.tick(w);assert(w.resources.power>0);assert(w.history.some(e=>e.kind==='commissioned'))});
test('no free construction, stale revisions fail',()=>{let w=E.createWorld('low');w.resources.budget=0;assert.equal(E.preview(w,E.interpretIntent('энергия')).feasible,false);assert.throws(()=>E.commit(w,E.interpretIntent('энергия')));w.resources.budget=200;w.land.volcano=true;assert.throws(()=>E.commit(w,E.interpretIntent('энергия'),-1),/STALE/)});
test('catastrophe does not end the simulation',()=>{let w=E.createWorld('crisis');w.resources.power=0;w.resources.food=0;for(let i=0;i<15;i++)w=E.tick(w);assert(w.crisis);assert(w.population>0);assert.equal(w.tick,15);assert(w.history.some(x=>x.kind==='adaptation'))});
test('fictional stable address and cultural spokesperson',()=>{let w=E.createWorld('residents');assert.deepEqual(E.address(w,'house-1',2,3),E.address(w,'house-1',2,3));assert.equal(E.address(w,'house-1',99,1),null);w.culture.temples=3;w=E.tick(w);assert(w.culture.spokesperson?.fictional)});
test('intent cannot conjure resources, cautious intent changes risk and time',()=>{const w=E.createWorld('intent');w.land.volcano=true;const a=E.preview(w,E.interpretIntent('электричество','geothermal'));const b=E.preview(w,E.interpretIntent('электричество поэтапно после исследования','geothermal'));assert(b.buildTicks>a.buildTicks);assert(b.risk<a.risk);assert(b.cost>a.cost)});
test('construction conserves inputs and output starts after exact delay',()=>{
 let w=E.createWorld('exact-delay');w.land.volcano=true;w.population=84;w.resources.power=50;w.resources.water=80;w.resources.workers=30;w.resources.budget=300;
 const original=structuredClone(w),intent=E.interpretIntent('геотермальная энергия','geothermal'),plan=E.preview(w,intent);
 const committed=E.commit(w,intent,w.revision);
 assert.deepEqual(w,original);assert.equal(committed.resources.budget,300-plan.cost);assert.equal(committed.resources.water,68);assert.equal(committed.resources.workers,22);
 let projectRun=structuredClone(committed),control=structuredClone(committed);control.projects=[];control.history=[];
 for(let i=0;i<plan.buildTicks;i++){projectRun=E.tick(projectRun);control=E.tick(control)}
 assert.equal(projectRun.resources.power,control.resources.power);assert(projectRun.history.some(e=>e.kind==='commissioned'));
 projectRun=E.tick(projectRun);control=E.tick(control);assert.equal(projectRun.resources.power-control.resources.power,36);
});
test('serialized state replays exact resources and history',()=>{
 let w=E.createWorld('serialized-replay');w.land.volcano=true;w.resources.budget=300;
 w=E.commit(w,E.interpretIntent('геотермальная энергия после исследования','geothermal'));
 const restored=JSON.parse(JSON.stringify(w));assert.deepEqual(E.simulateTicks(w,9),E.simulateTicks(restored,9));
});
test('Genie cards prove two worseners, shifted crisis and balanced counterfactual',()=>{
 for(const target of ['power','water','food']){
  const w=E.createWorld('cards-'+target);Object.assign(w.resources,{power:80,water:80,food:80,budget:500,workers:50});w.resources[target]=35;
  const result=E.proposeGenieCards(w),categories=result.cards.map(c=>c.category);
  assert.equal(result.target,target);assert.equal(result.degraded,false);assert.equal(result.cards.length,4);
  assert.equal(categories.filter(x=>x==='worsens').length,2);assert.equal(categories.filter(x=>x==='shifts_crisis').length,1);assert.equal(categories.filter(x=>x==='balanced').length,1);
  for(const card of result.cards){assert(card.plan.feasible);assert(Number.isFinite(card.delta));assert.equal(card.category==='worsens',card.delta<0)}
 }
});
test('Genie cards honestly degrade when no category can be funded',()=>{
 const w=E.createWorld('no-free-cards');w.resources.budget=0;
 const result=E.proposeGenieCards(w);assert.equal(result.degraded,true);assert.equal(result.cards.length,0);assert.deepEqual(result.missingCategories.sort(),['balanced','shifts_crisis','worsens','worsens'].sort());
});
test('deterministic risk event still preserves adaptation path',()=>{
 let a=E.createWorld('risk'),b=E.createWorld('risk');for(const w of [a,b]){w.resources.budget=500;w.resources.workers=50}
 a=E.commit(a,E.interpretIntent('','coal'));b=E.commit(b,E.interpretIntent('','coal'));
 a=E.simulateTicks(a,30);b=E.simulateTicks(b,30);assert.deepEqual(a,b);assert(a.history.some(e=>e.kind==='accident'));assert(a.history.some(e=>e.kind==='adaptation'));assert(a.population>0);
});
