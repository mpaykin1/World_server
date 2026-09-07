'use strict';

const fs = require('fs');
const path = require('path');
const { sendJson, methodNotAllowed, readJsonBody, withErrors, httpError } = require('./http');
const { publicWorlds } = require('./world-graph');

const indexPath = path.join(process.cwd(), 'data', 'world-graph-index.json');
const registryPath = path.join(process.cwd(), 'data', 'app-release-registry.json');

// In-memory rate limiting map: ip -> Array of timestamps
const rateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;

function checkRateLimit(req) {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const now = Date.now();
  let timestamps = rateLimits.get(ip) || [];
  timestamps = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    throw httpError(429, 'Rate limit exceeded');
  }
  timestamps.push(now);
  rateLimits.set(ip, timestamps);
}

function resetRateLimits() {
  rateLimits.clear();
}

async function handleHandshake(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    throw httpError(400, 'Invalid JSON body object');
  }
  const protocol = Number(body.protocol);
  if (!protocol || protocol !== 2) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Unsupported protocol version. TestStand v2.1 requires protocol=2.',
      protocol: 2
    });
  }
  return sendJson(res, 200, {
    ok: true,
    protocol: 2,
    capabilities: {
      world_graph: true,
      chunk_streaming: true,
      events: true,
      telemetry: true
    },
    serverVersion: '2.1.0'
  });
}

async function handleWorld(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const requestedId = requestUrl.searchParams.get('id') || requestUrl.searchParams.get('worldId') || '';

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const worlds = publicWorlds(index, registry);

  const selected = requestedId
    ? worlds.filter(w => w.id === requestedId || w.releaseAppId === requestedId)
    : worlds;

  if (requestedId && selected.length === 0) {
    return sendJson(res, 404, { ok: false, error: 'World not found' });
  }

  const sanitizedWorlds = selected.map(w => ({
    id: String(w.id || '').slice(0, 64),
    title: String(w.title || '').slice(0, 100),
    description: String(w.description || '').slice(0, 500),
    capabilities: Array.isArray(w.capabilities) ? w.capabilities.slice(0, 20).map(c => String(c).slice(0, 50)) : [],
    bounds: { min: [-100, -50, -100], max: [100, 50, 100] },
    portals: Array.isArray(w.portals) ? w.portals.map(p => ({
      id: String(p.id || '').slice(0, 64),
      targetWorldId: String(p.targetWorldId || '').slice(0, 64),
      label: String(p.label || '').slice(0, 100)
    })) : [],
    status: String(w.status || 'released').slice(0, 32)
  }));

  return sendJson(res, 200, {
    ok: true,
    protocol: 2,
    worlds: sanitizedWorlds
  });
}

async function handleChunk(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const worldId = String(requestUrl.searchParams.get('worldId') || requestUrl.searchParams.get('id') || 'default').slice(0, 64);

  const rawX = requestUrl.searchParams.get('x') || '0';
  const rawY = requestUrl.searchParams.get('y') || '0';
  const rawZ = requestUrl.searchParams.get('z') || '0';

  const parseCoord = (val) => {
    const num = Number(val);
    if (Number.isNaN(num) || !Number.isFinite(num)) {
      throw httpError(400, 'Invalid coordinate value');
    }
    return Math.max(-10, Math.min(10, Math.round(num)));
  };

  const x = parseCoord(rawX);
  const y = parseCoord(rawY);
  const z = parseCoord(rawZ);

  const voxels = [];
  for (let bx = 0; bx < 4; bx++) {
    for (let by = 0; by < 4; by++) {
      for (let bz = 0; bz < 4; bz++) {
        voxels.push((Math.abs(x + y + z + bx + by + bz) % 4) + 1);
      }
    }
  }

  return sendJson(res, 200, {
    ok: true,
    protocol: 2,
    worldId,
    chunk: {
      x,
      y,
      z,
      size: [4, 4, 4],
      voxels
    }
  });
}

async function handleEvents(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  checkRateLimit(req);
  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    throw httpError(400, 'Invalid JSON body object');
  }

  const ALLOWED_EVENT_TYPES = new Set(['player_join', 'player_leave', 'portal_use', 'touch_interaction', 'action']);
  const rawEvents = Array.isArray(body.events) ? body.events : [body];
  if (rawEvents.length === 0 || rawEvents.length > 50) {
    throw httpError(400, 'Events payload must contain between 1 and 50 events');
  }

  let processedCount = 0;
  for (const evt of rawEvents) {
    if (!evt || typeof evt !== 'object') throw httpError(400, 'Invalid event element');
    const type = String(evt.type || '').trim();
    if (!ALLOWED_EVENT_TYPES.has(type)) {
      throw httpError(400, `Unsupported event type: ${type}`);
    }
    processedCount++;
  }

  return sendJson(res, 200, {
    ok: true,
    protocol: 2,
    processed: processedCount
  });
}

async function handleTelemetry(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  checkRateLimit(req);
  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    throw httpError(400, 'Invalid JSON body object');
  }

  const metrics = body.metrics || body;
  if (!metrics || typeof metrics !== 'object') {
    throw httpError(400, 'Invalid telemetry body');
  }

  const fps = Number(metrics.fps ?? 60);
  const memoryMB = Number(metrics.memoryMB ?? 100);
  const pingMs = Number(metrics.pingMs ?? 10);

  if (Number.isNaN(fps) || Number.isNaN(memoryMB) || Number.isNaN(pingMs)) {
    throw httpError(400, 'Invalid numeric telemetry fields');
  }

  const clampedMetrics = {
    fps: Math.max(0, Math.min(240, fps)),
    memoryMB: Math.max(0, Math.min(32768, memoryMB)),
    pingMs: Math.max(0, Math.min(10000, pingMs)),
    client: String(metrics.client || 'roblox_studio').slice(0, 64)
  };

  return sendJson(res, 200, {
    ok: true,
    protocol: 2,
    received: true,
    metrics: clampedMetrics
  });
}

const router = withErrors(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let route = requestUrl.searchParams.get('__route') || '';

  if (route.startsWith('roblox_')) {
    route = route.replace('roblox_', '');
  } else if (!route && requestUrl.pathname.startsWith('/api/roblox/')) {
    route = requestUrl.pathname.replace('/api/roblox/', '');
  }

  switch (route) {
    case 'handshake':
      return handleHandshake(req, res);
    case 'world':
      return handleWorld(req, res);
    case 'chunk':
      return handleChunk(req, res);
    case 'events':
      return handleEvents(req, res);
    case 'telemetry':
      return handleTelemetry(req, res);
    default:
      return sendJson(res, 404, { ok: false, error: 'Roblox API route not found.' });
  }
});

module.exports = {
  router,
  handleHandshake: withErrors(handleHandshake),
  handleWorld: withErrors(handleWorld),
  handleChunk: withErrors(handleChunk),
  handleEvents: withErrors(handleEvents),
  handleTelemetry: withErrors(handleTelemetry),
  resetRateLimits
};
