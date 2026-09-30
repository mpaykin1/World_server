const DEFAULT_THRESHOLDS = Object.freeze({
  true3D: 0.9,
  spatialDepth: 0.48,
  silhouette: 0.42,
  semanticDetail: 0.48,
  secondaryGeometry: 0.35,
  materialVariation: 0.38,
  lightingResponse: 0.5,
  nearObject: 0.5,
  environmentDetail: 0.48,
  maxFlatSurfaceRatio: 0.64,
  maxPrimitiveFallbackRatio: 0.5,
  minDepthPlanes: 3,
  minDpr: 1,
  maxDrawCalls: 180,
  maxTriangles: 700000
});

const STYLE_OVERRIDES = Object.freeze({
  realistic: {},
  krieger_industrial: {
    semanticDetail: 0.55,
    secondaryGeometry: 0.45,
    materialVariation: 0.45,
    nearObject: 0.58,
    environmentDetail: 0.55,
    maxFlatSurfaceRatio: 0.5,
    maxPrimitiveFallbackRatio: 0.34
  },
  voxel_art: {
    silhouette: 0.32,
    materialVariation: 0.2,
    lightingResponse: 0.35,
    maxFlatSurfaceRatio: 0.74,
    maxPrimitiveFallbackRatio: 0.44
  },
  living_ink: {
    silhouette: 0.5,
    materialVariation: 0.18,
    lightingResponse: 0.28,
    maxFlatSurfaceRatio: 0.7,
    maxPrimitiveFallbackRatio: 0.42
  },
  watercolor: {
    materialVariation: 0.14,
    lightingResponse: 0.2,
    maxFlatSurfaceRatio: 0.78
  },
  intentional_minimalism: {
    materialVariation: 0.08,
    secondaryGeometry: 0.18,
    environmentDetail: 0.32,
    maxFlatSurfaceRatio: 0.82,
    maxPrimitiveFallbackRatio: 0.42
  }
});

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const round = (value, places = 3) => {
  const p = 10 ** places;
  return Math.round((Number(value) || 0) * p) / p;
};
const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const ratio = (value, total) => total > 0 ? value / total : 0;

export function thresholdsFor(styleProfile = 'realistic', custom = {}) {
  return {
    ...DEFAULT_THRESHOLDS,
    ...(STYLE_OVERRIDES[styleProfile] || {}),
    ...custom
  };
}

function objectSemanticScore(object) {
  const layers = new Set(object.semanticLayers || []);
  const tags = new Set(object.semanticTags || []);
  const layerScore = ['macro', 'meso', 'micro', 'surface', 'state', 'props']
    .filter(layer => layers.has(layer)).length / 6;
  const tagScore = Math.min(1, tags.size / 6);
  const partsScore = Math.min(1, (Number(object.secondaryParts) || 0) / 10);
  return clamp01(layerScore * 0.48 + tagScore * 0.28 + partsScore * 0.24);
}

function objectSilhouetteScore(object) {
  const segments = Number(object.silhouetteSegments) || 0;
  const concavity = clamp01(object.concavity || 0);
  return clamp01(Math.min(1, segments / 18) * 0.72 + concavity * 0.28);
}

function objectMaterialScore(object) {
  const regions = Math.max(1, Number(object.materialRegions) || 1);
  const variation = clamp01(object.materialVariation || 0);
  const micro = clamp01(object.surfaceMicrodetail || 0);
  return clamp01(Math.min(1, (regions - 1) / 5) * 0.45 + variation * 0.35 + micro * 0.2);
}

function objectNearScore(object) {
  const semantic = objectSemanticScore(object);
  const silhouette = objectSilhouetteScore(object);
  const material = objectMaterialScore(object);
  const mechanisms = Math.min(1, (Number(object.functionalComponents) || 0) / 6);
  return clamp01(semantic * 0.34 + silhouette * 0.26 + material * 0.2 + mechanisms * 0.2);
}

function isGiantFlatPrimitive(object) {
  return Boolean(object.primitiveFallback) &&
    clamp01(object.flatSurfaceRatio ?? 1) >= 0.78 &&
    (Number(object.screenCoverage) || 0) >= 0.16;
}

function weightedFlatRatio(objects) {
  let weight = 0;
  let flat = 0;
  for (const object of objects) {
    const w = Math.max(0.02, Number(object.screenCoverage) || 0.05);
    weight += w;
    flat += w * clamp01(object.flatSurfaceRatio ?? 0.5);
  }
  return weight ? flat / weight : 1;
}

