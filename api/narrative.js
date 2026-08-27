'use strict';

// Consolidated router for the improve-world-home Story/World/Merge backend
// (see api/quality.js for why this pattern exists -- Vercel Hobby plan's
// 12-function-per-deployment cap; see AGENTS.md section on API-surface
// router reuse -- this is a NEW router, not folded into api/game.js, since
// story/world/merge is a distinct domain from the survival game).
// vercel.json rewrites keep /api/story, /api/world, /api/merge working as
// their own public URLs.
const routes = {
  story: require('../lib/api-handlers/story'),
  world: require('../lib/api-handlers/world'),
  merge: require('../lib/api-handlers/merge')
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
    res.end(JSON.stringify({ ok: false, error: `Unknown narrative route: ${route}` }));
    return;
  }
  return target(req, res);
};
