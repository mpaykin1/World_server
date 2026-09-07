'use strict';

const crypto = require('crypto');

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function asString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Manifest ${field} must be a non-empty string`);
  return value.trim();
}

function normalizeManifest(input) {
  if (!input || typeof input !== 'object') throw new Error('World manifest must be an object');
  const id = asString(input.id, 'id');
  const patchFamily = asString(input.patchFamily || id, 'patchFamily');
  if (!ID.test(id) || !ID.test(patchFamily)) throw new Error('Manifest ids must be stable kebab-case identifiers');
  const version = asString(input.version || '1.0.0', 'version');
  const releaseAppId = asString(input.releaseAppId || id, 'releaseAppId');
  const portals = Array.isArray(input.portals) ? input.portals.map((portal) => {
    if (!portal || typeof portal !== 'object') throw new Error(`Manifest ${id} has an invalid portal`);
    const target = asString(portal.targetWorldId, 'portal.targetWorldId');
    if (!ID.test(target)) throw new Error(`Manifest ${id} has an invalid portal target`);
    return { id: asString(portal.id || `${id}-to-${target}`, 'portal.id'), targetWorldId: target, label: asString(portal.label || target, 'portal.label') };
  }) : [];
  const normalized = {
    id,
    patchFamily,
    version,
    releaseAppId,
    title: asString(input.title || id, 'title'),
    description: asString(input.description || 'World imported from a patch family.', 'description'),
    lore: asString(input.lore || input.description || 'A persistent World_server world.', 'lore'),
    capabilities: Array.isArray(input.capabilities) ? [...new Set(input.capabilities.map((x) => asString(x, 'capability')))].sort() : [],
    history: Array.isArray(input.history) ? input.history.map((entry) => ({ version: asString(entry.version, 'history.version'), summary: asString(entry.summary, 'history.summary') })) : [],
    portals,
    source: input.source && typeof input.source === 'object' ? {
      commit: asString(input.source.commit, 'source.commit'),
      path: asString(input.source.path, 'source.path')
    } : null
  };
  normalized.revisionId = `${patchFamily}@${version}`;
  normalized.manifestHash = digest(normalized);
  return normalized;
}

function ingestManifests(manifests, releaseRegistry = { apps: {} }) {
  if (!Array.isArray(manifests)) throw new Error('Manifests must be an array');
  const worlds = new Map();
  for (const raw of manifests) {
    const manifest = normalizeManifest(raw);
    const world = worlds.get(manifest.patchFamily) || { id: manifest.patchFamily, patchFamily: manifest.patchFamily, revisions: [], latestRevisionId: null };
    const existing = world.revisions.find((revision) => revision.revisionId === manifest.revisionId);
    if (existing && existing.manifestHash !== manifest.manifestHash) throw new Error(`Conflicting duplicate revision ${manifest.revisionId}`);
    if (!existing) world.revisions.push(manifest);
    world.revisions.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
    world.latestRevisionId = world.revisions.at(-1).revisionId;
    worlds.set(world.id, world);
  }
  const graphWorlds = [...worlds.values()].map((world) => {
    const latest = world.revisions.find((revision) => revision.revisionId === world.latestRevisionId);
    const release = releaseRegistry.apps?.[latest.releaseAppId] || {};
    return {
      ...world,
      title: latest.title,
      description: latest.description,
      lore: latest.lore,
      capabilities: latest.capabilities,
      portals: latest.portals,
      releaseAppId: latest.releaseAppId,
      public: release.visible === true && release.status === 'certified',
      status: release.status || 'unregistered'
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const known = new Set(graphWorlds.map((world) => world.id));
  for (const world of graphWorlds) for (const portal of world.portals) if (!known.has(portal.targetWorldId)) throw new Error(`Dangling portal ${world.id} -> ${portal.targetWorldId}`);
  return { schemaVersion: '1.0.0', generatedBy: 'scripts/ingest-world-patches.js', worlds: graphWorlds };
}

function publicWorlds(index, releaseRegistry) {
  return (index?.worlds || []).filter((world) => {
    const release = releaseRegistry?.apps?.[world.releaseAppId];
    return release ? release.visible === true && release.status === 'certified' : world.public === true && world.status === 'certified';
  }).map((world) => clone(world));
}

module.exports = { normalizeManifest, ingestManifests, publicWorlds, digest };
