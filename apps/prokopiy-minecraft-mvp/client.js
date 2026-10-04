import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const canvas=document.querySelector('#world');
const statusEl=document.querySelector('#status');
const seedInfo=document.querySelector('#seedInfo');
const regionInfo=document.querySelector('#regionInfo');
const strip=document.querySelector('#assetStrip');
const toggle=document.querySelector('#catalogToggle');
const moveFeedback=document.querySelector('#moveFeedback');
const moveKnob=document.querySelector('#moveKnob');
const tabs=[...document.querySelectorAll('#tabs button')];
const coarse=matchMedia('(pointer:coarse)').matches;

const params=new URLSearchParams(location.search);
const BASE_SEED=params.get('seed')||'-3361685360695458093';
const CHUNK=24, REGION=96, CELL=2, VIEW=coarse?2:3;
const FAMILIES=['gothic','new_york','ancient_chinese','tokyo','future'];
const IDEAS={
  gothic:'gothic flooded ruins',
  new_york:'New York dense city',
  ancient_chinese:'ancient Chinese jungle city',
  tokyo:'Tokyo canal city',
  future:'future flooded ruins'
};
const FAMILY_COLORS={
  gothic:{ground:0x60884c,soil:0x604d42,road:0x3f4448,wall:0x575861,accent:0x323039},
  new_york:{ground:0x718c58,soil:0x665548,road:0x45484c,wall:0x8b7b70,accent:0x51545b},
  ancient_chinese:{ground:0x6f9a55,soil:0x6d533d,road:0x716352,wall:0xa84f3d,accent:0x4e3828},
  tokyo:{ground:0x658b5c,soil:0x64544b,road:0x4b4f55,wall:0x8a8e97,accent:0x435068},
  future:{ground:0x526f62,soil:0x434d4c,road:0x303941,wall:0x596873,accent:0x8dbbc3}
};

function hashString(value){let h=2166136261;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function hash32(x,z,seed){let h=(Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^(seed|0))|0;h=Math.imul(h^(h>>>13),1274126177);return(h^(h>>>16))>>>0}
function unit(x,z,seed){return hash32(x,z,seed)/0xffffffff}
function floorDiv(v,n){return Math.floor(v/n)}
function chunkKey(cx,cz){return cx+':'+cz}
const BASE_SEED32=hashString(BASE_SEED);
function terrainHeight(x,z){
  const broad=Math.sin(x*.055)+Math.cos(z*.047);
  const noise=unit(Math.floor(x/7),Math.floor(z/7),BASE_SEED32+700)-.5;
  return Math.floor(broad*1.25+noise*4);
}

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x8cc8ef);
scene.fog=new THREE.Fog(0x8cc8ef,55,145);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,coarse?1.5:2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const camera=new THREE.PerspectiveCamera(58,1,.1,220);
scene.add(new THREE.HemisphereLight(0xd8efff,0x65704a,2.15));
const sun=new THREE.DirectionalLight(0xffedc7,3.0);
sun.position.set(-22,34,18);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left=-45;sun.shadow.camera.right=45;sun.shadow.camera.top=45;sun.shadow.camera.bottom=-45;scene.add(sun);

const loader=new GLTFLoader();
const assetSources=new Map();
const regionProfiles=new Map();
const regionMaterials=new Map();
const chunks=new Map();
const chunkJobs=new Map();
const creatures=new Set();
let catalog=null,currentKind='mobs',playerModel=null,lastChunk='',lastRegion='',spawned=[];
const player={pos:new THREE.Vector3(0,terrainHeight(0,0)+.55,0),yaw:0,speed:6.5};
const cameraState={yaw:0,pos:new THREE.Vector3(0,7,-8)};
const keys=new Set();
const touchMove={x:0,y:0,power:0};
let gestureId=null,gestureX=0,gestureY=0;

const groundGeo=new THREE.BoxGeometry(CELL,1,CELL);
const soilGeo=new THREE.BoxGeometry(CELL,1,CELL);
const treeTrunkGeo=new THREE.BoxGeometry(.8,3,.8);
const treeLeafGeo=new THREE.BoxGeometry(2.8,2.4,2.8);
const unitBoxGeo=new THREE.BoxGeometry(1,1,1);
const waterGeo=new THREE.BoxGeometry(CHUNK,.18,CHUNK);

