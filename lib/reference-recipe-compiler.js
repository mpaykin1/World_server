'use strict';

const {analyzeReferenceFrames}=require('./reference-frame-analyzer');
const {compileVisualGrammar}=require('./reference-visual-grammar');
const {routeReferenceGraphics}=require('./reference-graphics-router');

const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
const round=(value,digits=3)=>Number((Number(value)||0).toFixed(digits));

function materialRecipe(grammar){
  const wet=grammar.materials.wetSurface;
  const roughness=wet?0.34:grammar.lighting.mode==='low-key'?0.68:0.78;
  return{
    system:'WORLD_MATERIAL_SYNTHESIS',semanticClasses:grammar.materials.semantic,
    roughnessBias:round(roughness),normalStrength:round(0.45+grammar.geometry.edgeDensity*0.9),
    aoStrength:round(0.58+grammar.geometry.edgeDensity*0.55),
    emissiveBias:grammar.lighting.localEmitters?round(0.8+grammar.lighting.glowStrength*2.4):0,
    wetSurface:wet,proceduralOnly:true
  };
}

function lightingRecipe(grammar){
  return{
    system:grammar.lighting.localEmitters?'LIGHT+scene-lighting':'scene-lighting',
    exposure:grammar.lighting.mode==='low-key'?0.82:1,
    contrast:round(clamp(0.9+grammar.lighting.contrast*1.8,0.9,1.65)),
    bloomGain:grammar.lighting.localEmitters?round(clamp(0.8+grammar.lighting.glowStrength*3,0.8,2.2)):0,
    fogDensity:grammar.semantic.tags.some(t=>t.includes('fog'))?0.045:0,
    temperature:grammar.lighting.temperature,
    preserveLocalFalloff:true
  };
}

function voxelRecipe(grammar){
  const detail=grammar.geometry.detailDensity==='high'?160:grammar.geometry.detailDensity==='medium'?128:96;
  return{
    engine:'voxel_city',voxelGridWidth:detail,paletteColors:clamp(grammar.palette.estimatedColors,12,64),
    maxDepth:grammar.geometry.detailDensity==='high'?40:28,structureCell:grammar.geometry.detailDensity==='high'?3:4,
    depthLayers:grammar.geometry.detailDensity==='high'?12:8,foundation:true,
    semanticEnhancer:true,frontProjectionPreserved:true
  };
}

function spriteRecipe(grammar){
  const palette=clamp(Math.round(grammar.palette.estimatedColors||16),4,32);
  return{
    engine:'sprite-intelligence',paletteColors:palette,outline:grammar.geometry.edgeDensity>0.2?'strong':'medium',
    shadingBands:grammar.lighting.contrast>0.22?3:2,alpha:true,
    frameStrategy:grammar.motion.cadence==='active'?'key-pose+inbetweens':'key-pose',
    targetFps:grammar.motion.cadence==='active'?12:grammar.motion.cadence==='moderate'?8:6,
    semanticPartsRequired:true
  };
}

function compileReferenceRecipe({frames,hints={},availability={}}={}){
  const analysis=analyzeReferenceFrames(frames);
  const grammar=compileVisualGrammar(analysis,hints);
  const routing=routeReferenceGraphics(grammar,availability);
  const primary=routing.primary?.id;
  const geometry=primary==='voxel'?voxelRecipe(grammar):primary==='sprite'?spriteRecipe(grammar):{
    engine:primary||'ai3d',semanticDecomposition:true,multiObjectScene:grammar.geometry.architecture.length>1,
    silhouetteFirst:true,detailDensity:grammar.geometry.detailDensity
  };
  return{
    schemaVersion:'1.0.0',analysis,grammar,routing,
    recipes:{
      geometry,materials:materialRecipe(grammar),lighting:lightingRecipe(grammar),
      camera:{...grammar.camera,matchReferenceFraming:true},
      motion:{...grammar.motion,temporalConsistencyRequired:analysis.frameCount>1}
    },
    verification:{
      renderBack:true,referenceFidelity:'lib/reference-fidelity.js',
      visualCritic:'scripts/ai-visual-critic.js',temporalRequired:analysis.frameCount>1,
      userVerdictRequired:true
    }
  };
}

module.exports={compileReferenceRecipe,materialRecipe,lightingRecipe,voxelRecipe,spriteRecipe};
