import * as THREE from "three";
import {GLTFLoader} from "./vendor/GLTFLoader.js";
import {assetLod,validVoxelManifest} from "../../shared/graphics/voxel-art-contract.mjs";

const stage=document.getElementById("stage"),status=document.getElementById("status");
const mobile=matchMedia("(pointer:coarse)").matches,loader=new GLTFLoader();
const roots={new:"../voxel-world/voxel-art/",old:"./old/"};
const scene=new THREE.Scene();scene.background=new THREE.Color(0x91bad0);
const camera=new THREE.OrthographicCamera(-5,5,5,-5,.1,160);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"low-power"});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.2:1.65));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;stage.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xcde6f9,0x465a35,2.3));
const sunlight=new THREE.DirectionalLight(0xffe3ad,3);sunlight.position.set(5,12,8);sunlight.castShadow=true;
sunlight.shadow.mapSize.set(1024,1024);sunlight.shadow.camera.left=-12;sunlight.shadow.camera.right=12;
sunlight.shadow.camera.top=12;sunlight.shadow.camera.bottom=-12;scene.add(sunlight);

const manifests={},cache=new Map(),semanticCache=new Map(),mixers=[];
let current=null,debugGroup=null,activeKind="barren",version="new",lod=0,animation=true,semantic=false;
let yaw=-.65,elevation=.60,zoom=1,span=5.3,distance=15,target=new THREE.Vector3(0,1.4,0);
const pointers=new Map();let previousPinch=0;const clock=new THREE.Clock();

function resize(){
  const w=innerWidth,h=innerHeight,aspect=w/h;
  camera.left=-span*aspect;camera.right=span*aspect;camera.top=span;camera.bottom=-span;
  camera.zoom=zoom;camera.updateProjectionMatrix();renderer.setSize(w,h);
}
function orbit(){
  camera.position.set(target.x+Math.sin(yaw)*distance*Math.cos(elevation),
    target.y+Math.sin(elevation)*distance,target.z+Math.cos(yaw)*distance*Math.cos(elevation));
  camera.lookAt(target);
}
function fit(group){
  const box=new THREE.Box3().setFromObject(group),size=new THREE.Vector3();box.getSize(size);box.getCenter(target);
  const max=Math.max(size.x,size.y,size.z,1);span=Math.max(2.0,max*.72);distance=Math.max(9,max*3.0);zoom=1;
  resize();orbit();
}
addEventListener("resize",resize);resize();orbit();
function clampZoom(value){return Math.max(.55,Math.min(3.4,value));}
renderer.domElement.addEventListener("wheel",event=>{
  event.preventDefault();zoom=clampZoom(zoom*Math.exp(-event.deltaY*.0012));resize();
},{passive:false});
renderer.domElement.addEventListener("pointerdown",event=>{
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});renderer.domElement.setPointerCapture(event.pointerId);
  if(pointers.size===2){const p=[...pointers.values()];previousPinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}
});
renderer.domElement.addEventListener("pointermove",event=>{
  const old=pointers.get(event.pointerId);if(!old)return;
  const next={x:event.clientX,y:event.clientY};pointers.set(event.pointerId,next);
  if(pointers.size===1){
    yaw-=(next.x-old.x)*.008;elevation=Math.max(.12,Math.min(1.28,elevation-(next.y-old.y)*.006));orbit();
  }else if(pointers.size===2){
    const p=[...pointers.values()],now=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
    if(previousPinch>2){zoom=clampZoom(zoom*(now/previousPinch));resize();}previousPinch=now;
  }
});
function release(event){pointers.delete(event.pointerId);if(pointers.size<2)previousPinch=0;}
renderer.domElement.addEventListener("pointerup",release);renderer.domElement.addEventListener("pointercancel",release);

