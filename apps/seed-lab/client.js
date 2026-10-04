import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas=document.getElementById('view'),seedEl=document.getElementById('seed'),ideaEl=document.getElementById('idea');
const statusEl=document.getElementById('status'),factsEl=document.getElementById('facts'),paletteEl=document.getElementById('palette');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x0b1018);scene.fog=new THREE.FogExp2(0x0b1018,.012);
const camera=new THREE.PerspectiveCamera(48,1,.1,500);
let yaw=.7,pitch=.58,dist=82;const target=new THREE.Vector3();
scene.add(new THREE.HemisphereLight(0xcfe8ff,0x27311d,2.1));
const sun=new THREE.DirectionalLight(0xffe7c2,3.2);sun.position.set(30,55,18);sun.castShadow=true;scene.add(sun);
const world=new THREE.Group();scene.add(world);const textureCache=new Map(),gltfLoader=new GLTFLoader();

function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
function updateCamera(){camera.position.set(target.x+Math.cos(yaw)*Math.cos(pitch)*dist,target.y+Math.sin(pitch)*dist,target.z+Math.sin(yaw)*Math.cos(pitch)*dist);camera.lookAt(target)}
function clearWorld(){while(world.children.length){const o=world.children.pop();o.traverse?.(x=>{x.geometry?.dispose?.();if(x.material&&!Array.isArray(x.material))x.material.dispose?.()})}}
function segment(a,b,width=.4){const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);const mesh=new THREE.Mesh(new THREE.BoxGeometry(len,.08,width),new THREE.MeshStandardMaterial({color:0x4d545c,roughness:.96}));mesh.position.set((a.x+b.x)/2,.04,(a.z+b.z)/2);mesh.rotation.y=-Math.atan2(dz,dx);world.add(mesh)}
function roads(plan){for(const r of plan.roads||[]){if(r.kind==='line')segment({x:r.x1,z:r.z1},{x:r.x2,z:r.z2},r.width*.18);else for(let i=1;i<r.points.length;i++)segment(r.points[i-1],r.points[i],r.width*.18)}}
function loadImage(url){return new Promise((ok,bad)=>{const img=new Image();img.onload=()=>ok(img);img.onerror=bad;img.src=url})}
async function roleTextures(mc){
  const key=mc.sourceCommit+':'+mc.blockAtlas.palette.map(x=>x.index).join(',');
  if(textureCache.has(key))return textureCache.get(key);
  const [img,meta]=await Promise.all([loadImage(mc.blockAtlas.imageUrl),fetch(mc.blockAtlas.metadataUrl).then(r=>r.json())]);
  const map={};
  for(const p of mc.blockAtlas.palette){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.imageSmoothingEnabled=false;const sx=(p.index%meta.columns)*meta.tile,sy=Math.floor(p.index/meta.columns)*meta.tile;x.drawImage(img,sx,sy,meta.tile,meta.tile,0,0,64,64);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;map[p.role]=t}
  textureCache.set(key,map);return map;
}
const material=(texture,metal=.02)=>new THREE.MeshStandardMaterial({map:texture,roughness:.83,metalness:metal});
function box(group,w,h,d,y,mat,x=0,z=0){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y+h/2,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh}
function building(sample,textures,index){
  const g=new THREE.Group(),family=sample.family,w=Math.min(13,sample.footprint.width*.52),d=Math.min(13,sample.footprint.depth*.52);
  const total=Math.min(34,Math.max(3,sample.floors*.55));
  const wall=family==='future'?material(textures.iron,.45):family==='ancient_chinese'?material(textures.plank):material(textures.brick);
  const stone=material(textures.stone),glass=material(textures.glass,.05);
  if(family==='new_york'){box(g,w,total*.55,d,0,wall);box(g,w*.72,total*.3,d*.72,total*.55,wall);box(g,w*.42,total*.15,d*.42,total*.85,stone)}
  else if(family==='gothic'){box(g,w,total*.72,d,0,stone);box(g,w*.36,total*.28,d*.36,total*.72,stone);const cone=new THREE.Mesh(new THREE.ConeGeometry(w*.24,total*.28,4),stone);cone.position.y=total*1.14;cone.rotation.y=Math.PI/4;g.add(cone)}
  else if(family==='ancient_chinese'){for(let i=0;i<Math.min(4,Math.ceil(total/4));i++){box(g,w-i*.8,2.2,d-i*.8,i*3.1,wall);box(g,w+1-i*.65,.35,d+1-i*.65,i*3.1+2.2,material(textures.brick))}}
  else if(family==='future'){box(g,w,total*.55,d,0,wall);box(g,w*.58,total*.5,d*.58,total*.55,glass);box(g,w*.16,total*.3,d*.16,total*1.05,material(textures.iron,.6))}
  else{box(g,w,total,d,0,wall);box(g,w*.78,.45,d*.78,total,material(textures.iron,.3))}
  g.position.set(sample._x,0,sample._z);g.rotation.y=(index%4)*Math.PI/2;world.add(g);
}
async function seededModels(mc){
  const positions=[[-22,0,18],[18,0,20],[0,0,-24]],models=mc.assets?.mobs||[];
  for(let i=0;i<Math.min(3,models.length);i++){
    try{
      const gltf=await gltfLoader.loadAsync(models[i].url),obj=gltf.scene;
      const box3=new THREE.Box3().setFromObject(obj),size=new THREE.Vector3();box3.getSize(size);
      const max=Math.max(size.x,size.y,size.z)||1,scale=3.2/max;obj.scale.setScalar(scale);
      obj.position.set(positions[i][0],.05,positions[i][2]);obj.rotation.y=i*2.1;
      obj.traverse(x=>{if(x.isMesh){x.castShadow=true;x.receiveShadow=true}});world.add(obj);
    }catch(error){console.warn('[SEED_LAB_ASSET]',models[i].id,error?.message||error)}
  }
}
async function render(data,samples){
  clearWorld();roads(data.cityPlan);const textures=await roleTextures(data.architecture.minecraft);
  samples.forEach((s,i)=>building(s,textures,i));
  const size=data.cityPlan.size||256,ground=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshStandardMaterial({map:textures.grass,roughness:1}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.12;ground.receiveShadow=true;world.add(ground);await seededModels(data.architecture.minecraft);target.set(0,7,0);dist=Math.max(55,size*.32);updateCamera();
}
function facts(a){const mc=a.minecraft;factsEl.innerHTML='<div class="fact"><b>'+a.primaryFamily+'</b> · '+a.modifiers.join(', ')+'</div><div class="fact">roads: <b>'+a.urbanism.roadPattern+'</b> · density '+a.urbanism.density+'</div><div class="fact">history: <b>'+a.history.state+'</b> · '+a.history.ageYears+' years</div><div class="fact">rare: <b>'+mc.structures.rareStructure+'</b> · structures '+mc.structures.pool.length+'</div><div class="fact">assets: '+mc.assets.mobs.map(x=>x.id).join(', ')+'</div>'}
async function palette(a){
  paletteEl.innerHTML='';for(const p of a.minecraft.blockAtlas.palette){const div=document.createElement('div');div.className='tile';div.innerHTML='<span>'+p.role+'</span>';paletteEl.appendChild(div)}
  const img=await loadImage(a.minecraft.blockAtlas.imageUrl),meta=a.minecraft.blockAtlas;
  [...paletteEl.children].forEach((el,i)=>{const p=meta.palette[i],c=document.createElement('canvas');c.width=c.height=48;const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(img,(p.index%meta.columns)*meta.tile,Math.floor(p.index/meta.columns)*meta.tile,meta.tile,meta.tile,0,0,48,48);el.style.backgroundImage='url('+c.toDataURL()+')'});
}
async function generate(){
  statusEl.textContent='генерация…';
  try{
    const coords=[[-72,-72],[0,-72],[72,-72],[-72,0],[72,0],[-72,72],[0,72],[72,72]].map(([x,z])=>({x,z,lotWidth:18,lotDepth:18}));
    const res=await fetch('/api/world-factory',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'preview-seed',seed:seedEl.value,idea:ideaEl.value,x:0,z:0,size:240,samples:coords})});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const data=await res.json();data.samples.forEach((s,i)=>{s._x=coords[i].x;s._z=coords[i].z});
    facts(data.architecture);void palette(data.architecture);await render(data,data.samples);statusEl.textContent='seed '+data.architecture.seedKey+' · deterministic';
  }catch(e){console.error(e);statusEl.textContent='ошибка: '+e.message}
}
document.getElementById('generate').onclick=generate;
document.getElementById('examples').onclick=e=>{if(e.target.dataset.idea){ideaEl.value=e.target.dataset.idea;void generate()}};
let drag=null;canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw-=(e.clientX-drag.x)*.006;pitch=Math.max(.18,Math.min(1.2,pitch+(e.clientY-drag.y)*.004));drag={x:e.clientX,y:e.clientY};updateCamera()});
canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('wheel',e=>{dist=Math.max(25,Math.min(180,dist+e.deltaY*.06));updateCamera()},{passive:true});
addEventListener('resize',resize);resize();updateCamera();(function loop(){requestAnimationFrame(loop);renderer.render(scene,camera)})();void generate();