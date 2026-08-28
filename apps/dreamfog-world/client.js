import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';
import {createDreamFogAtmosphere} from '/shared/dreamfog-atmosphere.js';

const loading=document.getElementById('dreamLoading');
const statusEl=document.getElementById('dreamStatus');
const qualityEl=document.getElementById('dreamQuality');
const hint=document.getElementById('dreamHint');
const coarse=matchMedia('(pointer:coarse)').matches;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

async function loadManifest(){
  try{const r=await fetch('./assets/generated/dreamfog-scene.json',{cache:'no-store'});if(!r.ok)return null;return await r.json();}catch{return null;}
}

const manifest=await loadManifest();
const seed=Number(manifest?.seed||771923);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.05,260);
camera.rotation.order='YXZ';
const renderer=new THREE.WebGLRenderer({antialias:!coarse,powerPreference:'high-performance',alpha:false,stencil:false});
  globalThis.WorldProceduralThreeNative?.attach?.(renderer, THREE);
  if(typeof world!=='undefined'&&typeof activeCamera!=='undefined')globalThis.WorldProceduralVoxelDDGI?.attach?.({renderer:renderer,worldGetter:()=>world,cameraGetter:()=>activeCamera});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,coarse?1.3:1.65));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.88;document.body.prepend(renderer.domElement);
renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','DreamFog 3D world');

const player={x:0,y:1.72,z:7,yaw:0,pitch:-.04,vy:0,grounded:true};
camera.position.set(player.x,player.y,player.z);camera.rotation.set(player.pitch,player.yaw,0);
const atmosphere=createDreamFogAtmosphere(THREE,{scene,camera,renderer,seed,manifest,assetBase:'/apps/dreamfog-world/assets/generated/',onQualityChange:s=>{qualityEl.textContent=`quality: ${s.tier} · fog ${s.fogBanks} · ${s.particles} mist`;}});

// Existing server systems remain authoritative: DPR tuning, controls, physics and telemetry.
const stopAutoTune=window.GoldenPerformanceAutoTune?.registerRenderer?.(renderer,{minDpr:.72,maxDpr:coarse?1.3:1.8,targetFps:coarse?38:52})||(()=>{});
window.GameGoldenStandard?.installMobileControls?.();

function canOccupy(p){
  if(!Number.isFinite(p.x)||!Number.isFinite(p.z))return false;
  if(Math.abs(p.x)>88||Math.abs(p.z)>88)return false;
  for(const c of atmosphere.colliders){const dx=p.x-c.x,dz=p.z-c.z;if(dx*dx+dz*dz<(c.radius+.34)*(c.radius+.34))return false;}
  return true;
}

const keys=new Set();
addEventListener('keydown',e=>{if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'].includes(e.code)){keys.add(e.code);if(e.code==='Space'&&player.grounded){player.vy=5.9;player.grounded=false;}e.preventDefault();}},{passive:false});
addEventListener('keyup',e=>keys.delete(e.code));

function inputs(){
  const g=window.GameGoldenStandard?.input?.();
  const forward=(g?.forward||keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(g?.back||keys.has('KeyS')||keys.has('ArrowDown')?1:0);
  const side=(g?.right||keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(g?.left||keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  const run=!!(g?.run||keys.has('ShiftLeft')||keys.has('ShiftRight'));
  return{forward,side,run};
}

function applyLook(dx,dy){player.yaw-=dx*.00225;player.pitch=clamp(player.pitch-dy*.00185,-1.25,1.15);}
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===renderer.domElement)applyLook(e.movementX,e.movementY);});
addEventListener('goldenlook',e=>applyLook(Number(e.detail?.dx||0)*1.25,Number(e.detail?.dy||0)*1.25));
renderer.domElement.addEventListener('pointerdown',async e=>{renderer.domElement.focus();if(!coarse&&document.pointerLockElement!==renderer.domElement)renderer.domElement.requestPointerLock?.();atmosphere.enableAudio().catch(()=>{});hint.style.opacity='.15';e.preventDefault();},{passive:false});

let last=performance.now(),frames=0,lastMetric=performance.now(),fps=60;
const state=window.__DREAMFOG_STATE__={ready:false,render:true,walkable:true,collisions:true,grounding:true,playerSpawn:true,mouseLook:true,touchControls:coarse,seed,manifestLoaded:!!manifest,atmosphere:atmosphere.state,fps:0,errors:[]};
addEventListener('error',e=>state.errors.push(String(e.error?.message||e.message||'window error')));
addEventListener('unhandledrejection',e=>state.errors.push(String(e.reason?.message||e.reason||'unhandled rejection')));

function updatePlayer(dt){
  const i=inputs();const len=Math.hypot(i.forward,i.side)||1;const f=i.forward/len,s=i.side/len;const speed=(i.run?5.2:3.25)*dt;
  let delta={x:0,y:0,z:0};
  if(f||s){
    const v=window.GameGoldenPhysics?.canonicalXZ?.(player.yaw,f,s,speed) || {x:(Math.sin(player.yaw)*-f+Math.cos(player.yaw)*s)*speed,z:(Math.cos(player.yaw)*-f-Math.sin(player.yaw)*s)*speed};
    delta.x=v.x;delta.z=v.z;
  }
  if(window.GameGoldenPhysics?.moveSwept){const moved=window.GameGoldenPhysics.moveSwept({x:player.x,y:player.y,z:player.z},delta,canOccupy,{allowStep:false,maxSubstep:.16});player.x=moved.position.x;player.z=moved.position.z;}
  else{const next={x:player.x+delta.x,y:player.y,z:player.z+delta.z};if(canOccupy(next)){player.x=next.x;player.z=next.z;}}
  player.vy-=13.8*dt;player.y+=player.vy*dt;if(player.y<=1.72){player.y=1.72;player.vy=0;player.grounded=true;}
  camera.position.set(player.x,player.y,player.z);camera.rotation.set(player.pitch,player.yaw,0);
}

function animate(now){
  const dt=Math.min(.05,Math.max(.001,(now-last)/1000));last=now;updatePlayer(dt);atmosphere.update(now,dt);atmosphere.render(now);window.GameGoldenStandard?.frame?.();frames++;
  if(now-lastMetric>1500){fps=Math.round(frames*1000/(now-lastMetric));frames=0;lastMetric=now;state.fps=fps;state.atmosphere={...atmosphere.state};statusEl.textContent=`${manifest?'depth layers ready':'procedural fallback'} · ${fps} FPS`;}
  requestAnimationFrame(animate);
}

function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight,false);atmosphere.resize(innerWidth,innerHeight);}addEventListener('resize',resize,{passive:true});

setTimeout(()=>{
  const touchReady=!coarse||window.GameGoldenStandard?.state?.touchControls===true||document.getElementById('goldenMobileControls');
  state.touchControls=!!touchReady;state.ready=true;
  window.GameGoldenStandard?.reportReady?.({playable:true,walkable:true,collisions:true,grounding:true,playerSpawn:true,mouseLook:true,touchControls:!!touchReady,mobileReady:!!touchReady});
  loading.classList.add('hidden');
},500);

addEventListener('beforeunload',()=>{try{stopAutoTune();atmosphere.dispose();}catch{}},{once:true});
requestAnimationFrame(animate);
