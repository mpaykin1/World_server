import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';

await window.AppCore.init('survival');
const socket = window.AppCore.socket();
socket.emit('survival:join');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc5f1);
scene.fog = new THREE.Fog(0x8fc5f1, 90, 420);
const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, .1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65)); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled=true;
document.body.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd7edff,0x46532e,1.2));
const sun = new THREE.DirectionalLight(0xffffff,2.1); sun.position.set(40,90,30); sun.castShadow=true; scene.add(sun);

const groundMat = new THREE.MeshStandardMaterial({color:0x49633a, roughness:.95});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000,3000,80,80), groundMat); ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
const grid = new THREE.GridHelper(3000,750,0x526547,0x526547); grid.material.opacity=.16; grid.material.transparent=true; scene.add(grid);

const self = { id:null, position:new THREE.Vector3(0,0,0), rotationY:0, running:false, action:'idle', inventory:[], selected:0, hp:100,hunger:100,thirst:100 };
const keys = new Set(); let yaw=0, pitch=.34; let buildMode=false; let selectedPiece='foundation'; let buildRotation=0; let inventoryVisible=true; let lastSend=0; let lastChunkReq=0;
const chunks = new Map(); const resources = new Map(); const resourceMeshes = new Map(); const buildings = new Map(); const remotePlayers = new Map();
const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(0,0);
const interactables = [];

const ITEM_ICON = { wood:'🪵', stone:'🪨', metal_ore:'⛓️', cloth:'🧵', food:'🍖', stone_hatchet:'🪓', pickaxe:'⛏️', campfire:'🔥', storage_box:'📦', door:'🚪' };
const ITEM_NAME = { wood:'Дерево', stone:'Камень', metal_ore:'Руда', cloth:'Ткань', food:'Еда', stone_hatchet:'Каменный топор', pickaxe:'Кирка', campfire:'Костёр', storage_box:'Ящик', door:'Дверь' };
const BUILD_ITEMS = [
  ['foundation','Фундамент','🟫'], ['wall','Стена','🧱'], ['doorway','Проём','🚪'], ['door','Дверь','🚪'],
  ['stairs','Лестница','🪜'], ['campfire','Костёр','🔥'], ['storage_box','Ящик','📦']
];
const CRAFT_ITEMS = [ ['stone_hatchet','🪓 Топор'], ['pickaxe','⛏️ Кирка'], ['campfire','🔥 Костёр'], ['storage_box','📦 Ящик'], ['door','🚪 Дверь'] ];

function makeFacePlane(){
  const canvas=document.createElement('canvas'); canvas.width=256; canvas.height=256;
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,256,256);
  ctx.fillStyle='#24140e';
  ctx.beginPath(); ctx.arc(88,100,13,0,Math.PI*2); ctx.arc(168,100,13,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#5b2d1e'; ctx.lineWidth=8; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(128,116); ctx.lineTo(120,145); ctx.lineTo(137,145); ctx.stroke();
  ctx.strokeStyle='#7b231d'; ctx.lineWidth=9;
  ctx.beginPath(); ctx.arc(128,158,35,0.15*Math.PI,0.85*Math.PI); ctx.stroke();
  ctx.strokeStyle='#3a2017'; ctx.lineWidth=7;
  ctx.beginPath(); ctx.moveTo(68,74); ctx.lineTo(108,66); ctx.moveTo(148,66); ctx.lineTo(188,74); ctx.stroke();
  const tex=new THREE.CanvasTexture(canvas);
  const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide});
  const face=new THREE.Mesh(new THREE.PlaneGeometry(.42,.42),mat); face.position.set(0,0,-.275);
  return face;
}

