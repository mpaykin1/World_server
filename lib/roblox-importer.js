'use strict';

const crypto = require('crypto');
const { parseRbxlx, walk } = require('./roblox-rbxlx-parser');
const { aggregateBehaviorPlan } = require('./roblox-behavior-translator');
const { collectAssetRefs, applyProvidedAssets, assetSummary } = require('./roblox-asset-resolver');

const RENDERABLE = new Set(['Part', 'MeshPart', 'UnionOperation', 'WedgePart', 'CornerWedgePart', 'TrussPart']);
const LIGHTS = new Set(['PointLight', 'SpotLight', 'SurfaceLight']);

function pickProperties(properties) {
  const keys = ['CFrame', 'Position', 'Orientation', 'Size', 'Color', 'Color3', 'Material', 'Transparency', 'Anchored', 'CanCollide', 'CastShadow', 'MeshId', 'TextureID'];
  return Object.fromEntries(keys.filter((key) => properties[key] !== undefined).map((key) => [key, properties[key]]));
}

function classifyInstance(instance) {
  if (RENDERABLE.has(instance.className)) return 'geometry';
  if (LIGHTS.has(instance.className)) return 'light';
  if (instance.className === 'Terrain' || instance.className === 'TerrainRegion') return 'terrain';
  if (instance.className === 'RemoteEvent') return 'network-event';
  if (['Model', 'Folder', 'Workspace'].includes(instance.className)) return 'group';
  if (['Script', 'LocalScript', 'ModuleScript'].includes(instance.className)) return 'behavior-source';
  return 'entity';
}

function sceneNodes(instances) {
  const nodes = [];
  walk(instances, (instance) => {
    nodes.push({ id: instance.referent, parentId: instance.parentReferent, name: instance.name, sourceClass: instance.className,
      kind: classifyInstance(instance), properties: pickProperties(instance.properties) });
  });
  return nodes;
}

function buildAdapterPlan(parsed, behaviorPlan) {
  const events = parsed.remotes.map((item) => item.name).sort();
  const needs = new Set(behaviorPlan.capabilities.map((item) => item.adapter));
  const classes = parsed.classes || {};
  const hasUi = Object.keys(classes).some((name) => /Gui|ImageLabel|TextLabel|TextButton|ImageButton|ViewportFrame/.test(name));
  const hasTerrain = Boolean(classes.Terrain || classes.TerrainRegion);
  const hasAudio = Boolean(classes.Sound || classes.SoundService);
  return {
    controls: { mode: needs.has('golden-controls') ? 'reuse' : 'optional', canonical: 'shared/ai3d-playable-runtime.js', compatibility: 'shared/roblox-runtime-adapter.js' },
    physics: { mode: needs.has('world-physics') ? 'adapt' : 'optional', canonical: 'shared/golden-physics.js', compatibility: 'shared/roblox-runtime-adapter.js', requires: behaviorPlan.capabilities.filter((x) => x.adapter === 'world-physics').map((x) => x.capability) },
    networking: { mode: events.length ? 'adapt' : 'optional', target: 'world-server-event-bus', compatibility: 'shared/roblox-runtime-adapter.js', remoteEvents: events },
    scheduler: { mode: needs.has('world-scheduler') ? 'adapt' : 'optional', target: 'requestAnimationFrame/server-tick' },
    rendering: { target: 'world-server-webgl-runtime', preserveSourceMaterials: true, materialPolicy: 'map-roblox-materials-to-world-pbr-without-fabricating-textures', qualityFloor: 85 },
    terrain: { mode: hasTerrain ? 'adapt-or-export' : 'optional', target: 'world-terrain-adapter', policy: 'decode-supported-data-or-require-export; never-invent-hidden-terrain' },
    ui: { mode: hasUi ? 'semantic-rebuild' : 'optional', canonical: 'shared/golden-ui-shell.js', policy: 'preserve-actions-layout-intent-not-roblox-runtime-widgets' },
    audio: { mode: hasAudio ? 'asset-map' : 'optional', target: 'browser-audio-runtime' },
    assets: { mode: 'manifest-first', target: 'lib/roblox-asset-resolver.js', policy: 'external-bytes-must-be-provided-or-legally-exported' },
    scriptExecution: { importTime: false, runtime: false, policy: 'semantic-reimplementation-only' }
  };
}

function buildWorldRecipe(parsed, behaviorPlan) {
  const has = (name) => behaviorPlan.behaviors.includes(name);
  return {
    source: 'roblox-rbxlx', worldType: has('procedural-world') ? 'procedural-import' : 'scene-import',
    infinite: has('chunk-streaming'), systems: behaviorPlan.behaviors,
    player: { input: has('player-input'), climbing: has('climbing'), airMovement: has('air-movement') },
    gameplay: { projectiles: has('projectile-physics'), networkEvents: has('network-events') },
    render: { lighting: has('lighting'), visualEffects: has('visual-effects'), qualityFloor: 85 }
  };
}

function blockers(assets, behaviorPlan, parsed) {
  const out = [];
  if (assets.some((item) => item.status === 'unresolved-external')) out.push('external-assets-unresolved');
  if (behaviorPlan.warnings.length) out.push('unsupported-roblox-services');
  if ((parsed?.classes?.TerrainRegion || 0) > 0) out.push('terrain-region-bytes-require-decoder-or-export');
  return out;
}

function importRbxlx(xml, options = {}) {
  const parsed = parseRbxlx(xml);
  const behaviorPlan = aggregateBehaviorPlan(parsed.scripts);
  const assets = applyProvidedAssets(collectAssetRefs(parsed.instances), options.providedAssets || {});
  const sourceSha256 = crypto.createHash('sha256').update(String(xml), 'utf8').digest('hex');
  return {
    schemaVersion: 'world-server.roblox-import.v1', source: { format: 'rbxlx', version: parsed.version, sha256: sourceSha256 },
    summary: { instances: parsed.instanceCount, classes: parsed.classes, scripts: parsed.scripts.length, remotes: parsed.remotes.length, ...assetSummary(assets) },
    scene: { coordinatePolicy: 'preserve-roblox-y-up-until-runtime-adapter', nodes: sceneNodes(parsed.instances) },
    assets, behaviors: behaviorPlan, adapters: buildAdapterPlan(parsed, behaviorPlan), recipe: buildWorldRecipe(parsed, behaviorPlan),
    migration: { stage: 'imported-ir', executable: false, qualityGate: 'NOT_READY_FOR_FINAL_DELIVERY', blockers: blockers(assets, behaviorPlan, parsed) }
  };
}

module.exports = { importRbxlx, classifyInstance, sceneNodes, buildAdapterPlan, buildWorldRecipe };
