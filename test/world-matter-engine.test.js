'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MatterWorld, MATERIALS, CHUNK_SIZE } = require('../lib/world-matter-engine');

function run(world, ticks) {
  const stats = [];
  for (let i = 0; i < ticks; i++) stats.push(world.step());
  return stats;
}

function floor(world, radius = 2) {
  for (let x = -radius; x <= radius; x++) {
    for (let z = -radius; z <= radius; z++) world.setCell(x, 0, z, 'stone');
  }
}

test('matter catalog exposes physical phases and chunk scale', () => {
  assert.equal(CHUNK_SIZE, 16);
  assert.equal(MATERIALS.sand.phase, 'powder');
  assert.equal(MATERIALS.water.phase, 'liquid');
  assert.equal(MATERIALS.steam.phase, 'gas');
  assert.ok(MATERIALS.lava.temperature > MATERIALS.water.boil);
});

test('sand falls and settles on solid stone', () => {
  const world = new MatterWorld({ seed: 7 });
  floor(world);
  world.setCell(0, 3, 0, 'sand');
  run(world, 5);
  assert.equal(world.getCell(0, 1, 0)?.material, 'sand');
  assert.equal(world.getCell(0, 0, 0)?.material, 'stone');
});

test('denser water falls through oil by swapping materials', () => {
  const world = new MatterWorld({ seed: 9 });
  floor(world, 1);
  for (const y of [1, 2]) {
    world.setCell(1, y, 0, 'stone');
    world.setCell(-1, y, 0, 'stone');
    world.setCell(0, y, 1, 'stone');
    world.setCell(0, y, -1, 'stone');
  }
  world.setCell(0, 1, 0, 'oil');
  world.setCell(0, 2, 0, 'water');
  world.step();
  assert.equal(world.getCell(0, 1, 0)?.material, 'water');
  assert.equal(world.getCell(0, 2, 0)?.material, 'oil');
});

test('lava touching water makes stone and steam without scripted event', () => {
  const world = new MatterWorld({ seed: 11 });
  world.setCell(0, 1, 0, 'lava');
  world.setCell(1, 1, 0, 'water');
  world.step();
  const materials = world.snapshot().map(cell => cell.material);
  assert.ok(materials.includes('stone'));
  assert.ok(materials.includes('steam'));
  assert.ok(!materials.includes('lava'));
});

test('fire ignites wood, consumes fuel and leaves ash', () => {
  const world = new MatterWorld({ seed: 4 });
  floor(world);
  world.setCell(0, 1, 0, 'wood');
  world.setCell(1, 1, 0, 'fire');
  run(world, 14);
  assert.ok(world.snapshot().some(cell => cell.material === 'ash'));
});

test('hot water transitions to steam and steam can cool back to water', () => {
  const world = new MatterWorld({ seed: 5 });
  world.setCell(0, 0, 0, 'stone');
  world.setCell(0, 1, 0, 'water', { temperature: 130 });
  world.step();
  assert.ok(world.snapshot().some(cell => cell.material === 'steam'));

  const cool = new MatterWorld({ seed: 5 });
  cool.setCell(0, 0, 0, 'stone');
  cool.setCell(0, 1, 0, 'steam', { temperature: 70, life: 12 });
  cool.step();
  assert.ok(cool.snapshot().some(cell => cell.material === 'water'));
});

test('stable cells go to sleep until a neighbour changes', () => {
  const world = new MatterWorld({ seed: 1 });
  world.setCell(0, 0, 0, 'stone');
  const first = world.step();
  const second = world.step();
  assert.equal(first.processed, 1);
  assert.equal(second.processed, 0);
  assert.equal(second.activeChunks, 0);

  world.setCell(0, 1, 0, 'sand');
  assert.ok(world.stats().activeCells > 0);
});

test('same seed and inputs remain deterministic across ticks', () => {
  const build = () => {
    const world = new MatterWorld({ seed: 123 });
    for (let x = -2; x <= 2; x++) world.setCell(x, 0, 0, 'stone');
    world.setCell(0, 4, 0, 'sand');
    world.setCell(1, 3, 0, 'water');
    world.setCell(-1, 3, 0, 'oil');
    run(world, 8);
    return world.snapshot();
  };
  assert.deepEqual(build(), build());
});
