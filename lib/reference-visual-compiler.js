'use strict';
const {buildVisualGrammar}=require('./reference-visual-grammar');
const {routeVisualGrammar}=require('./reference-visual-router');
function materialPlan(g){return g.materials.map((m,i)=>({id:'material-'+(i+1),...m,useExistingProfiler:m.class!=='pixel-palette',
  targetNormalStrength:m.class==='stone' ? 0.62 : 0.45,targetAoStrength:m.class==='pixel-palette'?0:.72}));}
function lightingPlan(g){const l=g.lighting;return{ambientLevel:l.ambientLevel,keyContrast:l.contrast,localEmissive:l.emissive,volumetricFog:l.fog,
  shadowSoftness:l.shadowSoftness,temperature:l.temperature,useLightSystem:g.style==='luminous-outline'};}
function geometryPlan(g,r){const lane=r.primary?.id;if(lane==='voxel-3d')return{representation:'voxel-occupancy',priorities:['silhouette','large-masses','arches-bridges-spires','semantic-microdetail'],walkable:true};
  if(lane==='sprite-2d')return{representation:'sprite-regions',priorities:['silhouette','palette','internal-regions','shading-bands','animation-frames'],walkable:false};
  return{representation:'multi-object-scene',priorities:['silhouette','large-masses','semantic-parts','surface-detail'],walkable:g.dimension==='3d'};}
function verificationPlan(g){return{targetFidelity:.85,dimensions:['silhouette','composition','palette','lighting','material-readability','semantic-detail','camera'],
  temporal:g.motion.temporalReference?['motion-shape','camera-motion','frame-stability','secondary-motion']:[],
  rules:['render-back before claiming fidelity','desktop and mobile measured separately','runtime evidence cannot be replaced by source-code claims','user decides SUCCESS or FAILURE']};}
function compileReferenceVisual(reference={}){
  const grammar=buildVisualGrammar(reference),route=routeVisualGrammar(grammar);
  return{schemaVersion:'1.0.0',status:route.primary?'PLANNED':'BLOCKED',grammar,route,
    plans:{geometry:geometryPlan(grammar,route),materials:materialPlan(grammar),lighting:lightingPlan(grammar),camera:grammar.camera,detail:grammar.detail,motion:grammar.motion,verification:verificationPlan(grammar)},
    executableSystems:[...(route.primary?.systems||[]),...route.auxiliary.flatMap(l=>l.systems||[])],blockers:route.blockers};
}
function planVisualCorrections(t,o={}){
  const f=[];if(o.style&&o.style!==t.style)f.push({priority:100,axis:'style',action:'route toward '+t.style});
  if(Number.isFinite(o.contrast)&&Math.abs(o.contrast-t.lighting.contrast)>.12)f.push({priority:90,axis:'lighting',action:'move contrast toward '+t.lighting.contrast});
  if(o.cameraMode&&o.cameraMode!==t.camera.mode)f.push({priority:85,axis:'camera',action:'use '+t.camera.mode+' camera'});
  if(o.silhouetteFidelity!==undefined&&o.silhouetteFidelity<.85)f.push({priority:95,axis:'silhouette',action:'fix silhouette and large masses before microdetail'});
  if(o.materialReadability!==undefined&&o.materialReadability<.85)f.push({priority:70,axis:'materials',action:'retune roughness/metalness/normal/AO before adding geometry'});
  return f.sort((a,b)=>b.priority-a.priority);
}
module.exports={compileReferenceVisual,planVisualCorrections};
