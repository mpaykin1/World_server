import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Living Watercolor runtime avoids per-frame random rerolls',()=>{
  const src=fs.readFileSync(new URL('../shared/graphics/living-watercolor-3d.js',import.meta.url),'utf8');
  assert.match(src,/stableSeed/);assert.match(src,/coherentWobble/);assert.doesNotMatch(src,/Math\.random\s*\(/);
  assert.match(src,/goldenqualitychange/);assert.match(src,/__livingWatercolorOutline/);
});

test('diagnostic app exposes a machine-readable readiness marker',()=>{
  const src=fs.readFileSync(new URL('../apps/living-watercolor-3d/client.js',import.meta.url),'utf8');
  assert.match(src,/__LIVING_WATERCOLOR_3D_READY__/);
  for(const feature of ['watercolor-wash-shader','irregular-ink-shell','coherent-brush-smoke','artistic-lod','orthographic-illustration-camera','organic-geometry','reference-shaped-generators','semantic-ink-strokes','reference-fidelity-gate'])assert.match(src,new RegExp(feature));
});

test('v2 avoids technical wireframe rendering and keeps the reference gate explicit',()=>{
  const app=fs.readFileSync(new URL('../apps/living-watercolor-3d/client.js',import.meta.url),'utf8');
  const generators=fs.readFileSync(new URL('../shared/graphics/living-watercolor-generators.js',import.meta.url),'utf8');
  const gate=fs.readFileSync(new URL('../shared/graphics/living-watercolor-reference-gate.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/wireframe\s*:\s*true/);assert.doesNotMatch(generators,/EdgesGeometry/);
  assert.match(generators,/OrthographicCamera/);assert.match(generators,/deformGeometryOrganic/);assert.match(gate,/score>=85/);
});

test('watercolor lab remains deny-by-default diagnostic',()=>{
  const registry=JSON.parse(fs.readFileSync(new URL('../data/app-release-registry.json',import.meta.url),'utf8'));
  const app=registry.apps['living-watercolor-3d'];
  assert.ok(app);assert.equal(app.visible,false);assert.equal(app.status,'diagnostic');assert.equal(app.kind,'diagnostic');
});
