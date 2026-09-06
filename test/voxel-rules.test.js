'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  safeWorldId, safePosition, safeBlockCoordinate, safeBlockType, chunkCoord
} = require('../lib/voxel-rules');

test('voxel world id accepts stable slugs only', () => {
  assert.equal(safeWorldId('main'), 'main');
  assert.throws(() => safeWorldId('../main'), /Некорректный мир/);
});

test('voxel positions must be finite and inside world bounds', () => {
  assert.deepEqual(safePosition({ x: 1.25, y: 42, z: -3 }), { x: 1.25, y: 42, z: -3 });
  assert.throws(() => safePosition({ x: Infinity, y: 0, z: 0 }), /Некорректная позиция/);
  assert.throws(() => safePosition({ x: 1000001, y: 0, z: 0 }), /вне границ мира/);
});

test('voxel block coordinates keep database constraints', () => {
  assert.equal(safeBlockCoordinate(-64, 'y'), -64);
  assert.equal(safeBlockCoordinate(320, 'y'), 320);
  assert.throws(() => safeBlockCoordinate(321, 'y'), /вне мира/);
  assert.equal(chunkCoord(-1), -1);
  assert.equal(chunkCoord(-16), -1);
  assert.equal(chunkCoord(-17), -2);
});

test('unknown voxel block ids are rejected before persistence', () => {
  assert.equal(safeBlockType(0), 0);
  assert.equal(safeBlockType(13), 13);
  assert.throws(() => safeBlockType(14), /Некорректный тип блока/);
  assert.throws(() => safeBlockType(255), /Некорректный тип блока/);
  assert.throws(() => safeBlockType('not-a-block'), /Некорректный тип блока/);
});