function createPlayerMesh(color=0x2c6ebd, name='Player'){
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({color:0xf0c6a3, roughness:.55});
  const shirt = new THREE.MeshStandardMaterial({color, roughness:.85});
  const pants = new THREE.MeshStandardMaterial({color:0x263142, roughness:.8});
  const dark = new THREE.MeshStandardMaterial({color:0x17191d, roughness:.7});
  function part(mesh,x,y,z){mesh.position.set(x,y,z); mesh.castShadow=true; g.add(mesh); return mesh;}
  g.userData.torso = part(new THREE.Mesh(new THREE.CapsuleGeometry(.36,.75,10,20),shirt),0,1.35,0);
  g.userData.head = part(new THREE.Mesh(new THREE.SphereGeometry(.28,28,18),skin),0,1.92,0);
  g.userData.head.add(makeFacePlane());
  part(new THREE.Mesh(new THREE.BoxGeometry(.08,.035,.035),dark),-.09,1.95,-.255); part(new THREE.Mesh(new THREE.BoxGeometry(.08,.035,.035),dark),.09,1.95,-.255);
  part(new THREE.Mesh(new THREE.BoxGeometry(.12,.035,.04),new THREE.MeshStandardMaterial({color:0x9a4e42})),0,1.86,-.267);
  g.userData.leftArm = part(new THREE.Mesh(new THREE.CapsuleGeometry(.09,.65,8,14),shirt),-.47,1.28,0);
  g.userData.rightArm = part(new THREE.Mesh(new THREE.CapsuleGeometry(.09,.65,8,14),shirt),.47,1.28,0);
  g.userData.leftLeg = part(new THREE.Mesh(new THREE.CapsuleGeometry(.11,.82,8,14),pants),-.17,.55,0);
  g.userData.rightLeg = part(new THREE.Mesh(new THREE.CapsuleGeometry(.11,.82,8,14),pants),.17,.55,0);
  part(new THREE.Mesh(new THREE.BoxGeometry(.5,.75,.18),new THREE.MeshStandardMaterial({color:0x3b2f25, roughness:.9})),0,1.25,.28);
  const label = makeLabel(name); label.position.set(0,2.45,0); g.userData.label=label; g.add(label);
  return g;
}
function makeLabel(text){
  const canvas=document.createElement('canvas'); canvas.width=512; canvas.height=128; const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(0,0,0,.45)'; ctx.fillRect(0,28,512,72); ctx.fillStyle='#fff'; ctx.font='bold 42px Arial'; ctx.textAlign='center'; ctx.fillText(text,256,78);
  const tex=new THREE.CanvasTexture(canvas); const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true})); spr.scale.set(2.6,.65,1); return spr;
}
function animateHuman(mesh, t, speed, action){
  if(!mesh?.userData) return; const s = speed > .05 ? (speed>10?1.6:1.0) : 0; const phase=t*(speed>10?12:8);
  const swing = Math.sin(phase)*.55*s;
  mesh.userData.leftArm.rotation.x = swing; mesh.userData.rightArm.rotation.x = -swing;
  mesh.userData.leftLeg.rotation.x = -swing*.8; mesh.userData.rightLeg.rotation.x = swing*.8;
  mesh.userData.torso.rotation.x = Math.abs(Math.sin(phase))*0.035*s;
  if(action==='mine') { mesh.userData.rightArm.rotation.x = -1.5 + Math.sin(t*18)*.65; mesh.userData.torso.rotation.x = .18; }
}
const selfMesh = createPlayerMesh(0x336fd1,'you'); scene.add(selfMesh);

