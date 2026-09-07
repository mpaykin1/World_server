'use strict';

// Local/self-hosted server. Vercel production uses static hosting and the
// request handlers in /api; Cloud Run can use this same entrypoint.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const robloxHandler = require('./api/roblox');

const root = __dirname;
const apiHandlers = new Map([
  ['/api/apps', require('./api/apps')],
  ['/api/worlds', require('./api/worlds')],
  ['/api/config', require('./api/config')],
  ['/api/register', require('./lib/api-handlers/register')],
  ['/api/login', require('./lib/api-handlers/login')],
  ['/api/me', require('./lib/api-handlers/me')],
  ['/api/logout', require('./lib/api-handlers/logout')],
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

// WORLD_ENTRYPOINT lets a long-lived deployment (including Cloud Run) redirect
// "/" to a specific approved app without creating a second entrypoint system.
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

function health(res, ready = true) {
  const body = JSON.stringify({
    ok: true,
    ready,
    service: 'world-server',
    runtime: process.env.K_SERVICE ? 'cloud-run' : 'node',
    revision: process.env.K_REVISION || null
  });
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
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

  if (url.pathname === '/healthz') return health(res, true);
  if (url.pathname === '/readyz') return health(res, true);

  // Local/Cloud Run supports native subpaths. Vercel rewrites the same public
  // paths into the single api/roblox.js function via __route.
  if (url.pathname === '/api/roblox' || url.pathname.startsWith('/api/roblox/')) {
    return robloxHandler(req, res);
  }

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
server.listen(port, host, () => console.log(`World Server listening on http://${host}:${port}`));

// Opt-in autostart of the remote-task-bridge watchdog. It remains disabled by
// default, and is appropriate only for long-lived self-hosted runtimes.
if (process.env.REMOTE_BRIDGE_AUTOSTART === '1') {
  try {
    require('./scripts/collective-brain-remote-bridge-watchdog.js').ensureRunning('server-autostart');
  } catch (e) {
    console.error('REMOTE_BRIDGE_AUTOSTART: watchdog failed to start (non-fatal, server keeps running):', e.message);
  }
}

module.exports = {
  server,
  safeJoin,
  resolveEntrypoint,
  DEFAULT_ENTRYPOINT,
  ENTRYPOINT_WHITELIST
};
