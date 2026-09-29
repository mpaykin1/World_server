'use strict';

const { readJsonBody, sendJson, methodNotAllowed, withErrors, httpError } = require('../lib/http');
const { explainForecast } = require('../lib/micropolis-forecast-narrative');

const DEFAULT_ORIGINS = new Set([
  'https://mpaykin1.github.io',
  'https://world-server.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

function allowedOrigins(env = process.env) {
  const configured = String(env.CHAIN_AI_ALLOWED_ORIGINS || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  return configured.length ? new Set(configured) : DEFAULT_ORIGINS;
}

function applyCors(req, res, env = process.env) {
  const origin = String(req.headers?.origin || '');
  if (origin && allowedOrigins(env).has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = withErrors(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST', 'OPTIONS']);
  const origin = String(req.headers?.origin || '');
  if (origin && !allowedOrigins().has(origin)) throw httpError(403, 'Origin not allowed.');
  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Invalid body');
  const result = await explainForecast(body.forecast);
  sendJson(res, 200, { explanation: result.explanation, provider: result.provider });
});

module.exports._private = { allowedOrigins, applyCors };