function createResourceMesh(r){
  const g=new THREE.Group(); g.position.set(r.position.x,0,r.position.z); g.userData.resourceId=r.id;
  let mesh;
  if(r.type==='tree'){
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.25,.38,3,10),new THREE.MeshStandardMaterial({color:0x76502a})); trunk.position.y=1.5; trunk.castShadow=true; g.add(trunk);
    const crown=new THREE.Mesh(new THREE.ConeGeometry(1.6,3.2,10),new THREE.MeshStandardMaterial({color:0x1f6730})); crown.position.y=3.7; crown.castShadow=true; g.add(crown);
  } else if(r.type==='stone' || r.type==='metal_ore'){
    mesh=new THREE.Mesh(new THREE.DodecahedronGeometry(r.type==='metal_ore'?1.45:1.25,1),new THREE.MeshStandardMaterial({color:r.type==='metal_ore'?0x6b6a70:0x7c8078, roughness:.9, metalness:r.type==='metal_ore'?.35:.0})); mesh.position.y=.8; mesh.scale.y=.7; mesh.castShadow=true; g.add(mesh);
  } else {
    mesh=new THREE.Mesh(new THREE.SphereGeometry(.8,12,8),new THREE.MeshStandardMaterial({color:0x3c8a3e, roughness:.95})); mesh.position.y=.55; mesh.scale.set(1.2,.55,1.2); mesh.castShadow=true; g.add(mesh);
  }
  resourceMeshes.set(r.id,g); resources.set(r.id,r); interactables.push(g); scene.add(g);
}
function updateResource(id, remaining){
  const r=resources.get(id); if(r) r.remaining=remaining;
  const m=resourceMeshes.get(id); if(m && remaining<=0){ scene.remove(m); resourceMeshes.delete(id); const i=interactables.indexOf(m); if(i>=0)interactables.splice(i,1); }
}

function createBuildingMesh(b){
  const g=new THREE.Group(); g.position.set(b.position.x,b.position.y||0,b.position.z); g.rotation.y=b.rotationY||0; g.userData.buildingId=b.id; g.userData.piece=b.piece; g.userData.data=b;
  const wood = new THREE.MeshStandardMaterial({color:0x8a623c, roughness:.85}); const stone=new THREE.MeshStandardMaterial({color:0x6d6d66, roughness:.9}); const ghostMat=wood;
  function add(mesh,x,y,z){mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true; g.add(mesh); return mesh;}
  if(b.piece==='foundation') add(new THREE.Mesh(new THREE.BoxGeometry(4,.35,4),stone),0,.18,0);
  if(b.piece==='wall') add(new THREE.Mesh(new THREE.BoxGeometry(4,3,.28),wood),0,1.5,0);
  if(b.piece==='doorway') { add(new THREE.Mesh(new THREE.BoxGeometry(1.2,3,.25),wood),-1.4,1.5,0); add(new THREE.Mesh(new THREE.BoxGeometry(1.2,3,.25),wood),1.4,1.5,0); add(new THREE.Mesh(new THREE.BoxGeometry(4,.5,.25),wood),0,2.75,0); }
  if(b.piece==='door') add(new THREE.Mesh(new THREE.BoxGeometry(1.7,2.55,.22),new THREE.MeshStandardMaterial({color:0x5b371e})),0,1.28,0);
  if(b.piece==='stairs') { const st=new THREE.Mesh(new THREE.BoxGeometry(4,.35,1),ghostMat); for(let i=0;i<4;i++){ const c=st.clone(); add(c,0,.25+i*.35,-1.5+i*.85); } }
  if(b.piece==='campfire') { add(new THREE.Mesh(new THREE.CylinderGeometry(.7,.9,.35,12),stone),0,.18,0); add(new THREE.Mesh(new THREE.ConeGeometry(.55,1.3,8),new THREE.MeshStandardMaterial({color:0xff7622, emissive:0xff3b00, emissiveIntensity:1.2})),0,.9,0); }
  if(b.piece==='storage_box') add(new THREE.Mesh(new THREE.BoxGeometry(1.8,1.1,1.1),wood),0,.55,0);
  buildings.set(b.id,g); scene.add(g);
}

