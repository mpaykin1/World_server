'use strict';

// Local development server. Production uses Vercel static hosting and the
// request handlers in /api; all persistent state lives in Supabase.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const root = __dirname;

// Every api/*.js file is its own Vercel Function at /api/<filename> by
// default -- register all of them generically instead of hand-picking a
// subset (that hand-picked list silently went stale and broke local dev
// entirely once api/ was consolidated into routers).
const directHandlers = new Map();
for (const entry of fs.readdirSync(path.join(root, 'api'))) {
  if (!entry.endsWith('.js')) continue;
  const name = entry.slice(0, -3);
  directHandlers.set(`/api/${name}`, require(`./api/${name}`));
}

// The consolidated routers (api/quality.js, api/auth.js, api/generative.js,
// and any future one) dispatch by `req.query.__route`, which only exists
// under Vercel's real runtime -- locally we inject it ourselves from
// vercel.json's own rewrites, so local dev matches production exactly
// instead of drifting from it. A rewrite whose destination isn't of this
// exact shape (e.g. the /apps/:app/ static rewrite) is left to the normal
// static-file path below.
const routedHandlers = new Map();
const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
for (const rewrite of vercelConfig.rewrites || []) {
  const match = /^\/api\/([\w-]+)\?__route=([\w-]+)$/.exec(rewrite.destination);
  if (!match) continue;
  const [, routerName, routeName] = match;
  routedHandlers.set(rewrite.source, { handler: directHandlers.get(`/api/${routerName}`), route: routeName });
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.ktx2': 'image/ktx2',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm'
};

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

// Vercel's real runtime augments the Node response with an Express-like
// status()/json()/send() API; several handlers (lowfi-25d-scene.js, the
// quality/procedural-quality handlers) rely on it directly instead of the
// plain writeHead/end API lib/http.js's helpers use. Without this, those
// handlers throw synchronously on the first request, which crashes this
// entire process (an uncaught exception in a raw http.createServer request
// listener is fatal), taking down every other route with it.
function vercelizeResponse(res) {
  res.status = function status(code) { res.statusCode = code; return res; };
  res.json = function json(body) {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return res;
  };
  res.send = function send(body) {
    if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) return res.json(body);
    res.end(body);
    return res;
  };
  return res;
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

async function callHandler(handler, req, res) {
  // Vercel isolates every function invocation in its own process -- one
  // handler throwing must not take the whole local dev server down with it.
  try {
    await handler(req, res);
  } catch (error) {
    console.error('API handler error:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'internal-error' }));
    } else {
      res.end();
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  vercelizeResponse(res);
  const routed = routedHandlers.get(url.pathname);
  if (routed && routed.handler) {
    req.query = Object.assign({}, req.query, { __route: routed.route });
    return callHandler(routed.handler, req, res);
  }
  const direct = directHandlers.get(url.pathname);
  if (direct) return callHandler(direct, req, res);
  if (url.pathname.startsWith('/api/')) return notFound(res);
  if (url.pathname === '/') {
    res.writeHead(302, { Location: '/apps/catalog/' });
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
server.listen(port, () => console.log(`World Server local development: http://localhost:${port}`));

module.exports = { server, safeJoin };

