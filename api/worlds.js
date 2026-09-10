'use strict';

const fs = require('fs');
const path = require('path');
const { sendJson, methodNotAllowed, withErrors } = require('../lib/http');
const { publicWorlds } = require('../lib/world-graph');
const { buildIndieWorldIndex, buildRss, requestBaseUrl } = require('../lib/indieworlds');
const { URL } = require('url');

const indexPath = path.join(process.cwd(), 'data', 'world-graph-index.json');
const registryPath = path.join(process.cwd(), 'data', 'app-release-registry.json');
const lorePath = path.join(process.cwd(), 'data', 'world-lore-v2.json');

function sendRss(res, body) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(body);
}

function sendPassport(res, world) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/vnd.world-server.indieworld+json; charset=utf-8');
  res.setHeader('Cache-Control', world.external || world.certified ? 'public, max-age=300, stale-while-revalidate=3600' : 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename="${world.id}.indieworld.json"`);
  res.end(JSON.stringify(world));
}

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const requestUrl = new URL(req.url || '/api/worlds', 'http://localhost');
  const format = requestUrl.searchParams.get('format') || 'default';
  const requested = requestUrl.searchParams.get('id');

  if (format === 'rss' || format === 'indieweb') {
    const scope = requestUrl.searchParams.get('scope');
    if (scope && scope !== 'public') return sendJson(res, 400, { error: 'Unknown world scope' });
    const loreBible = JSON.parse(fs.readFileSync(lorePath, 'utf8'));
    const baseUrl = requestBaseUrl(req, process.env.WORLD_PUBLIC_URL || process.env.PUBLIC_BASE_URL || '');
    const projected = buildIndieWorldIndex({
      registry,
      graph: index,
      loreBible,
      baseUrl,
      includeUncertified: false
    });
    res.setHeader('Link', `<${projected.feed}>; rel="alternate"; type="application/rss+xml", <${projected.url}>; rel="up"`);
    if (format === 'rss') return sendRss(res, buildRss(projected));
    if (requested) {
      const world = projected.worlds.find((item) => item.id === requested);
      if (!world) return sendJson(res, 404, { error: 'World not found' });
      return sendPassport(res, world);
    }
    return sendJson(res, 200, projected);
  }
  if (format !== 'default') return sendJson(res, 400, { error: 'Unknown world representation' });

  const worlds = publicWorlds(index, registry).map((world) => ({
    id: world.id,
    title: world.title,
    description: world.description,
    lore: world.lore,
    capabilities: world.capabilities,
    latestRevisionId: world.latestRevisionId,
    revisions: world.revisions.map((revision) => ({ revisionId: revision.revisionId, version: revision.version, manifestHash: revision.manifestHash, source: revision.source })),
    portals: world.portals,
    releaseAppId: world.releaseAppId,
    status: world.status
  }));
  const selected = requested ? worlds.filter((world) => world.id === requested || world.releaseAppId === requested) : worlds;
  if (requested && selected.length === 0) return sendJson(res, 404, { error: 'World not found' });
  sendJson(res, 200, { worlds: selected, graph: { nodes: selected.map(({ id }) => id), edges: selected.flatMap((world) => world.portals.map((portal) => ({ from: world.id, to: portal.targetWorldId, id: portal.id, label: portal.label }))) } });
});
