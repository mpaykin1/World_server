import {GLTFLoader} from "https://unpkg.com/three@0.165.0/examples/jsm/loaders/GLTFLoader.js";
import {assetLod,lodForDistance,planVoxelPlacements,validVoxelManifest} from "../../shared/graphics/voxel-art-contract.mjs";

// Optional renderer: ?voxelArt=1. Standard simulation/collision renderer stays authoritative.
export function installWorldVoxelArt({THREE,worldGroup,heightAt,camera,assetRoot="/apps/voxel-world/voxel-art/"}){
  const mobile=matchMedia("(pointer:coarse)").matches,maxEntities=mobile?6:10;
  const loader=new GLTFLoader(),cache=new Map(),semanticCache=new Map(),instances=new Map();
  const clock=new THREE.Clock();let generation=0,manifest=null,failed=null;
  const ready=fetch(assetRoot+"manifest.json",{cache:"force-cache"}).then(async response=>{
    if(!response.ok)throw new Error("Voxel art manifest HTTP "+response.status);
    const data=await response.json();if(!validVoxelManifest(data))throw new Error("Invalid voxel-art manifest");
    manifest=new Map(data.entities.map(entry=>[entry.type,entry]));return manifest;
  }).catch(error=>{failed=error;console.warn("Voxel art fallback:",error);return null;});

  function load(type,lod=0){
    const meta=manifest?.get(type);if(!meta)return Promise.resolve(null);
    const resolved=meta.lods?Math.max(0,Math.min(2,lod|0)):0,key=type+":"+resolved;
    if(!cache.has(key)){
      const asset=assetLod(meta,resolved);
      cache.set(key,loader.loadAsync(assetRoot+asset.file).catch(error=>{
        cache.delete(key);console.warn("Voxel art model failed:",key,error);return null;
      }));
    }
    return cache.get(key);
  }
  function loadSemantic(type){
    if(semanticCache.has(type))return semanticCache.get(type);
    const meta=manifest?.get(type);
    if(!meta?.semantic)return Promise.resolve(null);
    const promise=fetch(assetRoot+meta.semantic.file,{cache:"force-cache"}).then(async response=>{
      if(!response.ok)throw new Error("Semantic HTTP "+response.status);
      const graph=await response.json();
      if(graph?.kind!==type||!Array.isArray(graph.features))throw new Error("Invalid semantic graph");
      return graph;
    }).catch(error=>{console.warn("Voxel semantic metadata failed:",type,error);return null;});
    semanticCache.set(type,promise);return promise;
  }
  function setMeshQuality(group){
    group.traverse(node=>{if(node.isMesh){node.castShadow=!mobile;node.receiveShadow=true;}});
  }
  function positionGroup(group,p){
    const sample=[[0,0],[2,0],[-2,0],[0,2],[0,-2]].map(([dx,dz])=>heightAt(p.x+dx,p.z+dz));
    const finite=sample.filter(Number.isFinite),ground=finite.length?Math.max(...finite):22;
    group.position.set(p.x,ground+.35,p.z);group.scale.setScalar(Math.max(1,Math.min(5,p.radius/7)));
  }
  function startMixer(gltf,group,lod){
    if(lod!==0||!gltf.animations.length)return null;
    const mixer=new THREE.AnimationMixer(group);
    for(const clip of gltf.animations){const action=mixer.clipAction(clip);action.setLoop(THREE.LoopRepeat);action.play();}
    return mixer;
  }
  function clearEntry(entry){
    entry.mixer?.stopAllAction();worldGroup.remove(entry.group);
  }
  async function replaceLod(entry,desired){
    if(entry.loadingLod!==null||desired===entry.lod)return;
    const token=generation;entry.loadingLod=desired;
    const gltf=await load(entry.type,desired);
    if(!gltf||token!==generation||instances.get(entry.id)!==entry){entry.loadingLod=null;return;}
    const next=gltf.scene.clone(true);next.name="WorldVoxelArt_"+entry.type+"_"+entry.id+"_LOD"+desired;
    setMeshQuality(next);positionGroup(next,entry);
    const wasVisible=entry.group.visible;next.visible=wasVisible;
    const mixer=startMixer(gltf,next,desired);
    worldGroup.add(next);clearEntry(entry);
    entry.group=next;entry.mixer=mixer;entry.lod=desired;entry.loadingLod=null;
  }
  function clear(){
    generation++;for(const entry of instances.values())clearEntry(entry);instances.clear();
  }
  async function update(emergenceState){
    const version=++generation;if(!await ready||version!==generation)return false;
    const placements=planVoxelPlacements(emergenceState,maxEntities),incoming=new Map(placements.map(p=>[p.id,p]));
    for(const [id,entry] of [...instances]){
      const p=incoming.get(id);
      if(!p||p.type!==entry.type||p.x!==entry.x||p.z!==entry.z){clearEntry(entry);instances.delete(id);}
    }
    for(const p of placements){
      if(instances.has(p.id))continue;
      const dx=p.x-camera.position.x,dz=p.z-camera.position.z,meta=manifest.get(p.type);
      const initialLod=meta?.lods?lodForDistance(Math.hypot(dx,dz),{mobile}):0;
      const gltf=await load(p.type,initialLod);if(!gltf||version!==generation)continue;
      const group=gltf.scene.clone(true);group.name="WorldVoxelArt_"+p.type+"_"+p.id+"_LOD"+initialLod;
      setMeshQuality(group);positionGroup(group,p);worldGroup.add(group);
      const mixer=startMixer(gltf,group,initialLod);
      instances.set(p.id,{...p,group,mixer,lod:initialLod,loadingLod:null});
    }
    return true;
  }
  function tick(){
    const elapsed=Math.min(clock.getDelta(),.05),cutoff=mobile?90:160;
    for(const entry of instances.values()){
      const dx=entry.x-camera.position.x,dz=entry.z-camera.position.z,distance=Math.hypot(dx,dz);
      const visible=distance<cutoff;entry.group.visible=visible;if(!visible)continue;
      const meta=manifest?.get(entry.type),desired=meta?.lods?lodForDistance(distance,{mobile,current:entry.lod}):0;
      if(desired!==entry.lod)void replaceLod(entry,desired);
      entry.mixer?.update(elapsed);
    }
  }
  return{
    ready,update,tick,clear,semantic:loadSemantic,getError:()=>failed,
    stats:()=>{
      const lods={0:0,1:0,2:0};for(const entry of instances.values())lods[entry.lod]=(lods[entry.lod]||0)+1;
      return{loaded:cache.size,semantics:semanticCache.size,instances:instances.size,lods,failed:failed?.message||null};
    },
  };
}
