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

const _itemIcon=(key)=>{ const c=document.createElement('canvas'); c.width=24; c.height=24; const ctx=c.getContext('2d');
const _d=_itemIcon._d; if(!_d[key])return ''; _d[key](ctx,24,24); const src=c.toDataURL(); return `<img src="${src}">`; };
_itemIcon._d={
  wood(ctx,w,h){ ctx.fillStyle='#8b6b4a'; ctx.fillRect(2,2,w-4,h-4); for(let i=0;i<8;i++){ const y=3+i*3; ctx.strokeStyle='rgba(60,35,15,.3)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(3,y); ctx.lineTo(w-3,y+(i%2?0:1)); ctx.stroke(); } },
  stone(ctx,w,h){ ctx.fillStyle='#7a7a72'; ctx.beginPath(); ctx.arc(w/2,h/2,w/2-2,0,Math.PI*2); ctx.fill(); for(let i=0;i<6;i++){ ctx.fillStyle='rgba(50,50,45,.4)'; ctx.beginPath(); ctx.arc(4+Math.random()*(w-8),4+Math.random()*(h-8),1+Math.random()*3,0,Math.PI*2); ctx.fill(); } },
  metal_ore(ctx,w,h){ ctx.fillStyle='#4a4a4a'; ctx.beginPath(); for(let i=0;i<6;i++){ const a=i/6*Math.PI*2-Math.PI/2; ctx[i?'lineTo':'moveTo'](w/2+Math.cos(a)*(w/2-2),h/2+Math.sin(a)*(h/2-2)); } ctx.closePath(); ctx.fill(); for(let i=0;i<6;i++){ ctx.fillStyle='rgba(180,120,40,.5)'; ctx.beginPath(); ctx.arc(3+Math.random()*(w-6),3+Math.random()*(h-6),1+Math.random()*2,0,Math.PI*2); ctx.fill(); } for(let i=0;i<3;i++){ ctx.fillStyle='rgba(220,210,190,.7)'; ctx.beginPath(); ctx.arc(4+Math.random()*(w-8),4+Math.random()*(h-8),.5+Math.random(),0,Math.PI*2); ctx.fill(); } },
  cloth(ctx,w,h){ ctx.fillStyle='#a08060'; ctx.fillRect(2,2,w-4,h-4); for(let x=4;x<w-2;x+=4){ ctx.strokeStyle='rgba(140,110,80,.4)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x,2); ctx.lineTo(x-1,h-2); ctx.stroke(); } for(let y=4;y<h-2;y+=4){ ctx.strokeStyle='rgba(140,110,80,.3)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(2,y); ctx.lineTo(w-2,y-1); ctx.stroke(); } },
  food(ctx,w,h){ ctx.fillStyle='#c04020'; ctx.beginPath(); ctx.ellipse(w/2+2,h/2-1,5,7,0,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#d06030'; ctx.beginPath(); ctx.ellipse(w/2-1,h/2+2,4,6,.3,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#a03010'; ctx.beginPath(); ctx.arc(w/2-2,h/2-5,2,0,Math.PI*2); ctx.fill(); },
  stone_hatchet(ctx,w,h){ ctx.strokeStyle='#6b4226'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(5,h-3); ctx.lineTo(12,8); ctx.stroke(); ctx.fillStyle='#888880'; ctx.beginPath(); ctx.moveTo(10,2); ctx.lineTo(20,5); ctx.lineTo(16,14); ctx.closePath(); ctx.fill(); ctx.strokeStyle='#555'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(10,2); ctx.lineTo(20,5); ctx.lineTo(16,14); ctx.closePath(); ctx.stroke(); },
  pickaxe(ctx,w,h){ ctx.strokeStyle='#6b4226'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(6,h-3); ctx.lineTo(12,7); ctx.stroke(); ctx.fillStyle='#888880'; ctx.beginPath(); ctx.moveTo(14,7); ctx.lineTo(20,4); ctx.lineTo(22,10); ctx.lineTo(16,12); ctx.closePath(); ctx.fill(); ctx.strokeStyle='#555'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(14,7); ctx.lineTo(20,4); ctx.lineTo(22,10); ctx.lineTo(16,12); ctx.closePath(); ctx.stroke(); },
  campfire(ctx,w,h){ ctx.fillStyle='#603010'; for(let i=0;i<3;i++) ctx.fillRect(7+i*4,h-4,2,2); ctx.fillStyle='#ff6000'; ctx.beginPath(); ctx.moveTo(w/2,h-2); ctx.lineTo(6,h-6); ctx.lineTo(w/2,6); ctx.closePath(); ctx.fill(); ctx.fillStyle='#ffcc00'; ctx.beginPath(); ctx.moveTo(w/2,h-4); ctx.lineTo(10,h-8); ctx.lineTo(w/2,10); ctx.closePath(); ctx.fill(); },
  storage_box(ctx,w,h){ ctx.fillStyle='#7a5a3a'; ctx.fillRect(3,6,w-6,h-8); ctx.fillStyle='#8a6a4a'; ctx.fillRect(2,4,w-4,4); ctx.fillStyle='#b08050'; ctx.fillRect(w/2-3,5,6,4); ctx.strokeStyle='#5a3a2a'; ctx.lineWidth=1; ctx.strokeRect(3,6,w-6,h-8); },
  door(ctx,w,h){ ctx.fillStyle='#5b371e'; ctx.fillRect(4,2,w-10,h-4); ctx.fillStyle='#7a5030'; ctx.fillRect(5,3,w-12,h-6); ctx.fillStyle='#b09070'; ctx.beginPath(); ctx.arc(w-9,h/2,2,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#3a2210'; ctx.lineWidth=1; ctx.strokeRect(4,2,w-10,h-4); },
};
const ITEM_ICON = { wood:_itemIcon('wood'), stone:_itemIcon('stone'), metal_ore:_itemIcon('metal_ore'), cloth:_itemIcon('cloth'), food:_itemIcon('food'), stone_hatchet:'🪓', pickaxe:'⛏️', campfire:_itemIcon('campfire'), storage_box:_itemIcon('storage_box'), door:_itemIcon('door') };
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

function makeCanvas(w,h,fn){ const c=document.createElement('canvas'); c.width=w; c.height=h; const ctx=c.getContext('2d'); fn(ctx,w,h); return c; }
function texRepeat(t){ t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(2,2); return t; }
const _texCache={};
function getTex(key,gen){ if(!_texCache[key]){ const c=gen(); _texCache[key]=new THREE.CanvasTexture(c); _texCache[key].needsUpdate=true; } return _texCache[key]; }
function makeWoodTex(){ return makeCanvas(128,256,(ctx,w,h)=>{ ctx.fillStyle='#8b6b4a'; ctx.fillRect(0,0,w,h); for(let i=0;i<60;i++){ const y=Math.random()*h; ctx.strokeStyle=`rgba(60,35,15,${.08+Math.random()*.15})`; ctx.lineWidth=.5+Math.random()*2; ctx.beginPath(); ctx.moveTo(0,y+Math.random()*2-1); for(let x=0;x<w;x+=4) ctx.lineTo(x,y+Math.sin(x*.03+y)*2+Math.random()*1.5-1); ctx.stroke(); } }); }
function makeLeafTex(){ return makeCanvas(128,128,(ctx,w,h)=>{ ctx.fillStyle='#2d7a2d'; ctx.fillRect(0,0,w,h); for(let i=0;i<200;i++){ const x=Math.random()*w, y=Math.random()*h, r=2+Math.random()*8; const b=40+Math.random()*50; ctx.fillStyle=`rgba(${60+Math.random()*50},${140+Math.random()*60},${b},.6)`; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); } }); }
function makeStoneTex(){ return makeCanvas(128,128,(ctx,w,h)=>{ ctx.fillStyle='#7a7a72'; ctx.fillRect(0,0,w,h); for(let i=0;i<120;i++){ const x=Math.random()*w, y=Math.random()*h; const g=90+Math.random()*60; ctx.fillStyle=`rgba(${g-10},${g},${g-5},.5)`; ctx.beginPath(); ctx.arc(x,y,2+Math.random()*6,0,Math.PI*2); ctx.fill(); } for(let i=0;i<8;i++){ ctx.strokeStyle=`rgba(40,40,35,.35)`; ctx.lineWidth=1+Math.random(); ctx.beginPath(); ctx.moveTo(Math.random()*w,Math.random()*h); for(let j=0;j<5;j++) ctx.lineTo(Math.random()*w,Math.random()*h); ctx.stroke(); } }); }
function makeOreTex(){ return makeCanvas(128,128,(ctx,w,h)=>{ ctx.fillStyle='#4a4a4a'; ctx.fillRect(0,0,w,h); for(let i=0;i<80;i++){ const x=Math.random()*w, y=Math.random()*h, r=3+Math.random()*10; ctx.fillStyle=`rgba(30,28,28,.7)`; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); } for(let i=0;i<100;i++){ const x=Math.random()*w, y=Math.random()*h; ctx.fillStyle=`rgba(${180+Math.random()*70},${120+Math.random()*50},${40+Math.random()*60},.5)`; ctx.beginPath(); ctx.arc(x,y,1+Math.random()*4,0,Math.PI*2); ctx.fill(); } for(let i=0;i<40;i++){ const x=Math.random()*w, y=Math.random()*h; ctx.fillStyle=`rgba(220,210,190,${.3+Math.random()*.5})`; ctx.beginPath(); ctx.arc(x,y,.5+Math.random()*2,0,Math.PI*2); ctx.fill(); } }); }
function makeBushTex(){ return makeCanvas(128,128,(ctx,w,h)=>{ ctx.fillStyle='#3c8a3e'; ctx.fillRect(0,0,w,h); for(let i=0;i<150;i++){ const x=Math.random()*w, y=Math.random()*h, r=3+Math.random()*10; ctx.fillStyle=`rgba(${50+Math.random()*60},${130+Math.random()*60},${40+Math.random()*50},.5)`; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); } }); }
function texMat(tex,opts){ return new THREE.MeshStandardMaterial({map:tex,...opts}); }

function createResourceMesh(r){
  const g=new THREE.Group(); g.position.set(r.position.x,0,r.position.z); g.userData.resourceId=r.id;
  let mesh;
  if(r.type==='tree'){
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.25,.38,3,10),texMat(texRepeat(getTex('wood',makeWoodTex)),{roughness:.85})); trunk.position.y=1.5; trunk.castShadow=true; g.add(trunk);
    const crown=new THREE.Mesh(new THREE.ConeGeometry(1.6,3.2,10),texMat(getTex('leaf',makeLeafTex),{roughness:.9})); crown.position.y=3.7; crown.castShadow=true; g.add(crown);
  } else if(r.type==='stone' || r.type==='metal_ore'){
    const mat=r.type==='metal_ore'
      ? texMat(getTex('ore',makeOreTex),{roughness:.7,metalness:.45})
      : texMat(getTex('stone',makeStoneTex),{roughness:.85,metalness:.05});
    mesh=new THREE.Mesh(new THREE.DodecahedronGeometry(r.type==='metal_ore'?1.45:1.25,1),mat); mesh.position.y=.8; mesh.scale.y=.7; mesh.castShadow=true; g.add(mesh);
  } else {
    mesh=new THREE.Mesh(new THREE.SphereGeometry(.8,12,8),texMat(getTex('bush',makeBushTex),{roughness:.9})); mesh.position.y=.55; mesh.scale.set(1.2,.55,1.2); mesh.castShadow=true; g.add(mesh);
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
  d.onclick=()=>{
    if(globalIndex>=27){ self.selected=globalIndex-27; renderInventory(); return; }
    if(!self.inventory[globalIndex]) return;
    let empty=-1; for(let i=27;i<=35;i++){ if(!self.inventory[i]){ empty=i; break; } }
    socket.emit('inventory:move',{from:globalIndex,to:empty>=0?empty:27+self.selected});
  };
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

// ─── Lightning Sounds ──────────────────────────────────────────────────────
let boltAudioCtx = null;
function getAudioCtx() {
  if (!boltAudioCtx) try { boltAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  return boltAudioCtx;
}
function playLightningSound(type, distance) {
  const ctx = getAudioCtx(); if (!ctx) return;
  const vol = Math.max(0.03, 0.35 * (1 - Math.min(1, distance / 220)));
  const t = ctx.currentTime;
  const sRate = ctx.sampleRate;
  const len = sRate * 2;
  const buf = ctx.createBuffer(1, len, sRate);
  const d = buf.getChannelData(0);
  let decay, freq, wave;
  switch (type) {
    case 0: decay=0.4; freq=400; wave='noise'; break;
    case 1: decay=1.2; freq=200; wave='noise'; break;
    case 2: decay=0.6; freq=350; wave='double'; break;
    case 3: decay=2.0; freq=120; wave='noise'; break;
    case 4: decay=0.8; freq=600; wave='hiss'; break;
    case 5: decay=0.5; freq=800; wave='pop'; break;
    case 6: decay=1.8; freq=80; wave='boom'; break;
    case 7: decay=0.9; freq=250; wave='rattle'; break;
    case 8: decay=0.7; freq=300; wave='crackle'; break;
    case 9: decay=0.5; freq=500; wave='noise'; break;
    case 10: decay=0.6; freq=350; wave='rise'; break;
    case 11: decay=0.3; freq=900; wave='squeak'; break;
    case 12: decay=1.0; freq=280; wave='whoosh'; break;
    case 13: decay=2.5; freq=60; wave='roar'; break;
    case 14: decay=0.5; freq=450; wave='crackle'; break;
    case 15: decay=1.2; freq=220; wave='whine'; break;
    case 16: decay=1.5; freq=100; wave='boom'; break;
    case 17: decay=0.6; freq=500; wave='scrape'; break;
    case 18: decay=1.8; freq=180; wave='alien'; break;
    default: decay=0.5; freq=400; wave='noise';
  }
  for (let i = 0; i < len; i++) {
    const p = i / len;
    const e = Math.pow(1 - p, decay * 2);
    if (wave === 'noise') d[i] = (Math.random() * 2 - 1) * e;
    else if (wave === 'double') d[i] = (Math.random() * 2 - 1) * e * (0.5 + 0.5 * Math.sin(p * Math.PI * 4));
    else if (wave === 'hiss') d[i] = (Math.random() * 2 - 1) * e * (0.3 + 0.7 * Math.max(0, Math.sin(p * 120)));
    else if (wave === 'pop') { const pp = Math.floor(p * 12); d[i] = (Math.random() * 2 - 1) * e * (pp % 2 === 0 ? 1 : 0.1); }
    else if (wave === 'boom') d[i] = (Math.random() * 2 - 1) * e * 0.5 + Math.sin(i * 0.02) * e * 0.5;
    else if (wave === 'rattle') d[i] = (Math.random() * 2 - 1) * e * Math.max(0, Math.sin(i * 0.5));
    else if (wave === 'crackle') { const en = e * (0.5 + 0.5 * Math.random()); d[i] = (Math.random() * 2 - 1) * en; }
    else if (wave === 'rise') d[i] = (Math.random() * 2 - 1) * e * Math.min(1, p * 4);
    else if (wave === 'squeak') d[i] = Math.sin(p * sRate * 0.06) * e * 0.4 + (Math.random() * 2 - 1) * e * 0.6;
    else if (wave === 'whoosh') d[i] = (Math.random() * 2 - 1) * e * Math.max(0, 1 - Math.abs(p - 0.3) * 3);
    else if (wave === 'roar') d[i] = (Math.random() * 2 - 1) * e * 0.6 + Math.sin(i * 0.008) * e * 0.4;
    else if (wave === 'whine') d[i] = Math.sin(p * sRate * 0.04 + p * 2000) * e * 0.5 + (Math.random() * 2 - 1) * e * 0.5;
    else if (wave === 'scrape') d[i] = (Math.random() * 2 - 1) * e * Math.max(0, Math.sin(i * 2));
    else if (wave === 'alien') d[i] = Math.sin(p * sRate * 0.03 * (1 + Math.sin(p * 30))) * e * 0.5 + (Math.random() * 2 - 1) * e * 0.5;
    else d[i] = (Math.random() * 2 - 1) * e;
  }
  try {
    const src = ctx.createBufferSource(); src.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = freq * 0.1;
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + 0.03);
    gn.gain.exponentialRampToValueAtTime(0.001, t + decay + 0.2);
    src.connect(hp); hp.connect(lp); lp.connect(gn); gn.connect(ctx.destination);
    src.start(t); src.stop(t + decay + 0.3);
  } catch {}
}
// ─── Lightning Visuals ─────────────────────────────────────────────────────
function makeBoltGlowTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.1,'rgba(200,220,255,0.9)');
  g.addColorStop(0.35,'rgba(120,160,255,0.4)'); g.addColorStop(0.7,'rgba(60,100,255,0.12)'); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}
const boltGlowTex2 = makeBoltGlowTex();
const BOLT_COLORS2 = [
  { name:'blue',   c:new THREE.Color(0x4488ff) },
  { name:'purple', c:new THREE.Color(0xaa44ff) },
  { name:'orange', c:new THREE.Color(0xff8800) },
  { name:'green',  c:new THREE.Color(0x44ff88) },
  { name:'red',    c:new THREE.Color(0xff2244) },
  { name:'yellow', c:new THREE.Color(0xffdd00) },
  { name:'pink',   c:new THREE.Color(0xff44aa) },
  { name:'cyan',   c:new THREE.Color(0x00ffdd) },
];
const lightningGroup2 = new THREE.Group();
scene.add(lightningGroup2);
let lightningTimer2 = 1 + Math.random() * 4;

function boltPath2(x, z, h, segs, spreadA, spreadH, wind) {
  const pts = []; let px = x, pz = z;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const sp = spreadA * Math.max(0.1, 1 - t * 0.7);
    px += (Math.random() - 0.5) * sp * (1 + wind * 0.5);
    pz += (Math.random() - 0.5) * sp * (1 + wind * 0.5);
    const py = Math.max(0.05, h - i * (h / segs) + (Math.random() - 0.5) * spreadH * (1 - t));
    pts.push(new THREE.Vector3(px, py, pz));
  }
  pts[pts.length-1].y = 0.05;
  return pts;
}
function addBoltLine2(parent, pts, color, opacity) {
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  parent.add(new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent:true, opacity })));
}
function addGlow2(parent, x, y, z, color, size) {
  const mat = new THREE.SpriteMaterial({ map:boltGlowTex2, blending:THREE.AdditiveBlending, transparent:true, opacity:0.8, color, depthWrite:false });
  const spr = new THREE.Sprite(mat); spr.position.set(x, y, z);
  const s = size || (12 + Math.random() * 18); spr.scale.set(s, s, 1);
  parent.add(spr);
}

