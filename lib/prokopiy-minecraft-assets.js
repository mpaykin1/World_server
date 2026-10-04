'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'assets', 'voxel', 'prokopiy-minecraft');
const CATALOG_PATH = path.join(ROOT, 'catalog.json');
const PROVENANCE_PATH = path.join(__dirname, '..', 'data', 'provenance', 'prokopiy-minecraft', 'permission.json');

const CREATURE_MODEL_MAP = Object.freeze({
  slime: 'slime',
  wolf: 'wolf',
  skeleton: 'skeleton',
  bear: 'polar_bear',
  dragon_wyrmling: 'ender_dragon'
});

let catalogCache;
let provenanceCache;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadCatalog() {
  if (!catalogCache) catalogCache = readJson(CATALOG_PATH);
  return catalogCache;
}

function loadProvenance() {
  if (!provenanceCache) provenanceCache = readJson(PROVENANCE_PATH);
  return provenanceCache;
}
function normalizeKind(kind) {
  const value = String(kind || '').toLowerCase();
  if (!['mobs', 'items', 'entities'].includes(value)) {
    throw new TypeError('kind must be mobs, items, or entities');
  }
  return value;
}

function listModels(kind) {
  const key = normalizeKind(kind);
  return loadCatalog().models[key].map((entry) => ({ ...entry, kind: key }));
}

function findModel(kind, id) {
  const key = normalizeKind(kind);
  const wanted = String(id || '').trim();
  if (!wanted) return null;
  const entry = loadCatalog().models[key].find((model) => model.id === wanted);
  return entry ? { ...entry, kind: key } : null;
}

function resolveCreatureVisual(speciesId) {
  const modelId = CREATURE_MODEL_MAP[String(speciesId || '')];
  if (!modelId) return null;
  const model = findModel('mobs', modelId);
  if (!model) return null;
  const provenance = loadProvenance();
  return {
    provider: 'prokopiy-minecraft',
    sourceCommit: provenance.sourceCommit,
    permissionEvidence: provenance.permissionEvidence,
    attributionRequired: true,
    modelId,
    url: model.url,
    sha256: model.sha256
  };
}

function listSourceOnlyModels() {
  return (loadCatalog().sourceOnlyModels?.unityFbx || []).map((entry) => ({ ...entry }));
}

function getBlockAtlas() {
  const atlas = loadCatalog().blockAtlas;
  return {
    provider: 'prokopiy-minecraft',
    imageUrl: '/assets/voxel/prokopiy-minecraft/' + atlas.image,
    metadataUrl: '/assets/voxel/prokopiy-minecraft/' + atlas.metadata,
    layers: atlas.layers,
    columns: atlas.columns
  };
}

function verifyCatalogFiles() {
  const catalog = loadCatalog();
  const missing = [];
  for (const kind of ['mobs', 'items', 'entities']) {
    for (const model of catalog.models[kind]) {
      const relative = model.url.replace(/^\/assets\/voxel\/prokopiy-minecraft\//, '');
      if (!fs.existsSync(path.join(ROOT, relative))) missing.push(model.url);
    }
  }
  for (const model of catalog.sourceOnlyModels?.unityFbx || []) {
    const relative = model.path.replace(/^\/assets\/voxel\/prokopiy-minecraft\//, '');
    if (!fs.existsSync(path.join(ROOT, relative))) missing.push(model.path);
  }
  for (const rel of [catalog.blockAtlas.image, catalog.blockAtlas.metadata]) {
    if (!fs.existsSync(path.join(ROOT, rel))) missing.push(rel);
  }
  return { ok: missing.length === 0, missing };
}

module.exports = {
  ROOT,
  CATALOG_PATH,
  CREATURE_MODEL_MAP,
  loadCatalog,
  loadProvenance,
  listModels,
  findModel,
  resolveCreatureVisual,
  listSourceOnlyModels,
  getBlockAtlas,
  verifyCatalogFiles
};
