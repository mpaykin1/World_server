'use strict';

// Consolidated router for account endpoints (see api/quality.js for why this
// pattern exists — Vercel Hobby plan's 12-function-per-deployment cap).
// vercel.json rewrites keep /api/login, /api/logout, /api/me, /api/register
// working exactly as before.
const routes = {
  login: require('../lib/api-handlers/login'),
  logout: require('../lib/api-handlers/logout'),
  me: require('../lib/api-handlers/me'),
  register: require('../lib/api-handlers/register')
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
    res.end(JSON.stringify({ error: `Unknown auth route: ${route}` }));
    return;
  }
  return target(req, res);
};
