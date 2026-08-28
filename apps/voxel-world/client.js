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
// A world provisioned by the improve-world-home questionnaire pipeline
// (lib/api-handlers/world.js / merge.js) links here as
// /apps/voxel-world/?world=<id>; falls back to the original 'main' world
// when no id is given, so the pre-existing single-world experience is
// unchanged for anyone who doesn't pass one.
const worldId=new URLSearchParams(location.search).get('world')||'main';
function token(){ return localStorage.getItem('webgl_hub_token') || ''; }
async function api(action,payload={}){
  const headers={'Content-Type':'application/json','Accept':'application/json'}; const t=token(); if(t) headers.Authorization=`Bearer ${t}`;
  const r=await fetch('/api/voxel',{method:'POST',headers,body:JSON.stringify({action,guestId:guestId(),...payload})});
  const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||'Ошибка Voxel API'); return j;
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
// A world's `settings.theme` (derived server-side from its narrative content
// by lib/voxel-provisioning.js -- see AGENTS.md's dual-layer rule) biases
// which biome the same noise field resolves to, without changing the core
// generator algorithm. 'plains' (the default/unthemed case) is unbiased.
let worldTheme='plains';
// Reflects the questionnaire's own tension/conflict answers (embedded in
// the World Spec's scene text -- see lib/voxel-provisioning.js#deriveHeightScale):
// a calmer story produces gentler terrain, a tense/conflict-driven one
// produces more dramatic relief. Only scales the noise-driven variance, not
// the base height, so spawn logic and sea level stay unaffected.
let worldHeightScale=1;
let worldTreeDensity=1;
// Base hue for the existing day/night sky-color cycle (daylight(), below) --
// theme shifts which hue the cycle breathes through, at zero extra render
// cost (same Color object, same per-frame math, just a different constant).
let worldSkyHue=.57;
function hexToHue(hex){ try{ const c=new THREE.Color(hex); const hsl={h:0,s:0,l:0}; c.getHSL(hsl); return hsl.h; }catch{ return .57; } }
const THEME_BIOME_BIAS={
  desert:{desert:-.22,snow:.15,forest:.08},
  snow:{desert:.15,snow:-.2,forest:.05},
  forest:{desert:.08,snow:.06,forest:-.18},
  plains:{desert:0,snow:0,forest:0}
};
function biomeAt(x,z){
  const bias=THEME_BIOME_BIAS[worldTheme]||THEME_BIOME_BIAS.plains;
  const t=valueNoise(x,z,180,worldSeed+900), m=valueNoise(x,z,150,worldSeed+1400);
  if(t>.72+bias.desert) return 'desert'; if(t<.22+bias.snow) return 'snow'; if(m>.62+bias.forest) return 'forest'; return 'plains';
}
function heightAt(x,z){
  const b=biomeAt(x,z), n=fbm(x,z,worldSeed), ridge=Math.abs(valueNoise(x,z,105,worldSeed+77)-.5)*2;
  let h=16+n*21*worldHeightScale; if(b==='snow') h+=ridge*15*worldHeightScale; if(b==='desert') h=17+n*11*worldHeightScale; if(b==='forest') h+=4;
  return clamp(Math.floor(h),5,WORLD_Y-12);
}
function caveAt(x,y,z){ if(y<4||y>55) return false; const a=valueNoise(x+y*7,z-y*5,22,worldSeed+2600); const b=valueNoise(x-y*3,z+y*9,11,worldSeed+2800); return a>.72&&b>.58; }
function oreAt(x,y,z){ const r=hash32(x*7+y*17,z*11-y*5,worldSeed+3200); if(y<18&&r>.982) return BLOCK.IRON; if(y<36&&r>.972) return BLOCK.COAL; return BLOCK.STONE; }

