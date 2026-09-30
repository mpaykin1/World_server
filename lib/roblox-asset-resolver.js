'use strict';

const ASSET_RE = /rbxassetid:\/\/(\d+)/gi;

function scanValue(value, onAsset, path = '') {
  if (typeof value === 'string') {
    let match;
    ASSET_RE.lastIndex = 0;
    while ((match = ASSET_RE.exec(value))) onAsset(match[1], match[0], path);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) scanValue(nested, onAsset, path ? `${path}.${key}` : key);
}

function guessKind(property) {
  const p = String(property || '').toLowerCase();
  if (p.includes('mesh')) return 'mesh';
  if (p.includes('texture') || p.includes('skybox')) return 'texture';
  if (p.includes('sound')) return 'audio';
  if (p.includes('animation')) return 'animation';
  return 'asset';
}

function collectAssetRefs(instances) {
  const assets = [];
  function visit(instance) {
    scanValue(instance.properties, (assetId, uri, property) => assets.push({
      assetId, uri, kind: guessKind(property), property,
      source: { referent: instance.referent, className: instance.className, name: instance.name },
      status: 'unresolved-external', resolutionPolicy: 'authorized-export-or-user-supplied-bytes'
    }));
    for (const nested of instance.children || []) visit(nested);
  }
  for (const instance of instances || []) visit(instance);
  return assets.sort((a, b) => a.assetId.localeCompare(b.assetId) || a.property.localeCompare(b.property));
}

function applyProvidedAssets(assets, provided = {}) {
  return assets.map((asset) => {
    const supplied = provided[asset.assetId];
    if (!supplied) return asset;
    return { ...asset, status: 'provided', resolvedTo: String(supplied), resolutionPolicy: 'user-supplied' };
  });
}

function assetSummary(assets) {
  const unique = new Set(assets.map((item) => item.assetId));
  const unresolved = new Set(assets.filter((item) => item.status !== 'provided').map((item) => item.assetId));
  return { references: assets.length, uniqueAssets: unique.size, unresolvedAssets: unresolved.size };
}

module.exports = { collectAssetRefs, applyProvidedAssets, assetSummary, guessKind };
