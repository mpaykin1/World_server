import '/shared/graphics/universal-voxel-microdetail-bootstrap.js';
import * as THREE from 'three';
import { BeaconTower, ROCK_DARK, ROCK_MID, ROCK_LIT, hash2 } from '/shared/dark-void-scene-runtime.mjs';

const mobile=matchMedia('(pointer:coarse)').matches||Math.min(innerWidth,innerHeight)<760;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x18232c);
scene.fog=new THREE.FogExp2(0x29333a,mobile?.022:.018);
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.05,150);
const renderer=new THREE.WebGLRenderer({antialias:!mobile,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile?1:1.3));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.06;
renderer.shadowMap.enabled=!mobile;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
window.GoldenPaintingAtmosphere?.registerThree({THREE,scene,renderer,getCamera:()=>camera,worldId:'voxel-art-render-mvp'});
window.WorldQualityAutopilot?.registerRenderer('voxel-art-render-mvp',renderer,{initialTier:mobile?'BALANCED':'HIGH',targetFps:mobile?40:55,onQualityChange(q){renderer.shadowMap.enabled=!mobile&&q.shadowQuality>0;},getStats(){return{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}}});

scene.add(new THREE.HemisphereLight(0xb9d3e8,0x30251f,1.75));
const key=new THREE.DirectionalLight(0xffd18d,2.15);
key.position.set(-9,15,8);key.castShadow=!mobile;key.shadow.mapSize.set(1024,1024);scene.add(key);
const rim=new THREE.DirectionalLight(0x8fc8ff,1.7);rim.position.set(10,8,-9);scene.add(rim);
const world=new THREE.Group();scene.add(world);
const fx=new THREE.Group();scene.add(fx);
const box=new THREE.BoxGeometry(1,1,1);
const tmpM=new THREE.Matrix4(),tmpP=new THREE.Vector3(),tmpS=new THREE.Vector3(),tmpQ=new THREE.Quaternion();
const tag=(obj,semantic,importance=1)=>window.UniversalVoxelMicrodetail?.tag(obj,semantic,importance)||obj;
const mat=(color,opts={})=>new THREE.MeshStandardMaterial({color,roughness:opts.roughness??.86,metalness:opts.metalness??.04,emissive:opts.emissive??0x000000,emissiveIntensity:opts.emissiveIntensity??0,vertexColors:opts.vertexColors??false,transparent:opts.transparent??false,opacity:opts.opacity??1});
function groundHeight(x,z){return .05+Math.sin(x*.31)*.07+Math.cos(z*.27)*.06+Math.sin((x+z)*.18)*.035;}
function buildTerrain(){
  const n=34,cell=.72,count=n*n,material=mat(0xffffff,{roughness:.96,vertexColors:true});
  window.UniversalVoxelMicrodetail?.runtime?.patchMaterial(material,'stone');
  const mesh=new THREE.InstancedMesh(box,material,count);mesh.name='VoxelGround';mesh.receiveShadow=true;
  let i=0;
  for(let gx=0;gx<n;gx++)for(let gz=0;gz<n;gz++){
    const x=(gx-(n-1)/2)*cell,z=(gz-(n-1)/2)*cell,h=groundHeight(x,z);
    tmpP.set(x,h-.23,z);tmpS.set(cell*.985,.46,cell*.985);tmpM.compose(tmpP,tmpQ.identity(),tmpS);mesh.setMatrixAt(i,tmpM);
    const tone=.18+hash2(gx*1.7,gz*2.3)*.28;mesh.setColorAt(i,ROCK_MID.clone().lerp(ROCK_LIT,tone));i++;
  }
  mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  world.add(tag(mesh,'stone',1.2));return mesh;
}
buildTerrain();
function buildRuins(){
  const cells=[];
  const centers=[[-7,-6],[7,-5],[-6,5],[6,6]];
  for(const center of centers){
    const cx=center[0],cz=center[1];
    for(let y=0;y<6;y++)for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){
      const edge=Math.abs(x)===2||Math.abs(z)===2;
      const door=z===2&&Math.abs(x)<1&&y<3;
      const broken=hash2(cx+x*3+y,cz+z*5+y)>.86&&y>2;
      if(edge&&!door&&!broken)cells.push([cx+x*.58,y*.52,cz+z*.58]);
    }
  }
  const material=mat(0xffffff,{roughness:.9,vertexColors:true});
  window.UniversalVoxelMicrodetail?.runtime?.patchMaterial(material,'brick');
  const mesh=new THREE.InstancedMesh(box,material,cells.length);
  cells.forEach((c,i)=>{
    const h=groundHeight(c[0],c[2]);
    tmpP.set(c[0],h+.26+c[1],c[2]);tmpS.set(.54,.5,.54);
    tmpM.compose(tmpP,tmpQ.identity(),tmpS);mesh.setMatrixAt(i,tmpM);
    mesh.setColorAt(i,ROCK_MID.clone().lerp(ROCK_LIT,.24+hash2(i,7)*.24));
  });
  mesh.instanceMatrix.needsUpdate=true;
  if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  mesh.castShadow=!mobile;mesh.receiveShadow=true;mesh.name='RuinVoxels';
  world.add(tag(mesh,'brick',1.35));
  return centers.map(c=>({minX:c[0]-1.8,maxX:c[0]+1.8,minZ:c[1]-1.8,maxZ:c[1]+1.8}));
}
const colliders=buildRuins();
function buildTrees(){
  const trunks=[];
  const leaves=[];
  for(let i=0;i<18;i++){
    const a=i*.73;
    const r=8.5+(i%4)*1.05;
    const x=Math.cos(a)*r;
    const z=Math.sin(a)*r;
    if(Math.abs(x)<3&&z<-7)continue;
    const h=groundHeight(x,z);
    trunks.push([x,h+.75,z]);
    for(let y=0;y<4;y++){
      const radius=Math.max(1,3-y);
      for(let dx=-radius;dx<=radius;dx++){
        for(let dz=-radius;dz<=radius;dz++){
          if(Math.abs(dx)+Math.abs(dz)<=radius+1)leaves.push([x+dx*.36,h+1.5+y*.34,z+dz*.36]);
        }
      }
    }
  }
  const trunkMat=mat(0x5a3824,{roughness:.96});window.UniversalVoxelMicrodetail?.runtime?.patchMaterial(trunkMat,'wood');
  const tm=new THREE.InstancedMesh(box,trunkMat,trunks.length);
  trunks.forEach((c,i)=>{
    tmpP.set(c[0],c[1],c[2]);tmpS.set(.32,1.5,.32);
    tmpM.compose(tmpP,tmpQ.identity(),tmpS);tm.setMatrixAt(i,tmpM);
  });
  tm.instanceMatrix.needsUpdate=true;
  world.add(tag(tm,'wood',.8));
  const leafMat=mat(0x314b38,{roughness:.95});window.UniversalVoxelMicrodetail?.runtime?.patchMaterial(leafMat,'vegetation');
  const lm=new THREE.InstancedMesh(box,leafMat,leaves.length);
  leaves.forEach((c,i)=>{
    tmpP.set(c[0],c[1],c[2]);tmpS.set(.34,.34,.34);
    tmpM.compose(tmpP,tmpQ.identity(),tmpS);lm.setMatrixAt(i,tmpM);
  });
  lm.instanceMatrix.needsUpdate=true;
  world.add(tag(lm,'vegetation',.65));
}
buildTrees();
const beacon=new BeaconTower();
beacon.group.position.set(0,2.2,-10.2);
scene.add(beacon.group);
const portalPos=new THREE.Vector3(0,groundHeight(0,-10.2)+.6,-10.2);
const portalRing=new THREE.Mesh(new THREE.TorusGeometry(1.25,.14,6,24),mat(0xff783f,{roughness:.42,emissive:0xff4c16,emissiveIntensity:2.4}));
portalRing.position.copy(portalPos).add(new THREE.Vector3(0,1.1,0));
portalRing.rotation.x=Math.PI/2;
scene.add(portalRing);
const portalLight=new THREE.PointLight(0xff6e3c,4,16,1.6);
portalLight.position.copy(portalRing.position);
scene.add(portalLight);