function buildGhostMesh(piece){
  const temp={id:'ghost',piece,position:{x:0,y:0,z:0},rotationY:0}; const g=createBuildingPreview(temp); return g;
}
function createBuildingPreview(b){
  const g=new THREE.Group(); const mat=new THREE.MeshStandardMaterial({color:0x56e676, transparent:true, opacity:.42, depthWrite:false});
  function add(mesh,x,y,z){mesh.position.set(x,y,z); g.add(mesh); return mesh;}
  if(b.piece==='foundation') add(new THREE.Mesh(new THREE.BoxGeometry(4,.35,4),mat),0,.18,0);
  if(b.piece==='wall') add(new THREE.Mesh(new THREE.BoxGeometry(4,3,.28),mat),0,1.5,0);
  if(b.piece==='doorway') { add(new THREE.Mesh(new THREE.BoxGeometry(1.2,3,.25),mat),-1.4,1.5,0); add(new THREE.Mesh(new THREE.BoxGeometry(1.2,3,.25),mat),1.4,1.5,0); add(new THREE.Mesh(new THREE.BoxGeometry(4,.5,.25),mat),0,2.75,0); }
  if(b.piece==='door') add(new THREE.Mesh(new THREE.BoxGeometry(1.7,2.55,.22),mat),0,1.28,0);
  if(b.piece==='stairs') for(let i=0;i<4;i++) add(new THREE.Mesh(new THREE.BoxGeometry(4,.35,1),mat),0,.25+i*.35,-1.5+i*.85);
  if(b.piece==='campfire') add(new THREE.Mesh(new THREE.CylinderGeometry(.8,.9,.35,12),mat),0,.18,0);
  if(b.piece==='storage_box') add(new THREE.Mesh(new THREE.BoxGeometry(1.8,1.1,1.1),mat),0,.55,0);
  return g;
}
let ghost=createBuildingPreview({piece:selectedPiece}); scene.add(ghost); ghost.visible=false;
function setGhostColor(ok){ ghost.traverse(o=>{ if(o.material){ o.material.color.set(ok?0x5dff72:0xff5555); }}); }

function makeInvSlot(globalIndex, hotbarNumber=null){
  const s=self.inventory[globalIndex];
  const d=document.createElement('div');
  d.className='mcSlot '+((globalIndex>=27 && globalIndex-27===self.selected)?'sel':'');
  d.dataset.i=globalIndex;
  d.innerHTML=(hotbarNumber!==null?`<em class="slotNum">${hotbarNumber}</em>`:'')+(s?`${ITEM_ICON[s.item]||'□'}<span>${s.count>1?s.count:''}</span>`:'');
  d.title=s?`${ITEM_NAME[s.item]||s.item} x${s.count}`:'';
  d.onclick=()=>{ if(globalIndex>=27){ self.selected=globalIndex-27; renderInventory(); }};
  return d;
}
function renderInventory(){
  const grid=document.getElementById('invGrid');
  const invHot=document.getElementById('invHotGrid');
  const hotbar=document.getElementById('hotbarGrid');
  if(grid){ grid.innerHTML=''; for(let i=0;i<27;i++) grid.appendChild(makeInvSlot(i)); }
  if(invHot){ invHot.innerHTML=''; for(let i=27;i<36;i++) invHot.appendChild(makeInvSlot(i,i-26)); }
  if(hotbar){ hotbar.innerHTML=''; for(let i=27;i<36;i++) hotbar.appendChild(makeInvSlot(i,i-26)); }
  const item=currentHotbarItem();
  const nameBox=document.getElementById('itemName');
  if(item){ nameBox.classList.remove('hidden'); nameBox.textContent=ITEM_NAME[item]||item; setTimeout(()=>nameBox.classList.add('hidden'),900); }
}
function renderBuildPanel(){
  const bg=document.getElementById('buildGrid'); bg.innerHTML='';
  for(const [piece,label,icon] of BUILD_ITEMS){ const b=document.createElement('button'); b.className='buildBtn '+(piece===selectedPiece?'active':''); b.innerHTML=`<b>${icon}</b><br>${label}`; b.onclick=()=>{selectedPiece=piece; scene.remove(ghost); ghost=createBuildingPreview({piece}); scene.add(ghost); renderBuildPanel();}; bg.appendChild(b); }
  const cg=document.getElementById('craftGrid'); cg.innerHTML='';
  for(const [item,label] of CRAFT_ITEMS){ const b=document.createElement('button'); b.className='craftBtn'; b.textContent=label; b.onclick=()=>socket.emit('craft:item',{item}); cg.appendChild(b); }
}
renderBuildPanel(); renderInventory();

