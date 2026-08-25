'use strict';

const registry = require('../data/app-release-registry.json');

const SAFE_APP = /^[a-z0-9][a-z0-9-]{0,63}$/;

function getQuery(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.end('Method Not Allowed');
    return;
  }

  const query = getQuery(req);
  const app = String(query.app || 'catalog').trim().toLowerCase();

  if (!SAFE_APP.test(app) || !registry.apps?.[app]) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Unknown app.' }));
    return;
  }

  const meta = registry.apps[app] || {};
  const title = String(meta.title || app);
  const scope = `/apps/${app}/`;
  const manifest = {
    id: scope,
    name: title,
    short_name: title.slice(0, 24),
    description: 'World Server progressive web application',
    start_url: `${scope}?source=pwa`,
    scope,
    display: 'standalone',
    display_override: ['standalone', 'fullscreen'],
    background_color: '#080b10',
    theme_color: '#0b0f16',
    orientation: 'any',
    categories: meta.kind === 'game'
      ? ['games', 'entertainment']
      : ['utilities', 'productivity'],
    icons: [
      { src: '/shared/pwa-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/shared/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ],
    prefer_related_applications: false
  };

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(manifest));
};

module.exports.getQuery = getQuery;
