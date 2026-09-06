'use strict';

// Local development server. Production uses Vercel static hosting and the
// request handlers in /api; all persistent state lives in Supabase.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const root = __dirname;
const apiHandlers = new Map([
  ['/api/apps', require('./api/apps')],
  ['/api/config', require('./api/config')],
  ['/api/register', require('./api/register')],
  ['/api/login', require('./api/login')],
  ['/api/me', require('./api/me')],
  ['/api/logout', require('./api/logout')],
  ['/api/game', require('./api/game')],
  ['/api/voxel', require('./api/voxel')],
  ['/api/ai3d', require('./api/ai3d')],
  ['/api/ai3d-voxel-generate', require('./api/ai3d-voxel-generate')]
]);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

// WORLD_ENTRYPOINT: lets a deployment (e.g. a Google AI Studio / Cloud Run
// app pointed at this same server.js) redirect "/" to a specific app instead
// of the default catalog, without a second parallel entrypoint system and
// without touching any existing behavior when it's unset. A single shared
// variable (not one per slot) - WORLD_SLOT, if set, is purely an identifier
// callers may use for their own logging/labeling; it does not affect this
// redirect at all. Whitelist-only: an unset or unrecognized value falls back
// to the exact previous behavior ("/apps/catalog/") rather than trusting an
// arbitrary path from the environment.
const DEFAULT_ENTRYPOINT = '/apps/catalog/';
const ENTRYPOINT_WHITELIST = new Set([DEFAULT_ENTRYPOINT, '/apps/dark-void-scene/']);
function resolveEntrypoint() {
  const requested = String(process.env.WORLD_ENTRYPOINT || '').trim();
  if (requested && ENTRYPOINT_WHITELIST.has(requested)) return requested;
  return DEFAULT_ENTRYPOINT;
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

function safeJoin(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); }
  catch { return null; }
  const clean = decoded.replace(/^\/+/, '');
  const full = path.resolve(root, clean);
  const relative = path.relative(root, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return full;
}

function sendFile(res, file) {
  fs.stat(file, (error, stats) => {
    if (error || !stats.isFile()) return notFound(res);
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stats.size,
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const handler = apiHandlers.get(url.pathname);
  if (handler) return handler(req, res);
  if (url.pathname.startsWith('/api/')) return notFound(res);
  if (url.pathname === '/') {
    res.writeHead(302, { Location: resolveEntrypoint() });
    return res.end();
  }
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  if (!url.pathname.startsWith('/apps/') && !url.pathname.startsWith('/shared/')) return notFound(res);
  let file = safeJoin(url.pathname);
  if (!file) return notFound(res);
  try {
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  } catch { return notFound(res); }
  return sendFile(res, file);
});

const port = Number(process.env.PORT) || 3000;
const host = '0.0.0.0';
server.listen(port, host, () => console.log(`World Server local development: http://${host}:${port}`));

// Opt-in autostart of the remote-task-bridge watchdog (off by default -
// unset/anything other than "1" changes nothing). Safe to wire here because
// this file is never invoked in production: Vercel serves this repo via the
// api/*.js serverless functions declared in vercel.json, not via
// `node server.js` - so this only ever runs for a long-lived local/self-
// hosted process (local dev, or a Cloud Run-style deployment using this same
// server.js), exactly where a background poller can meaningfully live.
if (process.env.REMOTE_BRIDGE_AUTOSTART === '1') {
  try {
    require('./scripts/collective-brain-remote-bridge-watchdog.js').ensureRunning('server-autostart');
  } catch (e) {
    console.error('REMOTE_BRIDGE_AUTOSTART: watchdog failed to start (non-fatal, server keeps running):', e.message);
  }
}

module.exports = { server, safeJoin, resolveEntrypoint, DEFAULT_ENTRYPOINT, ENTRYPOINT_WHITELIST };