socket.on('survival:init', data=>{ self.id=data.selfId; Object.assign(self, { inventory:data.player.inventory, hp:data.player.health, hunger:data.player.hunger, thirst:data.player.thirst }); self.position.set(data.player.position.x,0,data.player.position.z); selfMesh.position.copy(self.position); document.getElementById('playerName').textContent=data.player.name; renderInventory(); (data.buildings||[]).forEach(createBuildingMesh); requestChunks(true); });
socket.on('inventory:update', inv=>{ self.inventory=inv; renderInventory(); });
socket.on('chunk:data', arr=>{ for(const chunk of arr){ const key=`${chunk.cx},${chunk.cz}`; if(chunks.has(key)) continue; chunks.set(key,chunk); for(const r of chunk.resources){ if(r.remaining>0) createResourceMesh(r); } createGrass(chunk.cx,chunk.cz); } });
socket.on('resource:update', data=>updateResource(data.id,data.remaining));
socket.on('building:placed', b=>createBuildingMesh(b));
socket.on('survival:players:update', list=>{ for(const p of list){ if(p.id===self.id) continue; let m=remotePlayers.get(p.id); if(!m){ m=createPlayerMesh(0xb65642,p.name); remotePlayers.set(p.id,m); scene.add(m); } m.userData.target=p; } for(const [id,m] of remotePlayers){ if(!list.find(p=>p.id===id)){scene.remove(m); remotePlayers.delete(id);} } });

