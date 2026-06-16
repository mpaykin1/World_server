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
function makeGlowTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.1,'rgba(200,220,255,0.9)');
  g.addColorStop(0.35,'rgba(120,160,255,0.4)'); g.addColorStop(0.7,'rgba(60,100,255,0.12)'); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}
const boltGlowTex = makeGlowTex();
const BOLT_COLORS = [
  { name:'blue',   c:new THREE.Color(0x4488ff) },
  { name:'purple', c:new THREE.Color(0xaa44ff) },
  { name:'orange', c:new THREE.Color(0xff8800) },
  { name:'green',  c:new THREE.Color(0x44ff88) },
  { name:'red',    c:new THREE.Color(0xff2244) },
  { name:'yellow', c:new THREE.Color(0xffdd00) },
  { name:'pink',   c:new THREE.Color(0xff44aa) },
  { name:'cyan',   c:new THREE.Color(0x00ffdd) },
];
const lightningGroup = new THREE.Group();
scene.add(lightningGroup);
let lightningTimer = 1 + Math.random() * 4;

function boltPath(x, z, h, segs, spreadA, spreadH, wind) {
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
function addBoltLine(parent, pts, color, opacity, lineWidth) {
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  parent.add(new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent:true, opacity, linewidth:lineWidth||1 })));
}
function addGlow(parent, x, y, z, color, size) {
  const mat = new THREE.SpriteMaterial({ map:boltGlowTex, blending:THREE.AdditiveBlending, transparent:true, opacity:0.8, color, depthWrite:false });
  const spr = new THREE.Sprite(mat); spr.position.set(x, y, z);
  const s = size || (12 + Math.random() * 18); spr.scale.set(s, s, 1);
  parent.add(spr);
}

