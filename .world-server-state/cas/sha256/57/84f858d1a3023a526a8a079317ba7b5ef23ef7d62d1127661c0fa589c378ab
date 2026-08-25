import * as THREE from 'three';

const canvas=document.querySelector('#c'),statusEl=document.querySelector('#status');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight,false);
renderer.outputColorSpace=THREE.SRGBColorSpace;

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x0a0d12);
scene.fog=new THREE.FogExp2(0x0a0d12,.028);
const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.03,180);
scene.add(new THREE.HemisphereLight(0xbfd9ff,0x334455,1.25));
const sun=new THREE.DirectionalLight(0xffd4a0,1.0);sun.position.set(5,8,2);scene.add(sun);

const manifest=await fetch('/assets/manifest.json').then(r=>r.json());
const sceneMeta=await fetch(manifest.scene.meta).then(r=>r.json());
const avatarMeta=await fetch(manifest.avatar.meta).then(r=>r.json());
const collision=await fetch(manifest.collision.file).then(r=>r.json());
const navgrid=await fetch(manifest.navgrid.file).then(r=>r.json());
let motion={frames:[]},animations=null,avatarLodMeta=null;
try{motion=await fetch(manifest.avatar.motion).then(r=>r.json())}catch{}
if(manifest.avatar.animations){try{animations=await fetch(manifest.avatar.animations).then(r=>r.json())}catch{}}
if(manifest.avatar.lods){try{avatarLodMeta=await fetch(manifest.avatar.lods).then(r=>r.json())}catch{}}

function material(){return new THREE.MeshLambertMaterial({vertexColors:true})}
function makeVoxelMesh(indices,colors,voxelSize){
  const geom=new THREE.BoxGeometry(voxelSize,voxelSize,voxelSize);
  const mesh=new THREE.InstancedMesh(geom,material(),indices.length);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const dummy=new THREE.Object3D(),c=new THREE.Color();
  for(let i=0;i<indices.length;i++){
    dummy.position.set((indices[i][0]+.5)*voxelSize,(indices[i][1]+.5)*voxelSize,(indices[i][2]+.5)*voxelSize);
    dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    c.setRGB(colors[i][0]/255,colors[i][1]/255,colors[i][2]/255);mesh.setColorAt(i,c);
  }
  mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  mesh.frustumCulled=true;
  return mesh;
}
async function loadVoxelBin(url){
  const ab=await fetch(url).then(r=>{if(!r.ok)throw new Error(url);return r.arrayBuffer()});
  const dv=new DataView(ab),n=dv.getUint32(0,true);let off=4;
  const idx=new Int32Array(ab,off,n*3);off+=n*3*4;
  const col=new Uint8Array(ab,off,n*3),indices=[],colors=[];
  for(let i=0;i<n;i++){indices.push([idx[i*3],idx[i*3+1],idx[i*3+2]]);colors.push([col[i*3],col[i*3+1],col[i*3+2]])}
  return {indices,colors};
}

const world=new THREE.Group();scene.add(world);
const voxelSize=manifest.scene.quality.voxel_size||manifest.voxel.voxel_size_candidates?.[0]||.22;
const chunkRecords=sceneMeta.chunks.map(ch=>({...ch,loaded:false,mesh:null,lastUse:0}));
async function loadChunk(r){
  if(r.loaded)return;
  const d=await loadVoxelBin(r.file);r.mesh=makeVoxelMesh(d.indices,d.colors,voxelSize);world.add(r.mesh);r.loaded=true;
}
function unloadChunk(r){
  if(!r.loaded||!r.mesh)return;
  world.remove(r.mesh);r.mesh.geometry.dispose();r.mesh.material.dispose();r.mesh=null;r.loaded=false;
}

