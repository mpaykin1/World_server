'use strict';
const rules = require('../data/world-sprite-rules.json');
function relationKey(value) {
  if (typeof value === 'string') return value.split('|').sort().join('|');
  if (Array.isArray(value)) return value.map(String).sort().join('|');
  if (value && Array.isArray(value.types)) return relationKey(value.types);
  if (value && value.a && value.b) return relationKey([value.a.type || value.a, value.b.type || value.b]);
  return null;
}
function planWorldSprites(world = {}, inventory = [], budget = {}) {
  const known = new Set(inventory.map(asset => typeof asset === 'string' ? asset : asset.id));
  const remaining = Number.isFinite(budget.maxSprites) ? Math.max(0, Math.floor(budget.maxSprites)) : 3;
  const allowedZones = new Set(world.zones || []);
  const relationKinds = new Set((world.relations || []).map(r => typeof r === 'string' ? r : r.kind));
  const relationKeys = new Set((world.relations || []).map(relationKey));
  const types = new Set((world.entities || []).map(e => typeof e === 'string' ? e : e.type));
  const candidates = [];
  for (const rule of rules.relations) {
    const [a, b] = rule.key.split('|');
    if (!relationKinds.has(rule.kind) && !relationKeys.has(rule.key) && !(types.has(a) && types.has(b))) continue;
    for (const asset of rule.assets) {
      if (world.biome && ![a, b, 'mixed'].includes(world.biome)) continue;
      if (allowedZones.size && !allowedZones.has(asset.zone)) continue;
      if (asset.stage !== 'any' && asset.stage !== world.growthStage) continue;
      candidates.push({ ...asset, relation: rule.kind, relationKey: rule.key,
        action: known.has(asset.id) ? 'reuse' : 'generate',
        reason: 'causal relation '+rule.kind+' in zone '+asset.zone,
        expectedObservable: asset.id+' visible in '+asset.zone,
        verification: 'sprite manifest + relation-zone placement + desktop/mobile render and FPS' });
    }
  }
  candidates.sort((a,b) => Number(b.action === 'reuse')-Number(a.action === 'reuse') || a.id.localeCompare(b.id));
  return {schemaVersion:1, candidates:candidates.slice(0,remaining),
    rejected:candidates.slice(remaining).map(c=>({id:c.id,reason:'sprite budget exhausted'})),
    budget:{maxSprites:remaining}, automaticPlacement:false};
}
module.exports = {planWorldSprites, relationKey};
