'use strict';

const fs = require('fs');
const path = require('path');
const { sendJson, methodNotAllowed, readJsonBody, withErrors, httpError } = require('./http');
const { publicWorlds } = require('./world-graph');

const indexPath = path.join(process.cwd(), 'data', 'world-graph-index.json');
const registryPath = path.join(process.cwd(), 'data', 'app-release-registry.json');
const PROTOCOL = 3;
const SERVER_VERSION = '3.0.0';
const MAX_BODY_REPLAY_BYTES = 64 * 1024;
const MAX_REPLAY_EVENTS = 40;
const MAX_DELTA_OPS = 300;

const rateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;

function checkRateLimit(req) {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const now = Date.now();
  let timestamps = rateLimits.get(ip) || [];
  timestamps = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) throw httpError(429, 'Rate limit exceeded');
  timestamps.push(now);
  rateLimits.set(ip, timestamps);
}

function resetRateLimits() { rateLimits.clear(); }

function clampFinite(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function safeString(value, max = 128) {
  return String(value == null ? '' : value).slice(0, max);
}

function isAllowedCloudRunUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLowerCase().endsWith('.run.app');
  } catch {
    return false;
  }
}

function configuredCloudRunUrl() {
  const candidate = String(process.env.WORLD_SERVER_CLOUD_RUN_URL || '').trim();
  return isAllowedCloudRunUrl(candidate) ? candidate.replace(/\/$/, '') : null;
}

function readPublicWorlds() {
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  return publicWorlds(index, registry);
}

async function handleHandshake(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') throw httpError(400, 'Invalid JSON body object');
  if (Number(body.protocol) !== PROTOCOL) {
    return sendJson(res, 400, { ok: false, error: 'Unsupported protocol version. TestStand v3 requires protocol=3.', protocol: PROTOCOL });
  }
  const response = {
    ok: true,
    protocol: PROTOCOL,
    bridgeVersion: SERVER_VERSION,
    serverVersion: SERVER_VERSION,
    capabilities: {
      chunks: true,
      delta: true,
      authoritativeActions: true,
      events: true,
      replay: true,
      npc: true,
      telemetry: true
    }
  };
  const cloudRunUrl = configuredCloudRunUrl();
  if (cloudRunUrl) response.cloudRunUrl = cloudRunUrl;
  return sendJson(res, 200, response);
}

async function handleWorld(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const requestedId = requestUrl.searchParams.get('id') || requestUrl.searchParams.get('worldId') || '';
  const worlds = readPublicWorlds();
  const selected = requestedId ? worlds.filter(w => w.id === requestedId || w.releaseAppId === requestedId) : worlds;
  if (requestedId && selected.length === 0) return sendJson(res, 404, { ok: false, error: 'World not found' });

  const sanitizedWorlds = selected.map(w => ({
    id: safeString(w.id, 64),
    title: safeString(w.title, 100),
    description: safeString(w.description, 500),
    revision: safeString(w.latestRevisionId || 'unknown', 80),
    cursor: `world:${safeString(w.id, 64)}:${safeString(w.latestRevisionId || '0', 80)}`,
    capabilities: Array.isArray(w.capabilities) ? w.capabilities.slice(0, 20).map(c => safeString(c, 50)) : [],
    bounds: { min: [-100, -50, -100], max: [100, 50, 100] },
    portals: Array.isArray(w.portals) ? w.portals.slice(0, 50).map(p => ({ id: safeString(p.id, 64), targetWorldId: safeString(p.targetWorldId, 64), label: safeString(p.label, 100) })) : [],
    status: safeString(w.status || 'released', 32)
  }));
  return sendJson(res, 200, { ok: true, protocol: PROTOCOL, worlds: sanitizedWorlds });
}

function parseChunkCoord(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw httpError(400, 'Invalid coordinate value');
  return Math.max(-10, Math.min(10, Math.round(number)));
}

async function handleChunk(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const worldId = safeString(requestUrl.searchParams.get('worldId') || requestUrl.searchParams.get('id') || 'default', 64);
  const x = parseChunkCoord(requestUrl.searchParams.get('x') || '0');
  const y = parseChunkCoord(requestUrl.searchParams.get('y') || '0');
  const z = parseChunkCoord(requestUrl.searchParams.get('z') || '0');
  const voxels = [];
  for (let bx = 0; bx < 4; bx++) for (let by = 0; by < 4; by++) for (let bz = 0; bz < 4; bz++) voxels.push((Math.abs(x + y + z + bx + by + bz) % 4) + 1);
  return sendJson(res, 200, { ok: true, protocol: PROTOCOL, worldId, chunk: { x, y, z, size: [4, 4, 4], voxels } });
}

async function handleDelta(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const worldId = safeString(requestUrl.searchParams.get('worldId') || requestUrl.searchParams.get('id') || 'default', 64);
  const cursor = safeString(requestUrl.searchParams.get('cursor') || '0', 160);
  const requestedLimit = clampFinite(requestUrl.searchParams.get('limit'), 100, 1, MAX_DELTA_OPS);
  const world = readPublicWorlds().find(w => w.id === worldId || w.releaseAppId === worldId);
  if (!world && worldId !== 'default') return sendJson(res, 404, { ok: false, error: 'World not found' });
  const revision = safeString(world?.latestRevisionId || '0', 80);
  return sendJson(res, 200, {
    ok: true,
    protocol: PROTOCOL,
    worldId,
    revision,
    cursor: `world:${worldId}:${revision}`,
    previousCursor: cursor,
    limit: Math.floor(requestedLimit),
    operations: []
  });
}