function spawnBolt() {
  const type = Math.floor(Math.random() * 19);
  const colorObj = BOLT_COLORS2[Math.floor(Math.random() * BOLT_COLORS2.length)];
  const color = colorObj.c;
  const isNear = Math.random() > 0.5;
  const range = isNear ? 80 : 250;
  const cx = self.position.x + (Math.random() - 0.5) * (isNear ? 60 : 0);
  const cz = self.position.z + (Math.random() - 0.5) * (isNear ? 60 : 0);
  const bx = cx + (Math.random() - 0.5) * range;
  const bz = cz + (Math.random() - 0.5) * range;
  const h = 18 + Math.random() * 42;
  const segs = 18 + Math.floor(Math.random() * 18);
  const g = new THREE.Group(); g.frustumCulled = false;
  const life = 0.5 + Math.random() * 0.8;
  const dToPlayer = Math.hypot(bx - self.position.x, bz - self.position.z);

  switch (type) {
    case 0: { const pts = boltPath2(bx, bz, h, segs, 0.5, 0.3, 0); addBoltLine2(g, pts, color, 1); addGlow2(g, pts[pts.length-1].x, 1, pts[pts.length-1].z, color); break; }
    case 1: {
      const pts = boltPath2(bx, bz, h, segs, 2.5, 0.8, 0.3); addBoltLine2(g, pts, color, 1);
      for (let b = 0; b < 4 + Math.floor(Math.random() * 6); b++) {
        const idx = Math.floor(Math.random() * pts.length * 0.6); const st = pts[idx].clone();
        const bPts = [st]; const n = 3 + Math.floor(Math.random() * 4); const bLen = 3 + Math.random() * 12;
        for (let j = 1; j <= n; j++) bPts.push(new THREE.Vector3(st.x + (Math.random() - 0.5) * (2 + j * 0.5), st.y - j * bLen / n, st.z + (Math.random() - 0.5) * (2 + j * 0.5)));
        addBoltLine2(g, bPts, color, 0.3 + Math.random() * 0.3);
      } addGlow2(g, pts[pts.length-1].x, 1, pts[pts.length-1].z, color); break;
    }
    case 2: {
      const mid = 0.4 + Math.random() * 0.2; const ptsA = [], ptsB = []; let px = bx, pz = bz;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs; const sp = 1.5 * Math.max(0.1, 1 - t * 0.6); px += (Math.random() - 0.5) * sp; pz += (Math.random() - 0.5) * sp;
        const py = Math.max(0.05, h - i * (h / segs)); const v = new THREE.Vector3(px, py, pz);
        if (i / segs <= mid) { ptsA.push(v); ptsB.push(v); } else { ptsA.push(new THREE.Vector3(px + 3 * (t - mid), py, pz + 2 * (t - mid))); ptsB.push(new THREE.Vector3(px - 3 * (t - mid), py, pz - 2 * (t - mid))); }
      } addBoltLine2(g, ptsA, color, 0.9); addBoltLine2(g, ptsB, color, 0.9); addGlow2(g, ptsA[ptsA.length-1].x, 1, ptsA[ptsA.length-1].z, color); break;
    }
    case 3: {
      const pts = boltPath2(bx, bz, h, segs, 1.5, 1.0, 0.2); addBoltLine2(g, pts, color, 1);
      for (let b = 0; b < 8 + Math.floor(Math.random() * 8); b++) {
        const idx = Math.floor(Math.random() * pts.length * 0.7); const st = pts[idx].clone();
        const bPts = [st]; const n = 2 + Math.floor(Math.random() * 4); const bLen = 4 + Math.random() * 14; const dirX = (Math.random() - 0.5) * 6; const dirZ = (Math.random() - 0.5) * 6;
        for (let j = 1; j <= n; j++) bPts.push(new THREE.Vector3(st.x + dirX * j / n + (Math.random() - 0.5) * 2, st.y - j * bLen / n, st.z + dirZ * j / n + (Math.random() - 0.5) * 2));
        addBoltLine2(g, bPts, color, 0.2 + Math.random() * 0.35);
      } addGlow2(g, pts[pts.length-1].x, 1, pts[pts.length-1].z, color, 25); break;
    }
    case 4: {
      const n = 3 + Math.floor(Math.random() * 3);
      for (let r = 0; r < n; r++) { const off = (r - (n-1)/2) * 1.5; addBoltLine2(g, boltPath2(bx + off, bz, h, segs, 1.8, 0.6, 0.4), color, 0.4 + 0.5 * (1 - r / n)); }
      addGlow2(g, bx, 1, bz, color, 20); break;
    }
    case 5: {
      const pts = boltPath2(bx, bz, h, 30, 1.5, 0.8, 0.2);
      for (let i = 0; i < pts.length; i += 2 + Math.floor(Math.random() * 3)) { addBoltLine2(g, [pts[i], pts[Math.min(i+1, pts.length-1)]], color, 0.8); if (i % 6 === 0) addGlow2(g, pts[i].x, pts[i].y, pts[i].z, color, 4 + Math.random() * 4); }
      addGlow2(g, pts[pts.length-1].x, 1, pts[pts.length-1].z, color, 10); break;
    }
    case 6: { const pts = boltPath2(bx, bz, h, segs, 1.2, 0.5, 0.1); addBoltLine2(g, pts, color, 1); addGlow2(g, bx + (Math.random() - 0.5) * 8, 2 + Math.random() * 3, bz + (Math.random() - 0.5) * 8, color, 25 + Math.random() * 20); addGlow2(g, pts[pts.length-1].x, 1, pts[pts.length-1].z, color, 8); break; }
    case 7: {
      const cy = 30 + Math.random() * 20; const pts = []; let cx2 = bx, cz2 = bz;
      for (let i = 0; i <= segs; i++) { cx2 += (Math.random() - 0.5) * 2 * (1 - i / segs); cz2 += (Math.random() - 0.5) * 2 * (1 - i / segs); pts.push(new THREE.Vector3(cx2, cy + (Math.random() - 0.5) * 3, cz2)); }
      addBoltLine2(g, pts, color, 0.6); addGlow2(g, pts[Math.floor(pts.length/2)].x, cy, pts[Math.floor(pts.length/2)].z, color, 30); break;
    }
    case 8: {
      const y1 = 25 + Math.random() * 15, y2 = 25 + Math.random() * 15, dx = 20 + Math.random() * 40;
      const midY = Math.max(y1, y2) + 5 + Math.random() * 10; const pts = [];
      const p1 = {x:bx - dx/2, z:bz}, p2 = {x:bx + dx/2, z:bz};
      for (let i = 0; i <= segs; i++) { const t = i / segs; const py = (1 - t) * (1 - t) * y1 + 2 * t * (1 - t) * midY + t * t * y2; pts.push(new THREE.Vector3(p1.x + (p2.x - p1.x) * t + (Math.random() - 0.5) * 3, py + (Math.random() - 0.5) * 2, p1.z + (Math.random() - 0.5) * 3)); }
      addBoltLine2(g, pts, color, 0.7); addGlow2(g, p1.x, y1, p1.z, color, 8); addGlow2(g, p2.x, y2, p2.z, color, 8); break;
    }
    case 9: { const pts = boltPath2(bx, bz, h, segs, 3, 1.2, 0.4); addBoltLine2(g, pts, color, 1); for (let b = 0; b < 2 + Math.floor(Math.random() * 4); b++) { const idx = Math.floor(Math.random() * pts.length * 0.5); const st = pts[idx].clone(); const bp = [st]; for (let j = 1; j <= 4; j++) bp.push(new THREE.Vector3(st.x + (Math.random() - 0.5) * 4, st.y - j * 4, st.z + (Math.random() - 0.5) * 4)); addBoltLine2(g, bp, color, 0.3); } addGlow2(g, pts[pts.length-1].x, 1, pts[pts.length-1].z, color); break; }
    case 10: { const pts = []; let px = bx, pz = bz; for (let i = 0; i <= segs; i++) { const t = i / segs; const sp = 2.0 * Math.max(0.1, t * 0.7 + 0.3); px += (Math.random() - 0.5) * sp; pz += (Math.random() - 0.5) * sp; pts.push(new THREE.Vector3(px, 0.05 + t * h, pz)); } addBoltLine2(g, pts, color, 1); addGlow2(g, bx, 1, bz, color); break; }
    case 11: {
      const sy = 50 + Math.random() * 20; const center = new THREE.Vector3(bx, sy, bz); const n = 5 + Math.floor(Math.random() * 8);
      for (let i = 0; i < n; i++) { const ang = (i / n) * Math.PI * 2 + Math.random() * 0.3; const rad = 3 + Math.random() * 10; const pts = [center.clone()]; const len = 8 + Math.random() * 15; for (let j = 1; j <= 5; j++) { const r2 = rad * (1 - j * 0.15); pts.push(new THREE.Vector3(center.x + Math.cos(ang) * r2 + (Math.random() - 0.5) * 2, center.y - j * len / 5 + (Math.random() - 0.5) * 1.5, center.z + Math.sin(ang) * r2 + (Math.random() - 0.5) * 2)); } addBoltLine2(g, pts, color, 0.5 + 0.5 * (1 - i / n)); }
      addGlow2(g, center.x, sy, center.z, color, 15); break;
    }
    case 12: {
      const jetH = 30 + Math.random() * 30; const pts = []; const rad = 5 + Math.random() * 5;
      for (let i = 0; i <= segs; i++) { const t = i / segs; const r = rad * t * (0.5 + 0.5 * Math.sin(t * Math.PI)); pts.push(new THREE.Vector3(bx + (Math.random() - 0.5) * r * 2, 0.05 + t * jetH, bz + (Math.random() - 0.5) * r * 2)); }
      addBoltLine2(g, pts, color, 0.8);
      for (let i = 0; i < 4; i++) { const ang = i * Math.PI / 2 + Math.random() * 0.3; const sPts = [new THREE.Vector3(bx + Math.cos(ang)*2, 0.05, bz + Math.sin(ang)*2)]; for (let j = 1; j <= 6; j++) { const t = j / 6; sPts.push(new THREE.Vector3(bx + Math.cos(ang) * 2 * (1 + t * 4) + (Math.random() - 0.5) * 2, t * jetH * 0.7 + (Math.random() - 0.5) * 2, bz + Math.sin(ang) * 2 * (1 + t * 4) + (Math.random() - 0.5) * 2)); } addBoltLine2(g, sPts, color, 0.35); }
      break;
    }
    case 13: {
      const gjH = 50 + Math.random() * 40; const spread = 10 + Math.random() * 10; const pts = [];
      for (let i = 0; i <= segs; i++) { const t = i / segs; pts.push(new THREE.Vector3(bx + (Math.random() - 0.5) * spread * t, 0.05 + t * gjH, bz + (Math.random() - 0.5) * spread * t)); }
      addBoltLine2(g, pts, color, 1);
      for (let b = 0; b < 6; b++) { const ang = Math.random() * Math.PI * 2; const bp = [new THREE.Vector3(bx, 0.05, bz)]; for (let j = 1; j <= 8; j++) { const t = j / 8; bp.push(new THREE.Vector3(bx + Math.cos(ang) * t * 15 + (Math.random() - 0.5) * 5, t * gjH * 0.6, bz + Math.sin(ang) * t * 15 + (Math.random() - 0.5) * 5)); } addBoltLine2(g, bp, color, 0.2); }
      addGlow2(g, bx, 1, bz, color, 15); break;
    }
    case 14: {
      const cy2 = 3 + Math.random() * 8; const nB = 8 + Math.floor(Math.random() * 10);
      for (let i = 0; i < nB; i++) { const ang = (i / nB) * Math.PI * 2 + Math.random() * 0.2; const rad = 2 + Math.random() * 6; const pts = [new THREE.Vector3(bx, cy2, bz)]; for (let j = 1; j <= 4; j++) pts.push(new THREE.Vector3(bx + Math.cos(ang) * rad * j / 4 + (Math.random() - 0.5) * 1.5, cy2 + (Math.random() - 0.5) * 3, bz + Math.sin(ang) * rad * j / 4 + (Math.random() - 0.5) * 1.5)); addBoltLine2(g, pts, color, 0.6); }
      addGlow2(g, bx, cy2, bz, color, 25); break;
    }
    case 15: {
      const spH = 20 + Math.random() * 20, spRad = 3 + Math.random() * 5, turns = 2 + Math.floor(Math.random() * 4); const pts = [];
      for (let i = 0; i <= segs * 2; i++) { const t = i / (segs * 2); const ang = t * turns * Math.PI * 2; const r = spRad * (1 - t * 0.3); pts.push(new THREE.Vector3(bx + Math.cos(ang) * r + (Math.random() - 0.5) * 0.5, 0.05 + t * spH, bz + Math.sin(ang) * r + (Math.random() - 0.5) * 0.5)); }
      addBoltLine2(g, pts, color, 0.9); addGlow2(g, bx, 1, bz, color); break;
    }
    case 16: {
      const rad = 4 + Math.random() * 8, ry = 5 + Math.random() * 10; const pts = [];
      for (let i = 0; i <= 40; i++) { const ang = (i / 40) * Math.PI * 2; const wobble = 1 + (Math.random() - 0.5) * 0.15; pts.push(new THREE.Vector3(bx + Math.cos(ang) * rad * wobble, ry + Math.sin(ang * 2) * 0.5, bz + Math.sin(ang) * rad * wobble)); }
      addBoltLine2(g, pts, color, 0.7); addGlow2(g, bx, ry, bz, color, 20); break;
    }
    case 17: { const pts = []; let sx = bx, sz = bz; for (let i = 0; i <= segs; i++) { sx += (Math.random() - 0.5) * 3; sz += (Math.random() - 0.5) * 3; pts.push(new THREE.Vector3(sx, 0.1 + Math.random() * 0.5, sz)); } addBoltLine2(g, pts, color, 0.7); for (let i = 0; i < pts.length; i += 3) addGlow2(g, pts[i].x, 1, pts[i].z, color, 6); break; }
    case 18: {
      const pts = []; let fx = bx, fz = bz, fy = 0.05;
      for (let i = 0; i <= segs * 2; i++) { fy += (Math.random() - 0.5) * 3; fx += (Math.random() - 0.5) * 5; fz += (Math.random() - 0.5) * 5; fy = Math.max(0.05, Math.min(h, fy)); pts.push(new THREE.Vector3(fx, fy, fz)); }
      addBoltLine2(g, pts, color, 0.9);
      for (let i = 0; i < 6; i++) { const ang = Math.random() * Math.PI * 2; const rad = 3 + Math.random() * 10; const cX = bx + Math.cos(ang) * rad, cZ = bz + Math.sin(ang) * rad; const sPts = [new THREE.Vector3(cX, 0.05 + Math.random() * 10, cZ)]; for (let j = 1; j <= 5; j++) sPts.push(new THREE.Vector3(cX + (Math.random() - 0.5) * 8, 0.05 + Math.random() * 20, cZ + (Math.random() - 0.5) * 8)); addBoltLine2(g, sPts, color, 0.3); addGlow2(g, cX, 1, cZ, color, 8 + Math.random() * 8); }
      break;
    }
  }
  g.userData = { life, age: 0, type };
  lightningGroup2.add(g);
  playLightningSound(type, dToPlayer);
}

