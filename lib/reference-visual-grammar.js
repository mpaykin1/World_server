'use strict';
const {analyzeReference}=require('./reference-video-analyzer');
function has(e,w){const h=[...e.styles,...e.tags,...e.objects].join(' ');return w.some(x=>h.includes(x));}
function inferDimension(e){if(e.dimension==='2d'||e.dimension==='3d')return e.dimension;if(has(e,['pixel','sprite','2d']))return'2d';return'3d';}
function inferStyle(e,d){
  if(has(e,['watercolor','аквар']))return'watercolor';
  if(has(e,['living light','luminous','neon','glow outline']))return'luminous-outline';
  if(has(e,['gothic','гот'])&&has(e,['voxel','вокс']))return'gothic-voxel';
  if(has(e,['voxel','вокс']))return'voxel'; if(has(e,['pixel','пиксел']))return'pixel-art'; if(has(e,['sprite','спрайт']))return'sprite';
  return d==='2d'?'illustrative-2d':'mesh-3d';
}
function inferLighting(e){
  const dark=has(e,['dark','night','black','gothic','тём','ноч']),warm=has(e,['warm','amber','gold','yellow window','тёп','золот']);
  return {contrast:Number.isFinite(Number(e.lighting.contrast))?Number(e.lighting.contrast):dark?.88:.55,ambientLevel:dark?.18:.52,
    fog:has(e,['fog','mist','дым','туман'])||Number(e.lighting.fog)>.25,emissive:warm||Number(e.lighting.emissive)>.25,
    temperature:warm?'warm-local-over-cool-ambient':'reference-derived',shadowSoftness:has(e,['hard shadow','noir'])?.25:.62};
}
function inferMaterials(e,s){
  const m=[]; if(has(e,['stone','gothic','cathedral','кам']))m.push({class:'stone',wet:has(e,['wet','rain','мокр']),roughness:has(e,['wet','мокр'])?.38:.82});
  if(has(e,['metal','steel','steampunk','металл']))m.push({class:'metal',roughness:.42,metalness:.78});
  if(has(e,['wood','дерев']))m.push({class:'wood',roughness:.74,metalness:.02}); if(s==='pixel-art')m.push({class:'pixel-palette',shadingBands:3});
  return m.length?m:[{class:s.includes('voxel')?'stone':'generic',roughness:.72}];
}
function inferCamera(e,d){const mode=e.cameraMode||(has(e,['isometric','iso','изометр'])?'isometric':d==='2d'?'orthographic':'perspective');
  return {mode,fov:mode==='perspective'?(has(e,['wide','широк'])?78:58):null,height:has(e,['low angle','низк'])?'low':has(e,['top down','сверху'])?'high':'reference-derived',
    framingPriority:['hero-silhouette','major-masses','horizon','negative-space']};}
function inferDetail(e,s){return{silhouette:'highest',largeMasses:'highest',semanticArchitecture:s.includes('voxel')||has(e,['city','architecture','город','архит']),
  microdetail:has(e,['detailed','ornate','dense','детал','гот'])?'high':'medium',semanticMarks:has(e,['window','arch','bridge','spire','окн','арк','мост','шпил'])?'high':'medium',
  topologyLinesAllowed:s==='pixel-art'};}
function inferMotion(e){return{source:e.sourceType,types:e.motionTypes,amount:e.motionAmount??0,temporalReference:e.frameCount>1,
  preserveSecondaryMotion:has(e,['cloth','hair','smoke','water','плащ','волос','дым','вода'])};}
function buildVisualGrammar(reference={}){
  const e=analyzeReference(reference),dimension=inferDimension(e),style=inferStyle(e,dimension);
  return{schemaVersion:'1.0.0',source:{type:e.sourceType,frameCount:e.frameCount},dimension,style,tags:e.tags,objects:e.objects,palette:e.palette,
    lighting:inferLighting(e),materials:inferMaterials(e,style),camera:inferCamera(e,dimension),detail:inferDetail(e,style),motion:inferMotion(e),temporal:e.temporal};
}
module.exports={buildVisualGrammar,inferStyle,inferDimension};
