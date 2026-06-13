import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';

await window.AppCore.init('catalog');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x89bdec);
scene.fog = new THREE.Fog(0x89bdec, 80, 420);
const camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.1, 900);
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);

const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(30,70,20); sun.castShadow=true; scene.add(sun);
scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x334422, 1.1));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1500,1500,64,64), new THREE.MeshStandardMaterial({color:0x344627, roughness:.95}));
ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(1200, 60, 0x446655, 0x2b382f); grid.position.y=.03; scene.add(grid);

const player = new THREE.Group();

function makeFacePlane(){
  const canvas=document.createElement('canvas'); canvas.width=256; canvas.height=256;
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,256,256);
  ctx.fillStyle='#24140e'; ctx.beginPath(); ctx.arc(88,100,13,0,Math.PI*2); ctx.arc(168,100,13,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#5b2d1e'; ctx.lineWidth=8; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(128,116); ctx.lineTo(120,145); ctx.lineTo(137,145); ctx.stroke();
  ctx.strokeStyle='#7b231d'; ctx.lineWidth=9; ctx.beginPath(); ctx.arc(128,158,35,0.15*Math.PI,0.85*Math.PI); ctx.stroke();
  const tex=new THREE.CanvasTexture(canvas);
  const face=new THREE.Mesh(new THREE.PlaneGeometry(.42,.42),new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide}));
  face.position.set(0,0,-.275); return face;
}
function addPart(mesh, x,y,z){mesh.position.set(x,y,z); mesh.castShadow=true; player.add(mesh); return mesh;}
const mat = new THREE.MeshStandardMaterial({color:0x2d83d4});
addPart(new THREE.Mesh(new THREE.CapsuleGeometry(.33,.85,8,16),mat),0,1.25,0);
const head=addPart(new THREE.Mesh(new THREE.SphereGeometry(.28,24,16),new THREE.MeshStandardMaterial({color:0xf1c49c})),0,1.9,0); head.add(makeFacePlane());
addPart(new THREE.Mesh(new THREE.BoxGeometry(.18,.7,.18),mat),-.42,1.18,0);
addPart(new THREE.Mesh(new THREE.BoxGeometry(.18,.7,.18),mat),.42,1.18,0);
addPart(new THREE.Mesh(new THREE.BoxGeometry(.2,.8,.2),new THREE.MeshStandardMaterial({color:0x263447})),-.16,.45,0);
addPart(new THREE.Mesh(new THREE.BoxGeometry(.2,.8,.2),new THREE.MeshStandardMaterial({color:0x263447})),.16,.45,0);
scene.add(player);

let apps = [];
const portals = [];
const portalGroup = new THREE.Group(); scene.add(portalGroup);
const portalSpacing = 150;
const portalMat = new THREE.MeshStandardMaterial({ color:0x19b6ff, emissive:0x095c8b, emissiveIntensity:1.5, metalness:.2, roughness:.25 });
const baseMat = new THREE.MeshStandardMaterial({ color:0x1b2430, metalness:.2, roughness:.8 });

function makeTextSprite(text){
  const canvas = document.createElement('canvas'); canvas.width=512; canvas.height=128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(0,0,512,128);
  ctx.strokeStyle='rgba(255,255,255,.25)'; ctx.strokeRect(2,2,508,124);
  ctx.fillStyle='#fff'; ctx.font='bold 42px Arial'; ctx.textAlign='center'; ctx.fillText(text,256,62);
  ctx.fillStyle='#a8d8ff'; ctx.font='24px Arial'; ctx.fillText('portal',256,98);
  const tex = new THREE.CanvasTexture(canvas);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, transparent:true})); spr.scale.set(9,2.2,1); return spr;
}
function createPortal(app, index){
  const col = index % 5;
  const row = Math.floor(index / 5);
  const x = (col - 2) * portalSpacing;
  const z = row * portalSpacing + 60;
  const g = new THREE.Group(); g.position.set(x,0,z); g.userData.app = app;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2,.22,16,80), portalMat); ring.rotation.y=Math.PI/2; ring.position.y=4; ring.castShadow=true; g.add(ring);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(3.6,48), new THREE.MeshBasicMaterial({color:0x4fd8ff, transparent:true, opacity:.22, side:THREE.DoubleSide})); inner.rotation.y=Math.PI/2; inner.position.y=4; g.add(inner);
  const left = new THREE.Mesh(new THREE.BoxGeometry(.5,6,.5),baseMat); left.position.set(0,3,-4.1); left.castShadow=true; g.add(left);
  const right = left.clone(); right.position.z=4.1; g.add(right);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(5.2,5.2,.25,32), new THREE.MeshStandardMaterial({color:0x263142})); pad.position.y=.12; pad.receiveShadow=true; g.add(pad);
  const label = makeTextSprite(app.title); label.position.set(0,8.2,0); g.add(label);
  portalGroup.add(g); portals.push(g);
}
fetch('/api/apps').then(r=>r.json()).then(json=>{
  apps = json.apps.filter(a=>a.id!=='catalog');
  apps.forEach(createPortal);
  const mini = document.getElementById('miniMap');
  for(const a of apps){ const d=document.createElement('div'); d.textContent=`● ${a.title} — /apps/${a.id}/`; mini.appendChild(d); }
});

const keys = new Set(); let yaw=0, pitch=.38; let mouseDown=false;
addEventListener('keydown',e=>keys.add(e.code)); addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('mousedown',()=>mouseDown=true); addEventListener('mouseup',()=>mouseDown=false);
addEventListener('mousemove',e=>{ if(mouseDown || document.pointerLockElement){ yaw -= e.movementX*.003; pitch = Math.max(.15, Math.min(.9, pitch - e.movementY*.002)); }});
renderer.domElement.addEventListener('click',()=>renderer.domElement.requestPointerLock?.());
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

let last=performance.now(); let teleportLock=false;
function animate(now){
  requestAnimationFrame(animate); const dt=Math.min(.05,(now-last)/1000); last=now;
  const speed = keys.has('ShiftLeft') ? 20 : 10;
  const forward = new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const move = new THREE.Vector3();
  if(keys.has('KeyW')) move.add(forward); if(keys.has('KeyS')) move.sub(forward); if(keys.has('KeyD')) move.add(right); if(keys.has('KeyA')) move.sub(right);
  if(move.lengthSq()>0){ move.normalize().multiplyScalar(speed*dt); player.position.add(move); player.rotation.y=yaw; }
  const camOffset = new THREE.Vector3(Math.sin(yaw)*-12, 8 + pitch*4, Math.cos(yaw)*-12);
  camera.position.lerp(player.position.clone().add(camOffset), .12);
  camera.lookAt(player.position.x, player.position.y+1.5, player.position.z);
  for(const p of portals){
    p.children[0].rotation.z += dt*.9; p.children[1].material.opacity = .18 + Math.sin(now*.004)*.07;
  }
  const hint = document.getElementById('portalHint'); let nearest=null, nd=9999;
  for(const p of portals){ const d=player.position.distanceTo(p.position); if(d<nd){nd=d; nearest=p;} }
  if(nearest && nd<13){
    hint.classList.remove('hidden'); hint.textContent = `Портал: ${nearest.userData.app.title}. Подойди ближе для перехода (${nd.toFixed(1)}m)`;
    if(nd<5 && !teleportLock){ teleportLock=true; hint.textContent=`Переход в ${nearest.userData.app.title}...`; setTimeout(()=>location.href=nearest.userData.app.url,550); }
  } else hint.classList.add('hidden');
  renderer.render(scene,camera);
}
requestAnimationFrame(animate);
