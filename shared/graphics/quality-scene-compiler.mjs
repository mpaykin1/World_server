const hash01 = (seed, n) => {
  let x = Math.imul((seed | 0) ^ Math.imul((n + 1) | 0, 0x45d9f3b), 0x45d9f3b);
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
};

export function createQualitySceneRecipe(seed = 424242) {
  return {
    id: 'bridge-vault-alpha',
    seed,
    styleProfile: 'krieger_industrial',
    semantics: {
      setting: 'abandoned geothermal relay hall',
      route: 'central maintenance causeway',
      landmark: 'sealed reactor iris',
      foreground: 'survey instrument',
      hazards: ['steam leaks', 'live conduits'],
      architecture: ['vaulted supports', 'service galleries', 'recessed panels'],
      props: ['pipes', 'cable trays', 'warning lamps', 'debris']
    },
    camera: {position: [0, 0.18, 5.3], target: [0, -0.05, -7.5], fov: 64},
    composition: {
      foreground: 'survey instrument',
      middle: 'supports and causeway',
      focal: 'reactor iris',
      background: 'sealed maintenance vault'
    }
  };
}

function primitiveObject(id, patch = {}) {
  return {
    id,
    true3D: true,
    depthExtent: 1,
    primitiveFallback: true,
    semanticLayers: ['macro'],
    semanticTags: ['mass'],
    secondaryParts: 0,
    silhouetteSegments: 4,
    concavity: 0,
    materialRegions: 1,
    materialVariation: 0.04,
    surfaceMicrodetail: 0.02,
    flatSurfaceRatio: 0.94,
    functionalComponents: 0,
    screenCoverage: 0.12,
    triangles: 12,
    ...patch
  };
}

function enhancedObject(id, patch = {}) {
  return {
    id,
    true3D: true,
    depthExtent: 1,
    primitiveFallback: false,
    semanticLayers: ['macro', 'meso', 'micro', 'surface'],
    semanticTags: ['structure', 'joint', 'trim', 'wear'],
    secondaryParts: 8,
    silhouetteSegments: 16,
    concavity: 0.45,
    materialRegions: 4,
    materialVariation: 0.66,
    surfaceMicrodetail: 0.72,
    flatSurfaceRatio: 0.38,
    functionalComponents: 3,
    screenCoverage: 0.08,
    triangles: 880,
    ...patch
  };
}

function compilePrimitive(recipe, device = {}) {
  const objects = [
    primitiveObject('floor', {screenCoverage: 0.31, depthExtent: 20}),
    primitiveObject('left-wall', {screenCoverage: 0.19, depthExtent: 20}),
    primitiveObject('right-wall', {screenCoverage: 0.19, depthExtent: 20}),
    primitiveObject('ceiling', {screenCoverage: 0.17, depthExtent: 20}),
    primitiveObject('door', {screenCoverage: 0.09, materialVariation: 0.08}),
    primitiveObject('near-crate', {
      nearCamera: true,
      screenCoverage: 0.18,
      depthExtent: 0.9,
      triangles: 12
    })
  ];
  return {
    recipeId: recipe.id,
    seed: recipe.seed,
    qualityProfile: 'primitive',
    qualityTier: 'KRIEGER_CLASS',
    styleProfile: recipe.styleProfile,
    semantics: recipe.semantics,
    camera: recipe.camera,
    objects,
    lights: [
      {id: 'ambient-only', local: false, affectedGeometry: 0, responseStrength: 0.18}
    ],
    lighting: {globalResponse: 0.2},
    composition: {
      depthPlanes: 2,
      depthSpan: 0.36,
      foregroundStrength: 0.22,
      focalHierarchy: 0.24
    },
    performance: {
      drawCalls: 6,
      dpr: device.dpr || 1,
      generationMs: 0.8
    }
  };
}

