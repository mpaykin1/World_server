'use strict';

const CHUNK = 16;
const WORLD_ID = 'main';
const VALID_BLOCK_TYPES = new Set(Array.from({ length: 14 }, (_, i) => i));

function httpLikeError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeWorldId(value) {
  const id = String(value || WORLD_ID).trim();
  if (!/^[a-z0-9_-]{1,40}$/i.test(id)) throw httpLikeError(400, 'Некорректный мир.');
  return id;
}

function safePosition(value) {
  const p = value || {};
  const x = finite(p.x, NaN), y = finite(p.y, NaN), z = finite(p.z, NaN);
  if (![x, y, z].every(Number.isFinite)) throw httpLikeError(400, 'Некорректная позиция игрока.');
  if (Math.abs(x) > 1000000 || Math.abs(z) > 1000000 || y < -64 || y > 400) throw httpLikeError(400, 'Позиция вне границ мира.');
  return { x, y, z };
}

function safeBlockCoordinate(value, axis) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw httpLikeError(400, `Некорректная координата ${axis}.`);
  if ((axis === 'y' && (n < -64 || n > 320)) || (axis !== 'y' && Math.abs(n) > 1000000)) throw httpLikeError(400, `Координата ${axis} вне мира.`);
  return n;
}

function safeBlockType(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || !VALID_BLOCK_TYPES.has(n)) throw httpLikeError(400, 'Некорректный тип блока.');
  return n;
}

function chunkCoord(value) { return Math.floor(value / CHUNK); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }

module.exports = {
  CHUNK, WORLD_ID, VALID_BLOCK_TYPES, finite, safeWorldId, safePosition,
  safeBlockCoordinate, safeBlockType, chunkCoord, distance
};
