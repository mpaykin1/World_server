'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {
  compileWorldEvolutionRecipe,sampleEvolution,evaluateEvolutionQuality,
  containsPrebuiltScenePayload,cleanSeed
}=require('../lib/world-evolution');

const recipePath=path.join(__dirname,'../apps/cube-world-evolution-mvp/recipe.json');
const rawRecipe=JSON.parse(fs.readFileSync(recipePath,'utf8'));

test('recipe compiles to one deterministic cube seed without a prebuilt scene',()=>{
  const a=compileWorldEvolutionRecipe(rawRecipe),b=compileWorldEvolutionRecipe(rawRecipe);
  assert.equal(a.initialSeed,'CUBE');
  assert.equal(a.seed,b.seed);
  assert.equal(containsPrebuiltScenePayload(rawRecipe),false);
  assert.equal(a.timeline.length,9);
});

test('stage progress is monotonic and reaches a final living state',()=>{
  const recipe=compileWorldEvolutionRecipe(rawRecipe);let prior={};
  for(const t of [0,.1,.25,.5,.75,.9,1]){
    const sample=sampleEvolution(recipe,t);
    for(const [name,value] of Object.entries(sample.stages))assert.ok(value>=(prior[name]||0),`${name} regressed at ${t}`);
    prior=sample.stages;
  }
  const end=sampleEvolution(recipe,1);assert.equal(end.complete,true);assert.equal(end.stages.life,1);assert.equal(end.stages.final,1);
});

test('quality governor is stage-aware rather than punishing the intentional opening cube',()=>{
  const recipe=compileWorldEvolutionRecipe(rawRecipe);
  assert.equal(evaluateEvolutionQuality(sampleEvolution(recipe,.05),{}).pass,true);
  assert.deepEqual(evaluateEvolutionQuality(sampleEvolution(recipe,.72),{semanticDetail:.1}).failures,['SEMANTIC_DETAIL_FAIL']);
  assert.ok(evaluateEvolutionQuality(sampleEvolution(recipe,.84),{semanticDetail:.9,materialRichness:.1}).failures.includes('MATERIAL_FAIL'));
  assert.ok(evaluateEvolutionQuality(sampleEvolution(recipe,.91),{semanticDetail:.9,materialRichness:.9,lightingResponse:.1,lifeMotion:.9}).failures.includes('LIGHTING_FAIL'));
});

test('browser generator is deterministic and seed-sensitive',async()=>{
  const runtime=await import(pathToFileURL(path.join(__dirname,'../shared/world-evolution-runtime.mjs')).href);
  const a=runtime.createEvolutionPlan(rawRecipe),b=runtime.createEvolutionPlan(rawRecipe);
  const c=runtime.createEvolutionPlan({...rawRecipe,seed:cleanSeed('another-world')});
  assert.equal(runtime.planSignature(a),runtime.planSignature(b));
  assert.notEqual(runtime.planSignature(a),runtime.planSignature(c));
  assert.ok(a.terrain.length>250);assert.ok(a.biome.grass.length>80);assert.ok(a.architecture.length>=80);
  assert.equal(evaluateEvolutionQuality(sampleEvolution(compileWorldEvolutionRecipe(rawRecipe),1),a.quality).pass,true);
});

test('MVP locks the viewport and loads only recipe-driven evolution code',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../apps/cube-world-evolution-mvp/index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../apps/cube-world-evolution-mvp/app.mjs'),'utf8');
  assert.match(html,/overflow:hidden/);assert.match(html,/overscroll-behavior:none/);assert.match(html,/touch-action:none/);
  assert.match(app,/createEvolutionPlan\(recipe\)/);assert.doesNotMatch(app,/prebuiltScene|sceneData\.json|model\.glb/);
});
