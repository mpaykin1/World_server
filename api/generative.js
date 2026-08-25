'use strict';

// Consolidated router for procedural/3D generation endpoints (see api/quality.js
// for why this pattern exists — Vercel Hobby plan's 12-function-per-deployment cap).
// vercel.json rewrites keep every original URL working exactly as before.
const ai3d = require('../lib/api-handlers/ai3d');
const ai3dVoxelGenerate = require('../lib/api-handlers/ai3d-voxel-generate');
const apng = require('../lib/api-handlers/apng');
const lowfi25dScene = require('../lib/api-handlers/lowfi-25d-scene');
const voxel = require('../lib/api-handlers/voxel');

const routes = {
  ai3d,
  'ai3d-voxel-generate': ai3dVoxelGenerate,
  apng,
  'lowfi-25d-scene': lowfi25dScene,
  voxel
};

function routeName(req) {
  const fromRewrite = req.query && req.query.__route;
  if (fromRewrite) return String(fromRewrite);
  const pathname = String(req.url || '').split('?')[0];
  return pathname.replace(/^\/?api\/?/, '');
}

module.exports = async function handler(req, res) {
  const route = routeName(req);
  const target = routes[route];
  if (!target) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: `Unknown route: ${route}` }));
    return;
  }
  return target(req, res);
};