export function detectPrimitiveGraphics(scene, options = {}) {
  const objects = scene.objects || [];
  const warnings = [];
  const giant = objects.filter(isGiantFlatPrimitive);
  const primitive = objects.filter(object => object.primitiveFallback);
  const semanticScores = objects.map(objectSemanticScore);
  const materialScores = objects.map(objectMaterialScore);
  const near = objects.filter(object => object.nearCamera);
  const nearScores = near.map(objectNearScore);
  const localLights = (scene.lights || []).filter(light => light.local || light.emissiveLinked);
  const responsiveLights = localLights.filter(light => (Number(light.affectedGeometry) || 0) >= 2 && clamp01(light.responseStrength) >= 0.35);

  if (giant.length) warnings.push({code: 'GIANT_FLAT_PRIMITIVE', severity: 'hard', count: giant.length});
  if (ratio(primitive.length, objects.length) > 0.45) warnings.push({code: 'PRIMITIVE_FALLBACK_DOMINANT', severity: 'hard'});
  if (average(semanticScores) < 0.38) warnings.push({code: 'LOW_SEMANTIC_DETAIL', severity: 'hard'});
  if (average(materialScores) < 0.28) warnings.push({code: 'LOW_MATERIAL_VARIATION', severity: 'hard'});
  if (!near.length || Math.max(0, ...nearScores) < 0.42) warnings.push({code: 'NEAR_CAMERA_LOW_DETAIL', severity: 'hard'});
  if (localLights.length && responsiveLights.length / localLights.length < 0.5) warnings.push({code: 'LOCAL_LIGHT_NO_MEANINGFUL_RESPONSE', severity: 'hard'});
  if ((Number(scene.composition?.depthPlanes) || 0) < 3) warnings.push({code: 'SHALLOW_COMPOSITION', severity: 'medium'});
  return warnings;
}

export function analyzeGraphicsQuality(scene, options = {}) {
  const styleProfile = options.styleProfile || scene.styleProfile || 'realistic';
  const qualityTier = options.qualityTier || scene.qualityTier || 'KRIEGER_CLASS';
  const thresholds = thresholdsFor(styleProfile, options.thresholds);
  const objects = scene.objects || [];
  const lights = scene.lights || [];
  const nearObjects = objects.filter(object => object.nearCamera);
  const semanticScores = objects.map(objectSemanticScore);
  const silhouetteScores = objects.map(objectSilhouetteScore);
  const materialScores = objects.map(objectMaterialScore);
  const primitiveCount = objects.filter(object => object.primitiveFallback).length;
  const giantCount = objects.filter(isGiantFlatPrimitive).length;
  const totalTriangles = objects.reduce((sum, object) => sum + (Number(object.triangles) || 0), 0);
  const localLights = lights.filter(light => light.local || light.emissiveLinked);
  const responsiveLights = localLights.filter(light => (Number(light.affectedGeometry) || 0) >= 2 && clamp01(light.responseStrength) >= 0.35);
  const true3DObjects = objects.filter(object => object.true3D !== false && (Number(object.depthExtent) || 0) > 0.01);
  const depthPlanes = Number(scene.composition?.depthPlanes) || 0;
  const depthSpan = clamp01(scene.composition?.depthSpan || 0);
  const foreground = clamp01(scene.composition?.foregroundStrength || 0);
  const focal = clamp01(scene.composition?.focalHierarchy || 0);
  const environmentObjects = objects.filter(object => !object.nearCamera);
  const semanticDetail = average(semanticScores);
  const secondaryGeometry = average(objects.map(object => clamp01((Number(object.secondaryParts) || 0) / 9)));
  const environmentDetail = clamp01(
    average(environmentObjects.map(objectSemanticScore)) * 0.56 +
    average(environmentObjects.map(objectSilhouetteScore)) * 0.24 +
    (1 - ratio(giantCount, Math.max(1, environmentObjects.length))) * 0.2
  );
  const lightingResponse = localLights.length ? ratio(responsiveLights.length, localLights.length) : clamp01(scene.lighting?.globalResponse || 0.6);
  const metrics = {
    true3D: round(ratio(true3DObjects.length, objects.length)),
    spatialDepth: round(depthSpan * 0.56 + Math.min(1, depthPlanes / 5) * 0.24 + foreground * 0.1 + focal * 0.1),
    silhouetteComplexity: round(average(silhouetteScores)),
    semanticDetail: round(semanticDetail),
    secondaryGeometry: round(secondaryGeometry),
    materialVariation: round(average(materialScores)),
    lightingResponse: round(lightingResponse),
    nearObjectComplexity: round(Math.max(0, ...nearObjects.map(objectNearScore))),
    environmentDetail: round(environmentDetail),
    flatSurfaceRatio: round(weightedFlatRatio(objects)),
    primitiveFallbackRatio: round(ratio(primitiveCount, objects.length)),
    depthPlanes,
    triangles: totalTriangles,
    drawCalls: Number(scene.performance?.drawCalls) || 0,
    dpr: Number(scene.performance?.dpr) || 1,
    generationMs: Number(scene.performance?.generationMs) || 0
  };

  const gates = {
    TRUE_3D_GATE: metrics.true3D >= thresholds.true3D,
    DEPTH_GATE: metrics.spatialDepth >= thresholds.spatialDepth && depthPlanes >= thresholds.minDepthPlanes,
    SILHOUETTE_GATE: metrics.silhouetteComplexity >= thresholds.silhouette,
    SEMANTIC_DETAIL_GATE: metrics.semanticDetail >= thresholds.semanticDetail,
    SECONDARY_GEOMETRY_GATE: metrics.secondaryGeometry >= thresholds.secondaryGeometry,
    NEAR_OBJECT_GATE: metrics.nearObjectComplexity >= thresholds.nearObject,
    MATERIAL_GATE: metrics.materialVariation >= thresholds.materialVariation && metrics.flatSurfaceRatio <= thresholds.maxFlatSurfaceRatio,
    LIGHTING_GATE: metrics.lightingResponse >= thresholds.lightingResponse,
    ENVIRONMENT_GATE: metrics.environmentDetail >= thresholds.environmentDetail && metrics.primitiveFallbackRatio <= thresholds.maxPrimitiveFallbackRatio,
    PERFORMANCE_GATE: metrics.drawCalls <= thresholds.maxDrawCalls && metrics.triangles <= thresholds.maxTriangles,
    DPR_GATE: metrics.dpr >= thresholds.minDpr
  };

  const hardGateNames = ['NEAR_OBJECT_GATE', 'MATERIAL_GATE', 'LIGHTING_GATE', 'ENVIRONMENT_GATE'];
  const primitiveWarnings = detectPrimitiveGraphics(scene, {styleProfile});
  const failures = Object.entries(gates).filter(([, passed]) => !passed).map(([gate]) => ({
    gate,
    hard: hardGateNames.includes(gate),
    reason: failureReason(gate, metrics, thresholds)
  }));
  const passed = failures.length === 0;
  return {
    qualityTier,
    styleProfile,
    passed,
    status: passed ? 'PASS' : (failures.some(f => f.hard) ? 'PROTOTYPE' : 'BLOCKED'),
    gates,
    metrics,
    failures,
    primitiveWarnings,
    recommendations: recommendationsFor(failures, primitiveWarnings)
  };
}