function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
function colorMaterial(color,rough=.92){const m=new THREE.MeshStandardMaterial({color,roughness:rough,metalness:0});return m}
function materialPack(profile){
  const key=profile.primaryFamily;
  if(regionMaterials.has(key))return regionMaterials.get(key);
  const c=FAMILY_COLORS[profile.primaryFamily]||FAMILY_COLORS.gothic;
  const pack={
    ground:colorMaterial(c.ground),soil:colorMaterial(c.soil),road:colorMaterial(c.road),
    wall:colorMaterial(c.wall,.82),accent:colorMaterial(c.accent,.72),
    trunk:colorMaterial(0x6a4b32),leaves:colorMaterial(0x4c8d45),
    water:new THREE.MeshStandardMaterial({color:0x4e9ed0,roughness:.18,metalness:.02,transparent:true,opacity:.58})
  };
  regionMaterials.set(key,pack);return pack;
}
function regionCoords(x,z){return{rx:floorDiv(x,REGION),rz:floorDiv(z,REGION)}}
function regionSeed(rx,rz){return BASE_SEED+':'+rx+':'+rz}
function familyFor(rx,rz){return FAMILIES[hashString(regionSeed(rx,rz)+':family')%FAMILIES.length]}
async function getRegionProfile(rx,rz){
  const key=rx+':'+rz;
  if(regionProfiles.has(key))return regionProfiles.get(key);
  const promise=(async()=>{
    const family=familyFor(rx,rz),seed=regionSeed(rx,rz);
    const r=await fetch('/api/world-factory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'preview-seed',seed,idea:IDEAS[family],x:rx*REGION,z:rz*REGION,size:REGION})});
    if(!r.ok)throw new Error('Architecture Seed HTTP '+r.status);
    const data=await r.json();
    if(!data?.architecture?.minecraft)throw new Error('Architecture Seed profile missing Minecraft bridge');
    return data.architecture;
  })();
  regionProfiles.set(key,promise);
  if(regionProfiles.size>32){const oldest=regionProfiles.keys().next().value;if(oldest!==key)regionProfiles.delete(oldest)}
  try{return await promise}catch(e){regionProfiles.delete(key);throw e}
}
async function sourceFor(entry){
  if(assetSources.has(entry.url))return assetSources.get(entry.url);
  const promise=loader.loadAsync(entry.url).then(g=>{g.scene.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;if(n.material?.map)n.material.map.colorSpace=THREE.SRGBColorSpace}});return g.scene});
  assetSources.set(entry.url,promise);return promise;
}
function fitHeight(obj,height){
  const box=new THREE.Box3().setFromObject(obj),size=new THREE.Vector3(),center=new THREE.Vector3();
  box.getSize(size);box.getCenter(center);const s=height/Math.max(.001,size.y);obj.scale.setScalar(s);
  const scaledCenter=center.multiplyScalar(s);obj.position.x-=scaledCenter.x;obj.position.z-=scaledCenter.z;
  const box2=new THREE.Box3().setFromObject(obj);obj.position.y-=box2.min.y;return obj;
}
async function cloneAsset(entry,height=1.7){const src=await sourceFor(entry);return fitHeight(src.clone(true),height)}