async function handleEvents(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  checkRateLimit(req);
  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') throw httpError(400, 'Invalid JSON body object');
  const allowed = new Set(['player_join', 'player_leave', 'portal_use', 'touch_interaction', 'action', 'npc_reply']);
  const events = Array.isArray(body.events) ? body.events : [body];
  if (events.length === 0 || events.length > 50) throw httpError(400, 'Events payload must contain between 1 and 50 events');
  for (const event of events) {
    if (!event || typeof event !== 'object') throw httpError(400, 'Invalid event element');
    const type = safeString(event.type, 48).trim();
    if (!allowed.has(type)) throw httpError(400, `Unsupported event type: ${type}`);
  }
  return sendJson(res, 200, { ok: true, protocol: PROTOCOL, processed: events.length });
}

async function handleAction(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  checkRateLimit(req);
  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') throw httpError(400, 'Invalid JSON body object');
  const type = safeString(body.type || body.action, 48).trim();
  const allowed = new Set(['interact', 'portal', 'move', 'use', 'talk', 'jump']);
  if (!allowed.has(type)) return sendJson(res, 400, { ok: false, accepted: false, reason: 'unsupported_action' });
  const position = body.playerPosition || body.position || {};
  const boundedPosition = {
    x: clampFinite(position.x, 0, -50000, 50000),
    y: clampFinite(position.y, 0, -50000, 50000),
    z: clampFinite(position.z, 0, -50000, 50000)
  };
  return sendJson(res, 200, {
    ok: true,
    protocol: PROTOCOL,
    accepted: true,
    action: type,
    worldId: safeString(body.worldId || 'default', 64),
    targetId: safeString(body.targetId || '', 120),
    playerPosition: boundedPosition
  });
}

async function handleReplay(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  checkRateLimit(req);
  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') throw httpError(400, 'Invalid JSON body object');
  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length === 0 || events.length > MAX_REPLAY_EVENTS) throw httpError(400, `Replay payload must contain between 1 and ${MAX_REPLAY_EVENTS} events`);
  const encoded = Buffer.byteLength(JSON.stringify(body), 'utf8');
  if (encoded > MAX_BODY_REPLAY_BYTES) throw httpError(413, 'Replay payload too large');
  for (const event of events) if (!event || typeof event !== 'object') throw httpError(400, 'Invalid replay event');
  return sendJson(res, 200, { ok: true, protocol: PROTOCOL, accepted: events.length, nextSequence: Math.max(0, Math.floor(clampFinite(body.sequence, 0, 0, Number.MAX_SAFE_INTEGER))) + events.length });
}

async function handleNpc(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  checkRateLimit(req);
  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') throw httpError(400, 'Invalid JSON body object');
  const npcId = safeString(body.npcId || body.id, 120).trim();
  const message = safeString(body.message || body.prompt, 800).trim();
  if (!npcId || !message) throw httpError(400, 'npcId and message are required');
  return sendJson(res, 200, {
    ok: true,
    protocol: PROTOCOL,
    npcId,
    npcReply: safeString(`Acknowledged: ${message}`, 900),
    source: 'deterministic-fallback'
  });
}

async function handleTelemetry(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  checkRateLimit(req);
  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') throw httpError(400, 'Invalid JSON body object');
  const metrics = body.metrics || body;
  if (!metrics || typeof metrics !== 'object') throw httpError(400, 'Invalid telemetry body');
  const fps = Number(metrics.fps ?? 60);
  const memoryMB = Number(metrics.memoryMB ?? 100);
  const pingMs = Number(metrics.pingMs ?? 10);
  if (!Number.isFinite(fps) || !Number.isFinite(memoryMB) || !Number.isFinite(pingMs)) throw httpError(400, 'Invalid numeric telemetry fields');
  return sendJson(res, 200, {
    ok: true,
    protocol: PROTOCOL,
    received: true,
    metrics: {
      fps: Math.max(0, Math.min(240, fps)),
      memoryMB: Math.max(0, Math.min(32768, memoryMB)),
      pingMs: Math.max(0, Math.min(10000, pingMs)),
      client: safeString(metrics.client || 'roblox_studio', 64)
    }
  });
}

const router = withErrors(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let route = requestUrl.searchParams.get('__route') || '';
  if (route.startsWith('roblox_')) route = route.replace('roblox_', '');
  else if (!route && requestUrl.pathname.startsWith('/api/roblox/')) route = requestUrl.pathname.replace('/api/roblox/', '');
  switch (route) {
    case 'handshake': return handleHandshake(req, res);
    case 'world': return handleWorld(req, res);
    case 'chunk': return handleChunk(req, res);
    case 'delta': return handleDelta(req, res);
    case 'action': return handleAction(req, res);
    case 'events': return handleEvents(req, res);
    case 'telemetry': return handleTelemetry(req, res);
    case 'replay': return handleReplay(req, res);
    case 'npc': return handleNpc(req, res);
    default: return sendJson(res, 404, { ok: false, error: 'Roblox API route not found.' });
  }
});

module.exports = {
  router,
  handleHandshake: withErrors(handleHandshake),
  handleWorld: withErrors(handleWorld),
  handleChunk: withErrors(handleChunk),
  handleDelta: withErrors(handleDelta),
  handleAction: withErrors(handleAction),
  handleEvents: withErrors(handleEvents),
  handleTelemetry: withErrors(handleTelemetry),
  handleReplay: withErrors(handleReplay),
  handleNpc: withErrors(handleNpc),
  isAllowedCloudRunUrl,
  resetRateLimits
};