async function fetchManifest(which){
  const response=await fetch(roots[which]+"manifest.json");if(!response.ok)throw new Error(which+" manifest HTTP "+response.status);
  const data=await response.json();if(!validVoxelManifest(data))throw new Error("Некорректный "+which+" manifest");
  manifests[which]=new Map(data.entities.map(asset=>[asset.type,asset]));
}
async function getAsset(kind,which,requestedLod){
  const meta=manifests[which]?.get(kind);if(!meta)throw new Error("Отсутствует "+which+" модель: "+kind);
  const effective=which==="new"?requestedLod:0,entry=which==="new"?assetLod(meta,effective):meta;
  const key=which+":"+kind+":"+effective;
  if(!cache.has(key))cache.set(key,loader.loadAsync(roots[which]+entry.file).catch(error=>{cache.delete(key);throw error;}));
  return {gltf:await cache.get(key),meta,entry,effective};
}
async function getSemantic(kind){
  if(semanticCache.has(kind))return semanticCache.get(kind);
  const meta=manifests.new?.get(kind);if(!meta?.semantic)return null;
  const promise=fetch(roots.new+meta.semantic.file).then(async response=>{
    if(!response.ok)throw new Error("semantic HTTP "+response.status);return response.json();
  });
  semanticCache.set(kind,promise);return promise;
}
function clearDebug(){if(debugGroup&&current)current.remove(debugGroup);debugGroup=null;}
async function drawDebug(){
  clearDebug();if(!semantic||version!=="new"||!current)return;
  const requested=current,userKind=activeKind,userLod=lod,graph=await getSemantic(userKind);
  if(!graph||current!==requested||version!=="new"||lod!==userLod||!semantic)return;
  debugGroup=new THREE.Group();debugGroup.name="SemanticDebug";
  for(const feature of graph.features){
    if(!feature.bounds||!feature.lodPresence?.includes(userLod))continue;
    const [lo,hi]=feature.bounds,unit=.22;
    const box=new THREE.Box3(
      new THREE.Vector3((lo[0]-.5)*unit,(lo[2]-.5)*unit,(lo[1]-.5)*unit),
      new THREE.Vector3((hi[0]+.5)*unit,(hi[2]+.5)*unit,(hi[1]+.5)*unit));
    const color=feature.detail===1?0xffcc66:feature.detail===2?0x4fe0d0:0xff6fa8;
    const helper=new THREE.Box3Helper(box,color);helper.userData.semanticFeatureId=feature.id;debugGroup.add(helper);
  }
  current.add(debugGroup);
}
function stopMixers(){while(mixers.length)mixers.pop().stopAllAction();}
async function show(){
  const requested={kind:activeKind,version,lod};status.textContent="Загрузка "+requested.kind+"…";
  try{
    const {gltf,meta,entry,effective}=await getAsset(requested.kind,requested.version,requested.lod);
    if(activeKind!==requested.kind||version!==requested.version||lod!==requested.lod)return;
    if(current)scene.remove(current);clearDebug();stopMixers();
    current=gltf.scene.clone(true);current.name="Viewer_"+requested.version+"_"+requested.kind+"_LOD"+effective;
    current.traverse(node=>{if(node.isMesh){node.castShadow=!mobile;node.receiveShadow=true;}});
    scene.add(current);
    if(gltf.animations.length){
      const mixer=new THREE.AnimationMixer(current);for(const clip of gltf.animations)mixer.clipAction(clip).play();
      mixer.timeScale=animation?1:0;mixers.push(mixer);
    }
    fit(current);await drawDebug();
    const triangles=entry.triangles??meta.triangles,features=requested.version==="new"?meta.semantic?.featureCount:null;
    status.textContent=[requested.kind,requested.version==="new"?"NEW 10×":"OLD 1×","LOD"+effective,
      triangles?triangles+" tris":null,entry.bytes?Math.round(entry.bytes/1024)+" КБ":null,
      features?features+" semantic features":null,semantic&&version==="old"?"OLD: semantic graph отсутствует":null].filter(Boolean).join(" · ");
    document.querySelectorAll("[data-kind]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.kind===activeKind)));
    document.querySelectorAll("[data-version]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.version===version)));
    document.querySelectorAll("[data-lod]").forEach(b=>b.setAttribute("aria-pressed",String(Number(b.dataset.lod)===lod)));
  }catch(error){status.textContent="Ошибка модели: "+error.message;}
}
document.getElementById("choices").addEventListener("click",event=>{
  const kind=event.target.closest("[data-kind]")?.dataset.kind;if(kind){activeKind=kind;void show();}
});
document.getElementById("versions").addEventListener("click",event=>{
  const next=event.target.closest("[data-version]")?.dataset.version;if(next){version=next;void show();}
});
document.getElementById("lods").addEventListener("click",event=>{
  const next=event.target.closest("[data-lod]")?.dataset.lod;if(next!==undefined){lod=Number(next);void show();}
});
document.getElementById("animation").addEventListener("click",event=>{
  animation=!animation;event.currentTarget.setAttribute("aria-pressed",String(animation));mixers.forEach(m=>m.timeScale=animation?1:0);
});
document.getElementById("semantic").addEventListener("click",event=>{
  semantic=!semantic;event.currentTarget.setAttribute("aria-pressed",String(semantic));void drawDebug();
});
window.__voxelViewerStats=()=>({
  kind:activeKind,version,lod,animation,semantic,zoom,
  debugBoxes:debugGroup?.children.length||0,
  cacheEntries:cache.size,semanticCacheEntries:semanticCache.size,
  render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,points:renderer.info.render.points},
});

async function start(){
  try{await Promise.all([fetchManifest("new"),fetchManifest("old")]);await show();}
  catch(error){status.textContent="Viewer startup error: "+error.message;}
}
function frame(){
  const dt=Math.min(clock.getDelta(),.05);for(const mixer of mixers)mixer.update(dt);
  renderer.render(scene,camera);
}
renderer.setAnimationLoop(frame);start();
