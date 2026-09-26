'use strict';
const test=require('node:test'),a=require('node:assert/strict');
const E=require('../lib/world-consequence-engine');

test('canonical 5-house network, bounded state and exact replay',()=>{
 const w=E.createWorld('free-city');
 a.deepEqual(w,E.createWorld('free-city'));
 a.equal(w.cityServices.links.length,w.houses.length-1);
 a.equal(w.cityServices.summary.roadAccessHomes,w.houses.length);
 a.equal(new Set(w.cityServices.houses.map(h=>h.id)).size,w.houses.length);
 a.deepEqual(E.cityServices(w),w.cityServices);
 a.deepEqual(E.simulateTicks(w,8),E.simulateTicks(JSON.parse(JSON.stringify(w)),8));
 a(Buffer.byteLength(JSON.stringify(w))<16384);
});
test('floor-level scarcity rotates service rather than permanently favoring one house',()=>{
 const w=E.createWorld('scarcity');Object.assign(w.resources,{power:12,water:100,ecology:90});
 const served=new Set();
 for(let tick=0;tick<w.houses.length;tick++){
  w.tick=tick;const state=E.cityServices(w);
  a(state.summary.poweredHomes<w.houses.length);
  a.equal(state.summary.wateredHomes,w.houses.length);
  state.houses.filter(h=>h.powerFloors>0).forEach(h=>served.add(h.id));
 }
 a(served.size>1);
});
test('free commissioned backup never makes hazards worse and can restore supply',()=>{
 let damaged=false,repaired=false;
 for(let i=0;i<300;i++){
  const w=E.createWorld('hazard-'+i);
  Object.assign(w.resources,{ecology:0,power:100,water:100});
  w.land.volcano=true;w.tick=6;
  const before=E.cityServices(w);
  damaged ||=before.links.some(l=>!l.power||!l.water||!l.road);
  w.projects=[{id:'solar-'+i,type:'solar',active:true}];
  const after=E.cityServices(w);
  a(after.summary.poweredHomes>=before.summary.poweredHomes);
  repaired ||=after.summary.poweredHomes>before.summary.poweredHomes;
 }
 a(damaged&&repaired);
});
test('blackouts, recovery, and commute appear in durable anonymous game state',()=>{
 let w=E.createWorld('power-loss');
 a(w.cityServices.summary.commutersAbleToTravel>0);
 Object.assign(w.resources,{power:0,water:0});w=E.tick(w);
 a.equal(w.cityServices.summary.poweredHomes,0);
 a.equal(w.cityServices.summary.wateredHomes,0);
 const events=w.history.filter(e=>e.kind==='city_services_changed');
 a(events.some(e=>e.changes.some(c=>c.lost.length)));
 a(!JSON.stringify(events).includes('actorId'));
 Object.assign(w.resources,{power:100,water:100});w=E.tick(w);
 a.equal(w.cityServices.summary.poweredHomes,w.houses.length);
 a.equal(w.cityServices.summary.wateredHomes,w.houses.length);
 a(w.history.some(e=>e.kind==='city_services_changed'&&e.changes.some(c=>c.restored.length)));
});
test('legacy and malformed service snapshots are repaired, never blindly returned',()=>{
 let w=E.createWorld('legacy');delete w.cityServices;
 const hydrated=E.tick(w);
 a.equal(hydrated.cityServices.houses.length,w.houses.length);
 a(!hydrated.history.some(e=>e.kind==='city_services_changed'));
 w=E.createWorld('tamper');w.cityServices={version:1,houses:[null,{id:'house-0',powered:{nested:'injected'}}]};
 a.doesNotThrow(()=>E.tick(w));
 const publicWorld=require('../lib/chain-reaction-api').publicState(w);
 a.deepEqual(publicWorld.cityServices,E.cityServices(w));
 a(!JSON.stringify(publicWorld.cityServices).includes('injected'));
});
test('no-key offline Genie explanation is deterministic and hides classifications',()=>{
 const w=E.createWorld('offline-genie');Object.assign(w.resources,{power:35,water:80,food:80,budget:500,workers:50});
 const o=E.genieOptions(w);
 a.equal(o.cards.length,4);
 a(o.cards.every(c=>c.explanation.includes('Предварительная модель')));
 a(!/worsens|shifts_crisis|balanced|actorId/.test(JSON.stringify(o.cards)));
 a.deepEqual(o,E.genieOptions(JSON.parse(JSON.stringify(w))));
 a.equal(E.genieOptions({...w,resources:{...w.resources,budget:0}}).cards.length,0);
});
