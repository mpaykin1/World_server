import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';

const CHUNK = 16;
const WORLD_Y = 96;
const SEA = 22;
const VIEW = matchMedia('(pointer:coarse)').matches ? 2 : 3;
const REACH = 6.2;
const PLAYER_H = 1.78;
const PLAYER_R = 0.31;
const GRAVITY = 25;
const JUMP = 8.4;
const WALK = 5.2;
const RUN = 8.0;
const SAVE_INTERVAL = 1800;
const NET_INTERVAL = 90;
const WORLD_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const requestedWorldId = new URLSearchParams(location.search).get('world') || 'main';
const ACTIVE_WORLD_ID = WORLD_ID_RE.test(requestedWorldId) ? requestedWorldId : 'main';

const BLOCK = Object.freeze({ AIR:0, GRASS:1, DIRT:2, STONE:3, SAND:4, WOOD:5, LEAVES:6, SNOW:7, WATER:8, GLASS:9, BRICK:10, PLANK:11, COAL:12, IRON:13 });
const BLOCKS = {
  0:{name:'Воздух',color:0x000000,solid:false},
  1:{name:'Трава',color:0x5f9f43,solid:true},
  2:{name:'Земля',color:0x795238,solid:true},
  3:{name:'Камень',color:0x777d82,solid:true},
  4:{name:'Песок',color:0xd8c17a,solid:true},
  5:{name:'Дерево',color:0x80522e,solid:true},
  6:{name:'Листва',color:0x3d7d38,solid:true,alpha:.9},
  7:{name:'Снег',color:0xe9f4ff,solid:true},
  8:{name:'Вода',color:0x3f8fe8,solid:false,alpha:.58},
  9:{name:'Стекло',color:0xb8e9f4,solid:true,alpha:.45},
 10:{name:'Кирпич',color:0xa44c3d,solid:true},
 11:{name:'Доски',color:0xb6884d,solid:true},
 12:{name:'Уголь',color:0x35383b,solid:true},
 13:{name:'Железо',color:0xb7a89b,solid:true}
};
const HOTBAR = [BLOCK.GRASS,BLOCK.DIRT,BLOCK.STONE,BLOCK.SAND,BLOCK.WOOD,BLOCK.PLANK,BLOCK.GLASS,BLOCK.BRICK,BLOCK.SNOW];

const loading = document.getElementById('loading');
const statusEl = document.getElementById('vwStatus');
const biomeEl = document.getElementById('vwBiome');
const playersEl = document.getElementById('vwPlayers');
const targetEl = document.getElementById('targetInfo');
const titleEl = document.getElementById('vwTitle');
const loreEl = document.getElementById('vwLore');
const hotbarEl = document.getElementById('hotbar');

function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function floorDiv(v,d){ return Math.floor(v/d); }
function mod(v,d){ return ((v%d)+d)%d; }
function key3(x,y,z){ return `${x},${y},${z}`; }
function key2(x,z){ return `${x},${z}`; }
function validBlockType(value){ const n=Number(value); return Number.isInteger(n)&&Object.prototype.hasOwnProperty.call(BLOCKS,n)?n:null; }
function finiteCoord(value,limit=1000000){ const n=Number(value); return Number.isFinite(n)&&Math.abs(n)<=limit?n:null; }
function uuid(){ return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);}); }
function guestId(){ let id=localStorage.getItem('webgl_hub_guest_id'); if(!id){id=uuid();localStorage.setItem('webgl_hub_guest_id',id);} return id; }
function token(){ return localStorage.getItem('webgl_hub_token') || ''; }
async function api(action,payload={}){
  const headers={'Content-Type':'application/json','Accept':'application/json'}; const t=token(); if(!t)return null; headers.Authorization=`Bearer ${t}`;
  const r=await fetch('/api/voxel',{method:'POST',headers,body:JSON.stringify({action,guestId:guestId(),...payload})});
  const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||'Ошибка Voxel API'); return j;
}

async function canonApi(eventType,summary,payload,idempotencyKey){
  const headers={'Content-Type':'application/json','Accept':'application/json'}; const t=token(); if(t) headers.Authorization=`Bearer ${t}`;
  const r=await fetch('/api/canon',{method:'POST',headers,body:JSON.stringify({action:'record',guestId:guestId(),worldId:ACTIVE_WORLD_ID,eventType,summary,payload,idempotencyKey})});
  const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||'Canon API error'); return j;
}

function hash32(x,z,seed){ let h=(Math.imul(x,374761393)^Math.imul(z,668265263)^seed)|0; h=Math.imul(h^(h>>>13),1274126177); return ((h^(h>>>16))>>>0)/4294967295; }
function smooth(t){ return t*t*(3-2*t); }
function valueNoise(x,z,scale,seed){
  const fx=x/scale,fz=z/scale,x0=Math.floor(fx),z0=Math.floor(fz),tx=smooth(fx-x0),tz=smooth(fz-z0);
  const a=hash32(x0,z0,seed),b=hash32(x0+1,z0,seed),c=hash32(x0,z0+1,seed),d=hash32(x0+1,z0+1,seed);
  const ab=a+(b-a)*tx, cd=c+(d-c)*tx; return ab+(cd-ab)*tz;
}
function fbm(x,z,seed){ return valueNoise(x,z,72,seed)*.52+valueNoise(x,z,31,seed+97)*.28+valueNoise(x,z,13,seed+197)*.14+valueNoise(x,z,6,seed+313)*.06; }
let worldSeed=73194217;
let worldTheme='mixed';
function biomeAt(x,z){ const t=valueNoise(x,z,180,worldSeed+900), m=valueNoise(x,z,150,worldSeed+1400); if(worldTheme==='desert')return t>.14?'desert':'plains'; if(worldTheme==='snow')return t<.86?'snow':'plains'; if(worldTheme==='forest')return m>.18?'forest':'plains'; if(worldTheme==='mountains')return t<.72?'snow':'plains'; if(worldTheme==='islands')return m>.72?'forest':'plains'; if(t>.72)return 'desert'; if(t<.22)return 'snow'; if(m>.62)return 'forest'; return 'plains'; }
function heightAt(x,z){
  const b=biomeAt(x,z), n=fbm(x,z,worldSeed), ridge=Math.abs(valueNoise(x,z,105,worldSeed+77)-.5)*2;
  let h=16+n*21; if(worldTheme==='mountains')h=20+n*25+ridge*20; else if(worldTheme==='islands')h=9+n*17-ridge*4; else if(b==='snow')h+=ridge*15; else if(b==='desert')h=17+n*11; else if(b==='forest')h+=4;
  return clamp(Math.floor(h),5,WORLD_Y-12);
}
function caveAt(x,y,z){ if(y<4||y>55) return false; const a=valueNoise(x+y*7,z-y*5,22,worldSeed+2600); const b=valueNoise(x-y*3,z+y*9,11,worldSeed+2800); return a>.72&&b>.58; }
function oreAt(x,y,z){ const r=hash32(x*7+y*17,z*11-y*5,worldSeed+3200); if(y<18&&r>.982) return BLOCK.IRON; if(y<36&&r>.972) return BLOCK.COAL; return BLOCK.STONE; }

