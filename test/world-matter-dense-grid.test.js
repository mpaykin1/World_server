'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DenseMatterGrid, MATERIAL_IDS
} = require('../lib/world-matter-dense-grid');

function run(grid,n){ for(let i=0;i<n;i++) grid.step(); }

test('dense runtime stores matter in typed arrays', () => {
  const grid = new DenseMatterGrid(128,128,{seed:7});
  assert.ok(grid.material instanceof Uint8Array);
  assert.ok(grid.temperature instanceof Int16Array);
  assert.equal(grid.material.length,16384);
});

test('dense sand falls while settled cells go inactive', () => {
  const grid = new DenseMatterGrid(32,32,{seed:8});
  for(let x=0;x<32;x++) grid.set(x,0,'stone');
  grid.set(10,10,'sand');
  run(grid,20);
  const sand=[];
  grid.forEachCell((x,y,c)=>{if(c.material==='sand') sand.push([x,y]);});
  assert.equal(sand.length,1);
  assert.equal(sand[0][1],1);
  run(grid,4);
  assert.equal(grid.stats().active,0);
});

test('dense density rules let water displace lighter oil', () => {
  const grid = new DenseMatterGrid(12,12,{seed:9});
  for(let x=0;x<12;x++) grid.set(x,0,'stone');
  grid.set(6,1,'oil');
  grid.set(6,2,'water');
  grid.step();
  assert.equal(grid.get(6,1)?.material,'water');
  assert.equal(grid.get(6,2)?.material,'oil');
});

test('dense lava-water reaction produces stone, steam and an event', () => {
  const grid = new DenseMatterGrid(12,12,{seed:10});
  grid.set(5,5,'lava');
  grid.set(6,5,'water');
  grid.step();
  assert.equal(grid.get(5,5)?.material,'stone');
  let steam=0;
  grid.forEachCell((x,y,c)=>{if(c.material==='steam') steam++;});
  assert.ok(steam>0);
  const event = grid.drainEvents().find(e=>e.type==='reaction');
  assert.equal(event?.reaction,'lava-water');
});

test('dense fire ignites wood and eventually leaves ash', () => {
  const grid = new DenseMatterGrid(20,20,{seed:11});
  for(let x=0;x<20;x++) grid.set(x,0,'stone');
  grid.set(10,1,'wood');
  grid.set(11,1,'fire');
  run(grid,18);
  let ash=0;
  grid.forEachCell((x,y,c)=>{if(c.material==='ash') ash++;});
  assert.ok(ash>0);
  assert.ok(grid.drainEvents().some(e=>e.type==='ignite'));
});

test('dense matter respects an external sparse-world collision mask', () => {
  const grid = new DenseMatterGrid(12,12,{seed:13,externalSolid:(x,y)=>x===6&&y===1});
  grid.set(6,2,'sand');
  grid.step();
  assert.equal(grid.get(6,1),null);
  const sand=[];
  grid.forEachCell((x,y,c)=>{if(c.material==='sand') sand.push([x,y]);});
  assert.equal(sand.length,1);
  assert.notDeepEqual(sand[0],[6,1]);
});

test('dense runtime honors a hard active-cell budget', () => {
  const grid = new DenseMatterGrid(256,256,{seed:12});
  for(let x=0;x<256;x++) grid.set(x,0,'stone');
  for(let y=120;y<180;y++) for(let x=40;x<216;x++) grid.set(x,y,'sand');
  const before=grid.stats();
  assert.ok(before.occupied>10000);
  const after=grid.step({maxCells:5000});
  assert.ok(after.processed<=5000);
  assert.ok(after.active>0);
  assert.equal(MATERIAL_IDS.sand,2);
});
