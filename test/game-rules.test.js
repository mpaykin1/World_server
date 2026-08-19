'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  defaultInventory, generateChunk, snapBuilding, validateBuild,
  rowToBuilding, rowToSharabassObject
} = require('../lib/game-rules');
const { checkResourceDistance, playerPosition } = require('../api/game')._private;

test('default inventory preserves 36-slot gameplay contract', () => {
  const inventory = defaultInventory();
  assert.equal(inventory.length, 36);
  assert.deepEqual(inventory[0], { item: 'wood', count: 999 });
  assert.deepEqual(inventory[27], { item: 'stone_hatchet', count: 1 });
  assert.deepEqual(inventory[28], { item: 'pickaxe', count: 1 });
});

test('chunk generation remains deterministic', () => {
  const first = generateChunk(-2, 7);
  const second = generateChunk(-2, 7);
  assert.deepEqual(first, second);
  assert.equal(first.resources.length, 13);
  assert.equal(first.resources[0].id, 'r:-2:7:0');
});

test('resource persistence overlays deterministic chunks', () => {
  const remaining = new Map([['r:0:0:3', 0]]);
  const chunk = generateChunk(0, 0, remaining);
  assert.equal(chunk.resources[3].remaining, 0);
});

test('wall snaps to a foundation edge and validates support', () => {
  const foundation = { id: 'f1', piece: 'foundation', position: { x: 0, y: 0, z: 0 }, rotationY: 0 };
  const snapped = snapBuilding('wall', { x: 0.2, z: 2.1 }, 0, [foundation]);
  assert.equal(snapped.supportId, 'f1');
  assert.equal(snapped.z, 2);
  assert.doesNotThrow(() => validateBuild('wall', snapped, { x: 0, z: 0 }));
});

test('unsupported wall is rejected without changing building rules', () => {
  const snapped = snapBuilding('wall', { x: 10, z: 10 }, 0, []);
  assert.throws(() => validateBuild('wall', snapped, { x: 10, z: 10 }), /фундамент/);
});

test('database rows map to the legacy client event shape', () => {
  const created = '2026-08-19T00:00:00.000Z';
  const building = rowToBuilding({ id: 'b', piece: 'foundation', owner_user_id: null, owner_guest_id: 'g', owner_name: 'Guest', position: { x: 0, y: 0, z: 0 }, rotation_y: 0, support_id: null, slot: 'foundation:0:0', hp: 1000, created_at: created });
  assert.equal(building.owner, 'g');
  assert.equal(building.createdAt, Date.parse(created));
  const object = rowToSharabassObject({ id: 'o', object_type: 1, position: { x: 1, y: 2, z: 3 }, size: '2.50', owner_user_id: 'u', owner_guest_id: null, owner_name: 'User' });
  assert.equal(object.type, 1);
  assert.equal(object.size, 2.5);
});

test('resource harvesting keeps the nine metre interaction limit', () => {
  assert.doesNotThrow(() => checkResourceDistance({ position: { x: 4, z: 3 } }, { x: 0, z: 0 }));
  assert.doesNotThrow(() => checkResourceDistance({ position: { x: 9, z: 0 } }, { x: 0, z: 0 }));
  assert.throws(() => checkResourceDistance({ position: { x: 9.01, z: 0 } }, { x: 0, z: 0 }), /слишком далеко/);
});

test('persistent actions require a finite player position', () => {
  assert.deepEqual(playerPosition({ position: { x: 3, y: 0, z: -2 } }), { x: 3, y: 0, z: -2 });
  assert.throws(() => playerPosition({}), /позиция игрока/);
});
