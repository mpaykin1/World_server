'use strict';

const crypto = require('crypto');

const CHUNK_SIZE = 64;
const BUILD_GRID = 4;
const BUILD_COSTS = {
  foundation: { wood: 50 }, wall: { wood: 30 }, doorway: { wood: 35 }, door: { wood: 25 },
  stairs: { wood: 45 }, campfire: { wood: 20, stone: 5 }, storage_box: { wood: 40 }
};

function defaultInventory() {
  const inv = Array.from({ length: 36 }, () => null);
  inv[0] = { item: 'wood', count: 999 };
  inv[1] = { item: 'stone', count: 500 };
  inv[2] = { item: 'metal_ore', count: 120 };
  inv[3] = { item: 'food', count: 16 };
  inv[27] = { item: 'stone_hatchet', count: 1 };
  inv[28] = { item: 'pickaxe', count: 1 };
  inv[29] = { item: 'wood', count: 250 };
  return inv;
}

function seeded(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateChunk(cx, cz, remainingById = new Map()) {
  cx = Math.trunc(Number(cx));
  cz = Math.trunc(Number(cz));
  const rand = seeded(`survival:${cx}:${cz}`);
  const resources = [];
  const types = ['tree', 'stone', 'metal_ore', 'bush'];
  for (let i = 0; i < 13; i++) {
    const type = types[Math.floor(rand() * types.length)];
    const x = cx * CHUNK_SIZE + rand() * CHUNK_SIZE - CHUNK_SIZE / 2;
    const z = cz * CHUNK_SIZE + rand() * CHUNK_SIZE - CHUNK_SIZE / 2;
    const id = `r:${cx}:${cz}:${i}`;
    const amount = type === 'tree' ? 70 : type === 'metal_ore' ? 90 : type === 'stone' ? 80 : 40;
    resources.push({ id, type, position: { x, y: 0, z }, amount, remaining: remainingById.has(id) ? remainingById.get(id) : amount });
  }
  return { cx, cz, resources };
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function snap(n, grid = BUILD_GRID) { return Math.round(finite(n) / grid) * grid; }
function dist2(a, b) { const dx = a.x - b.x; const dz = a.z - b.z; return dx * dx + dz * dz; }

function foundationEdges(building) {
  const x = building.position.x;
  const z = building.position.z;
  return [
    { x, z: z - 2, y: 0, rotY: 0, supportId: building.id, slot: `edge:${building.id}:n` },
    { x, z: z + 2, y: 0, rotY: 0, supportId: building.id, slot: `edge:${building.id}:s` },
    { x: x - 2, z, y: 0, rotY: Math.PI / 2, supportId: building.id, slot: `edge:${building.id}:w` },
    { x: x + 2, z, y: 0, rotY: Math.PI / 2, supportId: building.id, slot: `edge:${building.id}:e` }
  ];
}

function nearest(buildings, piece, pos, maxDistance, candidates) {
  let best = null;
  let bestDistance = Infinity;
  for (const building of buildings) {
    if (building.piece !== piece) continue;
    for (const candidate of candidates(building)) {
      const distance = dist2(candidate, pos);
      if (distance < bestDistance) { bestDistance = distance; best = candidate; }
    }
  }
  return best && bestDistance <= maxDistance * maxDistance ? best : null;
}

function snapBuilding(piece, pos, rotationY, buildings) {
  if (piece === 'foundation') {
    const x = snap(pos.x), z = snap(pos.z);
    return { x, y: 0, z, rotY: 0, supportId: null, slot: `foundation:${x}:${z}` };
  }
  if (piece === 'wall' || piece === 'doorway') {
    const edge = nearest(buildings, 'foundation', pos, 3.2, foundationEdges);
    if (edge) return edge;
    const gx = snap(pos.x), gz = snap(pos.z);
    const lx = finite(pos.x) - gx, lz = finite(pos.z) - gz;
    return Math.abs(lx) > Math.abs(lz)
      ? { x: gx + Math.sign(lx || 1) * 2, y: 0, z: gz, rotY: Math.PI / 2, supportId: null, slot: `freewall:${gx}:${gz}:x` }
      : { x: gx, y: 0, z: gz + Math.sign(lz || 1) * 2, rotY: 0, supportId: null, slot: `freewall:${gx}:${gz}:z` };
  }
  if (piece === 'door') {
    const doorway = nearest(buildings, 'doorway', pos, 1.6, b => [{ x: b.position.x, y: 0, z: b.position.z, rotY: b.rotationY || 0, supportId: b.id, slot: `door:${b.id}` }]);
    if (doorway) return doorway;
  }
  if (piece === 'stairs') {
    const foundation = nearest(buildings, 'foundation', pos, 3.2, b => [{ x: b.position.x, y: 0, z: b.position.z, rotY: finite(rotationY), supportId: b.id, slot: `stairs:${b.id}` }]);
    if (foundation) return foundation;
  }
  const x = snap(pos.x), z = snap(pos.z);
  return { x, y: 0, z, rotY: finite(rotationY), supportId: null, slot: `${piece}:${x}:${z}` };
}

function validateBuild(piece, snapped, playerPosition) {
  if (!BUILD_COSTS[piece]) throw new Error('Нет такого строительного элемента.');
  if (Math.abs(snapped.x) > 10000 || Math.abs(snapped.z) > 10000) throw new Error('Координаты вне игрового мира.');
  if (playerPosition && dist2(playerPosition, snapped) > 14 * 14) throw new Error('Слишком далеко для строительства.');
  if ((piece === 'wall' || piece === 'doorway') && !snapped.supportId) throw new Error('Сначала поставь фундамент, потом крепи стену к краю.');
  if (piece === 'door' && !snapped.supportId) throw new Error('Дверь ставится в doorway-проём.');
}

function rowToBuilding(row) {
  return {
    id: row.id,
    piece: row.piece,
    owner: row.owner_user_id || row.owner_guest_id,
    ownerName: row.owner_name,
    position: row.position,
    rotationY: Number(row.rotation_y) || 0,
    supportId: row.support_id,
    slot: row.slot,
    hp: row.hp,
    createdAt: new Date(row.created_at).getTime()
  };
}

function rowToSharabassObject(row) {
  return {
    id: row.id,
    type: row.object_type,
    position: row.position,
    size: Number(row.size),
    owner: row.owner_user_id || row.owner_guest_id,
    ownerName: row.owner_name
  };
}

function rowToChatMessage(row) {
  return {
    id: row.id,
    ts: new Date(row.created_at).getTime(),
    app: row.app,
    name: row.author_name,
    account: Boolean(row.user_id),
    text: row.message
  };
}

function newId() { return crypto.randomUUID(); }

module.exports = {
  BUILD_COSTS, defaultInventory, generateChunk, snapBuilding, validateBuild,
  rowToBuilding, rowToSharabassObject, rowToChatMessage, finite, newId
};
