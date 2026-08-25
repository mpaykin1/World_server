'use strict';

// Local development server. Production uses Vercel static hosting and the
// request handlers in /api; all persistent state lives in Supabase.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { injectHtmlForPath } = require('./scripts/inject-pwa-runtime');

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
  ['/api/ai3d-voxel-generate', require('./api/ai3d-voxel-generate')],
  ['/api/quality-telemetry', require('./api/quality-telemetry')],
  ['/api/quality-summary', require('./api/quality-summary')],
  ['/api/quality-profile', require('./api/quality-profile')],
  ['/api/pwa-manifest', require('./api/pwa-manifest')]
]);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json; charset=utf-8',
  '.ktx2': 'image/ktx2',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.pck': 'application/octet-stream',
  '.ply': 'application/octet-stream',
  '.spz': 'application/octet-stream'
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

    const ext = path.extname(file).toLowerCase();
    if (ext === '.html' && file.startsWith(path.join(root, 'apps') + path.sep)) {
      fs.readFile(file, 'utf8', (readError, source) => {
        if (readError) return notFound(res);
        let body = source;
        try { body = injectHtmlForPath(source, file); }
        catch (injectError) { console.warn('[PWA_LOCAL_INJECT]', injectError.message); }
        const bytes = Buffer.byteLength(body);
        res.writeHead(200, {
          'Content-Type': mime[ext],
          'Content-Length': bytes,
          'X-Content-Type-Options': 'nosniff'
        });
        res.end(body);
      });
      return;
    }

    res.writeHead(200, {
      'Content-Type': mime[ext] || 'application/octet-stream',
      'Content-Length': stats.size,
      'X-Content-Type-Options': 'nosniff',
      ...(file === path.join(root, 'sw.js') ? {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Service-Worker-Allowed': '/'
      } : {})
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  req.query = Object.fromEntries(url.searchParams.entries());

  const handler = apiHandlers.get(url.pathname);
  if (handler) return handler(req, res);
  if (url.pathname.startsWith('/api/')) return notFound(res);

  if (url.pathname === '/') {
    res.writeHead(302, { Location: '/apps/catalog/' });
    return res.end();
  }
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }

  const isRootPwaAsset = url.pathname === '/sw.js' || url.pathname === '/offline.html';
  if (!isRootPwaAsset && !url.pathname.startsWith('/apps/') && !url.pathname.startsWith('/shared/') && !url.pathname.startsWith('/data/')) return notFound(res);

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
