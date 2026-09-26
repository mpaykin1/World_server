'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../lib/world-consequence-engine');

test('partial persisted world without resources has a bounded anonymous projection',()=>{
 const world=E.createWorld('partial-world');
 delete world.resources;
 const services=E.cityServices(world);
 assert.equal(services.houses.length,world.houses.length);
 assert.equal(services.summary.poweredHomes,0);
 assert.equal(services.summary.wateredHomes,0);
 assert.equal(services.summary.commutersAbleToTravel,0);
 assert.equal(services.links.length,world.houses.length-1);
});

test('the selected 32 houses are canonical irrespective of order and duplicates',()=>{
 const world=E.createWorld('canonical-33');
 world.houses=Array.from({length:33},(_,i)=>({
  id:'h'+String(i).padStart(2,'0'),x:i,z:0,floors:1
 }));
 const first=E.cityServices(world);
 const reversed=E.cityServices({...world,houses:[...world.houses].reverse()});
 assert.deepEqual(reversed,first);
 assert.deepEqual(first.houses.map(h=>h.id),world.houses.slice(0,32).map(h=>h.id));
 const duplicate={...world.houses[2],x:999};
 const withDuplicates=E.cityServices({...world,houses:[duplicate,...world.houses,duplicate]});
 assert.deepEqual(withDuplicates.houses.map(h=>h.id),first.houses.map(h=>h.id));
 assert.equal(new Set(withDuplicates.houses.map(h=>h.id)).size,32);
 assert.deepEqual(E.cityServices({...world,houses:[...world.houses,duplicate,duplicate]}),withDuplicates);
});

test('valid nine-floor and hundred-floor homes are not omitted',()=>{
 const world=E.createWorld('tall-houses');
 world.houses=[{id:'nine',x:0,z:0,floors:9},{id:'hundred',x:1,z:0,floors:100}];
 const services=E.cityServices(world);
 assert.deepEqual(services.houses.map(h=>h.id),['hundred','nine']);
 assert.deepEqual(services.houses.map(h=>h.floors),[100,9]);
});

test('commit refreshes persisted service allocation after resource reservation',()=>{
 const world=E.createWorld('desalination-cache');
 world.land.coast=true;
 Object.assign(world.resources,{power:45,workers:50,budget:300});
 world.cityServices=E.cityServices(world);
 const intent=E.interpretIntent('','desalination');
 const committed=E.commit(world,intent);
 assert.equal(committed.resources.power,33);
 assert.deepEqual(committed.cityServices,E.cityServices(committed));
 assert.notDeepEqual(committed.cityServices,world.cityServices);
 assert.equal(world.resources.power,45);
});

test('partial metadata gives explicit canonical tick and seed fallback',()=>{
 const world=E.createWorld('missing-metadata');
 delete world.tick;
 delete world.seed;
 const a=E.cityServices(world);
 const b=E.cityServices({...world,houses:[...world.houses].reverse()});
 assert.equal(a.tick,0);
 assert.deepEqual(a,b);
 assert.equal(a.summary.roadAccessHomes,world.houses.length);
});

test('partial world never echoes injected cityServices without house directory',()=>{
 const w=E.createWorld('privacy-missing-houses');delete w.houses;delete w.residents;
 w.cityServices={version:1,houses:[{id:'injected',privateToken:'DO_NOT_ECHO'}]};
 const publicWorld=require('../lib/chain-reaction-api').publicState(w);
 assert.deepEqual(publicWorld.cityServices,E.cityServices(w));
 assert.equal(JSON.stringify(publicWorld.cityServices).includes('DO_NOT_ECHO'),false);
});
test('malformed null history does not crash city services or public DTO',()=>{
 const w=E.createWorld('corrupt-history');w.tick=1;w.history=[null,{kind:'accident',tick:1}];
 assert.doesNotThrow(()=>E.cityServices(w));
 const publicWorld=require('../lib/chain-reaction-api').publicState(w);
 assert.deepEqual(publicWorld.history,[{kind:'accident',tick:1}]);
 assert.equal(E.cityServices(w).tick,1);
});