const scene=new THREE.Scene(); scene.background=new THREE.Color(0x7fbced); scene.fog=new THREE.Fog(0x7fbced,45,VIEW*CHUNK*2.15);
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.05,420);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'}); renderer.setPixelRatio(Math.min(devicePixelRatio,1.65)); renderer.setSize(innerWidth,innerHeight); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace; document.body.prepend(renderer.domElement);
const sun=new THREE.DirectionalLight(0xfff1d2,2.1); sun.position.set(45,70,20); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-55;sun.shadow.camera.right=55;sun.shadow.camera.top=55;sun.shadow.camera.bottom=-55; scene.add(sun);
const hemi=new THREE.HemisphereLight(0xbfe1ff,0x31412c,1.15); scene.add(hemi);
window.WorldQualityAutopilot?.registerRenderer('voxel-world',renderer,{initialTier:matchMedia('(pointer:coarse)').matches?'BALANCED':'HIGH',targetFps:matchMedia('(pointer:coarse)').matches?40:55,onQualityChange(q){renderer.shadowMap.enabled=q.shadowQuality>0;const shadowSize=q.shadowQuality>1?1024:512;if(sun?.shadow?.mapSize){sun.shadow.mapSize.set(shadowSize,shadowSize);sun.shadow.needsUpdate=true}},getStats(){return{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}}});
const worldGroup=new THREE.Group(); scene.add(worldGroup);
const remoteGroup=new THREE.Group(); scene.add(remoteGroup);

const solidMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,metalness:0,side:THREE.FrontSide});
const transparentMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.65,transparent:true,opacity:.62,depthWrite:false,side:THREE.DoubleSide});
const waterMaterial=new THREE.MeshStandardMaterial({color:0x3e91ec,roughness:.28,metalness:.05,transparent:true,opacity:.54,depthWrite:false,side:THREE.DoubleSide});

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
    const forestThresh=clamp(1-(1-.89)*worldTreeDensity,.6,.995), plainsThresh=clamp(1-(1-.975)*worldTreeDensity,.9,.999);
    const canTree=(biome==='forest'&&treeChance>forestThresh)||(biome==='plains'&&treeChance>plainsThresh);
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

async function loadNeededChunks(){
  if(streamBusy) return; const pcx=floorDiv(player.pos.x,CHUNK),pcz=floorDiv(player.pos.z,CHUNK),need=[];
  outer: for(let r=0;r<=VIEW;r++) for(let dx=-r;dx<=r;dx++) for(let dz=-r;dz<=r;dz++){ if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;const cx=pcx+dx,cz=pcz+dz,k=key2(cx,cz);if(!chunks.has(k)&&!requested.has(k)){requested.add(k);need.push({x:cx,z:cz});if(need.length>=8)break outer;} }
  if(!need.length)return; streamBusy=true;
  try{ const res=await api('chunks',{chunks:need,worldId}); const by=new Map(); for(const row of res.blocks||[]){const k=key2(row.cx,row.cz);if(!by.has(k))by.set(k,[]);by.get(k).push(row);} for(const q of need){const k=key2(q.x,q.z),c=generateChunkData(new ChunkData(q.x,q.z),by.get(k)||[]);chunks.set(k,c);rebuildChunk(c);} }
  catch(e){statusEl.textContent=e.message;statusEl.className='vwWarn'; for(const q of need)requested.delete(key2(q.x,q.z));}
  finally{streamBusy=false;}
  for(const [k,c] of [...chunks]) if(Math.max(Math.abs(c.cx-pcx),Math.abs(c.cz-pcz))>VIEW+1){ for(const m of c.meshes){worldGroup.remove(m);m.geometry.dispose();} chunks.delete(k); requested.delete(k); }
}

const player={pos:new THREE.Vector3(0,35,0),vel:new THREE.Vector3(),yaw:0,pitch:0,onGround:false,selected:0,id:'',name:'Player'};
const keys=new Set(); let mobileMove={x:0,y:0}; let channel=null; let lastSave=0,lastNet=0; let started=false;
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
    await api('set_block',{worldId,x:c.x,y:c.y,z:c.z,blockType:b,playerPosition:{x:player.pos.x,y:player.pos.y,z:player.pos.z}});
    if(channel) void channel.send({type:'broadcast',event:'block_set',payload:{x:c.x,y:c.y,z:c.z,block:b}});
    statusEl.textContent='онлайн · мир сохраняется';statusEl.className='vwGood';
  }catch(e){setBlockLocal(c.x,c.y,c.z,old);statusEl.textContent=e.message;statusEl.className='vwWarn';}
}
function collidesWithCell(x,y,z){ return x+1>player.pos.x-PLAYER_R&&x<player.pos.x+PLAYER_R&&z+1>player.pos.z-PLAYER_R&&z<player.pos.z+PLAYER_R&&y+1>player.pos.y&&y<player.pos.y+PLAYER_H; }