function createGrass(cx,cz){
  const geo=new THREE.PlaneGeometry(.18,1.1); const mat=new THREE.MeshStandardMaterial({color:0x5d7f35, side:THREE.DoubleSide}); const count=90;
  const mesh=new THREE.InstancedMesh(geo,mat,count); const dummy=new THREE.Object3D(); const rand=mulberry(`${cx},${cz}`);
  for(let i=0;i<count;i++){ dummy.position.set(cx*64+(rand()-.5)*64,.55,cz*64+(rand()-.5)*64); dummy.rotation.y=rand()*Math.PI; dummy.scale.setScalar(.5+rand()*1.1); dummy.updateMatrix(); mesh.setMatrixAt(i,dummy.matrix); }
  scene.add(mesh);
}
function mulberry(seed){let h=0; for(let i=0;i<seed.length;i++)h=Math.imul(31,h)+seed.charCodeAt(i)|0; return function(){h+=0x6D2B79F5;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}

addEventListener('keydown',e=>{
  if(document.activeElement?.id==='chatInput') return;
  keys.add(e.code);
  if(e.code==='KeyB'){ buildMode=!buildMode; document.getElementById('buildState').textContent='B: '+(buildMode?'вкл':'выкл'); }
  if(e.code==='KeyR'){ buildRotation=(buildRotation+Math.PI/2)%(Math.PI*2); }
  if(e.code==='KeyI'||e.code==='KeyE'){ inventoryVisible=!inventoryVisible; document.getElementById('inventory').classList.toggle('hidden',!inventoryVisible); }
  if(/^Digit[1-9]$/.test(e.code)){ self.selected=Number(e.code.slice(5))-1; renderInventory(); }
});
addEventListener('keyup',e=>keys.delete(e.code));
let mouseDown=false; addEventListener('mousedown',e=>{ if(e.button===0){ if(buildMode) placeBuild(); else hitResource(); } mouseDown=true; }); addEventListener('mouseup',()=>mouseDown=false);
addEventListener('mousemove',e=>{ if(document.pointerLockElement || mouseDown){ yaw -= e.movementX*.003; pitch = Math.max(.12, Math.min(.82, pitch - e.movementY*.002)); }});
renderer.domElement.addEventListener('click',()=>renderer.domElement.requestPointerLock?.());
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

function currentHotbarItem(){ return self.inventory[27+self.selected]?.item || self.inventory[self.selected]?.item || null; }
function nearestResource(){
  raycaster.setFromCamera(pointer,camera); const hits=raycaster.intersectObjects(interactables,true); if(hits[0]){ let obj=hits[0].object; while(obj.parent && !obj.userData.resourceId) obj=obj.parent; if(obj.userData.resourceId) return resources.get(obj.userData.resourceId); }
  let best=null, bd=999; for(const r of resources.values()){ if(r.remaining<=0)continue; const d=self.position.distanceTo(new THREE.Vector3(r.position.x,0,r.position.z)); if(d<bd){bd=d; best=r;} } return bd<8?best:null;
}
function hitResource(){ const r=nearestResource(); if(!r) return; socket.emit('resource:hit',{id:r.id,tool:currentHotbarItem()}); self.action='mine'; setTimeout(()=>self.action='idle',350); }
function foundationEdgesForMesh(m){
  const x=m.position.x, z=m.position.z;
  return [
    {x, z:z-2, y:0, rotY:0, support:true},
    {x, z:z+2, y:0, rotY:0, support:true},
    {x:x-2, z, y:0, rotY:Math.PI/2, support:true},
    {x:x+2, z, y:0, rotY:Math.PI/2, support:true}
  ];
}
function nearestClientFoundationEdge(point){
  let best=null, bd=999999;
  for(const m of buildings.values()){
    if(m.userData.piece!=='foundation') continue;
    for(const e of foundationEdgesForMesh(m)){
      const d=(e.x-point.x)*(e.x-point.x)+(e.z-point.z)*(e.z-point.z);
      if(d<bd){bd=d; best=e;}
    }
  }
  return best && bd<3.3*3.3 ? best : null;
}
function nearestClientFoundationCenter(point){
  let best=null, bd=999999;
  for(const m of buildings.values()){
    if(m.userData.piece!=='foundation') continue;
    const d=(m.position.x-point.x)*(m.position.x-point.x)+(m.position.z-point.z)*(m.position.z-point.z);
    if(d<bd){bd=d; best=m;}
  }
  return best && bd<3.3*3.3 ? {x:best.position.x,y:0,z:best.position.z,rotY:buildRotation,support:true} : null;
}
function nearestClientDoorway(point){
  let best=null, bd=999999;
  for(const m of buildings.values()){
    if(m.userData.piece!=='doorway') continue;
    const d=(m.position.x-point.x)*(m.position.x-point.x)+(m.position.z-point.z)*(m.position.z-point.z);
    if(d<bd){bd=d; best=m;}
  }
  return best && bd<1.8*1.8 ? {x:best.position.x,y:0,z:best.position.z,rotY:best.rotation.y,support:true} : null;
}
function getBuildSnapFromCrosshair(){
  raycaster.setFromCamera(pointer,camera);
  const plane = new THREE.Plane(new THREE.Vector3(0,1,0),0);
  const hit=new THREE.Vector3(); raycaster.ray.intersectPlane(plane,hit);
  if(selectedPiece==='foundation') return {x:Math.round(hit.x/4)*4,y:0,z:Math.round(hit.z/4)*4,rotY:0,support:true};
  if(selectedPiece==='wall'||selectedPiece==='doorway'){
    const e=nearestClientFoundationEdge(hit);
    if(e) return e;
    const gx=Math.round(hit.x/4)*4, gz=Math.round(hit.z/4)*4, lx=hit.x-gx, lz=hit.z-gz;
    return Math.abs(lx)>Math.abs(lz) ? {x:gx+Math.sign(lx||1)*2,y:0,z:gz,rotY:Math.PI/2,support:false} : {x:gx,y:0,z:gz+Math.sign(lz||1)*2,rotY:0,support:false};
  }
  if(selectedPiece==='door') return nearestClientDoorway(hit) || {x:Math.round(hit.x/4)*4,y:0,z:Math.round(hit.z/4)*4,rotY:buildRotation,support:false};
  if(selectedPiece==='stairs') return nearestClientFoundationCenter(hit) || {x:Math.round(hit.x/4)*4,y:0,z:Math.round(hit.z/4)*4,rotY:buildRotation,support:false};
  return {x:Math.round(hit.x/4)*4,y:0,z:Math.round(hit.z/4)*4,rotY:buildRotation,support:true};
}
function updateGhost(){
  ghost.visible=buildMode; if(!buildMode) return;
  const snap=getBuildSnapFromCrosshair();
  ghost.position.set(snap.x,snap.y,snap.z); ghost.rotation.y=snap.rotY||0;
  const near=self.position.distanceTo(new THREE.Vector3(snap.x,0,snap.z))<14;
  const supportOk = selectedPiece==='foundation' || selectedPiece==='campfire' || selectedPiece==='storage_box' || Boolean(snap.support);
  setGhostColor(near && supportOk);
}
function placeBuild(){ if(!ghost.visible) return; socket.emit('build:place',{piece:selectedPiece,position:{x:ghost.position.x,y:0,z:ghost.position.z},rotationY:ghost.rotation.y}); }
function requestChunks(force=false){
  const now=performance.now(); if(!force && now-lastChunkReq<850) return; lastChunkReq=now;
  const cx=Math.round(self.position.x/64), cz=Math.round(self.position.z/64); const req=[];
  for(let x=cx-2;x<=cx+2;x++) for(let z=cz-2;z<=cz+2;z++) if(!chunks.has(`${x},${z}`)) req.push({x,z});
  if(req.length) socket.emit('chunk:request',{chunks:req});
}
function updateStats(){ document.getElementById('hpBar').style.width=self.hp+'%'; document.getElementById('hunBar').style.width=self.hunger+'%'; document.getElementById('thrBar').style.width=self.thirst+'%'; }
function updatePrompt(){ const r=nearestResource(); const p=document.getElementById('damagePrompt'); if(r && !buildMode){ p.classList.remove('hidden'); p.textContent=`ЛКМ — добыть: ${r.type} (${Math.ceil(r.remaining)} hp)`; } else p.classList.add('hidden'); }

let last=performance.now();
function frame(now){
  requestAnimationFrame(frame); const dt=Math.min(.05,(now-last)/1000); last=now;
  const forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)); const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)); const move=new THREE.Vector3();
  if(keys.has('KeyW')) move.add(forward); if(keys.has('KeyS')) move.sub(forward); if(keys.has('KeyD')) move.add(right); if(keys.has('KeyA')) move.sub(right);
  self.running=keys.has('ShiftLeft'); const speed=self.running?13:7;
  const old=self.position.clone(); if(move.lengthSq()>0){ move.normalize().multiplyScalar(speed*dt); self.position.add(move); self.rotationY=yaw; self.action=self.action==='mine'?'mine':(self.running?'run':'walk'); } else if(self.action!=='mine') self.action='idle';
  selfMesh.position.copy(self.position); selfMesh.rotation.y=yaw; animateHuman(selfMesh,now/1000,self.position.distanceTo(old)/dt,self.action);
  const camOffset=new THREE.Vector3(Math.sin(yaw)*-8,5+pitch*5,Math.cos(yaw)*-8); camera.position.lerp(self.position.clone().add(camOffset),.16); camera.lookAt(self.position.x,self.position.y+1.45,self.position.z);
  for(const m of remotePlayers.values()){ const t=m.userData.target; if(t){ m.position.lerp(new THREE.Vector3(t.position.x,0,t.position.z),.28); m.rotation.y=t.rotationY||0; animateHuman(m,now/1000,t.running?12:7,t.action); m.userData.label.lookAt(camera.position); }}
  selfMesh.userData.label.lookAt(camera.position);
  updateGhost(); updatePrompt(); requestChunks(false); updateStats();
  if(now-lastSend>80){ lastSend=now; socket.emit('survival:state',{position:{x:self.position.x,y:0,z:self.position.z},rotationY:self.rotationY,running:self.running,action:self.action}); }
  renderer.render(scene,camera);
}
requestAnimationFrame(frame);