const player=new THREE.Group();scene.add(player),bones={},avatarLodObjects={};
for(const [name,part] of Object.entries(avatarMeta.parts)){
  const g=new THREE.Group();g.position.fromArray(part.rest_position);g.rotation.z=part.rest_rotation_z;player.add(g);bones[name]=g;
  if(avatarLodMeta?.[name]){
    avatarLodObjects[name]=[];
    for(const lm of avatarLodMeta[name]){
      const d=await loadVoxelBin(lm.file),m=makeVoxelMesh(d.indices,d.colors,lm.voxel_size);
      m.visible=lm.level===0;g.add(m);avatarLodObjects[name].push({mesh:m,...lm});
    }
  }else{
    const d=await loadVoxelBin(part.file);g.add(makeVoxelMesh(d.indices,d.colors,part.voxel_size));
  }
}

let sourceMotion=false,motionTime=0,walkPhase=0,vy=0,onGround=true,yaw=0,pitch=.18,drag=false,lx=0,ly=0;
const keys=new Set(),floorY=collision.floor_y||sceneMeta.floor_y||0;
addEventListener('keydown',e=>{keys.add(e.code);keys.add(e.key);if(e.code==='Space')e.preventDefault();if(e.key.toLowerCase()==='m')sourceMotion=!sourceMotion});
addEventListener('keyup',e=>{keys.delete(e.code);keys.delete(e.key)});
canvas.addEventListener('click',()=>{if(matchMedia('(pointer:fine)').matches)canvas.requestPointerLock?.()});
addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas){yaw-=e.movementX*.0026;pitch=Math.max(-.55,Math.min(1.15,pitch-e.movementY*.0022))}});
canvas.addEventListener('pointerdown',e=>{drag=true;lx=e.clientX;ly=e.clientY});
canvas.addEventListener('pointermove',e=>{if(!drag||document.pointerLockElement===canvas)return;const dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;yaw-=dx*.006;pitch=Math.max(-.55,Math.min(1.15,pitch-dy*.006))});
addEventListener('pointerup',()=>drag=false);
document.querySelectorAll('[data-key]').forEach(b=>{const k=b.dataset.key;b.addEventListener('pointerdown',e=>{e.preventDefault();keys.add(k)});for(const ev of ['pointerup','pointercancel'])b.addEventListener(ev,e=>{e.preventDefault();keys.delete(k)})});
const jb=document.querySelector('#jump');jb.addEventListener('pointerdown',e=>{e.preventDefault();keys.add('Space')});jb.addEventListener('pointerup',e=>{e.preventDefault();keys.delete('Space')});

function procedural(dt,speed){
  walkPhase+=dt*(speed>.2?8.2:2);const amp=Math.min(1,speed/Math.max(.1,manifest.game.walk_speed)),s=Math.sin(walkPhase)*amp;
  if(bones.l_upper_leg)bones.l_upper_leg.rotation.x=.55*s;if(bones.r_upper_leg)bones.r_upper_leg.rotation.x=-.55*s;
  if(bones.l_lower_leg)bones.l_lower_leg.rotation.x=Math.max(0,-s)*.65;if(bones.r_lower_leg)bones.r_lower_leg.rotation.x=Math.max(0,s)*.65;
  if(bones.l_upper_arm)bones.l_upper_arm.rotation.x=-.42*s;if(bones.r_upper_arm)bones.r_upper_arm.rotation.x=.42*s;
}
function applySource(dt){
  if(!motion.frames?.length)return false;motionTime+=dt;const dur=motion.frames.at(-1)?.t||1,t=motionTime%dur;let f=motion.frames[0];
  for(let i=1;i<motion.frames.length;i++){if(motion.frames[i].t>t)break;f=motion.frames[i]}
  for(const [n,a] of Object.entries(f.angles||{})){const g=bones[n];if(g)g.rotation.z=(avatarMeta.parts[n]?.rest_rotation_z||0)+a*.55}
  return true;
}
function groundLock(){
  if(manifest.game.ground_lock!==false&&player.position.y<floorY){player.position.y=floorY;vy=0;onGround=true}
}
function footIK(){
  if(manifest.game.foot_ik===false)return;
  const bob=Math.min(.035,Math.abs(Math.sin(walkPhase))*0.035);
  if(bones.l_lower_leg)bones.l_lower_leg.position.y=-bob;
  if(bones.r_lower_leg)bones.r_lower_leg.position.y=-(.035-bob);
}
function updateAvatarLOD(){
  const d=camera.position.distanceTo(player.position);
  for(const entries of Object.values(avatarLodObjects)){
    let level=d<8?0:d<18?1:2;
    for(const e of entries)e.mesh.visible=e.level===level;
  }
}

