'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeReferenceFrames}=require('../lib/reference-frame-analyzer');
const {compileVisualGrammar}=require('../lib/reference-visual-grammar');
const {routeReferenceGraphics}=require('../lib/reference-graphics-router');
const {compileReferenceRecipe}=require('../lib/reference-recipe-compiler');
const {planReferenceCorrections}=require('../lib/reference-correction-planner');

function frame(width,height,paint){
  const pixels=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const [r,g,b,a=255]=paint(x,y),i=(y*width+x)*4;
    pixels[i]=r;pixels[i+1]=g;pixels[i+2]=b;pixels[i+3]=a;
  }
  return{width,height,pixels};
}

const gothicA=frame(12,12,(x,y)=>{
  if(y<2)return[8,10,16,255];
  if((x===2||x===6||x===9)&&y>4)return[235,154,52,255];
  if((x+y)%3===0)return[42,44,50,255];
  return[18,20,26,255];
});
const gothicB=frame(12,12,(x,y)=>{
  if(y<2)return[8,10,16,255];
  if((x===3||x===6||x===9)&&y>4)return[245,170,58,255];
  if((x+y+1)%3===0)return[48,48,54,255];
  return[18,20,26,255];
});

test('video-frame analysis extracts temporal and luminous evidence',()=>{
  const stats=analyzeReferenceFrames([gothicA,gothicB]);
  assert.equal(stats.frameCount,2);
  assert(stats.motionEnergy>0);
  assert(stats.darkRatio>0.4);
  assert(stats.edgeDensity>0);
  assert(stats.glowSignal>0);
});

test('gothic voxel hints compile to voxel + PBR + LIGHT routes',()=>{
  const recipe=compileReferenceRecipe({
    frames:[gothicA,gothicB],
    hints:{tags:['3d','voxel','gothic','cathedral','arch','bridge','stone','wet','warm windows','fog'],camera:'fps'}
  });
  assert.equal(recipe.grammar.primaryStyle.id,'voxel');
  assert.equal(recipe.routing.primary.id,'voxel');
  assert(recipe.routing.routes.some(x=>x.id==='pbr'));
  assert(recipe.routing.routes.some(x=>x.id==='light'));
  assert.equal(recipe.recipes.geometry.semanticEnhancer,true);
  assert.equal(recipe.recipes.materials.wetSurface,true);
  assert(recipe.recipes.lighting.fogDensity>0);
  assert.equal(recipe.verification.temporalRequired,true);
});

test('2D pixel reference routes to sprite recipe rather than AI3D',()=>{
  const pixels=frame(8,8,(x,y)=>(x+y)%2?[220,190,120,255]:[35,30,42,255]);
  const recipe=compileReferenceRecipe({frames:[pixels],hints:{tags:['2d','sprite','pixel-art','knight']}});
  assert.equal(recipe.routing.primary.id,'sprite');
  assert.equal(recipe.recipes.geometry.engine,'sprite-intelligence');
  assert(recipe.recipes.geometry.paletteColors<=32);
  assert.equal(recipe.recipes.geometry.semanticPartsRequired,true);
});

test('watercolor lane is explicit blocker when canonical runtime is absent',()=>{
  const stats=analyzeReferenceFrames([gothicA]);
  const grammar=compileVisualGrammar(stats,{tags:['watercolor','ink','2d']});
  const route=routeReferenceGraphics(grammar);
  assert.equal(route.primary.id,'watercolor');
  assert.equal(route.primary.available,false);
  assert(route.blockers.some(x=>x.lane==='watercolor'));
});

test('correction planner fixes camera/structure/light before microdetail',()=>{
  const ref=compileVisualGrammar(analyzeReferenceFrames([gothicA]),{tags:['3d','voxel','gothic','warm windows'],camera:'fps'});
  const runtime=JSON.parse(JSON.stringify(ref));
  runtime.camera.type='isometric';
  runtime.lighting.localEmitters=false;
  runtime.lighting.contrast=0.02;
  runtime.geometry.edgeDensity=0.01;
  const result=planReferenceCorrections(ref,runtime,{structuralFidelity:0.61,identityFidelity:0.72,heroDetailFidelity:0.7});
  assert.equal(result.pass,false);
  assert(result.fixes.some(x=>x.system==='geometry'));
  assert(result.fixes.some(x=>x.system==='camera'));
  assert(result.fixes.some(x=>x.system==='LIGHT'));
  assert(result.fixes[0].priority>=90);
});
