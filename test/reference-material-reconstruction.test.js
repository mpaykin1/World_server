'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {colorInt,reconstructReferenceMaterials:r}=require('../lib/reference-material-reconstruction');
test('reference materials reuse canonical profiler and PBR synthesis',()=>{
  const out=r({style:'gothic-voxel',tags:['wet stone','warm windows'],palette:['#29262a','#c98743','#55705a']});
  assert.equal(out.profiles[0].materialClass,'stone');assert.equal(out.profiles[0].roughness,.38);
  assert.ok(out.profiles.some(x=>['emissive','vegetation','metal','stone','wood'].includes(x.materialClass)));
  assert.ok(out.textureBudget.virtualMegapixels>0);
});
test('material reconstruction handles hex numeric and empty evidence',()=>{
  assert.equal(colorInt('#ff00aa'),0xff00aa);assert.equal(colorInt(0x112233),0x112233);
  const empty=r({});assert.equal(empty.profiles[0].materialClass,'generic');assert.equal(empty.source,'semantics-or-fallback');
});
test('semantic material priors cover wood and metal',()=>{
  assert.equal(r({tags:['old wood']}).profiles[0].materialClass,'wood');
  assert.equal(r({tags:['rusted metal']}).profiles[0].materialClass,'metal');
});
