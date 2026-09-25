'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../lib/world-consequence-engine');

test('free city-services graph is bounded, canonical and deterministic',()=>{
 const a=E.createWorld('open-city'),b=E.createWorld('open-city');
 assert.deepEqual(a,b);
 assert.equal(a.cityServices.version,1);
 assert.equal(a.cityServices.links.length,a.houses.length-1);
 assert.equal(new Set(a.cityServices.houses.map(h=>h.id)).size,a.houses.length);
 assert.equal(a.cityServices.summary.roadAccessHomes,a.houses.length);
 assert(a.cityServices.houses.every(h=>Number.isInteger(h.powerFloors)&&h.powerFloors>=0&&
  h.powerFloors<=h.floors&&h.waterFloors<=h.floors));
 assert.deepEqual(E.cityServices(a),a.cityServices);
 const restored=JSON.parse(JSON.stringify(a));
 assert.deepEqual(E.simulateTicks(a,8),E.simulateTicks(restored,8));
 assert(Buffer.byteLength(JSON.stringify(a))<16*1024,'initial saved world must stay below existing 16 KiB expectation');
});

test('scarcity creates local blackouts with fair rotating priority',()=>{
 const world=E.createWorld('scarcity');
 world.resources.power=12;world.resources.water=100;world.resources.ecology=90;
 const served=new Set();
 for(let t=0;t<world.houses.length;t++){
  world.tick=t;
  const state=E.cityServices(world);
  assert(state.summary.poweredHomes<world.houses.length);
  assert.equal(state.summary.wateredHomes,world.houses.length);
  for(const h of state.houses)if(h.powerFloors>0)served.add(h.id);
 }
 assert(served.size>1,'scarce electricity must not privilege one house permanently');
});

test('hazards sever actual network links and free commissioned backup sources improve or preserve supply',()=>{
 let witnessedRepair=false,witnessedDamage=false;
 for(let i=0;i<300;i++){
  const world=E.createWorld('hazard-'+i);
  world.land.volcano=true;world.resources.ecology=0;
  world.resources.power=100;world.resources.water=100;
  world.tick=6;
  const base=E.cityServices(world);
  if(base.links.some(link=>!link.power||!link.road||!link.water))witnessedDamage=true;
  world.projects=[{id:'commissioned-solar-'+i,type:'solar',active:true}];
  const reinforced=E.cityServices(world);
  assert(reinforced.summary.poweredHomes>=base.summary.poweredHomes,
   'commissioned backup must not worsen power coverage');
  if(reinforced.summary.poweredHomes>base.summary.poweredHomes)witnessedRepair=true;
 }
 assert(witnessedDamage,'hazard fixture should damage at least one line');
 assert(witnessedRepair,'at least one deterministic seed should demonstrate power restoration');
});

test('outages, recovery and commute are saved as safe causal world consequences',()=>{
 let world=E.createWorld('services-outage');
 assert(world.cityServices.summary.commutersAbleToTravel>0);
 world.resources.power=0;world.resources.water=0;
 world=E.tick(world);
 assert.equal(world.cityServices.summary.poweredHomes,0);
 assert.equal(world.cityServices.summary.wateredHomes,0);
 const lost=world.history.find(e=>e.kind==='city_services_changed'&&e.changes.some(c=>c.lost.length));
 assert(lost);assert.equal(typeof lost.story,'string');
 assert.equal(JSON.stringify(lost).includes('actorId'),false);
 world.resources.power=100;world.resources.water=100;
 world=E.tick(world);
 assert.equal(world.cityServices.summary.poweredHomes,world.houses.length);
 assert.equal(world.cityServices.summary.wateredHomes,world.houses.length);
 assert(world.history.some(e=>e.kind==='city_services_changed'&&e.changes.some(c=>c.restored.length)));
});

test('legacy missing/corrupt projections rehydrate without trusting injected home records',()=>{
 const first=E.createWorld('legacy-service');
 const older=JSON.parse(JSON.stringify(first));delete older.cityServices;
 const migrated=E.tick(older);
 assert.equal(migrated.cityServices.version,1);
 assert.equal(migrated.cityServices.houses.length,older.houses.length);
 assert.equal(migrated.history.some(e=>e.kind==='city_services_changed'),false);
 first.cityServices.houses=[null,{id:'house-0',powered:{secret:'private'},watered:true,roadAccess:true}];
 assert.doesNotThrow(()=>E.tick(first));
});

test('Genie forecasts include free deterministic plain-language narration without external API',()=>{
 const world=E.createWorld('free-genie');
 Object.assign(world.resources,{power:35,water:80,food:80,budget:500,workers:50});
 const response=E.genieOptions(world);
 assert.equal(response.cards.length,4);
 for(const card of response.cards){
  assert.equal(typeof card.explanation,'string');
  assert(card.explanation.includes('Предварительная модель'));
  assert(!/worsens|shifts_crisis|balanced|actorId/.test(card.explanation));
 }
 assert.deepEqual(response,E.genieOptions(JSON.parse(JSON.stringify(world))));
 assert.equal(E.genieOptions({...world,resources:{...world.resources,budget:0}}).cards.length,0);
});

test('public Node adapter recomputes untrusted saved service projection',()=>{
 const w=E.createWorld('public-city-services');
 w.cityServices={version:1,houses:[{id:'injected',powered:{nested:'not canonical'}}]};
 const projection=require('../lib/chain-reaction-api').publicState(w);
 assert.deepEqual(projection.cityServices,E.cityServices(w));
 assert.equal(JSON.stringify(projection.cityServices).includes('not canonical'),false);
});
