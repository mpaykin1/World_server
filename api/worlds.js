'use strict';

const fs = require('fs');
const path = require('path');
const { sendJson, methodNotAllowed, withErrors } = require('../lib/http');
const { publicWorlds } = require('../lib/world-graph');
const { URL } = require('url');

const indexPath = path.join(process.cwd(), 'data', 'world-graph-index.json');
const registryPath = path.join(process.cwd(), 'data', 'app-release-registry.json');

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
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
  const requested = new URL(req.url || '/api/worlds', 'http://localhost').searchParams.get('id');
  const selected = requested ? worlds.filter((world) => world.id === requested || world.releaseAppId === requested) : worlds;
  if (requested && selected.length === 0) return sendJson(res, 404, { error: 'World not found' });
  sendJson(res, 200, { worlds: selected, graph: { nodes: selected.map(({ id }) => id), edges: selected.flatMap((world) => world.portals.map((portal) => ({ from: world.id, to: portal.targetWorldId, id: portal.id, label: portal.label }))) } });
});
