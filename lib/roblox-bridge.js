'use strict';

const { generateChunk } = require('./game-rules');

const PROTOCOL_VERSION = 3;
const BRIDGE_VERSION = '3.0.0';
const DEFAULT_WORLD_ID = 'starter';
const MAX_CHUNK_COORD = 10000;
const MAX_BATCH_ITEMS = Object.freeze({ events: 20, replay: 40 });
const MAX_TEXT = 1000;

const CAPABILITIES = Object.freeze({
  chunks: true,
  delta: true,
  authoritativeActions: true,
  events: true,
  replay: true,
  npc: true,
  telemetry: true,
  terrain: true,
  lod: true,
  universalIds: true,
  predictivePrefetch: true
});

const RESOURCE_STYLE = Object.freeze({
  tree: { asset: 'tree', size: [3, 9, 3], y: 4.5, material: 'Wood', color: [92, 124, 77] },
  stone: { asset: 'stone', size: [5, 3, 5], y: 1.5, material: 'Slate', color: [105, 109, 116] },
  metal_ore: { asset: 'metal_ore', size: [4, 3, 4], y: 1.5, material: 'Metal', color: [111, 121, 137] },
  bush: { asset: 'bush', size: [4, 2.5, 4], y: 1.25, material: 'Grass', color: [72, 122, 70] }
});

const GUIDE = Object.freeze({ id: 'guide', position: { x: 10, y: 2, z: 0 } });
const PORTAL = Object.freeze({ id: 'p1', position: { x: 0, y: 6, z: -20 }, targetWorld: 'starter' });

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampInteger(value, min, max, fallback = 0) {
  const n = Math.trunc(finite(value, fallback));
  return Math.max(min, Math.min(max, n));
}

function boundedText(value, max = MAX_TEXT) {
  return String(value ?? '').slice(0, max);
}

function normalizeWorldId(value) {
  const raw = String(value || DEFAULT_WORLD_ID).trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(raw) ? raw : DEFAULT_WORLD_ID;
}

function universalId(worldId, kind, id) {
  const world = normalizeWorldId(worldId);
  const cleanKind = String(kind || 'object').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'object';
  const cleanId = String(id || 'unknown').replace(/[^a-zA-Z0-9_:.-]/g, '').slice(0, 120) || 'unknown';
  return `world://${world}/${cleanKind}/${cleanId}`;
}

function validCloudRunUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) return null;
    const host = url.hostname.toLowerCase();
    if (!host.endsWith('.run.app')) return null;
    return `https://${host}`;
  } catch {
    return null;
  }
}

function buildHandshake(body = {}, env = process.env) {
  const result = {
    protocol: PROTOCOL_VERSION,
    bridgeVersion: BRIDGE_VERSION,
    worldId: normalizeWorldId(body.worldId),
    capabilities: { ...CAPABILITIES },
    serverTime: Date.now()
  };
  const cloudRunUrl = validCloudRunUrl(env.CLOUD_RUN_PUBLIC_URL);
  if (cloudRunUrl) result.cloudRunUrl = cloudRunUrl;
  return result;
}

function resourceToObject(worldId, resource) {
  const style = RESOURCE_STYLE[resource.type] || RESOURCE_STYLE.stone;
  return {
    id: resource.id,
    universalId: universalId(worldId, 'resource', resource.id),
    kind: 'resource',
    asset: style.asset,
    name: resource.type,
    position: [finite(resource.position?.x), style.y, finite(resource.position?.z)],
    size: style.size,
    color: style.color,
    material: style.material,
    interactive: Number(resource.remaining) > 0,
    action: 'interact',
    actionText: Number(resource.remaining) > 0 ? 'Gather' : 'Empty',
    remaining: Math.max(0, finite(resource.remaining, resource.amount)),
    lod: {
      near: {},
      mid: { size: style.size.map((v) => Math.max(0.5, v * 0.9)) },
      far: { size: style.size.map((v) => Math.max(0.5, v * 0.7)), material: 'SmoothPlastic' }
    }
  };
}

function buildChunkSpec(worldId, cx, cz) {
  const world = normalizeWorldId(worldId);
  const x = clampInteger(cx, -MAX_CHUNK_COORD, MAX_CHUNK_COORD);
  const z = clampInteger(cz, -MAX_CHUNK_COORD, MAX_CHUNK_COORD);
  const chunk = generateChunk(x, z);
  return {
    worldId: world,
    cx: x,
    cz: z,
    revision: 'worldspec-v3',
    objects: chunk.resources.map((resource) => resourceToObject(world, resource))
  };
}

function buildWorldSpec(worldId) {
  const world = normalizeWorldId(worldId);
  return {
    worldId: world,
    revision: 'worldspec-v3',
    cursor: '0',
    name: 'IMPROVE WORLD — Starter World',
    story: {
      summary: 'Один и тот же World Server может отображаться в Web, Roblox и Godot.'
    },
    environment: {
      clockTime: 19.5,
      brightness: 2,
      fogStart: 40,
      fogEnd: 650,
      atmosphereDensity: 0.22,
      haze: 1.2,
      ambient: [95, 102, 120]
    },
    ground: {
      id: 'ground',
      kind: 'ground',
      name: 'Ground',
      position: [0, -0.5, 0],
      size: [288, 1, 288],
      color: [54, 64, 72],
      material: 'Slate'
    },
    objects: [],
    npcs: [{
      id: GUIDE.id,
      universalId: universalId(world, 'npc', GUIDE.id),
      name: 'World Guide',
      position: [GUIDE.position.x, GUIDE.position.y, GUIDE.position.z],
      color: [85, 115, 155],
      actionText: 'Talk'
    }],
    portals: [{
      id: PORTAL.id,
      universalId: universalId(world, 'portal', PORTAL.id),
      name: 'World Portal',
      position: [PORTAL.position.x, PORTAL.position.y, PORTAL.position.z],
      targetWorld: PORTAL.targetWorld,
      actionText: 'Enter'
    }]
  };
}

