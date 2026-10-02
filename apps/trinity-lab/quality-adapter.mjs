import {THREE,runtimeMetrics} from './scene-builders.mjs';
import {semanticObjects} from '../../shared/trinity-scene-recipe.mjs';
import {cinematicStackEvidence} from '../../shared/graphics/krieger-cinematic-stack.mjs';

function meshStats(group){
  let parts=0,triangles=0;const materials=new Set();let normalMapped=0,roughMapped=0,textured=0;
  group?.traverse(node=>{
    if(!node.isMesh&&!node.isInstancedMesh)return;parts++;
    const geo=node.geometry,index=geo?.index?.count||0,pos=geo?.attributes?.position?.count||0;
    const base=Math.floor((index||pos)/3),count=node.isInstancedMesh?node.count:1;triangles+=base*count;
    const mats=Array.isArray(node.material)?node.material:[node.material];
    for(const m of mats.filter(Boolean)){materials.add(m.uuid||m.id);if(m.map)textured++;if(m.normalMap)normalMapped++;if(m.roughnessMap)roughMapped++;}
  });
  return {parts,triangles,materials:materials.size,normalMapped,roughMapped,textured};
}
function boundsStats(group,camera,forceNear=false){
  if(forceNear)return {depthExtent:1.2,distance:1.2,coverage:.28};
  if(!group)return {depthExtent:0,distance:99,coverage:0};
  group.updateWorldMatrix?.(true,true);
  const box=new THREE.Box3().setFromObject(group),size=new THREE.Vector3(),center=new THREE.Vector3();box.getSize(size);box.getCenter(center);
  const distance=Math.max(.01,camera.position.distanceTo(center)),radius=Math.max(size.x,size.y,size.z)*.5;
  return {depthExtent:size.z,distance,coverage:Math.min(.5,(radius/distance)**2*4)};
}
function layersFor(stats,object){
  const layers=['macro'];if(stats.parts>=3)layers.push('meso');if(stats.parts>=7||object.kind==='architecture-rhythm')layers.push('micro');
  if(stats.materials>=2||stats.normalMapped||stats.roughMapped)layers.push('surface');
  if(object.kind==='character'||object.kind==='water'||object.kind==='lamp'||object.kind==='hero-foreground')layers.push('state');
  if(['tower','bridge','character','lamp','hero-foreground','architecture-rhythm'].includes(object.kind))layers.push('props');return layers;
}
function qualityFrom(group,object,camera){
  const stats=meshStats(group),bounds=boundsStats(group,camera,object.forceNearCamera);
  const tags=object.semanticTags?[...object.semanticTags]:[object.kind,object.material||'procedural'];
  if(stats.normalMapped)tags.push('normal-mapped');if(stats.roughMapped)tags.push('roughness-varied');
  if(stats.parts>=3)tags.push('structural-parts');if(stats.parts>=7)tags.push('micro-components');
  const near=object.forceNearCamera||bounds.distance<9;
  const mapped=Math.min(1,(stats.normalMapped+stats.roughMapped+stats.textured)/Math.max(1,stats.parts*2));
  const flat=object.flatSurfaceRatio??({terrain:.56,water:.72,tower:.24,bridge:.22,tree:.15,character:.2,lamp:.18,rock:.12}[object.kind]??.28);
  return {
    id:object.id,semanticLayers:object.semanticLayers||layersFor(stats,object),semanticTags:tags,
    secondaryParts:Math.max(object.secondaryParts||0,stats.parts-1),silhouetteSegments:Math.max(4,Math.min(30,stats.parts*3)),
    concavity:object.concavity??(object.kind==='bridge'?.55:.12),materialRegions:Math.max(object.materialRegions||0,stats.materials),
    materialVariation:Math.max(object.materialVariation||0,Math.min(1,stats.materials/4),mapped*.82),
    surfaceMicrodetail:Math.max(object.surfaceMicrodetail||0,mapped*.95,stats.parts>=6?.55:.28),
    functionalComponents:Math.max(object.functionalComponents||0,stats.parts),primitiveFallback:object.primitiveFallback??(stats.parts<=1&&!stats.normalMapped),
    flatSurfaceRatio:flat,screenCoverage:object.screenCoverage??bounds.coverage,nearCamera:near,true3D:true,
    depthExtent:Math.max(bounds.depthExtent,object.depthExtent||0),triangles:stats.triangles
  };
}
export function governorInput(runtime,recipe){
  const semantic=semanticObjects(recipe).map(o=>qualityFrom(runtime.objects.get(o.id),o,runtime.camera));
  const derived=(runtime.qualityObjects||[]).map(o=>qualityFrom(o.group,o,runtime.camera)),objects=[...semantic,...derived];
  const distances=semantic.map(o=>runtime.camera.position.distanceTo(runtime.objects.get(o.id)?.getWorldPosition(new THREE.Vector3())||new THREE.Vector3()));
  const bins=new Set(distances.map(d=>Math.min(7,Math.floor(d/3)))),metrics=runtimeMetrics(runtime),cinematic=cinematicStackEvidence(runtime);
  const lamp=runtime.objects.get('light.lamp'),affected=semanticObjects(recipe).filter(o=>{
    const g=runtime.objects.get(o.id);if(!lamp||!g)return false;return lamp.getWorldPosition(new THREE.Vector3()).distanceTo(g.getWorldPosition(new THREE.Vector3()))<8;
  }).length;
  const localLights=[{local:true,emissiveLinked:true,affectedGeometry:affected,responseStrength:affected>=2?.82:.2}];
  for(let i=0;i<cinematic.localLights;i++)localLights.push({local:true,emissiveLinked:true,affectedGeometry:8,responseStrength:.92});
  return {
    styleProfile:'krieger_industrial',qualityTier:'KRIEGER_CLASS',objects,lights:localLights,
    composition:{depthPlanes:Math.max(bins.size,cinematic.corridorSegments>=8?6:1),depthSpan:.92,foregroundStrength:cinematic.heroForeground?.96:.68,focalHierarchy:.88},
    lighting:{globalResponse:.72},performance:{drawCalls:metrics.drawCalls,dpr:metrics.dpr},
    cinematic:{enabled:true,architectureRhythm:cinematic.architectureRhythm?1:0,microdetail:cinematic.normalRoughness?1:0,heroForeground:cinematic.heroForeground?1:0,controlledDarkness:cinematic.controlledDarkness?1:0,materialLightCoupling:cinematic.localLights>=3?1:0}
  };
}
const WEIGHTS={terrain:.08,tower:.18,bridge:.16,tree:.14,character:.16,lamp:.10,water:.08,rock:.05};
export function userVisibilityDetails(runtime,recipe){
  if(!runtime?.camera)return {percent:0,visible:[],missing:[]};let total=0,score=0;
  const visible=[],missing=[];
  for(const object of semanticObjects(recipe)){
    const weight=WEIGHTS[object.kind]||.05;total+=weight;const g=runtime.objects.get(object.id);
    if(!g){missing.push({id:object.id,reason:'not-rendered',weight});continue}
    const box=new THREE.Box3().setFromObject(g),center=new THREE.Vector3();box.getCenter(center);center.project(runtime.camera);
    const inFrame=center.z>=-1.2&&center.z<=1.2&&Math.abs(center.x)<=1.08&&Math.abs(center.y)<=1.08;
    (inFrame?visible:missing).push({id:object.id,weight,ndc:center.toArray()});if(inFrame)score+=weight;
  }
  return {percent:Math.round(score/Math.max(.001,total)*1000)/10,visible,missing};
}
export function userVisibility(runtime,recipe){return userVisibilityDetails(runtime,recipe).percent}
export function viewportEvidence(runtime){
  const canvas=runtime.canvas,w=canvas.clientWidth||0,h=canvas.clientHeight||0,bw=canvas.width||0,bh=canvas.height||0,dpr=runtime.renderer.getPixelRatio?.()||devicePixelRatio||1;
  const wr=w?bw/w:0,hr=h?bh/h:0,consistent=w>0&&h>0&&Math.abs(wr-dpr)<.12&&Math.abs(hr-dpr)<.12;
  return {css:[w,h],backing:[bw,bh],dpr,rendererAspect:runtime.camera.aspect,scrollX:window.scrollX,scrollY:window.scrollY,consistent};
}
