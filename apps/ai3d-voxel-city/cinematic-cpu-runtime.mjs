/**
 * Optional visual adapter for the EXISTING AI3D city renderer.
 * No new renderer, no fake world state, no collisions. Enable only ?cinematicCpu=1.
 * In production, the Genie/graphics owner can place this same pack at a real geothermal project.
 */
import {budgetFor,createPaintedSky,shouldCullWithHysteresis} from './cinematic-cpu-atmosphere.mjs';
const BASE='/apps/ai3d-voxel-city/cinematic-assets/';
const LIMITS=Object.freeze({low:[1,2],balanced:[0,1,2],high:[0,1,2],ultra:[0,1,2]});
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function levelSelection(distance,tier='balanced',previous=0){
  const low=tier==='low',near=low?42:64,far=low?100:138;
  const hysteresis=7;
  if(previous===0&&distance<near+hysteresis&&!low)return 0;
  if(previous===2&&distance>far-hysteresis)return 2;
  if(distance>=far)return 2;
  return distance>=near||low?1:0;
}
export function allowedLods(tier='balanced'){return LIMITS[tier]||LIMITS.balanced;}
async function checkedAsset(url,record){
  if(!url.startsWith(BASE)||!record.file||url!==BASE+record.file)throw Error('unsafe cinematic asset path');
  const response=await fetch(url);
  if(!response.ok)throw Error('asset HTTP '+response.status+': '+record.file);
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength!==record.bytes)throw Error('asset length mismatch: '+record.file);
  if(globalThis.crypto?.subtle){
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    const hex=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
    if(hex!==record.sha256)throw Error('asset hash mismatch: '+record.file);
  }
  return bytes;
}
function makeSteam(THREE,root,tier){
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d');
  const g=ctx.createRadialGradient(32,32,2,32,32,31);
  g.addColorStop(0,'rgba(220,234,239,0.65)');
  g.addColorStop(.5,'rgba(167,190,205,0.22)');
  g.addColorStop(1,'rgba(140,166,184,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
  const tex=new THREE.CanvasTexture(canvas);
  const list=[],n=budgetFor(tier).steamCount;
  for(let i=0;i<n;i++){
    const mat=new THREE.SpriteMaterial({map:tex,color:0xd7e5ec,opacity:.15,
      depthWrite:false,transparent:true, fog:true});
    const sprite=new THREE.Sprite(mat);
    const isTower=i<n*.65;
    const x=isTower?Math.cos(i*2.4)*4:8+(i%4)*3;
    const z=isTower?Math.sin(i*2.4)*4:Math.sin(i)*2;
    const base=isTower?35:13;
    sprite.position.set(x,base+(i%4),z);
    sprite.scale.set(8+(i%3)*3,9+(i%3)*2,1);
    root.add(sprite);list.push({sprite,x,z,base,index:i});
  }
  return {list,tex};
}
export async function mountCpuPack({THREE,scene,renderer,getCamera,anchor={x:-72,y:0,z:-42},tier}){
  if(!THREE?.LOD||!scene?.add||typeof getCamera!=='function')throw Error('invalid existing renderer adapter');
  const coarse=matchMedia('(pointer:coarse)').matches;
  const quality=tier||((coarse||navigator.hardwareConcurrency<=4)?'low':'balanced');
  const manifestResponse=await fetch(BASE+'cinematic-pack.json',{cache:'no-store'});
  if(!manifestResponse.ok)throw Error('CPU pack manifest HTTP '+manifestResponse.status);
  const manifest=await manifestResponse.json();
  if(manifest.schema!==1||manifest.generator!=='cinematic-cpu-v1'||manifest.assets?.length!==6||
    manifest.status!=='CANDIDATE_NOT_VISUALLY_VERIFIED')throw Error('CPU pack provenance mismatch');
  const {GLTFLoader}=await import('https://unpkg.com/three@0.165.0/examples/jsm/loaders/GLTFLoader.js');
  const loader=new GLTFLoader();
  const priorBackground=scene.background;
  const paintedSky=createPaintedSky(THREE,null,quality);
  scene.background=paintedSky.texture;
  const root=new THREE.Group();root.name='CinematicCPUVisualOnly';
  root.userData.visualOnly=true;root.position.set(anchor.x,anchor.y,anchor.z);
  scene.add(root);
  const group=new THREE.Group();root.add(group);
  const volcanoAnchor=new THREE.Group();
  volcanoAnchor.position.set(-75,-9,-90);root.add(volcanoAnchor);
  // Baked-look accent lights: one cheap key light, ambient fill and one
  // desktop-only lava light; no shadow maps, no volumetric ray marching.
  const fill=new THREE.HemisphereLight(0x9db8d7,0x1c2329,quality==='low'?.82:1.1);
  const key=new THREE.DirectionalLight(0xffca96,quality==='low'?1.2:1.7);
  key.position.set(55,70,90);key.castShadow=false;
  root.add(fill,key);
  if(quality!=='low'){
    const lavaGlow=new THREE.PointLight(0xff6b28,8,145,2);
    lavaGlow.position.set(-75,41,-90);lavaGlow.castShadow=false;root.add(lavaGlow);
  }
  const nodes=[['geothermal-plant',group,1],['volcano',volcanoAnchor,1.1]];
  const loaded={};
  let ready=false;
  try{
    for(const [name,parent,scale] of nodes){
      const lod=new THREE.LOD();lod.name='CPU-'+name;lod.userData.assetLevels=allowedLods(quality);
      for(const level of allowedLods(quality)){
        const record=manifest.assets.find(x=>x.kind===name&&x.lod===level);
        if(!record)throw Error('LOD missing: '+name+'/'+level);
        const data=await checkedAsset(BASE+record.file,record);
        const gltf=await new Promise((resolve,reject)=>loader.parse(data,BASE,resolve,reject));
        const mesh=gltf.scene;
        mesh.name=name+'-LOD'+level;
        mesh.scale.setScalar(scale);
        mesh.traverse(o=>{if(o.isMesh){
          o.castShadow=false;o.receiveShadow=false;
          const m=o.material,ambient=m?.name==='concrete'?[0x7891a2,.55]:
            m?.name==='steel'?[0x58758e,.45]:m?.name==='basalt'?[0x3a4b60,.25]:null;
          // Low-energy cool bounce light baked as emissive floor; a tiny bounded
          // substitute for full real-time GI when the existing day/night system dims lights.
          if(ambient&&m?.emissive){m.emissive.setHex(ambient[0]);m.emissiveIntensity=ambient[1];}
          if(m?.name==='lava'||m?.name==='window')m.emissiveIntensity=4;
        }});
        lod.addLevel(mesh,level===0?0:level===1?110:240);
      }
      parent.add(lod);loaded[name]=lod;
    }
    const steam=makeSteam(THREE,group,quality);
    let lastUpdate=-Infinity,visibility=true,farCount=0,previousFrame=null;
    const frameSamples=[];
    const samplePercentile=q=>{
      if(!frameSamples.length)return null;
      const ordered=frameSamples.slice().sort((a,b)=>a-b);
      return Number(ordered[Math.floor((ordered.length-1)*q)].toFixed(2));
    };
    ready=true;
    const api={
      status:'READY_VISUAL_ONLY_NOT_LIVE_VERIFIED',root,quality,manifest,loaded,
      stats(){
        const level=name=>{const lod=loaded[name];return lod?.userData.assetLevels[lod.getCurrentLevel()];};
        return{status:api.status,quality,
          plantLod:level('geothermal-plant'),volcanoLod:level('volcano'),
          geometryDrawCallUpperBound:Object.entries(loaded).reduce((total,[kind,lod])=>{
            const n=level(kind),entry=manifest.assets.find(a=>a.kind===kind&&a.lod===n);
            return total+(entry?.objects||0);
          },0),
          frameIntervalP50Ms:samplePercentile(.5),frameIntervalP95Ms:samplePercentile(.95),
          frameSampleCount:frameSamples.length,
          fullSceneDrawCalls:renderer?.info?.render?.calls??null,
          fullSceneTriangles:renderer?.info?.render?.triangles??null,
          geometryActuallyCulled:!group.visible,
          gpuFrameTimeMeasured:false,visualOnly:true,collisionIntegrated:false,
          playerVisibilityCertified:false};
      },
      update(now,camera=getCamera()){
        if(!ready||!camera)return;
        if(previousFrame!==null){
          const delta=now-previousFrame;
          if(delta>0&&delta<1000){frameSamples.push(delta);if(frameSamples.length>240)frameSamples.shift();}
        }
        previousFrame=now;
        if(now-lastUpdate<100)return;
        lastUpdate=now;
        // Renderer owns LOD switching; preserve native THREE.LOD distance logic.
        for(const lod of Object.values(loaded))lod.update(camera);
        for(const e of steam.list){
          const t=now*.00017+e.index*.9;
          e.sprite.position.x=e.x+Math.sin(t)*1.4;
          e.sprite.position.z=e.z+Math.cos(t*.67)*1.1;
          e.sprite.position.y=e.base+(t*6)%14;
          e.sprite.material.opacity=.18+.11*(1+Math.sin(t*1.4));
        }
        // Do not fake culling: group visibility is actually turned off past fog distance.
        const d=group.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position);
        const shouldShow=shouldCullWithHysteresis(d,visibility,quality);
        if(shouldShow!==visibility){visibility=shouldShow;group.visible=visibility;}
        farCount++;
      },
      dispose(){ready=false;root.parent?.remove(root);
        if(scene.background===paintedSky.texture)scene.background=priorBackground;
        paintedSky.dispose();
        for(const lod of Object.values(loaded)){lod.traverse(o=>{if(o.isMesh){o.geometry?.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats)m?.dispose();}})}
        for(const e of steam.list)e.sprite.material.dispose();steam.tex.dispose();}
    };
    return api;
  }catch(error){
    root.parent?.remove(root);
    if(scene.background===paintedSky.texture)scene.background=priorBackground;
    paintedSky.dispose();
    throw error;
  }
}
