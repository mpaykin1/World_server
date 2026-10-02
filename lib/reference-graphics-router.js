'use strict';

const DEFAULT_AVAILABILITY=Object.freeze({
  voxel:true,ai3d:true,light:true,sprite:true,watercolor:false
});

function add(result,id,role,reason,available,target){
  result.push({id,role,reason,available:available!==false,target});
}

function routeReferenceGraphics(grammar,availability={}){
  if(!grammar?.primaryStyle?.id)throw new TypeError('Visual grammar required');
  const a={...DEFAULT_AVAILABILITY,...availability},routes=[];
  const primary=grammar.primaryStyle.id;

  if(primary==='watercolor'){
    add(routes,'watercolor','primary','painted/watercolor visual grammar',a.watercolor,'shared/graphics/living-watercolor-*');
  }else if(primary==='sprite'||grammar.dimensionality==='2d'){
    add(routes,'sprite','primary','2D/pixel visual grammar',a.sprite,'scripts/world-sprite-cpu.js');
  }else if(primary==='voxel'||grammar.geometry.blockiness>=0.52){
    add(routes,'voxel','primary','block/voxel visual grammar',a.voxel,'services/ai3d-worker/ai3d/plugins/voxel_city.py');
  }else{
    add(routes,'ai3d','primary','volumetric 3D visual grammar',a.ai3d,'services/ai3d-worker/');
  }

  if(grammar.lighting.localEmitters||primary==='luminous'){
    add(routes,'light','overlay','luminous/emissive edge or bloom grammar',a.light,'shared/light/index.mjs');
  }
  if(grammar.materials.proceduralPbr&&grammar.dimensionality!=='2d'){
    add(routes,'pbr','material','procedural material reconstruction',true,'lib/world-quality-pbr-synthesizer.js');
  }
  add(routes,'fidelity','verification','render-back visual correction loop',true,'lib/reference-fidelity.js');

  return{
    primary:routes.find(r=>r.role==='primary'),
    routes,
    blockers:routes.filter(r=>!r.available).map(r=>({lane:r.id,target:r.target,reason:'canonical runtime unavailable'}))
  };
}

module.exports={routeReferenceGraphics,DEFAULT_AVAILABILITY};
