// World_server universal microdetail bootstrap v2.
// Hooks the existing THREE renderer; does not create a second renderer or collision world.
import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';
import {createUniversalVoxelMicrodetail} from './universal-voxel-microdetail.js';

const POLICY_URL='/shared/microdetail-policy.json';
let policy=null;
try{
  const response=await fetch(POLICY_URL,{cache:'force-cache'});
  if(!response.ok)throw new Error(`policy HTTP ${response.status}`);
  policy=await response.json();
}catch(error){
  console.warn('[UVM_V2] disabled safely: policy unavailable',error);
}

if(policy){
  const initialTier=matchMedia('(pointer:coarse)').matches?'BALANCED':'HIGH';
  const runtime=createUniversalVoxelMicrodetail({THREE,policy,initialTier});
  const states=new WeakMap();
  const recordByMesh=new WeakMap();
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));

  window.UniversalVoxelMicrodetail={
    runtime,
    tag(object,semantic,importance=1){
      if(object?.userData&&policy.profiles[semantic]){
        object.userData.microdetailSemantic=semantic;
        object.userData.microdetailImportance=clamp(importance,0,1.5);
      }
      return object;
    },
    stats:()=>runtime.stats()
  };

  function opaqueVertexColorMaterial(material){
    const mats=Array.isArray(material)?material:[material];
    return mats.length===1&&Boolean(mats[0]?.vertexColors)&&!mats[0]?.transparent&&Number(mats[0]?.opacity??1)>=.999;
  }
  function patchMeshMaterials(mesh){
    const semantic=runtime.inferSemantic(mesh);
    mesh.userData=mesh.userData||{};
    if(!mesh.userData.microdetailSemantic)mesh.userData.microdetailSemantic=semantic;
    const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    for(const material of mats)runtime.patchMaterial(material,semantic);
  }
  function registerGeometryRecord(state,mesh,now){
    if(!opaqueVertexColorMaterial(mesh.material)||!runtime.isQuadSurfaceGeometry(mesh.geometry))return null;
    let record=recordByMesh.get(mesh);
    if(record){record.lastSeen=now;return record;}
    mesh.geometry.computeBoundingSphere?.();
    record={
      mesh,baseGeometry:mesh.geometry,detailGeometry:null,detailTier:null,
      localCenter:mesh.geometry.boundingSphere?.center?.clone?.()||new THREE.Vector3(),
      radius:Number(mesh.geometry.boundingSphere?.radius)||0,lastSeen:now,detachedSince:0,
      center:new THREE.Vector3(),distance:Infinity,swapped:false
    };
    recordByMesh.set(mesh,record);state.records.add(record);return record;
  }
  function scanScene(state,scene,now){
    scene.updateMatrixWorld?.(true);
    scene.traverse?.(obj=>{
      if(!obj?.isMesh||obj.userData?.microdetailInternal)return;
      patchMeshMaterials(obj);
      registerGeometryRecord(state,obj,now);
    });
    const cleanupMs=Number(policy.guards.cleanupDetachedAfterMs)||2500;
    for(const record of [...state.records]){
      if(record.mesh.parent){record.detachedSince=0;record.lastSeen=now;continue;}
      if(!record.detachedSince)record.detachedSince=now;
      if(now-record.detachedSince<cleanupMs)continue;
      record.detailGeometry?.dispose?.();state.records.delete(record);
    }
  }

  function activeRecords(state,camera){
    if(!camera||camera.isOrthographicCamera)return[];
    const tier=runtime.tierFor(runtime.getTier()),candidates=[];
    camera.updateMatrixWorld?.();
    for(const record of state.records){
      const mesh=record.mesh;if(!mesh.parent||!mesh.visible)continue;
      record.center.copy(record.localCenter).applyMatrix4(mesh.matrixWorld);
      const centerDistance=camera.position.distanceTo(record.center);
      const surfaceDistance=Math.max(0,centerDistance-Math.min(record.radius,8));
      const importance=clamp(mesh.userData?.microdetailImportance??1,0,1.5);
      const maxDistance=tier.geometryDistance*(.75+.45*importance);
      if(surfaceDistance<=maxDistance){record.distance=surfaceDistance;candidates.push(record);}
    }
    candidates.sort((a,b)=>a.distance-b.distance);
    return candidates.slice(0,tier.maxActiveMeshes);
  }
  function ensureOneDetailGeometry(records){
    const tierName=runtime.getTier();
    for(const record of records){
      if(record.detailTier===tierName)continue;
      const old=record.detailGeometry;
      const p=record.mesh.getWorldPosition(new THREE.Vector3());
      record.detailGeometry=runtime.buildDetailedGeometry(record.baseGeometry,{
        tierName,worldOffset:{x:p.x,y:p.y,z:p.z}
      });
      record.detailTier=tierName;
      old?.dispose?.();
      return;
    }
  }
  function swapForRender(records){
    for(const record of records){
      if(!record.detailGeometry||record.mesh.geometry!==record.baseGeometry)continue;
      record.mesh.geometry=record.detailGeometry;record.swapped=true;
    }
  }
  function restoreAfterRender(records){
    for(const record of records)if(record.swapped){record.mesh.geometry=record.baseGeometry;record.swapped=false;}
  }

  function wrapWorldQualityAutopilot(){
    const api=window.WorldQualityAutopilot;
    if(!api||api.__uvmV2Wrapped||typeof api.registerRenderer!=='function')return false;
    const original=api.registerRenderer.bind(api);
    api.registerRenderer=(name,renderer,options={})=>{
      const initial=policy.tiers[options.initialTier]?options.initialTier:initialTier;
      runtime.setCeiling(initial);
      const onQualityChange=options.onQualityChange,getStats=options.getStats;
      return original(name,renderer,{
        ...options,
        onQualityChange(q){if(q?.tier&&policy.tiers[q.tier])runtime.setCeiling(q.tier);onQualityChange?.(q);},
        getStats(){return{...(getStats?.()||{}),microdetail:runtime.stats()};}
      });
    };
    api.__uvmV2Wrapped=true;return true;
  }
  if(!wrapWorldQualityAutopilot()){
    let attempts=0;
    const timer=setInterval(()=>{if(wrapWorldQualityAutopilot()||++attempts>20)clearInterval(timer);},100);
  }

  const proto=THREE.WebGLRenderer.prototype;
  if(!proto.__uvmV2Patched){
    const originalRender=proto.render;
    Object.defineProperty(proto,'__uvmV2Patched',{value:true,configurable:false});
    proto.render=function(scene,camera){
      const now=performance.now();runtime.tick(now);
      const exact=Boolean(policy.guards.orthographicExactMode&&camera?.isOrthographicCamera);
      runtime.setPresentationMode(exact);
      let state=states.get(this);
      if(!state){state={records:new Set(),lastScan:0};states.set(this,state);}
      const scanEvery=runtime.tierFor(runtime.getTier()).scanIntervalMs;
      if(now-state.lastScan>=scanEvery){scanScene(state,scene,now);state.lastScan=now;}
      const active=exact?[]:activeRecords(state,camera);
      ensureOneDetailGeometry(active);swapForRender(active);
      try{return originalRender.call(this,scene,camera);}
      finally{restoreAfterRender(active);}
    };
  }
  console.info('[UVM_V2] universal voxel microdetail enabled',runtime.stats());
}
