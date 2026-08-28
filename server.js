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
  ['/api/auth', require('./api/auth')],
  ['/api/game', require('./api/game')],
  ['/api/generative', require('./api/generative')],
  ['/api/quality', require('./api/quality')],
  ['/api/pwa-manifest', require('./api/pwa-manifest')],
]);
const rewrites = new Map([
  ['/api/register', '/api/auth?__route=register'],
  ['/api/login', '/api/auth?__route=login'],
  ['/api/me', '/api/auth?__route=me'],
  ['/api/logout', '/api/auth?__route=logout'],
  ['/api/ai3d', '/api/generative?__route=ai3d'],
  ['/api/ai3d-voxel-generate', '/api/generative?__route=ai3d-voxel-generate'],
  ['/api/apng', '/api/generative?__route=apng'],
  ['/api/lowfi-25d-scene', '/api/generative?__route=lowfi-25d-scene'],
  ['/api/voxel', '/api/generative?__route=voxel'],
  ['/api/quality-summary', '/api/quality?__route=quality-summary'],
  ['/api/quality-profile', '/api/quality?__route=quality-profile'],
]);
function resolveHandler(pathname, url) {
  if (apiHandlers.has(pathname)) return { handler: apiHandlers.get(pathname), url };
  if (rewrites.has(pathname)) {
    const dest = rewrites.get(pathname);
    const [p, q] = dest.split('?');
    const u = new URL(q ? `${p}?${q}` : p, 'http://localhost');
    // Merge original query
    for (const [k, v] of url.searchParams) u.searchParams.set(k, v);
    return { handler: apiHandlers.get(p), url: u };
  }
  // Generic quality rewrites: /api/quality-* -> /api/quality
  if (pathname.startsWith('/api/quality-') || pathname.startsWith('/api/procedural-quality-')) {
    const route = pathname.slice(5);
    const u = new URL(`/api/quality?__route=${route}`, 'http://localhost');
    for (const [k, v] of url.searchParams) u.searchParams.set(k, v);
    return { handler: apiHandlers.get('/api/quality'), url: u };
  }
  if (pathname.startsWith('/api/procedural-quality-')) {
    const route = pathname.slice(5);
    const u = new URL(`/api/quality?__route=${route}`, 'http://localhost');
    for (const [k, v] of url.searchParams) u.searchParams.set(k, v);
    return { handler: apiHandlers.get('/api/quality'), url: u };
  }
  return null;
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
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
  const resolved = resolveHandler(url.pathname, url);
  if (resolved) {
    // Pass the resolved url with __route to handler
    req.url = resolved.url.pathname + resolved.url.search;
    return resolved.handler(req, res);
  }
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