function cubePart(parent,size,pos,color,opts={}){
  const m=new THREE.Mesh(box,mat(color,opts));
  m.scale.set(size[0],size[1],size[2]);m.position.set(pos[0],pos[1],pos[2]);
  m.castShadow=!mobile;m.receiveShadow=true;parent.add(m);return m;
}
const playerModel=new THREE.Group();scene.add(playerModel);
cubePart(playerModel,[.72,.88,.54],[0,.76,0],0x426b78,{roughness:.62,metalness:.24});
cubePart(playerModel,[.56,.5,.5],[0,1.47,0],0x8fa89f,{roughness:.64,metalness:.16});
cubePart(playerModel,[.16,.55,.16],[-.47,.78,0],0x273742,{roughness:.7,metalness:.25});
cubePart(playerModel,[.16,.55,.16],[.47,.78,0],0x273742,{roughness:.7,metalness:.25});
cubePart(playerModel,[.22,.52,.22],[-.22,.23,0],0x26343b,{roughness:.8});
cubePart(playerModel,[.22,.52,.22],[.22,.23,0],0x26343b,{roughness:.8});
const player={x:0,z:7.4,yaw:0,pitch:-.12,health:100,alive:true,won:false,collected:0,shotCount:0,hitCooldown:0};

const crystalPositions=[[-8,0],[-3,-6],[7,-1],[6,8],[-7,7]];
const crystals=[];
for(let index=0;index<crystalPositions.length;index++){
  const p=crystalPositions[index];
  const g=new THREE.Group();
  g.position.set(p[0],groundHeight(p[0],p[1])+.65,p[1]);world.add(g);
  cubePart(g,[.34,1.05,.34],[0,.45,0],0x7fd7ff,{roughness:.28,emissive:0x2d8eff,emissiveIntensity:2.5});
  const sides=[[.34,0],[-.34,0],[0,.34],[0,-.34]];
  for(const side of sides){
    cubePart(g,[.2,.58,.2],[side[0],.25,side[1]],0x5ab8f0,{roughness:.3,emissive:0x237ac5,emissiveIntensity:2});
  }
  const light=new THREE.PointLight(0x6bcaff,2.6,6,1.5);
  light.position.y=.7;g.add(light);
  g.userData={index:index,collected:false,baseY:g.position.y};
  crystals.push(g);
}
function makeDrone(x,z,i){
  const g=new THREE.Group();
  g.position.set(x,groundHeight(x,z)+1,z);world.add(g);
  cubePart(g,[.7,.42,.7],[0,0,0],0x7d2d2a,{roughness:.58,metalness:.3,emissive:0x42100f,emissiveIntensity:.5});
  cubePart(g,[.22,.22,.22],[0,0,.46],0xffa25a,{roughness:.35,emissive:0xff5a24,emissiveIntensity:2.8});
  cubePart(g,[.3,.12,.6],[-.52,0,0],0x352e31,{roughness:.7,metalness:.4});
  cubePart(g,[.3,.12,.6],[.52,0,0],0x352e31,{roughness:.7,metalness:.4});
  g.userData={health:2,alive:true,phase:i*2.1,spawn:new THREE.Vector3(x,g.position.y,z),flash:0};
  return g;
}
const enemies=[makeDrone(-4,-1,0),makeDrone(4,3,1),makeDrone(1,-6,2)];
const keys=new Set();
const touchMove={x:0,y:0},touchLook={x:0,y:0};
addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='KeyF')shoot();});
addEventListener('keyup',e=>keys.delete(e.code));
renderer.domElement.addEventListener('click',()=>{
  if(document.pointerLockElement===renderer.domElement)shoot();
  else renderer.domElement.requestPointerLock?.();
});
addEventListener('mousemove',e=>{
  if(document.pointerLockElement!==renderer.domElement)return;
  player.yaw-=e.movementX*.0026;
  player.pitch=THREE.MathUtils.clamp(player.pitch-e.movementY*.0021,-.55,.42);
});
function wirePad(id,knobId,state){
  const el=document.getElementById(id),knob=document.getElementById(knobId);
  let active=null;
  const move=e=>{
    if(active!==e.pointerId)return;
    const r=el.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
    const max=r.width*.31,len=Math.hypot(dx,dy)||1,s=Math.min(1,max/len),px=dx*s,py=dy*s;
    state.x=px/max;state.y=py/max;knob.style.transform='translate('+px+'px,'+py+'px)';
  };
  el.addEventListener('pointerdown',e=>{active=e.pointerId;el.setPointerCapture?.(e.pointerId);move(e);});
  el.addEventListener('pointermove',move);
  const end=e=>{if(active!==e.pointerId)return;active=null;state.x=state.y=0;knob.style.transform='';};
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
}
wirePad('movePad','moveKnob',touchMove);
wirePad('lookPad','lookKnob',touchLook);
document.getElementById('shootBtn')?.addEventListener('pointerdown',e=>{e.preventDefault();shoot();});
document.getElementById('restart')?.addEventListener('click',restart);