function buildHotbar(){hotbarEl.innerHTML='';HOTBAR.forEach((b,i)=>{const d=document.createElement('div');d.className='slot'+(i===player.selected?' sel':'');d.innerHTML=`<span class="slotNum">${i+1}</span><span class="swatch" style="background:#${BLOCKS[b].color.toString(16).padStart(6,'0')}"></span><span>${BLOCKS[b].name}</span>`;d.onclick=()=>{player.selected=i;buildHotbar();};hotbarEl.appendChild(d);});}

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
  const sb=appState.supabase; channel=sb.channel(`voxel:${worldId}`,{config:{presence:{key:player.id},broadcast:{self:false,ack:false}}});
  channel.on('broadcast',{event:'player_state'},({payload})=>updateRemote(payload)); channel.on('broadcast',{event:'block_set'},({payload})=>{const b=validBlockType(payload?.block),x=finiteCoord(payload?.x),y=finiteCoord(payload?.y,320),z=finiteCoord(payload?.z);if(b===null||x===null||y===null||z===null||!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(z)||y<0||y>=WORLD_Y)return;if(Math.hypot(x-player.pos.x,z-player.pos.z)>(VIEW+3)*CHUNK)return;setBlockLocal(x,y,z,b);}); channel.on('presence',{event:'sync'},syncPresence);
  await new Promise((resolve,reject)=>channel.subscribe(async st=>{if(st==='SUBSCRIBED'){await channel.track({id:player.id,name:player.name,online_at:new Date().toISOString()});resolve();}else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT')reject(new Error('Realtime недоступен'));}));
}

function setupDesktop(){
  renderer.domElement.addEventListener('click',()=>{if(!matchMedia('(pointer:coarse)').matches&&document.pointerLockElement!==renderer.domElement)renderer.domElement.requestPointerLock?.();});
  document.addEventListener('pointerlockchange',()=>{targetEl.textContent=document.pointerLockElement===renderer.domElement?'ЛКМ ломать · ПКМ ставить':'Нажми на экран, чтобы играть';});
  document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==renderer.domElement)return;player.yaw-=e.movementX*.0022;player.pitch=clamp(player.pitch-e.movementY*.0022,-1.48,1.48);});
  document.addEventListener('keydown',e=>{if(document.activeElement?.tagName==='INPUT')return;keys.add(e.code);if(e.code==='Space'){e.preventDefault();jump();}if(/^Digit[1-9]$/.test(e.code)){player.selected=Number(e.code.slice(5))-1;buildHotbar();}});document.addEventListener('keyup',e=>keys.delete(e.code));
  renderer.domElement.addEventListener('mousedown',e=>{if(document.pointerLockElement!==renderer.domElement)return;if(e.button===0)editBlock(false);if(e.button===2)editBlock(true);});renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
}
function setupMobile(){
  const pad=document.getElementById('movePad'),knob=document.getElementById('moveKnob'),look=document.getElementById('lookZone');let moveId=null,lookId=null,lastLook=null;
  const upd=e=>{const r=pad.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,m=Math.min(46,Math.hypot(dx,dy)),a=Math.atan2(dy,dx);mobileMove={x:Math.cos(a)*(m/46),y:Math.sin(a)*(m/46)};knob.style.transform=`translate(${mobileMove.x*42}px,${mobileMove.y*42}px)`;};
  pad.addEventListener('pointerdown',e=>{moveId=e.pointerId;pad.setPointerCapture(e.pointerId);upd(e);});pad.addEventListener('pointermove',e=>{if(e.pointerId===moveId)upd(e);});const end=e=>{if(e.pointerId===moveId){moveId=null;mobileMove={x:0,y:0};knob.style.transform='';}};pad.addEventListener('pointerup',end);pad.addEventListener('pointercancel',end);
  look.addEventListener('pointerdown',e=>{lookId=e.pointerId;lastLook={x:e.clientX,y:e.clientY};look.setPointerCapture(e.pointerId);});look.addEventListener('pointermove',e=>{if(e.pointerId!==lookId||!lastLook)return;player.yaw-=(e.clientX-lastLook.x)*.005;player.pitch=clamp(player.pitch-(e.clientY-lastLook.y)*.005,-1.45,1.45);lastLook={x:e.clientX,y:e.clientY};});look.addEventListener('pointerup',e=>{if(e.pointerId===lookId){lookId=null;lastLook=null;}});
  document.getElementById('jumpBtn').onclick=jump;document.getElementById('breakBtn').onclick=()=>editBlock(false);document.getElementById('placeBtn').onclick=()=>editBlock(true);
}