function failureReason(gate, metrics, thresholds) {
  const reasons = {
    TRUE_3D_GATE: `true3D ${metrics.true3D} < ${thresholds.true3D}`,
    DEPTH_GATE: `depth ${metrics.spatialDepth}, planes ${metrics.depthPlanes}`,
    SILHOUETTE_GATE: `silhouette ${metrics.silhouetteComplexity} < ${thresholds.silhouette}`,
    SEMANTIC_DETAIL_GATE: `semantic detail ${metrics.semanticDetail} < ${thresholds.semanticDetail}`,
    SECONDARY_GEOMETRY_GATE: `secondary geometry ${metrics.secondaryGeometry} < ${thresholds.secondaryGeometry}`,
    NEAR_OBJECT_GATE: `near object complexity ${metrics.nearObjectComplexity} < ${thresholds.nearObject}`,
    MATERIAL_GATE: `material ${metrics.materialVariation}, flat ratio ${metrics.flatSurfaceRatio}`,
    LIGHTING_GATE: `local light response ${metrics.lightingResponse} < ${thresholds.lightingResponse}`,
    ENVIRONMENT_GATE: `environment ${metrics.environmentDetail}, primitive ratio ${metrics.primitiveFallbackRatio}`,
    PERFORMANCE_GATE: `triangles ${metrics.triangles}, draw calls ${metrics.drawCalls}`,
    DPR_GATE: `DPR ${metrics.dpr} < ${thresholds.minDpr}`
  };
  return reasons[gate] || gate;
}

function recommendationsFor(failures, warnings) {
  const map = {
    NEAR_OBJECT_GATE: 'Compile the foreground object from functional parts, secondary silhouette and material regions.',
    MATERIAL_GATE: 'Split dominant surfaces into material zones and add procedural roughness/cavity/wear variation.',
    LIGHTING_GATE: 'Bind local or emissive lights to nearby geometry response; glow alone is insufficient.',
    ENVIRONMENT_GATE: 'Replace giant fallback surfaces with semantic supports, recesses, frames, trims and props.',
    SEMANTIC_DETAIL_GATE: 'Add macro→meso→micro semantic structure rather than random geometric noise.',
    DEPTH_GATE: 'Strengthen foreground/midground/focal/background separation.'
  };
  const result = failures.map(f => map[f.gate]).filter(Boolean);
  if (warnings.some(w => w.code === 'PRIMITIVE_FALLBACK_DOMINANT')) result.push('Reduce primitive-fallback dominance; triangle inflation does not count as quality.');
  return [...new Set(result)];
}

export function qualityFingerprint(report) {
  const ordered = {
    qualityTier: report.qualityTier,
    styleProfile: report.styleProfile,
    gates: report.gates,
    metrics: report.metrics,
    warnings: report.primitiveWarnings.map(w => w.code)
  };
  let hash = 2166136261;
  for (const char of JSON.stringify(ordered)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