const scene=new THREE.Scene(); scene.background=new THREE.Color(0x7fbced); scene.fog=new THREE.Fog(0x7fbced,45,VIEW*CHUNK*2.15);
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.05,420);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'}); renderer.setPixelRatio(Math.min(devicePixelRatio,1.65)); renderer.setSize(innerWidth,innerHeight); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace; document.body.prepend(renderer.domElement);
const sun=new THREE.DirectionalLight(0xfff1d2,2.1); sun.position.set(45,70,20); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-55;sun.shadow.camera.right=55;sun.shadow.camera.top=55;sun.shadow.camera.bottom=-55; scene.add(sun);
const hemi=new THREE.HemisphereLight(0xbfe1ff,0x31412c,1.15); scene.add(hemi);
window.GoldenPaintingAtmosphere?.registerThree({THREE,scene,renderer,getCamera:()=>camera,worldId:'voxel-world'});
window.WorldQualityAutopilot?.registerRenderer('voxel-world',renderer,{initialTier:matchMedia('(pointer:coarse)').matches?'BALANCED':'HIGH',targetFps:matchMedia('(pointer:coarse)').matches?40:55,onQualityChange(q){renderer.shadowMap.enabled=q.shadowQuality>0;const shadowSize=q.shadowQuality>1?1024:512;if(sun?.shadow?.mapSize){sun.shadow.mapSize.set(shadowSize,shadowSize);sun.shadow.needsUpdate=true}},getStats(){return{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}}});
const worldGroup=new THREE.Group(); scene.add(worldGroup);
const remoteGroup=new THREE.Group(); scene.add(remoteGroup);

const solidMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,metalness:0,side:THREE.FrontSide});
const transparentMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.65,transparent:true,opacity:.62,depthWrite:false,side:THREE.DoubleSide});
const waterMaterial=new THREE.MeshStandardMaterial({color:0x3f9fe0,roughness:.20,metalness:.03,emissive:0x04131c,emissiveIntensity:.08,transparent:true,opacity:.62,depthWrite:false,side:THREE.DoubleSide});
let goldenWaterUniforms=null;
waterMaterial.userData.goldenWaterShader=true;
waterMaterial.onBeforeCompile=shader=>{
  shader.uniforms.goldenWaterTime={value:0};
  shader.uniforms.goldenWaterStrength={value:matchMedia('(pointer:coarse)').matches?.52:1};
  goldenWaterUniforms=shader.uniforms;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGoldenWaterWorld;');
  shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvGoldenWaterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vGoldenWaterWorld;\nuniform float goldenWaterTime;\nuniform float goldenWaterStrength;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\nfloat gwWave=sin(vGoldenWaterWorld.x*.31+goldenWaterTime*.78)*cos(vGoldenWaterWorld.z*.37-goldenWaterTime*.61);\nfloat gwFine=sin((vGoldenWaterWorld.x+vGoldenWaterWorld.z)*.83+goldenWaterTime*1.14);\nfloat gwMix=clamp(.48+(gwWave*.11+gwFine*.035)*goldenWaterStrength,0.,1.);\nvec3 gwDeep=vec3(.035,.22,.38),gwShallow=vec3(.18,.56,.78);\ndiffuseColor.rgb=mix(gwDeep,gwShallow,gwMix);`);
  const outputNeedle='#include <opaque_fragment>';
  if(shader.fragmentShader.includes(outputNeedle))shader.fragmentShader=shader.fragmentShader.replace(outputNeedle,`float gwFresnel=pow(1.0-clamp(abs(dot(normalize(normal),normalize(vViewPosition))),0.0,1.0),2.25);\noutgoingLight+=vec3(.20,.48,.68)*gwFresnel*.34*goldenWaterStrength;\n${outputNeedle}`);
};

const FACE=[
 {d:[1,0,0],v:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],shade:.9},
 {d:[-1,0,0],v:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]],shade:.82},
 {d:[0,1,0],v:[[0,1,0],[0,1,1],[1,1,1],[1,1,0]],shade:1.05},
 {d:[0,-1,0],v:[[0,0,1],[0,0,0],[1,0,0],[1,0,1]],shade:.62},
 {d:[0,0,1],v:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]],shade:.94},
 {d:[0,0,-1],v:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]],shade:.76}
];

class ChunkData{
  constructor(cx,cz){ this.cx=cx;this.cz=cz;this.blocks=new Uint8Array(CHUNK*WORLD_Y*CHUNK);this.meshes=[];this.ready=false; }
  idx(lx,y,lz){ return (y*CHUNK+lz)*CHUNK+lx; }
  get(lx,y,lz){ if(lx<0||lz<0||lx>=CHUNK||lz>=CHUNK||y<0||y>=WORLD_Y) return BLOCK.AIR; return this.blocks[this.idx(lx,y,lz)]; }
  set(lx,y,lz,b){ if(lx<0||lz<0||lx>=CHUNK||lz>=CHUNK||y<0||y>=WORLD_Y) return; this.blocks[this.idx(lx,y,lz)]=b; }
}
const chunks=new Map();
const overrides=new Map();
const requested=new Set();
let streamBusy=false;

const trustedScienceRuns = new Map();
let scienceNavigatorTimeout = null;
const SCIENCE_FX_CAP = matchMedia('(pointer:coarse)').matches ? 12 : 28;
const activeScienceFx = [];
const SCIENCE_PRODUCTION_HOSTS = ['survival-hub.vercel.app', 'webgl-survival-hub.vercel.app'];

function isProductionEnvironment() {
  return SCIENCE_PRODUCTION_HOSTS.includes(location.hostname);
}

function scienceDomainRuntimeEnabled(runId, domain) {
  const run = trustedScienceRuns.get(runId);
  if (!run || !run.active) return false;
  const cfg = run.domains?.[domain];
  if (!cfg) return false;
  if (isProductionEnvironment()) {
    return cfg.stage === 'production-enabled' && cfg.runtime?.production === true;
  }
  return (cfg.stage === 'experimental' || cfg.stage === 'verified-runtime' || cfg.stage === 'production-enabled') && cfg.runtime?.preview === true;
}

function scienceRunForDestroyedBlock(blockType, scienceEvents = []) {
  for (const science of Array.isArray(scienceEvents) ? scienceEvents : []) {
    const run = trustedScienceRuns.get(String(science?.runId || ''));
    if (run?.active && (run.eligibleBlockTypes || []).includes(blockType)) return run;
  }
  return null;
}

function emitScienceDomainTelemetry(runId, domain, phase) {
  if (!runId || !domain) return;
  window.dispatchEvent(new CustomEvent('world:science-domain', {
    detail: { runId, domain, phase }
  }));
}

function spawnDestructionFx(runId, pos, blockType) {
  if (!scienceDomainRuntimeEnabled(runId, 'visualDestruction')) return;
  const color = BLOCKS[blockType]?.color || 0xa44c3d;
  const geom = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1 });
  const count = matchMedia('(pointer:coarse)').matches ? 4 : 8;
  for (let i = 0; i < count; i++) {
    if (activeScienceFx.length >= SCIENCE_FX_CAP) {
      const old = activeScienceFx.shift();
      if (old?.mesh) { scene.remove(old.mesh); old.mesh.geometry.dispose(); old.mesh.material.dispose(); }
    }
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(
      pos.x + 0.5 + (Math.random() - 0.5) * 0.5,
      pos.y + 0.5 + (Math.random() - 0.5) * 0.5,
      pos.z + 0.5 + (Math.random() - 0.5) * 0.5
    );
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 3.2,
      1.8 + Math.random() * 2.5,
      (Math.random() - 0.5) * 3.2
    );
    scene.add(mesh);
    activeScienceFx.push({ mesh, vel, life: 0, maxLife: 0.6 + Math.random() * 0.4, type: 'debris' });
  }
}

function spawnRecoveryFx(runId, effect) {
  if (!scienceDomainRuntimeEnabled(runId, 'recoveryAnimation')) return;
  const color = BLOCKS[effect.blockType]?.color || 0x5f9f43;
  const geom = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const count = matchMedia('(pointer:coarse)').matches ? 3 : 6;
  for (let i = 0; i < count; i++) {
    if (activeScienceFx.length >= SCIENCE_FX_CAP) {
      const old = activeScienceFx.shift();
      if (old?.mesh) { scene.remove(old.mesh); old.mesh.geometry.dispose(); old.mesh.material.dispose(); }
    }
    const mesh = new THREE.Mesh(geom, mat);
    const target = new THREE.Vector3(effect.x + 0.5, effect.y + 0.5, effect.z + 0.5);
    mesh.position.copy(target).add(new THREE.Vector3(
      (Math.random() - 0.5) * 1.8,
      (Math.random() - 0.5) * 1.8,
      (Math.random() - 0.5) * 1.8
    ));
    scene.add(mesh);
    activeScienceFx.push({ mesh, target, speed: 2.2 + Math.random() * 1.5, life: 0, maxLife: 0.7, type: 'mote' });
  }
}

function updateScienceFx(now, dt) {
  for (let i = activeScienceFx.length - 1; i >= 0; i--) {
    const fx = activeScienceFx[i];
    fx.life += dt;
    if (fx.life >= fx.maxLife) {
      scene.remove(fx.mesh);
      fx.mesh.geometry.dispose();
      fx.mesh.material.dispose();
      activeScienceFx.splice(i, 1);
      continue;
    }
    if (fx.type === 'debris') {
      fx.vel.y -= 12 * dt;
      fx.mesh.position.addScaledVector(fx.vel, dt);
      fx.mesh.rotation.x += 4 * dt;
      fx.mesh.rotation.y += 6 * dt;
    } else if (fx.type === 'mote') {
      fx.mesh.position.lerp(fx.target, Math.min(1, dt * fx.speed * 3));
      if (fx.mesh.material) fx.mesh.material.opacity = Math.max(0, 1 - fx.life / fx.maxLife);
    }
  }
}

function ensureScienceNavigatorHud() {
  let el = document.getElementById('vwScienceHud');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'vwScienceHud';
  el.style.cssText = 'position:fixed;bottom:78px;left:50%;transform:translateX(-50%);z-index:40;max-width:min(90vw,620px);padding:10px 14px;background:rgba(8,12,18,0.88);border:1px solid rgba(212,162,94,0.45);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,0.45);color:#f3d7ab;font-family:Inter,system-ui,sans-serif;display:none;pointer-events:none;backdrop-filter:blur(8px);';
  el.innerHTML = '<div style="font-size:11px;letter-spacing:0.08em;color:#d4a25e;margin-bottom:3px;font-weight:700;">НАВИГАТОР (5 ЛЕТ)</div><div id="vwScienceBody" style="font-size:14px;line-height:1.35;white-space:pre-line;"></div><div id="vwScienceNote" style="font-size:11px;line-height:1.3;color:#a38b68;margin-top:4px;border-top:1px solid rgba(212,162,94,0.2);padding-top:4px;display:none;"></div>';
  document.body.appendChild(el);
  return el;
}

function showScienceNavigator(text, note = '') {
  if (!text) return;
  const hud = ensureScienceNavigatorHud();
  const body = document.getElementById('vwScienceBody');
  const noteEl = document.getElementById('vwScienceNote');
  if (body) body.textContent = text;
  if (noteEl) {
    noteEl.textContent = note;
    noteEl.style.display = note ? 'block' : 'none';
  }
  hud.style.display = 'block';
  if (scienceNavigatorTimeout) clearTimeout(scienceNavigatorTimeout);
  scienceNavigatorTimeout = setTimeout(() => { hud.style.display = 'none'; }, 9000);
}

function bounded(v, min = 0, max = 1) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}

function emitScienceTelemetry(science) {
  const telemetry = science?.telemetry || {};
  const safe = {
    runId: String(science.runId || telemetry.runId || 'RUN_000').slice(0, 16),
    phase: String(science.phase || telemetry.phase || 'unknown').slice(0, 24),
    effectCount: bounded(telemetry.effectCount, 0, 16),
    localNodes: bounded(telemetry.localNodes, 0, 512),
    beforeLcc: bounded(telemetry.beforeLcc, 0, 1),
    afterLcc: bounded(telemetry.afterLcc, 0, 1),
    cycleClosures: bounded(telemetry.cycleClosures, 0, 4)
  };
  try { window.Sentry?.addBreadcrumb?.({ category: 'science-gameplay', message: safe.runId, data: safe, level: 'info' }); } catch {}
  window.dispatchEvent(new CustomEvent('world:science-gameplay', { detail: safe }));
}

function announceScience(science) {
  if (!science) return;
  showScienceNavigator(science.navigator?.text, science.navigator?.scienceNote);
  emitScienceTelemetry(science);
}

function cacheScienceRuns(runs) {
  trustedScienceRuns.clear();
  for (const run of Array.isArray(runs) ? runs : []) {
    if (run?.active && /^RUN_\d{3}$/.test(String(run.runId || ''))) trustedScienceRuns.set(run.runId, run);
  }
}

function announceTrustedScienceSignal(signal) {
  const run = trustedScienceRuns.get(String(signal?.runId || ''));
  if (!run) return;
  const text = signal?.phase === 'damage' ? run.navigator?.damage : run.navigator?.regrow;
  showScienceNavigator(text, run.navigator?.scienceNote);
}

function applyScienceResult(science) {
  if (!science) return;
  let recoveryAnimated = false;
  for (const effect of science.effects || []) {
    const b = validBlockType(effect?.blockType);
    const x = finiteCoord(effect?.x), y = finiteCoord(effect?.y, 320), z = finiteCoord(effect?.z);
    if (b === null || x === null || y === null || z === null || !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) continue;
    setBlockLocal(x, y, z, b);
    if (Array.isArray(science.domainSignals) && science.domainSignals.includes('recoveryAnimation') && scienceDomainRuntimeEnabled(science.runId, 'recoveryAnimation')) {
      spawnRecoveryFx(science.runId, effect);
      recoveryAnimated = true;
    }
    if (channel) void channel.send({ type: 'broadcast', event: 'block_set', payload: { x, y, z, block: b } });
  }
  if (recoveryAnimated) emitScienceDomainTelemetry(science.runId, 'recoveryAnimation', science.phase || 'regrow');
  announceScience(science);
  if (channel) void channel.send({
    type: 'broadcast', event: 'science_event',
    payload: { runId: science.runId, phase: science.phase, telemetry: science.telemetry }
  });
}

function showScienceIntro(run) {
  if (!run?.active || !run?.navigator?.intro) return;
  const introKey = `science_intro_${run.runId}`;
  if (sessionStorage.getItem(introKey)) return;
  sessionStorage.setItem(introKey, '1');
  showScienceNavigator(run.navigator.intro, run.navigator.scienceNote || '');
}

function generateChunkData(c,rows=[]){
  const bx=c.cx*CHUNK,bz=c.cz*CHUNK;
  for(let lx=0;lx<CHUNK;lx++) for(let lz=0;lz<CHUNK;lz++){
    const x=bx+lx,z=bz+lz,h=heightAt(x,z),biome=biomeAt(x,z);
    for(let y=0;y<=Math.max(h,SEA);y++){
      let b=BLOCK.AIR;
      if(y>h){ if(y<=SEA) b=BLOCK.WATER; }
      else if(caveAt(x,y,z)) b=BLOCK.AIR;
      else if(y===h) b=biome==='desert'?BLOCK.SAND:biome==='snow'?BLOCK.SNOW:BLOCK.GRASS;
      else if(y>h-4) b=biome==='desert'?BLOCK.SAND:BLOCK.DIRT;
      else b=oreAt(x,y,z);
      c.set(lx,y,lz,b);
    }
    const treeChance=hash32(x,z,worldSeed+5100);
    const canTree=(biome==='forest'&&treeChance>.89)||(biome==='plains'&&treeChance>.975);
    if(canTree&&h>SEA+1&&lx>2&&lz>2&&lx<CHUNK-3&&lz<CHUNK-3){
      const th=4+(hash32(x,z,worldSeed+5200)*3|0);
      for(let y=h+1;y<=h+th&&y<WORLD_Y;y++) c.set(lx,y,lz,BLOCK.WOOD);
      for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=-2;dy<=1;dy++){
        if(Math.abs(dx)+Math.abs(dz)+(dy===1?1:0)>4) continue; const yy=h+th+dy; if(yy>0&&yy<WORLD_Y&&c.get(lx+dx,yy,lz+dz)===BLOCK.AIR)c.set(lx+dx,yy,lz+dz,BLOCK.LEAVES);
      }
    }
  }
  for(const r of rows){ const b=validBlockType(r.block_type); if(b===null||!Number.isInteger(r.x)||!Number.isInteger(r.y)||!Number.isInteger(r.z)||r.y<0||r.y>=WORLD_Y) continue; const lx=mod(r.x,CHUNK),lz=mod(r.z,CHUNK); c.set(lx,r.y,lz,b); overrides.set(key3(r.x,r.y,r.z),b); }
  c.ready=true; return c;
}

function blockAt(x,y,z){
  if(y<0||y>=WORLD_Y) return y<0?BLOCK.STONE:BLOCK.AIR;
  const ov=overrides.get(key3(x,y,z)); if(ov!==undefined) return ov;
  const c=chunks.get(key2(floorDiv(x,CHUNK),floorDiv(z,CHUNK))); if(c?.ready) return c.get(mod(x,CHUNK),y,mod(z,CHUNK));
  const h=heightAt(x,z),biome=biomeAt(x,z); if(y>h) return y<=SEA?BLOCK.WATER:BLOCK.AIR; if(caveAt(x,y,z)) return BLOCK.AIR; if(y===h) return biome==='desert'?BLOCK.SAND:biome==='snow'?BLOCK.SNOW:BLOCK.GRASS; if(y>h-4)return biome==='desert'?BLOCK.SAND:BLOCK.DIRT; return oreAt(x,y,z);
}
function isOccluding(b){ return b!==BLOCK.AIR&&b!==BLOCK.WATER&&BLOCKS[b]?.alpha===undefined; }

function pushFace(arr,x,y,z,face,color){
  const base=arr.pos.length/3; const col=new THREE.Color(color); col.multiplyScalar(face.shade);
  for(const v of face.v){arr.pos.push(x+v[0],y+v[1],z+v[2]);arr.col.push(col.r,col.g,col.b);} arr.idx.push(base,base+1,base+2,base,base+2,base+3);
}
function makeGeometry(data){ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(data.pos,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(data.col,3)); g.setIndex(data.idx); g.computeVertexNormals(); g.computeBoundingSphere(); return g; }
function rebuildChunk(c){
  for(const m of c.meshes){ worldGroup.remove(m); m.geometry.dispose(); } c.meshes=[];
  const solid={pos:[],col:[],idx:[]}, translucent={pos:[],col:[],idx:[]}, water={pos:[],col:[],idx:[]}; const bx=c.cx*CHUNK,bz=c.cz*CHUNK;
  for(let lx=0;lx<CHUNK;lx++)for(let lz=0;lz<CHUNK;lz++)for(let y=0;y<WORLD_Y;y++){
    const b=c.get(lx,y,lz); if(b===BLOCK.AIR) continue; const gx=bx+lx,gz=bz+lz;
    for(const f of FACE){ const nb=blockAt(gx+f.d[0],y+f.d[1],gz+f.d[2]); let visible=false;
      if(b===BLOCK.WATER) visible=nb!==BLOCK.WATER&&nb===BLOCK.AIR;
      else if(BLOCKS[b]?.alpha!==undefined) visible=nb===BLOCK.AIR||nb===BLOCK.WATER;
      else visible=!isOccluding(nb)||BLOCKS[nb]?.alpha!==undefined;
      if(!visible) continue; const dst=b===BLOCK.WATER?water:(BLOCKS[b]?.alpha!==undefined?translucent:solid); pushFace(dst,lx,y,lz,f,BLOCKS[b].color);
    }
  }
  for(const [data,mat] of [[solid,solidMaterial],[translucent,transparentMaterial],[water,waterMaterial]]) if(data.idx.length){ const m=new THREE.Mesh(makeGeometry(data),mat);m.position.set(bx,0,bz);m.receiveShadow=true;m.castShadow=mat===solidMaterial;c.meshes.push(m);worldGroup.add(m); }
}
function setBlockLocal(x,y,z,b){
  const safe=validBlockType(b); if(safe===null||!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(z)||y<0||y>=WORLD_Y)return false;
  overrides.set(key3(x,y,z),safe); const cx=floorDiv(x,CHUNK),cz=floorDiv(z,CHUNK),c=chunks.get(key2(cx,cz)); if(c){c.set(mod(x,CHUNK),y,mod(z,CHUNK),safe);rebuildChunk(c);} const lx=mod(x,CHUNK),lz=mod(z,CHUNK); if(lx===0)chunks.get(key2(cx-1,cz))&&rebuildChunk(chunks.get(key2(cx-1,cz))); if(lx===15)chunks.get(key2(cx+1,cz))&&rebuildChunk(chunks.get(key2(cx+1,cz))); if(lz===0)chunks.get(key2(cx,cz-1))&&rebuildChunk(chunks.get(key2(cx,cz-1))); if(lz===15)chunks.get(key2(cx,cz+1))&&rebuildChunk(chunks.get(key2(cx,cz+1))); return true;
}

function materializeChunkBatch(need, by=new Map()){
  for(const q of need){
    const k=key2(q.x,q.z),c=generateChunkData(new ChunkData(q.x,q.z),by.get(k)||[]);
    chunks.set(k,c);rebuildChunk(c);
  }
}
async function loadNeededChunks(){
  if(streamBusy) return; const pcx=floorDiv(player.pos.x,CHUNK),pcz=floorDiv(player.pos.z,CHUNK),need=[];
  outer: for(let r=0;r<=VIEW;r++) for(let dx=-r;dx<=r;dx++) for(let dz=-r;dz<=r;dz++){ if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;const cx=pcx+dx,cz=pcz+dz,k=key2(cx,cz);if(!chunks.has(k)&&!requested.has(k)){requested.add(k);need.push({x:cx,z:cz});if(need.length>=8)break outer;} }
  if(!need.length)return; streamBusy=true;
  try{
    if(backendMode==='offline') materializeChunkBatch(need);
    else {
      const res=await api('chunks',{chunks:need,worldId:ACTIVE_WORLD_ID}); const by=new Map();
      for(const row of res.blocks||[]){const k=key2(row.cx,row.cz);if(!by.has(k))by.set(k,[]);by.get(k).push(row);}
      materializeChunkBatch(need,by);
    }
  }
  catch(e){setOfflineMode(e.message);materializeChunkBatch(need);}
  finally{streamBusy=false;}
  for(const [k,c] of [...chunks]) if(Math.max(Math.abs(c.cx-pcx),Math.abs(c.cz-pcz))>VIEW+1){ for(const m of c.meshes){worldGroup.remove(m);m.geometry.dispose();} chunks.delete(k); requested.delete(k); }
}

const player={pos:new THREE.Vector3(0,35,0),vel:new THREE.Vector3(),yaw:0,pitch:0,onGround:false,selected:0,id:'',name:'Player'};
const keys=new Set(); let mobileMove={x:0,y:0},mobileLook={x:0,y:0}; let channel=null; let lastSave=0,lastNet=0; let started=false; let backendMode='online';
function setOfflineMode(reason=''){
  backendMode='offline';
  statusEl.textContent='офлайн · локальный процедурный мир';statusEl.className='vwWarn';
  playersEl.textContent='игроков: 1 · offline';
  window.dispatchEvent(new CustomEvent('voxel-world:offline',{detail:{reason:String(reason||'backend unavailable').slice(0,240)}}));
}
function collides(px,py,pz){
  const minX=Math.floor(px-PLAYER_R),maxX=Math.floor(px+PLAYER_R),minY=Math.floor(py),maxY=Math.floor(py+PLAYER_H-.02),minZ=Math.floor(pz-PLAYER_R),maxZ=Math.floor(pz+PLAYER_R);
  for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)for(let z=minZ;z<=maxZ;z++){const b=blockAt(x,y,z);if(BLOCKS[b]?.solid)return true;} return false;
}
function moveAxis(axis,amount){ if(!amount)return; const step=Math.sign(amount)*.05; let remain=Math.abs(amount); while(remain>0){const d=Math.sign(amount)*Math.min(.05,remain); const p=player.pos.clone();p[axis]+=d;if(collides(p.x,p.y,p.z)){player.vel[axis]=0;if(axis==='y'&&d<0)player.onGround=true;return;}player.pos[axis]+=d;remain-=Math.abs(d);} }
const GOLDEN_STEP_HEIGHTS=[.25,.5,.75,1.0,1.05];
function goldenHorizontal(axis,amount,allowStep){
  if(!amount)return true;
  const start=player.pos.clone();
  const target=start.clone();target[axis]+=amount;
  if(!collides(target.x,target.y,target.z)){player.pos[axis]=target[axis];return true;}
  if(allowStep){
    for(const h of GOLDEN_STEP_HEIGHTS){
      const raised=start.clone();raised.y+=h;
      if(collides(raised.x,raised.y,raised.z))continue;
      raised[axis]+=amount;
      if(collides(raised.x,raised.y,raised.z))continue;
      player.pos.copy(raised);player.vel.y=Math.max(0,player.vel.y);return true;
    }
  }
  player.vel[axis]=0;return false;
}
function physics(dt){
  const wasGrounded=player.onGround;
  const f=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0)-mobileMove.y; const s=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+mobileMove.x; const len=Math.hypot(f,s)||1, speed=(keys.has('ShiftLeft')||keys.has('ShiftRight'))?RUN:WALK;
  const move=window.GameGoldenPhysics.canonicalXZ(player.yaw,f/len,s/len,speed); const vx=move.x, vz=move.z; player.vel.x+=(vx-player.vel.x)*Math.min(1,dt*12); player.vel.z+=(vz-player.vel.z)*Math.min(1,dt*12); player.vel.y-=GRAVITY*dt; player.onGround=false;
  goldenHorizontal('x',player.vel.x*dt,wasGrounded); goldenHorizontal('z',player.vel.z*dt,wasGrounded); moveAxis('y',player.vel.y*dt); if(player.pos.y<-8){player.pos.set(0,heightAt(0,0)+4,0);player.vel.set(0,0,0);} camera.position.set(player.pos.x,player.pos.y+1.62,player.pos.z); camera.rotation.order='YXZ'; camera.rotation.y=player.yaw; camera.rotation.x=player.pitch;
}
function jump(){ if(player.onGround){player.vel.y=JUMP;player.onGround=false;} }

function rayVoxel(){
  const dir=new THREE.Vector3(0,0,-1).applyEuler(camera.rotation).normalize(), start=camera.position.clone(); let last=null,lastCell=null;
  for(let t=0;t<=REACH;t+=.075){const p=start.clone().addScaledVector(dir,t),cell={x:Math.floor(p.x),y:Math.floor(p.y),z:Math.floor(p.z)};if(lastCell&&cell.x===lastCell.x&&cell.y===lastCell.y&&cell.z===lastCell.z)continue;const b=blockAt(cell.x,cell.y,cell.z);if(b!==BLOCK.AIR&&b!==BLOCK.WATER)return {hit:cell,prev:last,block:b};last=cell;lastCell=cell;} return null;
}
async function editBlock(place){
  const hit=rayVoxel(); if(!hit){targetEl.textContent='Нет блока в радиусе';return;} const c=place?hit.prev:hit.hit;if(!c)return; const b=place?HOTBAR[player.selected]:BLOCK.AIR;
  if(place&&collidesWithCell(c.x,c.y,c.z)){targetEl.textContent='Нельзя поставить блок в игрока';return;}
  const old=blockAt(c.x,c.y,c.z); setBlockLocal(c.x,c.y,c.z,b);
  try{
    const result=await api('set_block',{worldId:ACTIVE_WORLD_ID,x:c.x,y:c.y,z:c.z,blockType:b,playerPosition:{x:player.pos.x,y:player.pos.y,z:player.pos.z}});
    if(channel) void channel.send({type:'broadcast',event:'block_set',payload:{x:c.x,y:c.y,z:c.z,block:b}});
    const scienceEvents=Array.isArray(result.scienceEvents)?result.scienceEvents:(result.science?[result.science]:[]);
    if(!place){const run=scienceRunForDestroyedBlock(old,scienceEvents);if(run){spawnDestructionFx(run.runId,c,old);emitScienceDomainTelemetry(run.runId,'playerDestruction','player_break');emitScienceDomainTelemetry(run.runId,'visualDestruction','player_break');}}
    for(const scienceEvent of scienceEvents)applyScienceResult(scienceEvent);
    canonEditCount+=1;
    if(scienceEvents.length||canonEditCount%20===0){
      const canonId=uuid();
      const summary=scienceEvents.length?'Player action created a durable world consequence.':'Player materially changed this world.';
      void canonApi('player_world_change',summary,{x:c.x,y:c.y,z:c.z,blockType:b,scienceRuns:scienceEvents.map(x=>x.runId).filter(Boolean).slice(0,4)},canonId).then(result=>{showCanonEvent(result?.event);for(const effect of result?.consequences||[])if(effect.target_world_id===ACTIVE_WORLD_ID)showCanonEvent(effect);}).catch(error=>console.warn('[CANON]',error?.message||error));
    }
    statusEl.textContent='онлайн · мир сохраняется';statusEl.className='vwGood';
  }catch(e){setOfflineMode(e.message);statusEl.textContent='офлайн · изменение сохранено локально';statusEl.className='vwWarn';}
}
function collidesWithCell(x,y,z){ return x+1>player.pos.x-PLAYER_R&&x<player.pos.x+PLAYER_R&&z+1>player.pos.z-PLAYER_R&&z<player.pos.z+PLAYER_R&&y+1>player.pos.y&&y<player.pos.y+PLAYER_H; }

function buildHotbar(){hotbarEl.innerHTML='';HOTBAR.forEach((b,i)=>{const d=document.createElement('div');d.className='slot'+(i===player.selected?' sel':'');d.innerHTML=`<span class="slotNum">${i+1}</span><span class="swatch" style="background:#${BLOCKS[b].color.toString(16).padStart(6,'0')}"></span><span>${BLOCKS[b].name}</span>`;d.onclick=()=>{player.selected=i;buildHotbar();};hotbarEl.appendChild(d);});}

let canonEditCount=0;
let canonChannel=null;
const canonEffects=new Map();
const canonSeen=new Set();
function canonStringHash(value){let h=2166136261;for(const ch of String(value||'')){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function disposeCanonEffect(entry){if(!entry?.group)return;scene.remove(entry.group);entry.group.traverse(o=>{o.geometry?.dispose?.();if(o.material){for(const m of (Array.isArray(o.material)?o.material:[o.material]))m.dispose?.();}});canonEffects.delete(entry.id);}
function applyCanonEffect(event){
  const effect=event?.payload?.effect;if(event?.event_type!=='cross_world_consequence'||effect?.kind!=='canon_beacon')return;
  const id=String(effect.effectId||event.event_key||'');if(!id||canonEffects.has(id))return;
  const created=Date.parse(event.created_at||'')||Date.now(),lifetime=clamp(Number(effect.lifetimeMs)||86400000,60000,86400000);if(Date.now()-created>lifetime)return;
  const seed=canonStringHash(event.event_key||id),angle=(seed%6283)/1000,distance=7+((seed>>>8)%12),x=Math.round(Math.cos(angle)*distance),z=Math.round(Math.sin(angle)*distance),y=heightAt(x,z)+2.5;
  const hue=clamp(Number(effect.hue)||0,0,359)/360,color=new THREE.Color().setHSL(hue,.82,.62),group=new THREE.Group();
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.16,.3,4.4,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.42,depthWrite:false}));beam.position.y=2.2;group.add(beam);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(clamp(Number(effect.radius)||5,3,9)*.22,.07,6,28),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.82,depthWrite:false}));ring.rotation.x=Math.PI/2;ring.position.y=.35;group.add(ring);
  group.position.set(x,y,z);scene.add(group);canonEffects.set(id,{id,group,ring,created,expiresAt:created+lifetime,intensity:clamp(Number(effect.intensity)||1,.5,1.5)});
}
function updateCanonEffects(now){for(const entry of [...canonEffects.values()]){if(Date.now()>entry.expiresAt){disposeCanonEffect(entry);continue;}entry.ring.rotation.z=now*.00035*entry.intensity;const p=.72+Math.sin(now*.002+entry.created*.0001)*.18;entry.group.scale.setScalar(p);}}
function showCanonEvent(event){if(!event)return;const key=String(event.event_key||'');if(key&&canonSeen.has(key))return;if(key)canonSeen.add(key);applyCanonEffect(event);const text=String(event.summary||event.story||'').trim();if(text)window.AppCore?.toast?.('Canon: '+text.slice(0,160));}
async function hydrateCanon(){try{const r=await fetch('/api/canon?worldId='+encodeURIComponent(ACTIVE_WORLD_ID)+'&limit=8',{headers:{Accept:'application/json'},cache:'no-store'});if(!r.ok)return;const j=await r.json();for(const event of [...(j.events||[])].reverse())showCanonEvent(event);}catch(error){console.warn('[CANON HYDRATE]',error?.message||error);}}

const remote=new Map();
function avatarFor(p){
  const g=new THREE.Group(); const skin=new THREE.MeshStandardMaterial({color:0xf0be92,roughness:.85}); const shirt=new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(hash32(p.id?.length||2,p.name?.length||3,771),.58,.52),roughness:.8}); const pants=new THREE.MeshStandardMaterial({color:0x26374c,roughness:.9});
  const body=new THREE.Mesh(new THREE.BoxGeometry(.62,.78,.32),shirt);body.position.y=1.08;g.add(body);const head=new THREE.Mesh(new THREE.BoxGeometry(.48,.48,.48),skin);head.position.y=1.72;g.add(head);for(const x of [-.18,.18]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.24,.72,.25),pants);leg.position.set(x,.38,0);g.add(leg);}g.userData.target=new THREE.Vector3();remoteGroup.add(g);return g;
}
function disposeAvatar(g){g.traverse(o=>{if(o.geometry)o.geometry.dispose?.();if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats)m.dispose?.();}});}
function updateRemote(payload){
  const id=typeof payload?.id==='string'&&payload.id.length<=80?payload.id:''; if(!id||id===player.id)return;
  const x=finiteCoord(payload.x),y=finiteCoord(payload.y,500),z=finiteCoord(payload.z),yaw=Number(payload.yaw); if(x===null||y===null||z===null||!Number.isFinite(yaw))return;
  if(Math.hypot(x-player.pos.x,z-player.pos.z)>(VIEW+3)*CHUNK)return;
  let g=remote.get(id);if(!g){g=avatarFor({id,name:String(payload.name||'Player').slice(0,20)});remote.set(id,g);}g.userData.target.set(x,y,z);g.rotation.y=clamp(yaw,-100000,100000);g.visible=true;
}
function syncPresence(){ if(!channel)return;const state=channel.presenceState(),active=new Set();for(const entries of Object.values(state))for(const p of entries){if(typeof p.id==='string'&&p.id.length<=80)active.add(p.id);}for(const [id,g] of remote)if(!active.has(id)){remoteGroup.remove(g);disposeAvatar(g);remote.delete(id);}playersEl.textContent=`игроков: ${Math.max(1,active.size)}`; }
async function connectRealtime(appState){
  const sb=appState.supabase; channel=sb.channel('voxel:'+ACTIVE_WORLD_ID,{config:{presence:{key:player.id},broadcast:{self:false,ack:false}}});
  channel.on('broadcast',{event:'player_state'},({payload})=>updateRemote(payload)); channel.on('broadcast',{event:'block_set'},({payload})=>{const b=validBlockType(payload?.block),x=finiteCoord(payload?.x),y=finiteCoord(payload?.y,320),z=finiteCoord(payload?.z);if(b===null||x===null||y===null||z===null||!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(z)||y<0||y>=WORLD_Y)return;if(Math.hypot(x-player.pos.x,z-player.pos.z)>(VIEW+3)*CHUNK)return;setBlockLocal(x,y,z,b);}); channel.on('broadcast',{event:'science_event'},({payload})=>announceTrustedScienceSignal(payload)); channel.on('presence',{event:'sync'},syncPresence);
  await new Promise((resolve,reject)=>channel.subscribe(async st=>{if(st==='SUBSCRIBED'){await channel.track({id:player.id,name:player.name,online_at:new Date().toISOString()});resolve();}else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT')reject(new Error('Realtime недоступен'));}));
  canonChannel=sb.channel('canon:'+ACTIVE_WORLD_ID).on('postgres_changes',{event:'INSERT',schema:'public',table:'world_canon_events',filter:'world_id=eq.'+ACTIVE_WORLD_ID},change=>showCanonEvent(change.new));
  void canonChannel.subscribe();
  void hydrateCanon();
}

function setupDesktop(){
  renderer.domElement.addEventListener('click',()=>{if(!matchMedia('(pointer:coarse)').matches&&document.pointerLockElement!==renderer.domElement)renderer.domElement.requestPointerLock?.();});
  document.addEventListener('pointerlockchange',()=>{targetEl.textContent=document.pointerLockElement===renderer.domElement?'ЛКМ ломать · ПКМ ставить':'Нажми на экран, чтобы играть';});
  document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==renderer.domElement)return;player.yaw-=e.movementX*.0022;player.pitch=clamp(player.pitch-e.movementY*.0022,-1.48,1.48);});
  document.addEventListener('keydown',e=>{if(document.activeElement?.tagName==='INPUT')return;keys.add(e.code);if(e.code==='Space'){e.preventDefault();jump();}if(/^Digit[1-9]$/.test(e.code)){player.selected=Number(e.code.slice(5))-1;buildHotbar();}});document.addEventListener('keyup',e=>keys.delete(e.code));
  renderer.domElement.addEventListener('mousedown',e=>{if(document.pointerLockElement!==renderer.domElement)return;if(e.button===0)editBlock(false);if(e.button===2)editBlock(true);});renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
}
function setupMobile(){
  const movePad=document.getElementById('movePad'),moveKnob=document.getElementById('moveKnob'),lookPad=document.getElementById('lookPad'),lookKnob=document.getElementById('lookKnob');
  function bindPad(pad,knob,onValue){
    let pointerId=null;
    const update=e=>{const r=pad.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,m=Math.min(46,Math.hypot(dx,dy)),a=Math.atan2(dy,dx),value={x:Math.cos(a)*(m/46),y:Math.sin(a)*(m/46)};onValue(value);knob.style.transform=`translate(${value.x*42}px,${value.y*42}px)`;};
    const reset=e=>{if(e&&pointerId!==null&&e.pointerId!==pointerId)return;pointerId=null;onValue({x:0,y:0});knob.style.transform='';};
    pad.addEventListener('pointerdown',e=>{if(document.documentElement.classList.contains('golden-drawer-open'))return;pointerId=e.pointerId;pad.setPointerCapture?.(e.pointerId);update(e);});
    pad.addEventListener('pointermove',e=>{if(e.pointerId===pointerId)update(e);});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(type,reset);
    return reset;
  }
  const resetMove=bindPad(movePad,moveKnob,v=>{mobileMove=v;});
  const resetLook=bindPad(lookPad,lookKnob,v=>{mobileLook=v;});
  addEventListener('goldendrawerchange',e=>{if(e.detail?.open){resetMove();resetLook();}});
  document.getElementById('jumpBtn').onclick=jump;document.getElementById('breakBtn').onclick=()=>editBlock(false);document.getElementById('placeBtn').onclick=()=>editBlock(true);
}

function daylight(now){if(window.GoldenPaintingAtmosphere)return;const day=(now*.000015)%1,a=day*Math.PI*2;sun.position.set(Math.cos(a)*65,Math.sin(a)*72+12,30);const k=clamp((sun.position.y+12)/55,.12,1);sun.intensity=.25+2.0*k;hemi.intensity=.28+1.0*k;const sky=new THREE.Color().setHSL(.57,.55,.18+.48*k);scene.background.copy(sky);scene.fog.color.copy(sky);}
function updateTarget(){const h=rayVoxel();if(!h)return;targetEl.textContent=`${BLOCKS[h.block]?.name||'Блок'} · ${h.hit.x}, ${h.hit.y}, ${h.hit.z}`;}

async function savePlayer(){if(backendMode!=='online')return;try{await api('player_save',{worldId:ACTIVE_WORLD_ID,position:{x:player.pos.x,y:player.pos.y,z:player.pos.z},yaw:player.yaw,pitch:player.pitch,selectedBlock:HOTBAR[player.selected]});}catch{} }
function broadcastPlayer(now){if(!channel||now-lastNet<NET_INTERVAL)return;lastNet=now;channel.send({type:'broadcast',event:'player_state',payload:{id:player.id,name:player.name,x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:player.yaw}});}
let prev=performance.now();function loop(now){requestAnimationFrame(loop);const dt=Math.min(.045,(now-prev)/1000);prev=now;if(goldenWaterUniforms?.goldenWaterTime)goldenWaterUniforms.goldenWaterTime.value=now/1000;if(started){if(Math.abs(mobileLook.x)>.02||Math.abs(mobileLook.y)>.02){player.yaw-=mobileLook.x*2.05*dt;player.pitch=clamp(player.pitch-mobileLook.y*1.65*dt,-1.45,1.45);}physics(dt);updateScienceFx(now,dt);updateCanonEffects(now);loadNeededChunks();broadcastPlayer(now);if(now-lastSave>SAVE_INTERVAL){lastSave=now;savePlayer();}updateTarget();biomeEl.textContent=`биом: ${biomeAt(Math.floor(player.pos.x),Math.floor(player.pos.z))} · чанки: ${chunks.size}`;for(const g of remote.values())g.position.lerp(g.userData.target,.18);}daylight(now);renderer.render(scene,camera);}requestAnimationFrame(loop);

addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});addEventListener('beforeunload',()=>savePlayer());
setupDesktop();setupMobile();buildHotbar();

try{
  const appState=await window.AppCore.init('voxel-world');
  const init=await api('init',{worldId:ACTIVE_WORLD_ID}); worldSeed=Number(init.world?.seed)||worldSeed; const worldSettings=init.world?.settings||{}; worldTheme=worldSettings.theme||worldSettings.worldDNA?.theme||'mixed'; if(titleEl)titleEl.textContent=worldSettings.name||'Voxel World'; if(loreEl){const lore=worldSettings.lore||worldSettings.worldDNA?.lore; loreEl.textContent=lore?.headline||((ACTIVE_WORLD_ID==='main')?'Living world':'World Factory creation'); loreEl.title=lore?.lore||'';} document.title=(worldSettings.name||'Voxel World')+' ? World_server'; player.id=init.selfId;player.name=init.player?.name||appState.user?.username||'Player'; const p=init.player?.position||{x:0,y:heightAt(0,0)+4,z:0};player.pos.set(Number(p.x)||0,Number(p.y)||heightAt(0,0)+4,Number(p.z)||0);player.yaw=Number(init.player?.yaw)||0;player.pitch=Number(init.player?.pitch)||0;const sel=HOTBAR.indexOf(Number(init.player?.selectedBlock));if(sel>=0)player.selected=sel;buildHotbar(); cacheScienceRuns(init.scienceGameplay); await connectRealtime(appState); started=true; showScienceIntro((init.scienceGameplay||[]).filter(run=>run.active).at(-1)); statusEl.textContent='онлайн · мир сохраняется';statusEl.className='vwGood';loading.classList.add('hidden');
}catch(e){console.error(e);setOfflineMode(e.message);player.id=guestId();player.name=`Guest_${player.id.replaceAll('-','').slice(0,4)}`;player.pos.set(0,heightAt(0,0)+4,0);started=true;loading.classList.add('hidden');}

window.VoxelWorldRuntime={
    stats(){return {player:{x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:player.yaw,pitch:player.pitch,onGround:player.onGround},renderer:renderer?.info?.render,pixelRatio:renderer?.getPixelRatio?.()||1,backendMode,chunks:chunks.size,playable:started&&chunks.size>0};},
    setView(nextYaw,nextPitch=0){player.yaw=Number(nextYaw)||0;player.pitch=Number(nextPitch)||0;}
  };

try{if(typeof renderer!=='undefined')window.GoldenPerformanceAutoTune?.registerRenderer(renderer,{targetFps:matchMedia('(pointer:coarse)').matches?45:55,minDpr:.75,maxDpr:Math.min(devicePixelRatio||1,2)});}catch{}