function spawnLightning() {
  const type = Math.floor(Math.random() * 19);
  const colorObj = BOLT_COLORS[Math.floor(Math.random() * BOLT_COLORS.length)];
  const color = colorObj.c;
  const isNear = Math.random() > 0.5;
  const range = isNear ? 80 : 250;
  const cx = player.position.x + (Math.random() - 0.5) * (isNear ? 60 : 0);
  const cz = player.position.z + (Math.random() - 0.5) * (isNear ? 60 : 0);
  const bx = cx + (Math.random() - 0.5) * range;
  const bz = cz + (Math.random() - 0.5) * range;
  const h = 18 + Math.random() * 42;
  const segs = 18 + Math.floor(Math.random() * 18);
  const g = new THREE.Group(); g.frustumCulled = false;
  const life = 0.5 + Math.random() * 0.8;
  const dToPlayer = Math.hypot(bx - player.position.x, bz - player.position.z);

  switch (type) {
    case 0: { // Linear
      const pts = boltPath(bx, bz, h, segs, 0.5, 0.3, 0);
      addBoltLine(g, pts, color, 1);
      addGlow(g, pts[pts.length-1].x, 1, pts[pts.length-1].z, color);
      break;
    }
    case 1: { // Branching
      const pts = boltPath(bx, bz, h, segs, 2.5, 0.8, 0.3);
      addBoltLine(g, pts, color, 1);
      for (let b = 0; b < 4 + Math.floor(Math.random() * 6); b++) {
        const idx = Math.floor(Math.random() * pts.length * 0.6);
        const st = pts[idx].clone();
        const bLen = 3 + Math.random() * 12;
        const bPts = [st];
        let n = 3 + Math.floor(Math.random() * 4);
        for (let j = 1; j <= n; j++) {
          bPts.push(new THREE.Vector3(
            st.x + (Math.random() - 0.5) * (2 + j * 0.5),
            st.y - j * bLen / n,
            st.z + (Math.random() - 0.5) * (2 + j * 0.5)
          ));
        }
        addBoltLine(g, bPts, color, 0.3 + Math.random() * 0.3);
      }
      addGlow(g, pts[pts.length-1].x, 1, pts[pts.length-1].z, color);
      break;
    }
    case 2: { // Forked
      const mid = 0.4 + Math.random() * 0.2;
      const ptsA = []; const ptsB = []; const ptsMain = [];
      let px = bx, pz = bz;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const sp = 1.5 * Math.max(0.1, 1 - t * 0.6);
        px += (Math.random() - 0.5) * sp; pz += (Math.random() - 0.5) * sp;
        const py = Math.max(0.05, h - i * (h / segs));
        const v = new THREE.Vector3(px, py, pz);
        ptsMain.push(v);
        if (i / segs < mid) { ptsA.push(v); ptsB.push(v); }
        else if (i / segs === mid) { ptsA.push(v); ptsB.push(v); }
        else {
          ptsA.push(new THREE.Vector3(px + 3 * (t - mid), py, pz + 2 * (t - mid)));
          ptsB.push(new THREE.Vector3(px - 3 * (t - mid), py, pz - 2 * (t - mid)));
        }
      }
      addBoltLine(g, ptsA, color, 0.9);
      addBoltLine(g, ptsB, color, 0.9);
      addGlow(g, ptsA[ptsA.length-1].x, 1, ptsA[ptsA.length-1].z, color);
      break;
    }
    case 3: { // Tree
      const pts = boltPath(bx, bz, h, segs, 1.5, 1.0, 0.2);
      addBoltLine(g, pts, color, 1);
      for (let b = 0; b < 8 + Math.floor(Math.random() * 8); b++) {
        const idx = Math.floor(Math.random() * pts.length * 0.7);
        const st = pts[idx].clone();
        const bLen = 4 + Math.random() * 14;
        const n = 2 + Math.floor(Math.random() * 4);
        const dirX = (Math.random() - 0.5) * 6; const dirZ = (Math.random() - 0.5) * 6;
        const bPts = [st];
        for (let j = 1; j <= n; j++) {
          bPts.push(new THREE.Vector3(
            st.x + dirX * j / n + (Math.random() - 0.5) * 2,
            st.y - j * bLen / n,
            st.z + dirZ * j / n + (Math.random() - 0.5) * 2
          ));
        }
        addBoltLine(g, bPts, color, 0.2 + Math.random() * 0.35);
      }
      addGlow(g, pts[pts.length-1].x, 1, pts[pts.length-1].z, color, 25);
      break;
    }
    case 4: { // Ribbon
      const n = 3 + Math.floor(Math.random() * 3);
      for (let r = 0; r < n; r++) {
        const off = (r - (n-1)/2) * 1.5;
        const pts = boltPath(bx + off, bz, h, segs, 1.8, 0.6, 0.4);
        addBoltLine(g, pts, color, 0.4 + 0.5 * (1 - r / n));
      }
      addGlow(g, bx, 1, bz, color, 20);
      break;
    }
    case 5: { // Pearl
      const pts = boltPath(bx, bz, h, 30, 1.5, 0.8, 0.2);
      for (let i = 0; i < pts.length; i += 2 + Math.floor(Math.random() * 3)) {
        const seg = [pts[i], pts[Math.min(i+1, pts.length-1)]];
        addBoltLine(g, seg, color, 0.8, 2);
        if (i % 6 === 0) addGlow(g, pts[i].x, pts[i].y, pts[i].z, color, 4 + Math.random() * 4);
      }
      addGlow(g, pts[pts.length-1].x, 1, pts[pts.length-1].z, color, 10);
      break;
    }
    case 6: { // Ball
      const pts = boltPath(bx, bz, h, segs, 1.2, 0.5, 0.1);
      addBoltLine(g, pts, color, 1);
      addGlow(g, bx + (Math.random() - 0.5) * 8, 2 + Math.random() * 3, bz + (Math.random() - 0.5) * 8, color, 25 + Math.random() * 20);
      addGlow(g, pts[pts.length-1].x, 1, pts[pts.length-1].z, color, 8);
      break;
    }
    case 7: { // Intracloud
      const cy = 30 + Math.random() * 20;
      const pts = []; const clen = 30 + Math.random() * 60;
      let cx2 = bx, cz2 = bz;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        cx2 += (Math.random() - 0.5) * 2 * (1 - t);
        cz2 += (Math.random() - 0.5) * 2 * (1 - t);
        pts.push(new THREE.Vector3(cx2, cy + (Math.random() - 0.5) * 3, cz2));
      }
      addBoltLine(g, pts, color, 0.6);
      addGlow(g, pts[Math.floor(pts.length/2)].x, cy, pts[Math.floor(pts.length/2)].z, color, 30);
      break;
    }
    case 8: { // C2C
      const y1 = 25 + Math.random() * 15;
      const y2 = 25 + Math.random() * 15;
      const dx = 20 + Math.random() * 40;
      const p1 = new THREE.Vector3(bx - dx/2, y1, bz);
      const p2 = new THREE.Vector3(bx + dx/2, y2, bz);
      const pts = []; const midY = Math.max(y1, y2) + 5 + Math.random() * 10;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const py = (1 - t) * (1 - t) * y1 + 2 * t * (1 - t) * midY + t * t * y2;
        pts.push(new THREE.Vector3(
          p1.x + (p2.x - p1.x) * t + (Math.random() - 0.5) * 3,
          py + (Math.random() - 0.5) * 2,
          p1.z + (Math.random() - 0.5) * 3
        ));
      }
      addBoltLine(g, pts, color, 0.7);
      addGlow(g, p1.x, y1, p1.z, color, 8);
      addGlow(g, p2.x, y2, p2.z, color, 8);
      break;
    }
    case 9: { // C2G
      const pts = boltPath(bx, bz, h, segs, 3, 1.2, 0.4);
      addBoltLine(g, pts, color, 1);
      const nb = 2 + Math.floor(Math.random() * 4);
      for (let b = 0; b < nb; b++) {
        const idx = Math.floor(Math.random() * pts.length * 0.5);
        const st = pts[idx].clone();
        const bp = [st];
        for (let j = 1; j <= 4; j++) bp.push(new THREE.Vector3(
          st.x + (Math.random() - 0.5) * 4, st.y - j * 4, st.z + (Math.random() - 0.5) * 4
        ));
        addBoltLine(g, bp, color, 0.3);
      }
      addGlow(g, pts[pts.length-1].x, 1, pts[pts.length-1].z, color);
      break;
    }
    case 10: { // G2C
      const pts = []; let px = bx, pz = bz;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const sp = 2.0 * Math.max(0.1, t * 0.7 + 0.3);
        px += (Math.random() - 0.5) * sp; pz += (Math.random() - 0.5) * sp;
        pts.push(new THREE.Vector3(px, 0.05 + t * h, pz));
      }
      addBoltLine(g, pts, color, 1);
      addGlow(g, bx, 1, bz, color);
      break;
    }
    case 11: { // Sprite
      const sy = 50 + Math.random() * 20;
      const center = new THREE.Vector3(bx, sy, bz);
      const n = 5 + Math.floor(Math.random() * 8);
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + Math.random() * 0.3;
        const rad = 3 + Math.random() * 10;
        const pts = [center.clone()];
        const len = 8 + Math.random() * 15;
        for (let j = 1; j <= 5; j++) {
          const r2 = rad * (1 - j * 0.15);
          pts.push(new THREE.Vector3(
            center.x + Math.cos(ang) * r2 + (Math.random() - 0.5) * 2,
            center.y - j * len / 5 + (Math.random() - 0.5) * 1.5,
            center.z + Math.sin(ang) * r2 + (Math.random() - 0.5) * 2
          ));
        }
        addBoltLine(g, pts, color, 0.5 + 0.5 * (1 - i / n));
      }
      addGlow(g, center.x, sy, center.z, color, 15);
      break;
    }
    case 12: { // Blue Jet
      const jetH = 30 + Math.random() * 30;
      const pts = []; const rad = 5 + Math.random() * 5;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const r = rad * t * (0.5 + 0.5 * Math.sin(t * Math.PI));
        pts.push(new THREE.Vector3(
          bx + (Math.random() - 0.5) * r * 2,
          0.05 + t * jetH,
          bz + (Math.random() - 0.5) * r * 2
        ));
      }
      addBoltLine(g, pts, color, 0.8);
      for (let i = 0; i < 4; i++) {
        const ang = i * Math.PI / 2 + Math.random() * 0.3;
        const sPts = [new THREE.Vector3(bx + Math.cos(ang)*2, 0.05, bz + Math.sin(ang)*2)];
        for (let j = 1; j <= 6; j++) {
          const t = j / 6;
          sPts.push(new THREE.Vector3(
            bx + Math.cos(ang) * 2 * (1 + t * 4) + (Math.random() - 0.5) * 2,
            t * jetH * 0.7 + (Math.random() - 0.5) * 2,
            bz + Math.sin(ang) * 2 * (1 + t * 4) + (Math.random() - 0.5) * 2
          ));
        }
        addBoltLine(g, sPts, color, 0.35);
      }
      break;
    }
    case 13: { // Giant Jet
      const gjH = 50 + Math.random() * 40;
      const pts = []; const spread = 10 + Math.random() * 10;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        pts.push(new THREE.Vector3(
          bx + (Math.random() - 0.5) * spread * t,
          0.05 + t * gjH,
          bz + (Math.random() - 0.5) * spread * t
        ));
      }
      addBoltLine(g, pts, color, 1, 2);
      for (let b = 0; b < 6; b++) {
        const ang = Math.random() * Math.PI * 2;
        const bp = [new THREE.Vector3(bx, 0.05, bz)];
        for (let j = 1; j <= 8; j++) {
          const t = j / 8;
          bp.push(new THREE.Vector3(
            bx + Math.cos(ang) * t * 15 + (Math.random() - 0.5) * 5,
            t * gjH * 0.6,
            bz + Math.sin(ang) * t * 15 + (Math.random() - 0.5) * 5
          ));
        }
        addBoltLine(g, bp, color, 0.2);
      }
      addGlow(g, bx, 1, bz, color, 15);
      break;
    }
    case 14: { // Corona
      const cy2 = 3 + Math.random() * 8;
      const nB = 8 + Math.floor(Math.random() * 10);
      for (let i = 0; i < nB; i++) {
        const ang = (i / nB) * Math.PI * 2 + Math.random() * 0.2;
        const rad = 2 + Math.random() * 6;
        const pts = [new THREE.Vector3(bx, cy2, bz)];
        for (let j = 1; j <= 4; j++) {
          pts.push(new THREE.Vector3(
            bx + Math.cos(ang) * rad * j / 4 + (Math.random() - 0.5) * 1.5,
            cy2 + (Math.random() - 0.5) * 3,
            bz + Math.sin(ang) * rad * j / 4 + (Math.random() - 0.5) * 1.5
          ));
        }
        addBoltLine(g, pts, color, 0.6);
      }
      addGlow(g, bx, cy2, bz, color, 25);
      break;
    }
    case 15: { // Spiral
      const spH = 20 + Math.random() * 20;
      const spRad = 3 + Math.random() * 5;
      const turns = 2 + Math.floor(Math.random() * 4);
      const pts = [];
      const total = segs * 2;
      for (let i = 0; i <= total; i++) {
        const t = i / total;
        const ang = t * turns * Math.PI * 2;
        const r = spRad * (1 - t * 0.3);
        pts.push(new THREE.Vector3(
          bx + Math.cos(ang) * r + (Math.random() - 0.5) * 0.5,
          0.05 + t * spH,
          bz + Math.sin(ang) * r + (Math.random() - 0.5) * 0.5
        ));
      }
      addBoltLine(g, pts, color, 0.9);
      addGlow(g, bx, 1, bz, color);
      break;
    }
    case 16: { // Ring
      const rad = 4 + Math.random() * 8;
      const ry = 5 + Math.random() * 10;
      const pts = [];
      const nSegs = 40;
      for (let i = 0; i <= nSegs; i++) {
        const ang = (i / nSegs) * Math.PI * 2;
        const wobble = 1 + (Math.random() - 0.5) * 0.15;
        pts.push(new THREE.Vector3(
          bx + Math.cos(ang) * rad * wobble,
          ry + Math.sin(ang * 2) * 0.5,
          bz + Math.sin(ang) * rad * wobble
        ));
      }
      addBoltLine(g, pts, color, 0.7);
      addGlow(g, bx, ry, bz, color, 20);
      break;
    }
    case 17: { // Surface
      const pts = []; const sLen = 20 + Math.random() * 50;
      let sx = bx, sz = bz;
      for (let i = 0; i <= segs; i++) {
        sx += (Math.random() - 0.5) * 3;
        sz += (Math.random() - 0.5) * 3;
        pts.push(new THREE.Vector3(sx, 0.1 + Math.random() * 0.5, sz));
      }
      addBoltLine(g, pts, color, 0.7);
      for (let i = 0; i < pts.length; i += 3) addGlow(g, pts[i].x, 1, pts[i].z, color, 6);
      break;
    }
    case 18: { // Fantasy
      const pts = [];
      let fx = bx, fz = bz, fy = 0.05;
      for (let i = 0; i <= segs * 2; i++) {
        const t = i / (segs * 2);
        fy += (Math.random() - 0.5) * 3;
        fx += (Math.random() - 0.5) * 5;
        fz += (Math.random() - 0.5) * 5;
        fy = Math.max(0.05, Math.min(h, fy));
        pts.push(new THREE.Vector3(fx, fy, fz));
      }
      addBoltLine(g, pts, color, 0.9, 2);
      for (let i = 0; i < 6; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 3 + Math.random() * 10;
        const cX = bx + Math.cos(ang) * rad;
        const cZ = bz + Math.sin(ang) * rad;
        const sPts = [new THREE.Vector3(cX, 0.05 + Math.random() * 10, cZ)];
        for (let j = 1; j <= 5; j++) sPts.push(new THREE.Vector3(
          cX + (Math.random() - 0.5) * 8, 0.05 + Math.random() * 20, cZ + (Math.random() - 0.5) * 8
        ));
        addBoltLine(g, sPts, color, 0.3);
        addGlow(g, cX, 1, cZ, color, 8 + Math.random() * 8);
      }
      break;
    }
  }
  g.userData = { life, age: 0, type, dToPlayer };
  lightningGroup.add(g);
  playLightningSound(type, dToPlayer);
}

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

  // ─── Lightning update ───────────────────────────────────────────────────
  lightningTimer -= dt;
  if (lightningTimer <= 0) {
    spawnLightning();
    const typesPerBurst = Math.random() > 0.7 ? 2 + Math.floor(Math.random() * 3) : 1;
    for (let i = 0; i < typesPerBurst; i++) setTimeout(spawnLightning, i * 200 + 100);
    lightningTimer = 2 + Math.random() * 7;
  }
  for (let i = lightningGroup.children.length - 1; i >= 0; i--) {
    const b = lightningGroup.children[i];
    b.userData.age += dt;
    const t = b.userData.age / b.userData.life;
    if (t >= 1) {
      lightningGroup.remove(b);
      b.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
    } else {
      const op = t < 0.1 ? 1 : 1 - (t - 0.1) / 0.9;
      const flicker = (b.userData.type === 18 || b.userData.type === 14) ? 0.7 + 0.3 * Math.sin(t * 200) : 1;
      b.traverse(c => { if (c.material && c.material.opacity !== undefined) c.material.opacity = op * flicker; });
    }
  }

  renderer.render(scene,camera);
}
requestAnimationFrame(animate);