const rayDir=new THREE.Vector3();
const toEnemy=new THREE.Vector3();
const shotOrb=new THREE.Mesh(new THREE.SphereGeometry(.08,6,4),mat(0xffdfa0,{roughness:.2,emissive:0xff9f32,emissiveIntensity:4,transparent:true,opacity:0}));
scene.add(shotOrb);
let shotLife=0;
function forwardVector(){
  return new THREE.Vector3(-Math.sin(player.yaw),Math.sin(player.pitch),-Math.cos(player.yaw)).normalize();
}
function shoot(){
  if(!player.alive||player.won)return;
  player.shotCount++;shotLife=.11;rayDir.copy(forwardVector());
  shotOrb.position.copy(camera.position).addScaledVector(rayDir,.9);shotOrb.material.opacity=1;
  let best=null,bestProj=Infinity;
  for(const enemy of enemies){
    if(!enemy.userData.alive)continue;
    toEnemy.copy(enemy.position).sub(camera.position);
    const proj=toEnemy.dot(rayDir);
    if(proj<=0||proj>20)continue;
    const miss=toEnemy.clone().addScaledVector(rayDir,-proj).length();
    if(miss<.78&&proj<bestProj){best=enemy;bestProj=proj;}
  }
  if(best){
    best.userData.health--;best.userData.flash=.18;
    if(best.userData.health<=0){best.userData.alive=false;best.visible=false;showMessage('Дрон уничтожен');}
  }
  playShot();
}
let audioCtx=null;
function playShot(){
  try{
    audioCtx||=new(window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type='square';o.frequency.setValueAtTime(220,audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(80,audioCtx.currentTime+.08);
    g.gain.setValueAtTime(.08,audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.09);
    o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.1);
  }catch{}
}

const msg=document.getElementById('message');
const objective=document.getElementById('objective');
const crystalText=document.getElementById('crystals');
const healthText=document.getElementById('health');
let messageUntil=0;
function showMessage(text,hold=1300){msg.textContent=text;msg.classList.add('show');messageUntil=performance.now()+hold;}
function updateHud(){crystalText.textContent='Кристаллы '+player.collected+'/5';healthText.textContent='Здоровье '+Math.max(0,Math.round(player.health));}
function activatePortal(){
  portalRing.material.color.set(0x7dffb6);portalRing.material.emissive.set(0x26ff7a);
  portalLight.color.set(0x55ff9c);portalLight.intensity=7;
  beacon.flameMesh?.material.color.set(0x79ffb0);
  if(beacon.flameLight){beacon.flameLight.color.set(0x55ff9c);beacon.flameLight.intensity=11;}
  objective.textContent='Маяк открыт! Войди в зелёный портал.';
  showMessage('Все кристаллы собраны',1900);
}
function collectCrystal(c){
  if(c.userData.collected)return;
  c.userData.collected=true;c.visible=false;player.collected++;updateHud();
  showMessage('Кристалл '+player.collected+'/5');
  if(player.collected===crystals.length)activatePortal();
}
function insideCollider(x,z,r=.32){
  return colliders.some(c=>x>c.minX-r&&x<c.maxX+r&&z>c.minZ-r&&z<c.maxZ+r);
}
function tryMove(dx,dz){
  const nx=THREE.MathUtils.clamp(player.x+dx,-11.5,11.5);
  const nz=THREE.MathUtils.clamp(player.z+dz,-11.5,11.5);
  if(!insideCollider(nx,player.z))player.x=nx;
  if(!insideCollider(player.x,nz))player.z=nz;
}
function updateMovement(dt){
  if(!player.alive||player.won)return;
  let f=0,s=0;
  if(keys.has('KeyW')||keys.has('ArrowUp'))f+=1;
  if(keys.has('KeyS')||keys.has('ArrowDown'))f-=1;
  if(keys.has('KeyD')||keys.has('ArrowRight'))s+=1;
  if(keys.has('KeyA')||keys.has('ArrowLeft'))s-=1;
  f-=touchMove.y;s+=touchMove.x;
  const len=Math.hypot(f,s);
  if(len>1){f/=len;s/=len;}
  const speed=(keys.has('ShiftLeft')?5.4:4.1)*dt;
  const sy=Math.sin(player.yaw),cy=Math.cos(player.yaw);
  tryMove((-sy*f+cy*s)*speed,(-cy*f-sy*s)*speed);
  player.yaw-=touchLook.x*dt*2.15;
  player.pitch=THREE.MathUtils.clamp(player.pitch-touchLook.y*dt*1.35,-.55,.42);
}
function updatePlayerModel(){
  const y=groundHeight(player.x,player.z);
  playerModel.position.set(player.x,y,player.z);playerModel.rotation.y=player.yaw;
  const forward=forwardVector();
  const flatForward=new THREE.Vector3(forward.x,0,forward.z).normalize();
  const target=new THREE.Vector3(player.x,y+1.15,player.z);
  const desired=target.clone().addScaledVector(flatForward,-8.4).add(new THREE.Vector3(0,4.4,0));
  camera.position.lerp(desired,.28);
  const look=target.clone().addScaledVector(forward,3.2);
  camera.lookAt(look);
}
function updateCrystals(now){
  for(const c of crystals){
    if(c.userData.collected)continue;
    c.rotation.y=now*.0012+c.userData.index;
    c.position.y=c.userData.baseY+(reducedMotion?0:Math.sin(now*.002+c.userData.index)*.12);
    if(Math.hypot(player.x-c.position.x,player.z-c.position.z)<1.15)collectCrystal(c);
  }
  portalRing.rotation.z=now*.0007;
}
function updateEnemies(now,dt){
  player.hitCooldown=Math.max(0,player.hitCooldown-dt);
  for(const e of enemies){
    if(!e.userData.alive)continue;
    e.userData.flash=Math.max(0,e.userData.flash-dt);
    e.scale.setScalar(e.userData.flash>0?1.14:1);
    const dx=player.x-e.position.x,dz=player.z-e.position.z,d=Math.hypot(dx,dz)||1;
    if(d<10&&d>1.55){
      e.position.x+=dx/d*dt*1.25;e.position.z+=dz/d*dt*1.25;
    }else if(d>=10){
      e.position.x=e.userData.spawn.x+Math.sin(now*.0006+e.userData.phase)*1.2;
      e.position.z=e.userData.spawn.z+Math.cos(now*.00055+e.userData.phase)*1.2;
    }
    e.position.y=groundHeight(e.position.x,e.position.z)+.95+(reducedMotion?0:Math.sin(now*.003+e.userData.phase)*.12);
    e.rotation.y=now*.001+e.userData.phase;
    if(d<1.35&&player.hitCooldown<=0){
      player.health-=12;player.hitCooldown=.8;showMessage('Дрон атакует!');updateHud();
      if(player.health<=0){player.alive=false;objective.textContent='Ты проиграл. Нажми «заново».';showMessage('Попробуй ещё раз',2400);}
    }
  }
}
function checkWin(){
  const d=Math.hypot(player.x-portalPos.x,player.z-portalPos.z);
  if(!player.won&&player.collected===crystals.length&&d<1.75){
    player.won=true;objective.textContent='Победа! Voxel Keep очищен.';showMessage('ПОБЕДА',4000);
  }
}
function updateGame(now,dt){
  updateMovement(dt);updatePlayerModel();updateCrystals(now);updateEnemies(now,dt);checkWin();
  if(shotLife>0){
    shotLife-=dt;shotOrb.position.addScaledVector(rayDir,dt*32);shotOrb.material.opacity=Math.max(0,shotLife/.11);
  }else shotOrb.material.opacity=0;
  if(messageUntil&&now>messageUntil){msg.classList.remove('show');messageUntil=0;}
}
function resetPortal(){
  portalRing.material.color.set(0xff783f);portalRing.material.emissive.set(0xff4c16);
  portalLight.color.set(0xff6e3c);portalLight.intensity=4;
  beacon.flameMesh?.material.color.set(0xff9a3c);
  if(beacon.flameLight){beacon.flameLight.color.set(0xff9a3c);beacon.flameLight.intensity=8;}
}
function restart(){
  player.x=0;player.z=7.4;player.yaw=0;player.pitch=-.12;player.health=100;
  player.alive=true;player.won=false;player.collected=0;player.shotCount=0;player.hitCooldown=0;
  crystals.forEach(c=>{c.userData.collected=false;c.visible=true;c.position.y=c.userData.baseY;});
  enemies.forEach(e=>{e.userData.health=2;e.userData.alive=true;e.visible=true;e.position.copy(e.userData.spawn);});
  resetPortal();
  objective.textContent='Собери 5 кристаллов. После этого войди в огненный маяк.';
  msg.classList.remove('show');messageUntil=0;updateHud();updatePlayerModel();
}
updateHud();restart();

let last=performance.now();
function frame(now){
  const dt=Math.min(.045,(now-last)/1000||.016);last=now;
  updateGame(now,dt);renderer.render(scene,camera);requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
function sampleCenter(){
  renderer.render(scene,camera);
  const gl=renderer.getContext(),p=new Uint8Array(4);
  const x=Math.floor(gl.drawingBufferWidth/2),y=Math.floor(gl.drawingBufferHeight/2);
  try{gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);}catch{}
  return Array.from(p);
}
function snapshot(){
  return {ready:true,player:[player.x,groundHeight(player.x,player.z),player.z],health:player.health,collected:player.collected,total:crystals.length,alive:player.alive,won:player.won,shots:player.shotCount,enemiesAlive:enemies.filter(e=>e.userData.alive).length,renderCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,microdetail:window.UniversalVoxelMicrodetail?.stats?.()||null};
}
window.__VOXEL_ART_MVP__={
  ready:true,
  version:'1.0.0',
  features:['world-server-voxel-baseline','golden-painting','golden-quality','universal-voxel-microdetail-v2','collectibles','enemies','shooting','desktop-controls','mobile-dual-stick','win-condition'],
  snapshot,
  renderOnce(){renderer.render(scene,camera);return snapshot();},
  sampleCenter,
  step(dt=.1){updateGame(performance.now(),Math.max(.001,Math.min(.25,Number(dt)||.1)));renderer.render(scene,camera);return snapshot();},
  teleportToCrystal(i){const c=crystals[i];if(c&&!c.userData.collected){player.x=c.position.x;player.z=c.position.z;}return snapshot();},
  collectAllForTest(){for(const c of crystals)collectCrystal(c);return snapshot();},
  teleportToBeacon(){player.x=portalPos.x;player.z=portalPos.z;return snapshot();},
  shoot,
  restart,
  renderer,
  scene,
  camera,
  playerModel,
  crystals,
  enemies,
  beacon
};