function compileEnhanced(recipe, device = {}) {
  const objects = [];
  objects.push(enhancedObject('floor-causeway', {
    semanticLayers: ['macro', 'meso', 'micro', 'surface', 'state'],
    semanticTags: ['route', 'tile-grid', 'cracks', 'wetness', 'debris'],
    secondaryParts: 14,
    silhouetteSegments: 20,
    materialRegions: 5,
    materialVariation: 0.74,
    surfaceMicrodetail: 0.82,
    screenCoverage: 0.22,
    triangles: 4200,
    depthExtent: 22
  }));
  objects.push(enhancedObject('vault-shell', {
    semanticTags: ['shell', 'recesses', 'arches', 'ribs', 'service-bays'],
    secondaryParts: 18,
    silhouetteSegments: 24,
    concavity: 0.72,
    materialRegions: 6,
    materialVariation: 0.69,
    surfaceMicrodetail: 0.76,
    screenCoverage: 0.2,
    triangles: 9400,
    depthExtent: 22
  }));
  for (let i = 0; i < 8; i++) {
    const worn = 0.55 + hash01(recipe.seed, i) * 0.25;
    objects.push(enhancedObject(`rib-${i}`, {
      semanticTags: ['support', 'arch', 'brace', 'bolts', 'wear'],
      secondaryParts: 10,
      silhouetteSegments: 22,
      concavity: 0.62,
      materialRegions: 4,
      materialVariation: worn,
      surfaceMicrodetail: 0.72,
      screenCoverage: 0.045,
      triangles: 1400,
      depthExtent: 1.8
    }));
  }
  for (let i = 0; i < 6; i++) {
    objects.push(enhancedObject(`service-bank-${i}`, {
      semanticLayers: ['meso', 'micro', 'surface', 'state', 'props'],
      semanticTags: ['pipe', 'valve', 'panel', 'cable', 'warning-light', 'leak'],
      secondaryParts: 16,
      silhouetteSegments: 26,
      concavity: 0.54,
      materialRegions: 7,
      materialVariation: 0.81,
      surfaceMicrodetail: 0.86,
      functionalComponents: 6,
      screenCoverage: 0.05,
      triangles: 3200
    }));
  }
  objects.push(enhancedObject('reactor-iris', {
    semanticLayers: ['macro', 'meso', 'micro', 'surface', 'state', 'props'],
    semanticTags: ['focal', 'iris', 'lock', 'segments', 'hydraulics', 'emissive'],
    secondaryParts: 20,
    silhouetteSegments: 30,
    concavity: 0.78,
    materialRegions: 8,
    materialVariation: 0.88,
    surfaceMicrodetail: 0.8,
    functionalComponents: 8,
    screenCoverage: 0.12,
    triangles: 7200,
    depthExtent: 2.2
  }));
  objects.push(enhancedObject('survey-instrument', {
    nearCamera: true,
    semanticLayers: ['macro', 'meso', 'micro', 'surface', 'state', 'props'],
    semanticTags: ['grip', 'optic', 'coil', 'housing', 'fasteners', 'display', 'wear'],
    secondaryParts: 22,
    silhouetteSegments: 34,
    concavity: 0.66,
    materialRegions: 8,
    materialVariation: 0.91,
    surfaceMicrodetail: 0.9,
    flatSurfaceRatio: 0.2,
    functionalComponents: 9,
    screenCoverage: 0.2,
    triangles: 12600,
    depthExtent: 1.4
  }));
  for (let i = 0; i < 9; i++) {
    objects.push(enhancedObject(`prop-${i}`, {
      semanticLayers: ['micro', 'surface', 'props'],
      semanticTags: ['debris', 'fixture', i % 2 ? 'cable' : 'plate', 'wear'],
      secondaryParts: 6,
      silhouetteSegments: 14,
      materialRegions: 3,
      materialVariation: 0.58,
      surfaceMicrodetail: 0.66,
      screenCoverage: 0.02,
      triangles: 520
    }));
  }
  return {
    recipeId: recipe.id,
    seed: recipe.seed,
    qualityProfile: 'krieger_class',
    qualityTier: 'KRIEGER_CLASS',
    styleProfile: recipe.styleProfile,
    semantics: recipe.semantics,
    camera: recipe.camera,
    objects,
    lights: [
      {id: 'lamp-a', local: true, emissiveLinked: true, affectedGeometry: 9, responseStrength: 0.82},
      {id: 'lamp-b', local: true, emissiveLinked: true, affectedGeometry: 11, responseStrength: 0.86},
      {id: 'lamp-c', local: true, emissiveLinked: true, affectedGeometry: 10, responseStrength: 0.84},
      {id: 'iris-cyan', local: true, emissiveLinked: true, affectedGeometry: 7, responseStrength: 0.77}
    ],
    lighting: {globalResponse: 0.74},
    composition: {
      depthPlanes: 5,
      depthSpan: 0.92,
      foregroundStrength: 0.9,
      focalHierarchy: 0.88
    },
    performance: {
      drawCalls: 46,
      dpr: device.dpr || 1,
      generationMs: 3.8
    }
  };
}

export function compileQualityScene(recipe, qualityProfile, device = {}) {
  if (!recipe || recipe.id !== 'bridge-vault-alpha') throw new Error('Unsupported quality scene recipe');
  if (qualityProfile === 'primitive') return compilePrimitive(recipe, device);
  if (qualityProfile === 'krieger_class') return compileEnhanced(recipe, device);
  throw new Error(`Unknown quality profile: ${qualityProfile}`);
}
