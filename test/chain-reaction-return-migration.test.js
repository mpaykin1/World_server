'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../lib/world-consequence-engine');

function stableWorld(seed='return-migration'){
 const world=engine.createWorld(seed);
 world.population=20;
 Object.assign(world.resources,{power:100,water:100,food:100,health:80,jobs:50,workers:10});
 return world;
}

test('crisis departures become a canonical displaced cohort',()=>{
 let world=stableWorld('departure');
 Object.assign(world.resources,{power:0,water:0,food:0});
 world=engine.simulateTicks(world,3);
 assert.equal(world.population,17);
 assert.deepEqual(world.demography,{displaced:3,stableTicks:0,returned:0});
 assert.equal(world.history.filter(event=>event.kind==='crisis_migration').length,3);
 assert.equal(world.history.at(-1).displaced,3);
});

test('two residents return only after four consecutive stable ticks',()=>{
 let world=stableWorld('exact-return');
 world.demography={displaced:5,stableTicks:0,returned:0};
 for(let tick=1;tick<4;tick++){
  world=engine.tick(world);
  assert.equal(world.population,20);
  assert.equal(world.demography.displaced,5);
  assert.equal(world.history.some(event=>event.kind==='return_migration'),false);
 }
 world=engine.tick(world);
 assert.equal(world.population,22);
 assert.deepEqual(world.demography,{displaced:3,stableTicks:0,returned:2});
 assert.deepEqual(world.history.at(-1),{tick:4,kind:'return_migration',count:2,remaining:3});
});

test('resource or jobs instability resets the return streak',()=>{
 let world=stableWorld('streak-reset');
 world.demography={displaced:2,stableTicks:3,returned:0};
 world.resources.jobs=24;
 world=engine.tick(world);
 assert.equal(world.demography.stableTicks,0);
 assert.equal(world.demography.displaced,2);
 assert.equal(world.population,20);
 Object.assign(world.resources,{jobs:50,power:100,water:100,food:100,health:80});
 world=engine.simulateTicks(world,3);
 assert.equal(world.demography.displaced,2);
 world=engine.tick(world);
 assert.equal(world.demography.displaced,0);
 assert.equal(world.population,22);
});

test('return migration conserves the stored cohort and suppresses unrelated growth',()=>{
 let world=stableWorld('conservation');
 world.demography={displaced:3,stableTicks:0,returned:7};
 const total=world.population+world.demography.displaced;
 world=engine.simulateTicks(world,8);
 assert.equal(world.demography.displaced,0);
 assert.equal(world.demography.returned,10);
 assert.equal(world.population,total);
 assert.equal(world.history.filter(event=>event.kind==='return_migration').reduce((sum,event)=>sum+event.count,0),3);
});

test('legacy and unsafe demography state is bounded and deterministic',()=>{
 const start=stableWorld('legacy-bounds');
 start.demography={displaced:Number.MAX_SAFE_INTEGER,stableTicks:Number.MAX_SAFE_INTEGER,returned:Number.MAX_SAFE_INTEGER};
 const first=engine.tick(start),replay=engine.tick(structuredClone(start));
 assert.deepEqual(first,replay);
 assert.equal(first.demography.displaced,99998);
 assert.equal(first.demography.stableTicks,0);
 assert.equal(first.demography.returned,100000);
 assert(Object.values(first.demography).every(Number.isSafeInteger));
});

test('missing or malformed legacy demography state hydrates without changing revision semantics',()=>{
 const missing=stableWorld('missing-state');delete missing.demography;
 const malformed=stableWorld('malformed-state');malformed.demography=[];
 const a=engine.tick(missing),b=engine.tick(malformed);
 assert.deepEqual(a.demography,{displaced:0,stableTicks:0,returned:0});
 assert.deepEqual(b.demography,{displaced:0,stableTicks:0,returned:0});
 assert.equal(a.revision,1);assert.equal(b.revision,1);
});
