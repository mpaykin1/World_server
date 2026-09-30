import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeGraphicsQuality, detectPrimitiveGraphics, qualityFingerprint} from '../shared/graphics/graphics-quality-governor.mjs';
import {createQualitySceneRecipe, compileQualityScene} from '../shared/graphics/quality-scene-compiler.mjs';

const recipe = createQualitySceneRecipe(424242);

test('primitive scene fails Krieger hard gates', () => {
  const scene = compileQualityScene(recipe, 'primitive', {dpr: 2});
  const report = analyzeGraphicsQuality(scene);
  assert.equal(report.passed, false);
  for (const gate of ['NEAR_OBJECT_GATE', 'MATERIAL_GATE', 'LIGHTING_GATE', 'ENVIRONMENT_GATE']) {
    assert.equal(report.gates[gate], false, gate);
  }
});

test('enhanced scene improves measurable quality and passes candidate gates', () => {
  const primitive = analyzeGraphicsQuality(compileQualityScene(recipe, 'primitive', {dpr: 2}));
  const enhanced = analyzeGraphicsQuality(compileQualityScene(recipe, 'krieger_class', {dpr: 2}));
  for (const metric of ['spatialDepth', 'silhouetteComplexity', 'semanticDetail', 'secondaryGeometry', 'materialVariation', 'lightingResponse', 'nearObjectComplexity', 'environmentDetail']) {
    assert.ok(enhanced.metrics[metric] > primitive.metrics[metric], metric);
  }
  assert.equal(enhanced.gates.NEAR_OBJECT_GATE, true);
  assert.equal(enhanced.gates.MATERIAL_GATE, true);
  assert.equal(enhanced.gates.LIGHTING_GATE, true);
  assert.equal(enhanced.gates.ENVIRONMENT_GATE, true);
  assert.equal(enhanced.passed, true);
});

test('triangle inflation alone cannot buy a pass', () => {
  const scene = compileQualityScene(recipe, 'primitive', {dpr: 2});
  scene.objects = scene.objects.map(object => ({...object, triangles: 250000}));
  const report = analyzeGraphicsQuality(scene);
  assert.equal(report.gates.NEAR_OBJECT_GATE, false);
  assert.equal(report.gates.MATERIAL_GATE, false);
  assert.equal(report.gates.ENVIRONMENT_GATE, false);
  assert.equal(report.passed, false);
});

test('giant flat primitive fallback is detected', () => {
  const warnings = detectPrimitiveGraphics(compileQualityScene(recipe, 'primitive', {dpr: 2}));
  assert.ok(warnings.some(w => w.code === 'GIANT_FLAT_PRIMITIVE'));
  assert.ok(warnings.some(w => w.code === 'PRIMITIVE_FALLBACK_DOMINANT'));
});

test('quality report is deterministic for same seed/config', () => {
  const a = analyzeGraphicsQuality(compileQualityScene(createQualitySceneRecipe(77), 'krieger_class', {dpr: 2}));
  const b = analyzeGraphicsQuality(compileQualityScene(createQualitySceneRecipe(77), 'krieger_class', {dpr: 2}));
  assert.deepEqual(a, b);
  assert.equal(qualityFingerprint(a), qualityFingerprint(b));
});

test('style profile changes material rules without disabling semantic quality', () => {
  const scene = compileQualityScene(recipe, 'krieger_class', {dpr: 2});
  scene.styleProfile = 'voxel_art';
  scene.objects = scene.objects.map(object => ({...object, materialVariation: 0.22, materialRegions: 2, surfaceMicrodetail: 0.2}));
  const voxel = analyzeGraphicsQuality(scene);
  scene.styleProfile = 'krieger_industrial';
  const krieger = analyzeGraphicsQuality(scene);
  assert.equal(voxel.gates.MATERIAL_GATE, true);
  assert.equal(krieger.gates.MATERIAL_GATE, false);
  assert.equal(voxel.gates.SEMANTIC_DETAIL_GATE, true);
});

test('A/B compiler preserves semantic recipe identity and camera', () => {
  const a = compileQualityScene(recipe, 'primitive', {dpr: 2});
  const b = compileQualityScene(recipe, 'krieger_class', {dpr: 2});
  assert.equal(a.recipeId, b.recipeId);
  assert.equal(a.seed, b.seed);
  assert.deepEqual(a.camera, b.camera);
  assert.deepEqual(a.semantics, b.semantics);
  assert.notDeepEqual(a.objects, b.objects);
});

test('portrait DPR sanity remains a non-compensating gate', () => {
  const scene = compileQualityScene(recipe, 'krieger_class', {dpr: 0.75});
  const report = analyzeGraphicsQuality(scene);
  assert.equal(report.gates.DPR_GATE, false);
  assert.equal(report.passed, false);
});
