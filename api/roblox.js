'use strict';

const { URL } = require('url');
const { sendJson, methodNotAllowed, readJsonBody, withErrors, httpError } = require('../lib/http');
const {
  buildHandshake,
  buildWorldSpec,
  buildChunkSpec,
  buildDelta,
  handleAuthoritativeAction,
  validateBatch,
  validateTelemetry,
  buildNpcReply,
  normalizeWorldId
} = require('../lib/roblox-bridge');

const GET_ROUTES = new Set(['world', 'chunk', 'delta']);
const POST_ROUTES = new Set(['handshake', 'action', 'events', 'telemetry', 'replay', 'npc']);

function routeName(req) {
  const url = new URL(req.url || '/api/roblox', 'http://localhost');
  const explicit = String(url.searchParams.get('__route') || '').trim().toLowerCase();
  if (explicit) return explicit;
  const match = url.pathname.match(/^\/api\/roblox\/([a-z0-9_-]+)\/?$/i);
  return match ? match[1].toLowerCase() : '';
}

function queryObject(req) {
  const url = new URL(req.url || '/api/roblox', 'http://localhost');
  return Object.fromEntries(url.searchParams.entries());
}

function requireMethod(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  methodNotAllowed(res, allowed);
  return false;
}

module.exports = withErrors(async (req, res) => {
  const route = routeName(req);
  if (!route || (!GET_ROUTES.has(route) && !POST_ROUTES.has(route))) {
    throw httpError(404, 'Roblox bridge route not found.');
  }

  if (route === 'world') {
    if (!requireMethod(req, res, ['GET'])) return;
    const query = queryObject(req);
    return sendJson(res, 200, buildWorldSpec(query.world));
  }

  if (route === 'chunk') {
    if (!requireMethod(req, res, ['GET'])) return;
    const query = queryObject(req);
    return sendJson(res, 200, buildChunkSpec(query.world, query.cx, query.cz));
  }

  if (route === 'delta') {
    if (!requireMethod(req, res, ['GET'])) return;
    return sendJson(res, 200, buildDelta(queryObject(req)));
  }

  if (!requireMethod(req, res, ['POST'])) return;
  const body = await readJsonBody(req);

  if (route === 'handshake') {
    return sendJson(res, 200, buildHandshake(body));
  }

  if (route === 'action') {
    const result = handleAuthoritativeAction(body);
    return sendJson(res, result.accepted === false ? 409 : 200, result);
  }

  if (route === 'events' || route === 'replay') {
    const result = validateBatch(route, body);
    if (!result.ok) throw httpError(400, result.reason);
    return sendJson(res, 202, {
      accepted: true,
      kind: route,
      count: result.count,
      worldId: normalizeWorldId(body.worldId),
      durable: false
    });
  }

  if (route === 'telemetry') {
    const result = validateTelemetry(body);
    if (!result.ok) throw httpError(400, result.reason);
    return sendJson(res, 202, {
      accepted: true,
      worldId: normalizeWorldId(body.worldId),
      durable: false
    });
  }

  if (route === 'npc') {
    const result = buildNpcReply(body);
    return sendJson(res, result.accepted === false ? 404 : 200, result);
  }
});

module.exports._private = { routeName, queryObject, GET_ROUTES, POST_ROUTES };