function buildDelta(query = {}) {
  return {
    worldId: normalizeWorldId(query.world),
    revision: boundedText(query.revision || 'worldspec-v3', 120),
    cursor: boundedText(query.cursor || '0', 120),
    operations: []
  };
}

function parseResourceId(value) {
  const match = String(value || '').match(/^r:(-?\d+):(-?\d+):(\d+)$/);
  if (!match) return null;
  const cx = Number(match[1]);
  const cz = Number(match[2]);
  const index = Number(match[3]);
  if (!Number.isInteger(cx) || !Number.isInteger(cz) || !Number.isInteger(index)) return null;
  if (Math.abs(cx) > MAX_CHUNK_COORD || Math.abs(cz) > MAX_CHUNK_COORD || index < 0 || index >= 13) return null;
  const resource = generateChunk(cx, cz).resources[index];
  return resource?.id === value ? resource : null;
}

function positionFromPayload(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x), y = Number(value.y), z = Number(value.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  if (Math.abs(x) > 50000 || Math.abs(y) > 50000 || Math.abs(z) > 50000) return null;
  return { x, y, z };
}

function distance3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function targetForAction(action, objectId) {
  if (action === 'talk' && objectId === GUIDE.id) return GUIDE.position;
  if (action === 'enter_portal' && objectId === PORTAL.id) return PORTAL.position;
  const resource = parseResourceId(objectId);
  if (resource) return { x: resource.position.x, y: 0, z: resource.position.z };
  return null;
}

function handleAuthoritativeAction(body = {}) {
  const worldId = normalizeWorldId(body.worldId);
  const action = boundedText(body.action, 60);
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const allowed = new Set(['interact', 'use', 'emote', 'request_story', 'ready', 'talk', 'enter_portal']);
  if (!allowed.has(action)) return { accepted: false, reason: 'action_not_allowed' };

  if (action === 'request_story') {
    return { accepted: true, story: buildWorldSpec(worldId).story };
  }
  if (action === 'ready' || action === 'emote') {
    return { accepted: true };
  }

  const objectId = boundedText(payload.objectId, 120);
  const target = targetForAction(action, objectId);
  if (target) {
    const playerPosition = positionFromPayload(payload.playerPosition);
    if (!playerPosition) return { accepted: false, reason: 'missing_player_position' };
    if (distance3(playerPosition, target) > 16) return { accepted: false, reason: 'too_far' };
  }

  if (action === 'talk') {
    if (objectId !== GUIDE.id) return { accepted: false, reason: 'unknown_npc' };
    return {
      accepted: true,
      npcId: GUIDE.id,
      npcReply: 'Я проводник World Server. Этот персонаж уже использует общий серверный канал; позже к нему можно подключить общий AI-мозг и память.'
    };
  }

  if (action === 'enter_portal') {
    if (objectId !== PORTAL.id) return { accepted: false, reason: 'unknown_portal' };
    return { accepted: true, targetWorld: PORTAL.targetWorld };
  }

  const resource = parseResourceId(objectId);
  if (resource) {
    return {
      accepted: true,
      objectId: resource.id,
      resourceType: resource.type,
      remaining: resource.remaining
    };
  }

  return { accepted: true };
}

function validateBatch(kind, body = {}) {
  const items = Array.isArray(body.events) ? body.events : null;
  const limit = MAX_BATCH_ITEMS[kind];
  if (!items || !Number.isInteger(limit)) return { ok: false, reason: 'invalid_batch' };
  if (items.length > limit) return { ok: false, reason: 'batch_too_large', limit };
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, reason: 'invalid_item' };
  }
  return { ok: true, count: items.length };
}

function validateTelemetry(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reason: 'invalid_telemetry' };
  const metrics = body.metrics;
  if (metrics != null && (typeof metrics !== 'object' || Array.isArray(metrics))) return { ok: false, reason: 'invalid_metrics' };
  return { ok: true };
}

function buildNpcReply(body = {}) {
  const npcId = boundedText(body.npcId || body.payload?.npcId, 120);
  const text = boundedText(body.text || body.payload?.text, 500);
  if (npcId && npcId !== GUIDE.id) return { accepted: false, reason: 'unknown_npc' };
  return {
    accepted: true,
    npcId: GUIDE.id,
    npcReply: text
      ? `Я слышу тебя через World Server: ${boundedText(text, 300)}`
      : 'Я проводник общего мира. Спроси меня о мире.'
  };
}

module.exports = {
  PROTOCOL_VERSION,
  BRIDGE_VERSION,
  DEFAULT_WORLD_ID,
  CAPABILITIES,
  MAX_BATCH_ITEMS,
  normalizeWorldId,
  universalId,
  validCloudRunUrl,
  buildHandshake,
  buildWorldSpec,
  buildChunkSpec,
  buildDelta,
  parseResourceId,
  positionFromPayload,
  handleAuthoritativeAction,
  validateBatch,
  validateTelemetry,
  buildNpcReply,
  resourceToObject
};