function addInstances(group,geo,mat,matrices){
  if(!matrices.length)return;
  const mesh=new THREE.InstancedMesh(geo,mat,matrices.length);matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));
  mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);
}
function buildingFor(group,profile,cellX,cellZ,mats){
  const runtime=window.ArchitectureSeedRuntime;if(!runtime)return;
  const s=runtime.sample(profile,cellX,cellZ);if(!s||s.road||s.empty||!s.inside)return;
  const width=Math.max(3,s.lot-s.pad*2),depth=width,height=Math.max(4,Math.min(28,s.height*.62));
  const gy=terrainHeight(cellX,cellZ);
  const body=new THREE.Mesh(unitBoxGeo,mats.wall);body.scale.set(width,height,depth);
  body.position.set(cellX,gy+height/2,cellZ);body.castShadow=true;body.receiveShadow=true;group.add(body);
  if(s.structure){
    const towerH=Math.max(3,Math.min(12,height*.45));
    const tower=new THREE.Mesh(unitBoxGeo,mats.accent);tower.scale.set(Math.max(2,width*.34),towerH,Math.max(2,depth*.34));
    tower.position.set(cellX,gy+height+towerH/2,cellZ);tower.castShadow=true;group.add(tower);
  }
}
function addTree(group,x,z,mats){
  const gy=terrainHeight(x,z);
  const trunk=new THREE.Mesh(treeTrunkGeo,mats.trunk);trunk.position.set(x,gy+1.5,z);trunk.castShadow=true;group.add(trunk);
  const leaves=new THREE.Mesh(treeLeafGeo,mats.leaves);leaves.position.set(x,gy+3.5,z);leaves.castShadow=true;group.add(leaves);
}
async function addSeedCreature(group,profile,cx,cz){
  const pool=profile.minecraft?.assets?.mobs||[];if(!pool.length)return;
  const roll=unit(cx,cz,hashString(profile.seedKey)+3300);if(roll<.48)return;
  const entry=pool[Math.floor(unit(cx,cz,hashString(profile.seedKey)+3400)*pool.length)%pool.length];
  const x=cx*CHUNK+3+unit(cx,cz,BASE_SEED32+3500)*(CHUNK-6);
  const z=cz*CHUNK+3+unit(cz,cx,BASE_SEED32+3600)*(CHUNK-6);
  try{
    const obj=await cloneAsset(entry,entry.id.includes('dragon')?3.2:1.45);
    if(!group.parent)return;
    obj.position.x+=x;obj.position.z+=z;obj.position.y+=terrainHeight(x,z)+.52;
    obj.rotation.y=unit(cx,cz,BASE_SEED32+3700)*Math.PI*2;
    obj.userData.seedCreature={anchorX:x,anchorZ:z,phase:unit(cx,cz,BASE_SEED32+3800)*Math.PI*2,speed:.12+roll*.18};
    group.userData.creatures.push(obj);creatures.add(obj);group.add(obj);
  }catch(e){console.warn('[SEED CREATURE]',entry.id,e?.message||e)}
}
async function createChunk(cx,cz){
  const key=chunkKey(cx,cz);if(chunks.has(key)||chunkJobs.has(key))return;
  const job=(async()=>{
    const bx=cx*CHUNK,bz=cz*CHUNK,{rx,rz}=regionCoords(bx+CHUNK/2,bz+CHUNK/2);
    const profile=await getRegionProfile(rx,rz),mats=materialPack(profile);
    const group=new THREE.Group();group.name='seed-chunk-'+key;group.userData.creatures=[];
    const top=[],soil=[],roads=[],matrix=new THREE.Matrix4();
    for(let x=bx;x<bx+CHUNK;x+=CELL)for(let z=bz;z<bz+CHUNK;z+=CELL){
      const gy=terrainHeight(x,z),sample=window.ArchitectureSeedRuntime?.sample?.(profile,x,z);
      matrix.makeTranslation(x,gy-.5,z);(sample?.road?roads:top).push(matrix.clone());
      matrix.makeTranslation(x,gy-1.5,z);soil.push(matrix.clone());
      const treeRoll=unit(Math.floor(x/CELL),Math.floor(z/CELL),BASE_SEED32+9000),treeThreshold=profile.modifiers?.includes('jungle')?.93:.982;
      if(!sample?.road&&!sample?.inside&&treeRoll>treeThreshold)addTree(group,x,z,mats);
    }
    addInstances(group,groundGeo,mats.ground,top);addInstances(group,groundGeo,mats.road,roads);addInstances(group,soilGeo,mats.soil,soil);
    if(profile.biome?.flooded){const water=new THREE.Mesh(waterGeo,mats.water);water.position.set(bx+CHUNK/2-1,.35,bz+CHUNK/2-1);water.receiveShadow=true;group.add(water)}
    const lot=window.ArchitectureSeedRuntime?.familyConfig?.(profile.primaryFamily)?.lot||20;
    const minX=Math.floor(bx/lot),maxX=Math.floor((bx+CHUNK-1)/lot),minZ=Math.floor(bz/lot),maxZ=Math.floor((bz+CHUNK-1)/lot);
    for(let gx=minX;gx<=maxX;gx++)for(let gz=minZ;gz<=maxZ;gz++){const centerX=gx*lot+lot/2,centerZ=gz*lot+lot/2;if(centerX>=bx&&centerX<bx+CHUNK&&centerZ>=bz&&centerZ<bz+CHUNK)buildingFor(group,profile,centerX,centerZ,mats)}
    chunks.set(key,group);scene.add(group);void addSeedCreature(group,profile,cx,cz);
  })().catch(e=>console.error('[SEED CHUNK]',key,e)).finally(()=>chunkJobs.delete(key));
  chunkJobs.set(key,job);await job;
}
function syncChunks(){
  const pcx=floorDiv(player.pos.x,CHUNK),pcz=floorDiv(player.pos.z,CHUNK),desired=new Set();
  for(let dz=-VIEW;dz<=VIEW;dz++)for(let dx=-VIEW;dx<=VIEW;dx++){const key=chunkKey(pcx+dx,pcz+dz);desired.add(key);void createChunk(pcx+dx,pcz+dz)}
  for(const [key,group] of chunks)if(!desired.has(key)){for(const c of group.userData.creatures||[])creatures.delete(c);scene.remove(group);chunks.delete(key)}
  lastChunk=chunkKey(pcx,pcz);
}
async function updateRegionHud(){
  const {rx,rz}=regionCoords(player.pos.x,player.pos.z),key=rx+':'+rz;if(key===lastRegion)return;
  lastRegion=key;regionInfo.textContent='регион '+key+' · загрузка seed…';
  try{const p=await getRegionProfile(rx,rz);if(lastRegion===key)regionInfo.textContent='регион '+key+' · '+p.primaryFamily.replaceAll('_',' ')+' · '+(p.minecraft?.assets?.mobs||[]).map(x=>x.id).join(', ')}
  catch(e){regionInfo.textContent='регион '+key+' · seed error';console.error(e)}
}