let last=performance.now();
function frame(now){
  requestAnimationFrame(frame); const dt=Math.min(.05,(now-last)/1000); last=now;
  const forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)); const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)); const move=new THREE.Vector3();
  if(keys.has('KeyW')) move.add(forward); if(keys.has('KeyS')) move.sub(forward); if(keys.has('KeyA')) move.add(right); if(keys.has('KeyD')) move.sub(right);
  self.running=keys.has('ShiftLeft'); const speed=self.running?13:7;
  const old=self.position.clone(); if(move.lengthSq()>0){ move.normalize().multiplyScalar(speed*dt); self.position.add(move); self.rotationY=yaw; self.action=self.action==='mine'?'mine':(self.running?'run':'walk'); } else if(self.action!=='mine') self.action='idle';
  selfMesh.position.copy(self.position); selfMesh.rotation.y=yaw; animateHuman(selfMesh,now/1000,self.position.distanceTo(old)/dt,self.action);
  const camOffset=new THREE.Vector3(Math.sin(yaw)*-8,5+pitch*5,Math.cos(yaw)*-8); camera.position.lerp(self.position.clone().add(camOffset),.16); camera.lookAt(self.position.x,self.position.y+1.45,self.position.z);
  for(const m of remotePlayers.values()){ const t=m.userData.target; if(t){ m.position.lerp(new THREE.Vector3(t.position.x,0,t.position.z),.28); m.rotation.y=t.rotationY||0; animateHuman(m,now/1000,t.running?12:7,t.action); m.userData.label.lookAt(camera.position); }}
  selfMesh.userData.label.lookAt(camera.position);
  updateGhost(); updatePrompt(); requestChunks(false); updateStats();
  if(now-lastSend>80){ lastSend=now; socket.emit('survival:state',{position:{x:self.position.x,y:0,z:self.position.z},rotationY:self.rotationY,running:self.running,action:self.action}); }
  lightningTimer2 -= dt;
  if (lightningTimer2 <= 0) {
    lightningTimer2 = 1.5 + Math.random() * 6;
    if (Math.random() < 0.67) {
      spawnBolt();
      if (Math.random() < 0.3) for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) setTimeout(() => spawnBolt(), 100 + Math.random() * 400);
    }
  }
  for (let i = lightningGroup2.children.length - 1; i >= 0; i--) {
    const g = lightningGroup2.children[i];
    g.userData.age += dt;
    const life = g.userData.life || 0.8;
    const alpha = Math.max(0, 1 - g.userData.age / life);
    g.children.forEach(c => { if (c.material) { c.material.opacity = alpha * (c.material.opacity > 0.5 ? 1 : 0.5); } });
    if (g.userData.age >= life) lightningGroup2.remove(g);
  }
  renderer.render(scene,camera);
}
requestAnimationFrame(frame);
