import {THREE,runtimeMetrics} from './scene-builders.mjs';
import {semanticObjects} from '../../shared/trinity-scene-recipe.mjs';

function meshStats(group){
  let parts=0,triangles=0;const materials=new Set();
  group?.traverse(node=>{
    if(!node.isMesh&&!node.isInstancedMesh)return;parts++;
    const geo=node.geometry,index=geo?.index?.count||0,pos=geo?.attributes?.position?.count||0;
    const base=Math.floor((index||pos)/3),count=node.isInstancedMesh?node.count:1;triangles+=base*count;
    if(Array.isArray(node.material))node.material.forEach(m=>materials.add(m.uuid||m.id));else if(node.material)materials.add(node.material.uuid||node.material.id);
  });
  return {parts,triangles,materials:materials.size};
}
function boundsStats(group,camera){
  if(!group)return {depthExtent:0,distance:99,coverage:0};
  const box=new THREE.Box3().setFromObject(group),size=new THREE.Vector3(),center=new THREE.Vector3();box.getSize(size);box.getCenter(center);
  const distance=Math.max(.01,camera.position.distanceTo(center)),radius=Math.max(size.x,size.y,size.z)*.5;
  return {depthExtent:size.z,distance,coverage:Math.min(.5,(radius/distance)**2*4)};
}
function layersFor(stats,object){
  const layers=['macro'];if(stats.parts>=3)layers.push('meso');if(stats.parts>=7)layers.push('micro');
  if(stats.materials>=2)layers.push('surface');if(object.kind==='character'||object.kind==='water'||object.kind==='lamp')layers.push('state');
  if(['tower','bridge','character','lamp'].includes(object.kind))layers.push('props');return layers;
}
function objectQuality(group,object,camera){
  const stats=meshStats(group),bounds=boundsStats(group,camera),tags=[object.kind,object.material||'procedural'];
  const near=bounds.distance<9,flat={terrain:.72,water:.78,tower:.34,bridge:.28,tree:.15,character:.2,lamp:.18,rock:.12}[object.kind]??.35;
  return {
    id:object.id,semanticLayers:layersFor(stats,object),semanticTags:tags,secondaryParts:Math.max(0,stats.parts-1),
    silhouetteSegments:Math.max(4,Math.min(24,stats.parts*3)),concavity:object.kind==='bridge'?.55:.12,
    materialRegions:stats.materials,materialVariation:Math.min(1,stats.materials/4),surfaceMicrodetail:stats.parts>=6?.55:.28,
    functionalComponents:stats.parts,primitiveFallback:stats.parts<=1,flatSurfaceRatio:flat,screenCoverage:bounds.coverage,
    nearCamera:near,true3D:true,depthExtent:bounds.depthExtent,triangles:stats.triangles
  };
}
export function governorInput(runtime,recipe){
  const objects=semanticObjects(recipe).map(o=>objectQuality(runtime.objects.get(o.id),o,runtime.camera));
  const distances=objects.map(o=>runtime.camera.position.distanceTo(runtime.objects.get(o.id)?.getWorldPosition(new THREE.Vector3())||new THREE.Vector3()));
  const bins=new Set(distances.map(d=>Math.min(4,Math.floor(d/4)))),metrics=runtimeMetrics(runtime);
  const lamp=runtime.objects.get('light.lamp'),affected=semanticObjects(recipe).filter(o=>{
    const g=runtime.objects.get(o.id);if(!lamp||!g)return false;return lamp.getWorldPosition(new THREE.Vector3()).distanceTo(g.getWorldPosition(new THREE.Vector3()))<8;
  }).length;
  return {
    styleProfile:'krieger_industrial',qualityTier:'KRIEGER_CLASS',objects,
    lights:[{local:true,emissiveLinked:true,affectedGeometry:affected,responseStrength:affected>=2?.82:.2}],
    composition:{depthPlanes:Math.max(1,bins.size),depthSpan:Math.min(1,(Math.max(...distances)-Math.min(...distances))/18),foregroundStrength:.68,focalHierarchy:.72},
    lighting:{globalResponse:.72},performance:{drawCalls:metrics.drawCalls,dpr:metrics.dpr}
  };
}
const WEIGHTS={terrain:.08,tower:.18,bridge:.16,tree:.14,character:.16,lamp:.10,water:.08,rock:.05};
export function userVisibility(runtime,recipe){
  if(!runtime?.camera)return 0;let total=0,visible=0;
  for(const object of semanticObjects(recipe)){
    const weight=WEIGHTS[object.kind]||.05;total+=weight;const g=runtime.objects.get(object.id);if(!g)continue;
    const box=new THREE.Box3().setFromObject(g),center=new THREE.Vector3();box.getCenter(center);center.project(runtime.camera);
    if(center.z>=-1.2&&center.z<=1.2&&Math.abs(center.x)<=1.08&&Math.abs(center.y)<=1.08)visible+=weight;
  }
  return Math.round(visible/Math.max(.001,total)*1000)/10;
}
export function viewportEvidence(runtime){
  const canvas=runtime.canvas,w=canvas.clientWidth||0,h=canvas.clientHeight||0,bw=canvas.width||0,bh=canvas.height||0,dpr=runtime.renderer.getPixelRatio?.()||devicePixelRatio||1;
  const wr=w?bw/w:0,hr=h?bh/h:0,consistent=w>0&&h>0&&Math.abs(wr-dpr)<.12&&Math.abs(hr-dpr)<.12;
  return {css:[w,h],backing:[bw,bh],dpr,rendererAspect:runtime.camera.aspect,scrollX:window.scrollX,scrollY:window.scrollY,consistent};
}
