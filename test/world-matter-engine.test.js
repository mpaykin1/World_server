'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MatterWorld, MATERIALS, CHUNK_SIZE, GRAVITY } = require('../lib/world-matter-engine');

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
  assert.deepEqual(GRAVITY, { x: 0, y: -1, z: 0 });
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

test('fixed Y-up gravity crosses chunk boundaries deterministically', () => {
  const falling = new MatterWorld({ seed: 29 });
  falling.setCell(0, 16, 0, 'sand');
  falling.step();
  assert.equal(falling.getCell(0, 15, 0)?.material, 'sand');

  const rising = new MatterWorld({ seed: 31 });
  rising.setCell(0, -1, 0, 'steam', { temperature: 120, life: 12 });
  rising.step();
  assert.equal(rising.getCell(0, 0, 0)?.material, 'steam');
});

test('powder uses explicit horizontal offsets to settle diagonally downward', () => {
  const world = new MatterWorld({ seed: 17 });
  world.setCell(0, 0, 0, 'stone');
  world.setCell(0, 1, 0, 'sand');
  world.step();
  const sand = world.snapshot().find(cell => cell.material === 'sand');
  const [x, y, z] = sand.position.split(',').map(Number);
  assert.equal(y, 0);
  assert.equal(Math.abs(x) + Math.abs(z), 1);
});

test('liquid flows horizontally when gravity is blocked', () => {
  const world = new MatterWorld({ seed: 19 });
  world.setCell(0, 0, 0, 'stone');
  world.setCell(0, 1, 0, 'water');
  world.step();
  const water = world.snapshot().find(cell => cell.material === 'water');
  const [x, y, z] = water.position.split(',').map(Number);
  assert.equal(y, 1);
  assert.equal(Math.abs(x) + Math.abs(z), 1);
});

test('gas rises vertically before trying horizontal drift', () => {
  const world = new MatterWorld({ seed: 23 });
  world.setCell(0, 1, 0, 'steam', { temperature: 120, life: 12 });
  world.step();
  assert.equal(world.getCell(0, 2, 0)?.material, 'steam');
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

test('nonflammable material cannot be forged into a burning state', () => {
  const world = new MatterWorld({ seed: 37 });
  world.setCell(0, 0, 0, 'stone', { burning: true, fuel: 10 });
  assert.equal(world.getCell(0, 0, 0)?.burning, false);
  world.step();
  assert.equal(world.getCell(0, 0, 0)?.material, 'stone');
  assert.ok(!world.snapshot().some(cell => cell.material === 'fire'));
});

test('fire ignites wood; wood survives ignition and consumes its fuel budget', () => {
  const world = new MatterWorld({ seed: 4 });
  floor(world);
  world.setCell(0, 1, 0, 'wood');
  world.setCell(1, 1, 0, 'fire');
  world.step();
  const ignited = world.getCell(0, 1, 0);
  assert.equal(ignited?.material, 'wood');
  assert.equal(ignited?.burning, true);
  assert.ok(ignited.fuel >= 7 && ignited.fuel <= 8);
  run(world, 13);
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