function daylight(now){const day=(now*.000015)%1,a=day*Math.PI*2;sun.position.set(Math.cos(a)*65,Math.sin(a)*72+12,30);const k=clamp((sun.position.y+12)/55,.12,1);sun.intensity=.25+2.0*k;hemi.intensity=.28+1.0*k;const sky=new THREE.Color().setHSL(worldSkyHue,.55,.18+.48*k);scene.background.copy(sky);scene.fog.color.copy(sky);}
function updateTarget(){const h=rayVoxel();if(!h)return;targetEl.textContent=`${BLOCKS[h.block]?.name||'Блок'} · ${h.hit.x}, ${h.hit.y}, ${h.hit.z}`;}

async function savePlayer(){try{await api('player_save',{worldId,position:{x:player.pos.x,y:player.pos.y,z:player.pos.z},yaw:player.yaw,pitch:player.pitch,selectedBlock:HOTBAR[player.selected]});}catch{} }
function broadcastPlayer(now){if(!channel||now-lastNet<NET_INTERVAL)return;lastNet=now;channel.send({type:'broadcast',event:'player_state',payload:{id:player.id,name:player.name,x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:player.yaw}});}
let prev=performance.now();function loop(now){requestAnimationFrame(loop);const dt=Math.min(.045,(now-prev)/1000);prev=now;if(started){physics(dt);loadNeededChunks();broadcastPlayer(now);if(now-lastSave>SAVE_INTERVAL){lastSave=now;savePlayer();}updateTarget();biomeEl.textContent=`биом: ${biomeAt(Math.floor(player.pos.x),Math.floor(player.pos.z))} · чанки: ${chunks.size}`;for(const g of remote.values())g.position.lerp(g.userData.target,.18);}daylight(now);renderer.render(scene,camera);}requestAnimationFrame(loop);

addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});addEventListener('beforeunload',()=>savePlayer());
setupDesktop();setupMobile();buildHotbar();

try{
  const appState=await window.AppCore.init('voxel-world');
  const init=await api('init',{worldId}); worldSeed=Number(init.world?.seed)||worldSeed; const vs=init.world?.settings||{}; worldTheme=String(vs.theme||'plains'); worldHeightScale=Number(vs.heightScale)||1; worldTreeDensity=Number(vs.treeDensity)||1; if(vs.skyTint!==undefined)worldSkyHue=hexToHue(Number(vs.skyTint)); if(Number.isFinite(vs.fogNear)&&Number.isFinite(vs.fogFar)){scene.fog.near=vs.fogNear;scene.fog.far=vs.fogFar;} player.id=init.selfId;player.name=init.player?.name||appState.user?.username||'Player'; const p=init.player?.position||{x:0,y:heightAt(0,0)+4,z:0};player.pos.set(Number(p.x)||0,Number(p.y)||heightAt(0,0)+4,Number(p.z)||0);player.yaw=Number(init.player?.yaw)||0;player.pitch=Number(init.player?.pitch)||0;const sel=HOTBAR.indexOf(Number(init.player?.selectedBlock));if(sel>=0)player.selected=sel;buildHotbar(); await connectRealtime(appState); started=true; statusEl.textContent='онлайн · мир сохраняется';statusEl.className='vwGood';loading.classList.add('hidden');
}catch(e){console.error(e);statusEl.textContent=e.message;statusEl.className='vwWarn';loading.textContent=`Voxel World: ${e.message}`;setTimeout(()=>loading.classList.add('hidden'),3500);started=true;player.pos.set(0,heightAt(0,0)+4,0);}

window.VoxelWorldRuntime={
    stats(){return {player:{x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:player.yaw,onGround:player.onGround},renderer:renderer?.info?.render,pixelRatio:renderer?.getPixelRatio?.()||1};},
    setView(nextYaw,nextPitch=0){player.yaw=Number(nextYaw)||0;player.pitch=Number(nextPitch)||0;}
  };

try{if(typeof renderer!=='undefined')window.GoldenPerformanceAutoTune?.registerRenderer(renderer,{targetFps:matchMedia('(pointer:coarse)').matches?45:55,minDpr:.75,maxDpr:Math.min(devicePixelRatio||1,2)});}catch{}