async function updateStreaming(now){
  const chunkWorld=voxelSize*(manifest.voxel.chunk_size||16),r=manifest.voxel.stream_radius_chunks||5,max=manifest.voxel.max_visible_chunks||150;
  const cx=Math.round(player.position.x/chunkWorld),cz=Math.round(player.position.z/chunkWorld);
  const scored=chunkRecords.map(rec=>({rec,d:Math.hypot(rec.chunk[0]-cx,rec.chunk[2]-cz)})).sort((a,b)=>a.d-b.d);
  let count=0;
  for(const it of scored){
    if(it.d<=r&&count<max){await loadChunk(it.rec);it.rec.lastUse=now;count++}else if(it.rec.loaded&&now-it.rec.lastUse>1200)unloadChunk(it.rec);
  }
}

let prev=performance.now(),streamAccum=0,fpsAccum=0,fpsFrames=0,fps=0;
function tick(now){
  const dt=Math.min(.033,(now-prev)/1000);prev=now;fpsAccum+=dt;fpsFrames++;if(fpsAccum>=.5){fps=Math.round(fpsFrames/fpsAccum);fpsAccum=0;fpsFrames=0}
  let x=0,z=0;if(keys.has('KeyW')||keys.has('w')||keys.has('ArrowUp'))z-=1;if(keys.has('KeyS')||keys.has('s')||keys.has('ArrowDown'))z+=1;
  if(keys.has('KeyA')||keys.has('a')||keys.has('ArrowLeft'))x-=1;if(keys.has('KeyD')||keys.has('d')||keys.has('ArrowRight'))x+=1;
  const len=Math.hypot(x,z)||1;x/=len;z/=len;const moving=Math.abs(x)+Math.abs(z)>.01,sp=(keys.has('ShiftLeft')||keys.has('ShiftRight'))?manifest.game.run_speed:manifest.game.walk_speed;
  if(moving){const sy=Math.sin(yaw),cy=Math.cos(yaw),wx=x*cy-z*sy,wz=x*sy+z*cy;player.position.x+=wx*sp*dt;player.position.z+=wz*sp*dt;player.rotation.y=Math.atan2(wx,wz)}
  if(keys.has('Space')&&onGround){vy=manifest.game.jump_speed;onGround=false}vy-=manifest.game.gravity*dt;player.position.y+=vy*dt;
  if(player.position.y<=floorY){player.position.y=floorY;vy=0;onGround=true}
  if(!(sourceMotion&&applySource(dt)))procedural(dt,moving?sp:0);
  groundLock();footIK();updateAvatarLOD();

  streamAccum+=dt;if(streamAccum>.3){streamAccum=0;updateStreaming(now)}
  const target=player.position.clone().add(new THREE.Vector3(0,1.25,0)),dist=4.8;
  camera.position.lerp(new THREE.Vector3(target.x+Math.sin(yaw)*Math.cos(pitch)*dist,target.y+Math.sin(pitch)*dist+1,target.z+Math.cos(yaw)*Math.cos(pitch)*dist),1-Math.exp(-dt*12));
  camera.lookAt(target);renderer.render(scene,camera);
  statusEl.textContent=`V5 · ${fps} FPS · chunks ${chunkRecords.filter(x=>x.loaded).length}/${chunkRecords.length} · nav ${navgrid.width}x${navgrid.height}`;
  requestAnimationFrame(tick);
}
updateStreaming(performance.now());requestAnimationFrame(tick);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight,false)});
