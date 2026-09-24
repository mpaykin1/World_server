'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../lib/world-consequence-engine');

function collapsed(seed='recovery'){
 const world=engine.createWorld(seed);
 Object.assign(world.resources,{power:0,water:0,food:0,budget:100,ecology:75,health:75,jobs:36,workers:0,culture:25});
 world.population=80;
 return world;
}

test('severe crisis activates one costly cooperative at the exact sixth tick',()=>{
 let world=collapsed();
 for(let i=0;i<5;i++){
  world=engine.tick(world);
  assert.equal(world.recovery.cooperativeActive,false);
  assert.equal(world.history.some(event=>event.kind==='crisis_recovery_started'),false);
 }
 world=engine.tick(world);
 assert.equal(world.tick,6);assert.equal(world.revision,6);
 assert.equal(world.recovery.cooperativeActive,true);
 assert.equal(world.recovery.interventions,1);assert.equal(world.recovery.lastAtTick,6);
 assert.equal(world.recovery.activeTicks,0);
 assert.equal(world.crisis,false);
 for(const key of ['power','water','food'])assert.equal(world.resources[key],18);
 assert.equal(world.resources.budget,94);assert.equal(world.resources.ecology,72);
 assert.equal(world.resources.culture,20);assert.equal(world.resources.jobs,30);
 assert.equal(world.resources.workers,4);assert.equal(world.population,71);
 const event=world.history.find(item=>item.kind==='crisis_recovery_started');
 assert.deepEqual(event.tradeoffs,{budget:-12,ecology:-3,culture:-5,jobs:-6,population:-3});
});

test('recovery arithmetic is deterministic and keeps a collapsed world playable',()=>{
 const start=collapsed('deterministic-recovery');
 const first=engine.simulateTicks(start,30),replay=engine.simulateTicks(structuredClone(start),30);
 assert.deepEqual(first,replay);
 assert(first.population>0);assert.equal(first.revision,30);
 const interventions=first.history.filter(event=>event.kind==='crisis_recovery_started');
 assert(interventions.length>=1);
 assert.equal(interventions.length,first.recovery.interventions);
 assert(interventions.every((event,index)=>index===0||event.tick-interventions[index-1].tick>=6));
 assert(['power','water','food'].every(key=>first.resources[key]>=15));
 assert(first.resources.budget<100);assert(first.resources.ecology<75);
});

test('legacy recovery state is repaired and the cooperative phases out only after sustained stability',()=>{
 let world=engine.createWorld('phase-out');
 world.recovery={cooperativeActive:true,crisisTicks:'bad',stableTicks:0,interventions:1,lastAtTick:2};
 Object.assign(world.resources,{power:80,water:80,food:80,health:80,budget:100,ecology:80});
 for(let i=0;i<5;i++){
  world=engine.tick(world);assert.equal(world.recovery.cooperativeActive,true);
 }
 world=engine.tick(world);
 assert.equal(world.recovery.cooperativeActive,false);assert.equal(world.recovery.stableTicks,0);
 assert.equal(world.recovery.crisisTicks,0);assert.equal(world.recovery.interventions,1);
 assert.equal(world.history.filter(event=>event.kind==='crisis_recovery_completed').length,1);
});

test('recovery support records and restores only resources that are actually in crisis',()=>{
 let world=engine.createWorld('single-deficit');
 Object.assign(world.resources,{power:0,water:70,food:70,budget:100,workers:8});
 for(let i=0;i<6;i++)world=engine.tick(world);
 const event=world.history.find(item=>item.kind==='crisis_recovery_started');
 assert.deepEqual(event.support,{power:18,workers:0});
 assert.equal(Object.hasOwn(event.support,'water'),false);
 assert.equal(Object.hasOwn(event.support,'food'),false);
 assert.equal(world.recovery.interventions,1);
});

test('an active workshop cannot turn recovery into a permanent subsidy',()=>{
 let world=engine.createWorld('workshop-counterexample');
 world.resources.budget=200;world.resources.power=80;world.resources.water=80;world.resources.food=80;world.resources.workers=20;
 world=engine.commit(world,engine.interpretIntent('', 'workshop'));
 world=engine.simulateTicks(world,2);assert.equal(world.projects[0].active,true);
 Object.assign(world.resources,{power:0,water:0,food:0,budget:0,ecology:75,health:75,jobs:0,workers:0,culture:25});
 world=engine.simulateTicks(world,2000);
 const started=world.history.filter(event=>event.kind==='crisis_recovery_started');
 const completed=world.history.filter(event=>event.kind==='crisis_recovery_completed');
 assert.equal(world.recovery.cooperativeActive,false);
 assert.equal(world.recovery.interventions,3);
 assert.equal(started.length,3);assert.equal(completed.length,3);
 assert(completed.every(event=>event.outcome==='exhausted'));
 assert.equal(world.resources.power,0);
});

test('unsafe legacy intervention counters clamp without overflow or phantom history',()=>{
 let world=collapsed('unsafe-counter');
 world.recovery={crisisTicks:5,stableTicks:0,activeTicks:0,cooperativeActive:false,
  interventions:Number.MAX_SAFE_INTEGER,lastAtTick:null};
 world=engine.tick(world);
 assert.equal(world.recovery.interventions,3);
 assert.equal(world.recovery.cooperativeActive,false);
 assert.equal(world.history.some(event=>event.kind==='crisis_recovery_started'),false);
 world=engine.tick(world);assert.equal(world.recovery.interventions,3);
});
