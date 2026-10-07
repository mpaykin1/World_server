'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../lib/world-consequence-engine');
test('seed and command replay identical',()=>{const a=E.createWorld('abc'),b=E.createWorld('abc');assert.deepEqual(a,b);assert.deepEqual(E.tick(a),E.tick(b))});
test('one volcano has distinct intention projects',()=>{const types=['геотермальная электроэнергия','туризм и экскурсии','теплицы на вулканических почвах'].map(s=>E.interpretIntent(s).goal);assert.deepEqual(types,['geothermal','tourism','volcanic_farm'])});
test('public project identity never fingerprints private free text',()=>{
 const first=E.createWorld('private-id'),second=E.createWorld('private-id');
 const a=E.interpretIntent('семейная история, которую нельзя публиковать','solar');
 const b=E.interpretIntent('другой личный комментарий ребёнка','solar');
 assert.notEqual(a.comment,b.comment);
 assert.deepEqual({...a,comment:undefined},{...b,comment:undefined});
 assert.equal(E.commit(first,a).projects[0].id,E.commit(second,b).projects[0].id);
});
test('geothermal pays first and electricity arrives only after construction',()=>{let w=E.createWorld('test');w.land.volcano=true;w.resources.budget=200;const i=E.interpretIntent('электричество после исследования');const p=E.preview(w,i);assert(p.feasible);w=E.commit(w,i);assert.equal(w.resources.budget,200-p.cost);const original=w.resources.power;for(let j=0;j<p.buildTicks;j++)w=E.tick(w);assert(w.resources.power<=original);w=E.tick(w);assert(w.resources.power>0);assert(w.history.some(e=>e.kind==='commissioned'))});
test('no free construction, stale revisions fail',()=>{let w=E.createWorld('low');w.resources.budget=0;assert.equal(E.preview(w,E.interpretIntent('энергия')).feasible,false);assert.throws(()=>E.commit(w,E.interpretIntent('энергия')));w.resources.budget=200;w.land.volcano=true;assert.throws(()=>E.commit(w,E.interpretIntent('энергия'),-1),/STALE/)});
test('catastrophe does not end the simulation',()=>{let w=E.createWorld('crisis');w.resources.power=0;w.resources.food=0;for(let i=0;i<15;i++)w=E.tick(w);assert(w.crisis);assert(w.population>0);assert.equal(w.tick,15);assert(w.history.some(x=>x.kind==='adaptation'))});
test('fictional residents are canonical stable world data',()=>{
 const w=E.createWorld('residents'),restored=JSON.parse(JSON.stringify(w));
 assert.equal(w.residents.length,112);assert.equal(new Set(w.residents.map(npc=>npc.id)).size,112);
 assert.equal(new Set(w.residents.map(npc=>npc.building+':'+npc.floor+':'+npc.flat)).size,112);
 assert(w.residents.every(npc=>npc.fictional===true));
 const stored=w.residents.find(npc=>npc.building==='house-1'&&npc.floor===2&&npc.flat===3);
 assert.deepEqual(E.address(w,'house-1',2,3),stored);
 assert.deepEqual(E.address(restored,'house-1',2,3),stored);
 assert.equal(E.address(w,'house-1',99,1),null);
});
test('legacy worlds hydrate the same resident directory on authoritative mutation',()=>{
 const original=E.createWorld('legacy-residents'),legacy=JSON.parse(JSON.stringify(original));delete legacy.residents;
 const fallback=E.address(legacy,'house-3',2,8);assert.deepEqual(fallback,E.address(original,'house-3',2,8));
 const ticked=E.tick(legacy);assert.equal(ticked.residents.length,112);assert.deepEqual(E.address(ticked,'house-3',2,8),fallback);
 assert.deepEqual(ticked,E.tick(JSON.parse(JSON.stringify(legacy))));
 const committedLegacy=JSON.parse(JSON.stringify(original));delete committedLegacy.residents;committedLegacy.resources.budget=300;
 assert.equal(E.commit(committedLegacy,E.interpretIntent('','solar')).residents.length,112);
});
test('empty partial or tampered resident directories fail closed to canonical data',()=>{
 const canonical=E.createWorld('corrupt-residents');
 for(const residents of [[],canonical.residents.slice(1),canonical.residents.map((npc,index)=>index?npc:{...npc,name:'Real Person',fictional:false})]){
  const corrupt=JSON.parse(JSON.stringify(canonical));corrupt.residents=residents;corrupt.culture.temples=3;corrupt.culture.spokesperson=null;
  assert.deepEqual(E.address(corrupt,'house-0',1,1),canonical.residents[0]);
  const repaired=E.tick(corrupt);assert.deepEqual(repaired.residents,canonical.residents);
  assert.equal(repaired.culture.spokesperson.fictional,true);assert.equal(typeof repaired.culture.spokesperson.name,'string');
  assert.equal(E.address(repaired,repaired.culture.spokesperson.building,repaired.culture.spokesperson.floor,repaired.culture.spokesperson.flat)?.id,
   repaired.culture.spokesperson.id);
 }
});
test('resident directory stays unique and bounded across many seeds',()=>{
 let maxBytes=0;
 for(let seed=0;seed<250;seed++){
  const w=E.createWorld('resident-falsification-'+seed);
  assert.equal(new Set(w.residents.map(npc=>npc.id)).size,w.residents.length);
  assert.equal(new Set(w.residents.map(npc=>npc.building+':'+npc.floor+':'+npc.flat)).size,w.residents.length);
  for(const npc of w.residents)assert.equal(E.address(w,npc.building,npc.floor,npc.flat)?.id,npc.id);
  maxBytes=Math.max(maxBytes,Buffer.byteLength(JSON.stringify(w)));
 }
 assert(maxBytes<16*1024);
});
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
test('builders are reserved during construction and released exactly once',()=>{
 let w=E.createWorld('builder-lifecycle');Object.assign(w.resources,{budget:300,workers:4,power:80,water:80,food:80});
 const solar=E.interpretIntent('','solar'),second=E.interpretIntent('','temple');
 w=E.commit(w,solar);assert.equal(w.resources.workers,1);assert.equal(E.preview(w,second).feasible,false);
 w=E.tick(w);assert.equal(w.resources.workers,1);
 w=E.tick(w);assert.equal(w.resources.workers,4);assert.equal(E.preview(w,second).feasible,true);
 const released=w.history.filter(e=>e.kind==='builders_released');assert.equal(released.length,1);assert.equal(released[0].count,3);
 const replay=E.tick(structuredClone(w));assert.equal(replay.resources.workers,4);
 assert.equal(replay.history.filter(e=>e.kind==='builders_released').length,1);
});
test('already commissioned legacy projects restore deducted builders once',()=>{
 let w=E.createWorld('legacy-builders');Object.assign(w.resources,{budget:300,workers:10,power:80,water:80,food:80});
 w=E.commit(w,E.interpretIntent('','solar'));w=E.simulateTicks(w,2);
 w.resources.workers=7;delete w.projects[0].workersReserved;delete w.projects[0].workersReleased;
 w.history=w.history.filter(e=>e.kind!=='builders_released');
 w=E.tick(w);assert.equal(w.resources.workers,10);assert.equal(w.projects[0].workersReleased,true);
 assert.equal(w.history.filter(e=>e.kind==='builders_released').length,1);
 w=E.tick(w);assert.equal(w.resources.workers,10);assert.equal(w.history.filter(e=>e.kind==='builders_released').length,1);
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
test('public Genie options hide classifications and include a bounded fifth lane',()=>{
 const w=E.createWorld('public-genie');Object.assign(w.resources,{power:35,water:80,food:80,budget:500,workers:50});
 const options=E.genieOptions(w),again=E.genieOptions(JSON.parse(JSON.stringify(w)));
 assert.deepEqual(options,again);assert.equal(options.cards.length,4);assert.equal(options.offeredCount,4);
 assert.equal(options.degraded,false);assert.equal(options.fifth.kind,'free_intent');assert.equal(options.fifth.maxTextLength,600);
 assert(options.fifth.supportedStructures.includes('geothermal'));
 for(const card of options.cards){
  assert.equal(Object.hasOwn(card,'category'),false);assert.equal(JSON.stringify(card).includes('worsens'),false);
  assert.equal(typeof card.forecast.targetDelta,'number');assert.equal(card.plan.buildTicks>0,true);
 }
});
test('public Genie options honestly expose a degraded short set',()=>{
 const w=E.createWorld('public-genie-degraded');w.resources.budget=0;
 const options=E.genieOptions(w);
 assert.equal(options.degraded,true);assert.equal(options.cards.length,options.offeredCount);
 assert.equal(options.offeredCount<4,true);assert.equal(options.fifth.kind,'free_intent');
 assert.doesNotMatch(JSON.stringify(options),/worsens|shifts_crisis|balanced/);
});
test('deterministic risk event still preserves adaptation path',()=>{
 let a=E.createWorld('risk'),b=E.createWorld('risk');for(const w of [a,b]){w.resources.budget=500;w.resources.workers=50}
 a=E.commit(a,E.interpretIntent('','coal'));b=E.commit(b,E.interpretIntent('','coal'));
 a=E.simulateTicks(a,30);b=E.simulateTicks(b,30);assert.deepEqual(a,b);assert(a.history.some(e=>e.kind==='accident'));assert(a.history.some(e=>e.kind==='adaptation'));assert(a.population>0);
});
test('illumination requires eight consecutive viable ticks and records one milestone',()=>{
 let w=E.createWorld('sustained-insight');Object.assign(w.resources,{power:90,water:90,food:90,ecology:90,health:90});
 assert.equal(w.insight.harmonyTicks,0);assert.equal(w.insight.illumination,false);assert.equal(w.insight.illuminationAtTick,null);
 Object.assign(w.insight,{knowledge:69,leisure:69,cooperation:69,sustainability:69});
 w=E.tick(w);assert.equal(w.insight.harmonyTicks,1);assert.equal(w.insight.illumination,false);
 w=E.simulateTicks(w,6);assert.equal(w.insight.harmonyTicks,7);assert.equal(w.insight.illumination,false);
 w=E.tick(w);assert.equal(w.insight.harmonyTicks,8);assert.equal(w.insight.illumination,true);
 assert.equal(w.insight.illuminationAtTick,w.tick);assert.equal(w.history.filter(e=>e.kind==='sustained_insight').length,1);
 const replay=E.simulateTicks(structuredClone(w),3);assert.equal(replay.history.filter(e=>e.kind==='sustained_insight').length,1);
});
test('insight streak resets on lost viability without erasing first attainment',()=>{
 let w=E.createWorld('insight-disruption');Object.assign(w.resources,{power:90,water:90,food:90,ecology:90,health:90});
 Object.assign(w.insight,{knowledge:90,leisure:90,cooperation:90,sustainability:90});
 w=E.simulateTicks(w,8);const achievedAt=w.insight.illuminationAtTick;assert.equal(w.insight.illumination,true);
 w.resources.food=0;w=E.tick(w);assert.equal(w.insight.harmonyTicks,0);assert.equal(w.insight.illumination,false);
 assert.equal(w.insight.illuminationAtTick,achievedAt);assert.equal(w.history.filter(e=>e.kind==='sustained_insight').length,1);
});
test('legacy one-tick illumination is not grandfathered',()=>{
 let w=E.createWorld('legacy-insight');Object.assign(w.resources,{power:90,water:90,food:90,ecology:90,health:90});
 Object.assign(w.insight,{knowledge:90,leisure:90,cooperation:90,sustainability:90,illumination:true});
 delete w.insight.harmonyTicks;delete w.insight.illuminationAtTick;
 const a=E.tick(w),b=E.tick(JSON.parse(JSON.stringify(w)));
 assert.deepEqual(a,b);assert.equal(a.insight.harmonyTicks,1);assert.equal(a.insight.illumination,false);
 assert.equal(a.history.some(e=>e.kind==='sustained_insight'),false);
});

test('three temples unlock fictional spokesperson only after all are commissioned',()=>{
 let w=E.createWorld('three-temples');w.resources.budget=300;w.resources.workers=20;
 for(let n=0;n<3;n++)w=E.commit(w,E.interpretIntent('','temple'),w.revision);
 assert.equal(w.culture.temples,0);assert.equal(w.culture.spokesperson,null);
 w=E.tick(w);assert.equal(w.culture.temples,0);assert.equal(w.culture.spokesperson,null);
 w=E.tick(w);assert.equal(w.culture.temples,3);
 assert.equal(w.culture.spokesperson?.fictional,true);
 assert.equal(w.culture.spokesperson?.role,'temple_spokesperson');
 assert.equal(E.address(w,w.culture.spokesperson.building,w.culture.spokesperson.floor,w.culture.spokesperson.flat)?.id,
  w.culture.spokesperson.id);
 const restored=JSON.parse(JSON.stringify(w));
 assert.deepEqual(E.tick(w),E.tick(restored));
});
test('legacy temple-square spokesperson migrates to a canonical resident address',()=>{
 let w=E.createWorld('legacy-spokesperson');w.culture.temples=3;
 w.culture.spokesperson=E.resident(w.seed,'temple-square',1,1);
 assert.equal(E.address(w,w.culture.spokesperson.building,w.culture.spokesperson.floor,w.culture.spokesperson.flat),null);
 w=E.tick(w);assert.equal(w.culture.spokesperson.role,'temple_spokesperson');
 assert.equal(E.address(w,w.culture.spokesperson.building,w.culture.spokesperson.floor,w.culture.spokesperson.flat)?.id,
  w.culture.spokesperson.id);
});
test('two commissioned temples plus one under construction cannot unlock spokesperson',()=>{
 let w=E.createWorld('two-temples');w.resources.budget=300;w.resources.workers=20;
 for(let n=0;n<2;n++)w=E.commit(w,E.interpretIntent('','temple'),w.revision);
 w=E.simulateTicks(w,2);assert.equal(w.culture.temples,2);
 w=E.commit(w,E.interpretIntent('','temple'),w.revision);
 w=E.tick(w);assert.equal(w.culture.temples,2);assert.equal(w.culture.spokesperson,null);
});

test('inherited project keys cannot become executable intents',()=>{
 for(const key of ['constructor','toString','__proto__']){
  const intent=E.interpretIntent('',key);
  assert.equal(intent.goal,'workshop');assert.equal(E.preview(E.createWorld('keys'),intent).feasible,true);
 }
});
test('fictional addresses require integral existing floor and flat',()=>{
 const w=E.createWorld('address-validation');
 for(const [floor,flat] of [[1.5,1],[1,2.5],[NaN,1],[1,Infinity],['2',1],[1,'2']])
  assert.equal(E.address(w,'house-1',floor,flat),null);
 assert.equal(E.address(w,'house-1',1,1)?.fictional,true);
});
