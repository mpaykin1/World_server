import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const canvas=document.querySelector('#world');
const statusEl=document.querySelector('#status');
const strip=document.querySelector('#assetStrip');
const panel=document.querySelector('#catalogPanel');
const toggle=document.querySelector('#catalogToggle');
const tabs=[...document.querySelectorAll('#tabs button')];

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x8dc6f1);
scene.fog=new THREE.Fog(0x8dc6f1,28,78);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const camera=new THREE.PerspectiveCamera(55,1,.1,180);
const target=new THREE.Vector3(0,2.3,0);
let yaw=.72,pitch=.48,distance=22;

scene.add(new THREE.HemisphereLight(0xd8efff,0x5d6b46,2.0));
const sun=new THREE.DirectionalLight(0xfff1cf,3.1);
sun.position.set(-14,24,11);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left=-28;sun.shadow.camera.right=28;sun.shadow.camera.top=28;sun.shadow.camera.bottom=-28;
scene.add(sun);

const loader=new GLTFLoader();
const clock=new THREE.Clock();
const mixers=[];
const loaded=new Map();
let catalog=null,currentKind='mobs',focusObject=null;
let dragging=false,lastX=0,lastY=0,pinchDistance=0;

function hash2(x,z){const s=Math.sin(x*91.7+z*47.3)*43758.5453;return s-Math.floor(s)}
function terrainHeight(x,z){return Math.floor((Math.sin(x*.28)+Math.cos(z*.25))*0.75+hash2(x,z)*1.25)}
function makeTerrain(){
  const geo=new THREE.BoxGeometry(1,1,1);
  const grass=new THREE.MeshStandardMaterial({color:0x6fae4e,roughness:1});
  const dirt=new THREE.MeshStandardMaterial({color:0x79563c,roughness:1});
  const count=31*31;
  const top=new THREE.InstancedMesh(geo,grass,count),soil=new THREE.InstancedMesh(geo,dirt,count);
  const m=new THREE.Matrix4();let i=0;
  for(let z=-15;z<=15;z++)for(let x=-15;x<=15;x++,i++){
    const h=terrainHeight(x,z);
    m.makeTranslation(x,h-.5,z);top.setMatrixAt(i,m);
    m.makeTranslation(x,h-1.5,z);soil.setMatrixAt(i,m);
  }
  top.receiveShadow=true;soil.receiveShadow=true;scene.add(top,soil);
  const water=new THREE.Mesh(new THREE.PlaneGeometry(52,52),new THREE.MeshStandardMaterial({color:0x4e9cd4,transparent:true,opacity:.55,roughness:.15,metalness:.05}));
  water.rotation.x=-Math.PI/2;water.position.y=-1.25;scene.add(water);
}
function makePedestal(){
  const group=new THREE.Group();group.name='focus-pedestal';
  const mat=new THREE.MeshStandardMaterial({color:0x2d3440,roughness:.8});
  for(let y=0;y<2;y++){const b=new THREE.Mesh(new THREE.BoxGeometry(4-y*.7,.45,4-y*.7),mat);b.position.y=terrainHeight(0,0)+.2+y*.4;b.receiveShadow=true;group.add(b)}
  scene.add(group);
}
function fitObject(obj,desired=3.4){
  const box=new THREE.Box3().setFromObject(obj),size=new THREE.Vector3(),center=new THREE.Vector3();
  box.getSize(size);box.getCenter(center);
  const max=Math.max(size.x,size.y,size.z)||1;const scale=desired/max;
  obj.scale.setScalar(scale);obj.position.sub(center.multiplyScalar(scale));
  const box2=new THREE.Box3().setFromObject(obj);obj.position.y-=box2.min.y;
}
function prepareObject(obj){
  obj.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;if(n.material?.map)n.material.map.colorSpace=THREE.SRGBColorSpace}});
}
async function loadModel(entry,{focus=false,position=null,scale=3.4}={}){
  let source=loaded.get(entry.url);
  if(!source){
    const gltf=await loader.loadAsync(entry.url);
    source=gltf.scene;prepareObject(source);loaded.set(entry.url,source);
  }
  const obj=source.clone(true);fitObject(obj,scale);
  if(position)obj.position.add(position);
  if(focus){
    focusObject?.removeFromParent();focusObject=obj;obj.position.y+=terrainHeight(0,0)+.65;scene.add(obj);
  } else scene.add(obj);
  return obj;
}
function find(kind,id){return catalog?.models?.[kind]?.find(x=>x.id===id)}
async function seedImportedModels(){
  const picks=[['mobs','villager',new THREE.Vector3(-6,terrainHeight(-6,-2)+.5,-2),2.4],['mobs','cow',new THREE.Vector3(5,terrainHeight(5,2)+.5,2),2.5],['mobs','wolf',new THREE.Vector3(7,terrainHeight(7,-5)+.5,-5),1.9],['mobs','zombie',new THREE.Vector3(-8,terrainHeight(-8,5)+.5,5),2.4],['entities','chest',new THREE.Vector3(3,terrainHeight(3,-6)+.5,-6),1.8]];
  for(const [kind,id,pos,scale] of picks){const entry=find(kind,id);if(entry)loadModel(entry,{position:pos,scale}).catch(()=>{})}
}
function renderCatalog(){
  strip.replaceChildren();
  const entries=catalog?.models?.[currentKind]||[];
  for(const entry of entries){
    const b=document.createElement('button');b.className='asset';b.textContent=entry.id.replaceAll('_',' ');b.dataset.id=entry.id;
    b.addEventListener('click',()=>selectEntry(entry,b));strip.appendChild(b);
  }
}
async function selectEntry(entry,button){
  [...strip.children].forEach(x=>x.classList.toggle('active',x===button));
  statusEl.textContent='загрузка '+entry.id+'…';
  try{await loadModel(entry,{focus:true,scale:3.4});statusEl.textContent=entry.id+' · '+Math.round(entry.size/1024)+' KB · source GLB';}
  catch(err){console.error(err);statusEl.textContent='не удалось загрузить '+entry.id;}
}
function updateCamera(){
  const cp=Math.cos(pitch);
  camera.position.set(target.x+Math.sin(yaw)*cp*distance,target.y+Math.sin(pitch)*distance,target.z+Math.cos(yaw)*cp*distance);
  camera.lookAt(target);
}
function resize(){
  const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
}
function onPointerDown(e){if(e.target.closest('#catalogPanel,#catalogToggle,#goldenUiShell'))return;dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture?.(e.pointerId)}
function onPointerMove(e){if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;yaw-=dx*.007;pitch=THREE.MathUtils.clamp(pitch+dy*.006,.12,1.25)}
function onPointerUp(){dragging=false}
canvas.addEventListener('pointerdown',onPointerDown);canvas.addEventListener('pointermove',onPointerMove);canvas.addEventListener('pointerup',onPointerUp);canvas.addEventListener('pointercancel',onPointerUp);
canvas.addEventListener('wheel',e=>{e.preventDefault();distance=THREE.MathUtils.clamp(distance+e.deltaY*.012,8,46)},{passive:false});
canvas.addEventListener('touchmove',e=>{if(e.touches.length!==2)return;const [a,b]=e.touches;const d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);if(pinchDistance)distance=THREE.MathUtils.clamp(distance+(pinchDistance-d)*.035,8,46);pinchDistance=d},{passive:false});
canvas.addEventListener('touchend',()=>pinchDistance=0,{passive:true});
addEventListener('keydown',e=>{const step=e.shiftKey ? .75 : .42;const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),r=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));if(['KeyW','ArrowUp'].includes(e.code))target.addScaledVector(f,step);if(['KeyS','ArrowDown'].includes(e.code))target.addScaledVector(f,-step);if(['KeyA','ArrowLeft'].includes(e.code))target.addScaledVector(r,-step);if(['KeyD','ArrowRight'].includes(e.code))target.addScaledVector(r,step)});
toggle.addEventListener('click',()=>{const hidden=document.documentElement.classList.toggle('catalog-hidden');toggle.setAttribute('aria-expanded',String(!hidden))});
for(const tab of tabs)tab.addEventListener('click',()=>{currentKind=tab.dataset.kind;tabs.forEach(x=>x.classList.toggle('active',x===tab));renderCatalog()});

async function boot(){
  makeTerrain();makePedestal();resize();updateCamera();
  const r=await fetch('/assets/voxel/prokopiy-minecraft/catalog.json',{cache:'no-store'});if(!r.ok)throw new Error('catalog HTTP '+r.status);catalog=await r.json();
  renderCatalog();await seedImportedModels();
  const first=find('mobs','player')||catalog.models.mobs[0];if(first)await loadModel(first,{focus:true});
  statusEl.textContent='готово · выбери любую импортированную модель';
  globalThis.ProkopiyMinecraftMVP={ready:true,catalogCounts:{mobs:catalog.models.mobs.length,items:catalog.models.items.length,entities:catalog.models.entities.length},viewportLocked:true};
}
function frame(){requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),.05);for(const mixer of mixers)mixer.update(dt);if(focusObject)focusObject.rotation.y+=dt*.18;updateCamera();renderer.render(scene,camera)}
addEventListener('resize',resize);frame();
boot().catch(err=>{console.error(err);statusEl.textContent='ошибка запуска: '+err.message;globalThis.ProkopiyMinecraftMVP={ready:false,error:err.message,viewportLocked:true}});
