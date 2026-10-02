'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MatterWorld } = require('../lib/world-matter-engine');
const {
  findUnsupportedClusters, applyDamage, RigidClusterSystem
} = require('../lib/world-matter-structure');

test('structural cells connected to ground remain supported', () => {
  const world = new MatterWorld({ seed: 1 });
  world.setCell(0,0,0,'stone');
  world.setCell(0,1,0,'wood');
  world.setCell(0,2,0,'wood');
  assert.deepEqual(findUnsupportedClusters(world), []);
});

test('removing support exposes one connected unsupported cluster', () => {
  const world = new MatterWorld({ seed: 2 });
  world.setCell(0,0,0,'stone');
  world.setCell(0,1,0,'wood');
  world.setCell(1,1,0,'wood');
  world.setCell(0,2,0,'wood');
  const broken = applyDamage(world,0,0,0,2);
  assert.equal(broken.length,1);
  const clusters = findUnsupportedClusters(world);
  assert.equal(clusters.length,1);
  assert.equal(clusters[0].length,3);
});

test('rigid cluster detaches, falls, collides and reinserts into matter world', () => {
  const world = new MatterWorld({ seed: 3 });
  for(let x=-3;x<=3;x++) world.setCell(x,0,0,'stone');
  world.setCell(0,5,0,'wood');
  world.setCell(1,5,0,'wood');
  world.setCell(0,6,0,'wood');

  const rigid = new RigidClusterSystem({ gravity:-30, shatterSpeed:99 });
  const detached = rigid.detach(world,{minCells:2});
  assert.equal(detached.length,1);
  assert.equal(detached[0].cells.length,3);
  assert.equal(world.getCell(0,5,0),null);

  for(let i=0;i<240 && rigid.clusters.length;i++) rigid.step(world,1/60);
  assert.equal(rigid.clusters.length,0);
  const wood = world.snapshot().filter(c=>c.material==='wood');
  assert.equal(wood.length,3);
  assert.ok(wood.every(c=>Number(c.position.split(',')[1])>=1));
});

test('hard impact can shatter a detached stone cluster into granular debris', () => {
  const world = new MatterWorld({ seed: 4 });
  for(let x=-4;x<=4;x++) world.setCell(x,0,0,'stone');
  world.setCell(0,8,0,'stone');
  world.setCell(1,8,0,'stone');
  const rigid = new RigidClusterSystem({ gravity:-45, shatterSpeed:4 });
  rigid.detach(world,{minCells:2});
  for(let i=0;i<240 && rigid.clusters.length;i++) rigid.step(world,1/60);
  assert.ok(world.snapshot().some(c=>c.material==='sand'));
});