function renderCatalog(){
  strip.replaceChildren();for(const entry of catalog?.models?.[currentKind]||[]){const b=document.createElement('button');b.className='asset';b.textContent=entry.id.replaceAll('_',' ');b.addEventListener('click',()=>spawnCatalog(entry,b));strip.appendChild(b)}
}
async function spawnCatalog(entry,button){
  [...strip.children].forEach(x=>x.classList.toggle('active',x===button));statusEl.textContent='строю '+entry.id+'…';
  try{
    const obj=await cloneAsset(entry,currentKind==='mobs'?1.6:1.0),f=new THREE.Vector3(Math.sin(player.yaw),0,Math.cos(player.yaw));
    obj.position.x+=player.pos.x+f.x*3;obj.position.z+=player.pos.z+f.z*3;obj.position.y+=terrainHeight(obj.position.x,obj.position.z)+.55;scene.add(obj);spawned.push(obj);
    if(spawned.length>12)scene.remove(spawned.shift());statusEl.textContent=entry.id+' · построен перед персонажем';
  }catch(e){statusEl.textContent='не удалось построить '+entry.id;console.error(e)}
}
function setupInput(){
  addEventListener('keydown',e=>{keys.add(e.code);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault()},{passive:false});
  addEventListener('keyup',e=>keys.delete(e.code));
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse')return;gestureId=e.pointerId;gestureX=e.clientX;gestureY=e.clientY;canvas.setPointerCapture?.(e.pointerId);
    moveFeedback.style.display='block';moveFeedback.style.left=e.clientX+'px';moveFeedback.style.top=e.clientY+'px';e.preventDefault();
  });
  canvas.addEventListener('pointermove',e=>{
    if(e.pointerId!==gestureId)return;const dx=e.clientX-gestureX,dy=e.clientY-gestureY,r=44,len=Math.hypot(dx,dy)||1,k=Math.min(1,r/len);
    const x=dx*k,y=dy*k;touchMove.x=x/r;touchMove.y=-y/r;touchMove.power=Math.min(1,len/r);
    moveKnob.style.transform='translate('+x+'px,'+y+'px)';e.preventDefault();
  });
  const end=e=>{if(e.pointerId!==gestureId)return;gestureId=null;touchMove.x=touchMove.y=touchMove.power=0;moveFeedback.style.display='none';moveKnob.style.transform='translate(0,0)';e.preventDefault()};
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  document.addEventListener('touchmove',e=>{if(e.target.closest?.('#assetStrip'))return;e.preventDefault()},{passive:false});
}
function lerpAngle(a,b,t){let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;return a+d*t}
function updatePlayer(dt,time){
  let sx=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  let sy=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
  sx+=touchMove.x;sy+=touchMove.y;const len=Math.hypot(sx,sy);
  if(len>.05){
    sx/=Math.max(1,len);sy/=Math.max(1,len);
    const f=new THREE.Vector3(Math.sin(cameraState.yaw),0,Math.cos(cameraState.yaw)),r=new THREE.Vector3(Math.cos(cameraState.yaw),0,-Math.sin(cameraState.yaw));
    const dir=f.multiplyScalar(sy).add(r.multiplyScalar(sx)).normalize(),speed=player.speed*(keys.has('ShiftLeft')||touchMove.power>.82?1.45:1);
    player.pos.addScaledVector(dir,speed*dt);const desired=Math.atan2(dir.x,dir.z);player.yaw=lerpAngle(player.yaw,desired,Math.min(1,dt*9));
  }
  player.pos.y=terrainHeight(player.pos.x,player.pos.z)+.55;
  if(playerModel){playerModel.position.copy(player.pos);playerModel.rotation.y=player.yaw+Math.PI;playerModel.position.y+=Math.sin(time*11)*(len>.05?.045:0)}
  cameraState.yaw=lerpAngle(cameraState.yaw,player.yaw,Math.min(1,dt*3.2));
  const heading=new THREE.Vector3(Math.sin(cameraState.yaw),0,Math.cos(cameraState.yaw));
  const desiredCam=player.pos.clone().addScaledVector(heading,-7.2).add(new THREE.Vector3(0,4.5,0));
  cameraState.pos.lerp(desiredCam,Math.min(1,dt*6));camera.position.copy(cameraState.pos);camera.lookAt(player.pos.x,player.pos.y+1.35,player.pos.z);
  const ck=chunkKey(floorDiv(player.pos.x,CHUNK),floorDiv(player.pos.z,CHUNK));if(ck!==lastChunk)syncChunks();void updateRegionHud();
}
function updateCreatures(time){
  for(const c of creatures){const s=c.userData.seedCreature;if(!s)continue;const radius=1.2+Math.sin(s.phase)*.7,angle=time*s.speed+s.phase;c.position.x=s.anchorX+Math.cos(angle)*radius;c.position.z=s.anchorZ+Math.sin(angle)*radius;c.position.y=terrainHeight(c.position.x,c.position.z)+.52;c.rotation.y=-angle+.5}
}
async function boot(){
  if(!window.ArchitectureSeedRuntime)throw new Error('Architecture Seed runtime unavailable');
  seedInfo.textContent='base seed: '+BASE_SEED;
  document.documentElement.classList.add('catalog-hidden');
  const r=await fetch('/assets/voxel/prokopiy-minecraft/catalog.json',{cache:'no-store'});if(!r.ok)throw new Error('catalog HTTP '+r.status);catalog=await r.json();renderCatalog();
  const playerEntry=catalog.models.mobs.find(x=>x.id==='player');if(!playerEntry)throw new Error('player GLB missing');
  playerModel=await cloneAsset(playerEntry,1.82);scene.add(playerModel);
  setupInput();resize();syncChunks();await updateRegionHud();
  statusEl.textContent='готово · третий персонаж · бесконечные seed-регионы';
  globalThis.ProkopiyMinecraftMVP={ready:true,viewportLocked:true,thirdPerson:true,infiniteChunks:true,architectureSeeds:true,seed:BASE_SEED,getPlayer:()=>({x:player.pos.x,y:player.pos.y,z:player.pos.z})};
}
toggle.addEventListener('click',()=>{const hidden=document.documentElement.classList.toggle('catalog-hidden');toggle.setAttribute('aria-expanded',String(!hidden))});
for(const tab of tabs)tab.addEventListener('click',()=>{currentKind=tab.dataset.kind;tabs.forEach(x=>x.classList.toggle('active',x===tab));renderCatalog()});
addEventListener('resize',resize);
const clock=new THREE.Clock();let elapsed=0;
function frame(){requestAnimationFrame(frame);const dt=Math.min(.05,clock.getDelta());elapsed+=dt;updatePlayer(dt,elapsed);updateCreatures(elapsed);renderer.render(scene,camera)}
frame();
boot().catch(e=>{console.error(e);statusEl.textContent='ошибка запуска: '+e.message;globalThis.ProkopiyMinecraftMVP={ready:false,error:e.message,viewportLocked:true}});
