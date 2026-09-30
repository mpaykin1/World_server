import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createVoxelModRegistry} from '../../shared/voxel-mod-registry.mjs';
import {createGothicCityMod} from '../../shared/mods/gothic-city.mjs';
import {fireCannonAtStructure} from '../../shared/voxel-structural-destruction.mjs';
import {createRapierCollapseRuntime,loadPinnedRapier,RAPIER_PROVENANCE} from '../../shared/physics/rapier-collapse-runtime.mjs';

const root=document.querySelector('#scene');
const fireBtn=document.querySelector('#fire');
const loader=document.querySelector('#loader');
const a11yStatus=document.querySelector('#a11yStatus');
const coarse=matchMedia('(pointer:coarse)').matches;
const key3=v=>`${v.x},${v.y},${v.z}`;

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x09111b);
scene.fog=new THREE.FogExp2(0x111a26,.017);

const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,260);
const renderer=new THREE.WebGLRenderer({antialias:!coarse,powerPreference:'high-performance'});
const gl=renderer.getContext(),debugRenderer=gl.getExtension('WEBGL_debug_renderer_info');
const rendererName=String(debugRenderer?gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));
const softwareRenderer=/swiftshader|llvmpipe|software/i.test(rendererName);
const shadowsEnabled=!softwareRenderer;
const maxDpr=softwareRenderer?.5:(coarse?1.12:1.45);
const physicsHz=softwareRenderer?12:(coarse?32:48);
const perShotFragmentBudget=softwareRenderer?48:(coarse?90:120);
const activeFragmentBudget=softwareRenderer?96:(coarse?180:240);
renderer.setPixelRatio(Math.min(devicePixelRatio||1,maxDpr));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=shadowsEnabled;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.12;
root.appendChild(renderer.domElement);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
controls.dampingFactor=.075;
controls.minDistance=11;
controls.maxDistance=86;
controls.maxPolarAngle=Math.PI*.49;
controls.minPolarAngle=.16;
controls.enablePan=false;

scene.add(new THREE.HemisphereLight(0x779fd3,0x24180f,1.35));
const sun=new THREE.DirectionalLight(0xffdfb0,3.6);
sun.position.set(23,39,25);
sun.castShadow=shadowsEnabled;
sun.shadow.mapSize.set(coarse?512:1024,coarse?512:1024);
sun.shadow.camera.left=-46;sun.shadow.camera.right=46;
sun.shadow.camera.top=40;sun.shadow.camera.bottom=-34;
sun.shadow.camera.near=1;sun.shadow.camera.far=100;
scene.add(sun);
const rim=new THREE.DirectionalLight(0x6ea8ff,1.65);
rim.position.set(-28,20,-30);
scene.add(rim);

const ground=new THREE.Mesh(
  new THREE.PlaneGeometry(150,150),
  new THREE.MeshStandardMaterial({color:0x22272d,roughness:1,metalness:0}),
);
ground.rotation.x=-Math.PI/2;
ground.position.y=-.52;
ground.receiveShadow=shadowsEnabled;
scene.add(ground);

const grid=new THREE.GridHelper(120,120,0x4c5663,0x272f38);
grid.position.y=-.5;
grid.material.opacity=.17;
grid.material.transparent=true;
scene.add(grid);

const moon=new THREE.Mesh(
  new THREE.SphereGeometry(5,24,18),
  new THREE.MeshBasicMaterial({color:0xc4d8ef}),
);
moon.position.set(-52,43,-80);
scene.add(moon);

const MAT={
  3:new THREE.MeshStandardMaterial({color:0x96999e,roughness:.83,metalness:.02}),
  10:new THREE.MeshStandardMaterial({color:0x75504c,roughness:.88,metalness:.01}),
  9:new THREE.MeshStandardMaterial({color:0x72d2ee,emissive:0x19577a,emissiveIntensity:2.5,roughness:.2,metalness:.04,transparent:true,opacity:.8}),
  13:new THREE.MeshStandardMaterial({color:0xa2aab4,roughness:.3,metalness:.72}),
  5:new THREE.MeshStandardMaterial({color:0x805838,roughness:.9}),
};
const FRAGMENT_MAT={
  3:new THREE.MeshStandardMaterial({color:0xb1b3b7,roughness:.76,metalness:.02}),
  10:new THREE.MeshStandardMaterial({color:0x8a5953,roughness:.82}),
  9:MAT[9],13:MAT[13],5:MAT[5],
};
const cube=new THREE.BoxGeometry(.94,.94,.94);

function meshVoxels(voxels,actorKey){
  const group=new THREE.Group(),buckets=new Map(),matrix=new THREE.Matrix4();
  group.userData.actorKey=actorKey;
  for(const voxel of voxels){
    const type=voxel.blockType;
    if(!buckets.has(type))buckets.set(type,[]);
    buckets.get(type).push(voxel);
  }
  for(const [type,list] of buckets){
    const mesh=new THREE.InstancedMesh(cube,MAT[type]||MAT[3],list.length);
    mesh.userData.actorKey=actorKey;
    for(let i=0;i<list.length;i++){
      const v=list[i],s=v.role==='spire'?.88:v.role==='arch'?.94:.96;
      matrix.compose(new THREE.Vector3(v.x,v.y,v.z),new THREE.Quaternion(),new THREE.Vector3(s,s,s));
      mesh.setMatrixAt(i,matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
    mesh.castShadow=shadowsEnabled;
    mesh.receiveShadow=shadowsEnabled;
    group.add(mesh);
  }
  return group;
}

function disposeGroup(group){
  if(!group)return;
  scene.remove(group);
  group.traverse(o=>{if(o.isInstancedMesh)o.dispose?.();});
}

function addRubble(seedX,seedZ,count){
  const material=new THREE.MeshStandardMaterial({color:0x555b62,roughness:1});
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.44,.28,.48),material,count);
  const matrix=new THREE.Matrix4();
  for(let i=0;i<count;i++){
    const a=i*2.3999632297,r=4+(i%11)*.37;
    matrix.compose(
      new THREE.Vector3(seedX+Math.cos(a)*r,-.31,seedZ+Math.sin(a)*r),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(i*.17,i*.31,i*.11)),
      new THREE.Vector3(.44+(i%5)*.055,.44+(i%5)*.055,.44+(i%5)*.055),
    );
    mesh.setMatrixAt(i,matrix);
  }
  mesh.instanceMatrix.needsUpdate=true;
  mesh.castShadow=shadowsEnabled&&!coarse;
  mesh.receiveShadow=shadowsEnabled;
  scene.add(mesh);
}
addRubble(8,0,46);
addRubble(-12,-8,64);

const registry=createVoxelModRegistry();
registry.register(createGothicCityMod());
const towerBlueprint=registry.compileBlueprint({
  structureId:'gothic-city:tower',blueprintVersion:1,seed:20260930,
  params:{origin:{x:8,y:0,z:0},width:9,height:20},
});
const viaductBlueprint=registry.compileBlueprint({
  structureId:'gothic-city:viaduct',blueprintVersion:1,seed:20260931,
  params:{origin:{x:-12,y:0,z:-9},spanCount:4,pierSpacing:8,deckY:9,halfWidth:1},
});

const RAPIER=await loadPinnedRapier();
const world=new RAPIER.World({x:0,y:-9.81,z:0});
let groundCollider=RAPIER.ColliderDesc.cuboid(75,.5,75);
groundCollider=groundCollider.setTranslation(0,-1,0).setFriction(.9).setRestitution(.03);
world.createCollider(groundCollider);

const physics=createRapierCollapseRuntime({
  RAPIER,world,
  maxBodies:activeFragmentBudget,
  maxColliders:activeFragmentBudget,
  halfExtent:.445,
  colliderMode:'voxel',
});

const fragmentVisuals=new Map();
const fragmentMeshes=new Set();
const tmpMatrix=new THREE.Matrix4();
const tmpPosition=new THREE.Vector3();
const tmpQuaternion=new THREE.Quaternion();
const tmpScale=new THREE.Vector3(.92,.92,.92);

function addFragmentVisuals(states){
  const groups=new Map();
  for(const state of states){
    const type=state.blockType??3;
    if(!groups.has(type))groups.set(type,[]);
    groups.get(type).push(state);
  }
  for(const [type,list] of groups){
    const mesh=new THREE.InstancedMesh(cube,FRAGMENT_MAT[type]||FRAGMENT_MAT[3],list.length);
    mesh.castShadow=shadowsEnabled&&!coarse;
    mesh.receiveShadow=shadowsEnabled;
    for(let i=0;i<list.length;i++){
      const s=list[i];
      tmpPosition.set(s.position.x,s.position.y,s.position.z);
      tmpQuaternion.set(s.rotation.x,s.rotation.y,s.rotation.z,s.rotation.w);
      tmpMatrix.compose(tmpPosition,tmpQuaternion,tmpScale);
      mesh.setMatrixAt(i,tmpMatrix);
      fragmentVisuals.set(s.id,{mesh,index:i});
    }
    mesh.instanceMatrix.needsUpdate=true;
    fragmentMeshes.add(mesh);
    scene.add(mesh);
  }
}

function syncFragments(states){
  const dirty=new Set();
  for(const state of states){
    const ref=fragmentVisuals.get(state.id);
    if(!ref)continue;
    tmpPosition.set(state.position.x,state.position.y,state.position.z);
    tmpQuaternion.set(state.rotation.x,state.rotation.y,state.rotation.z,state.rotation.w);
    tmpMatrix.compose(tmpPosition,tmpQuaternion,tmpScale);
    ref.mesh.setMatrixAt(ref.index,tmpMatrix);
    dirty.add(ref.mesh);
  }
  for(const mesh of dirty)mesh.instanceMatrix.needsUpdate=true;
}

class StructureActor{
  constructor(key,name,blueprint,options,impactPoint){
    this.key=key;
    this.name=name;
    this.blueprint=blueprint;
    this.structure=blueprint.structure;
    this.options=options;
    this.impactPoint=impactPoint;
    this.staticGroup=meshVoxels(this.structure.voxels,key);
    scene.add(this.staticGroup);
    this.fired=false;
    this.fragmentIds=[];
    this.lastResult=null;
  }
  rebuild(voxels,dynamicKeys){
    disposeGroup(this.staticGroup);
    this.staticGroup=meshVoxels(voxels.filter(v=>!dynamicKeys.has(key3(v))),this.key);
    scene.add(this.staticGroup);
  }
  apply(result){
    const remaining=result.damage?.remaining||this.structure.voxels;
    const spawned=physics.spawnFragments(result.collapse,remaining,{
      impact:{point:result.flight.point,direction:result.flight.velocity},
      destroyed:result.damage?.destroyed||[],
      maxFragments:perShotFragmentBudget,
    });
    const dynamicKeys=new Set(spawned.spawned.map(s=>s.voxelKey).filter(Boolean));
    addFragmentVisuals(spawned.spawned);
    this.fragmentIds=spawned.spawned.map(s=>s.id);
    this.rebuild(remaining,dynamicKeys);
    this.fired=true;
    this.lastResult=result;
    return spawned;
  }
}

const actors={
  tower:new StructureActor(
    'tower','Башня',towerBlueprint,
    {supportMargin:.65,maxBodies:6,maxClusterVoxels:1500},
    new THREE.Vector3(8,1,0),
  ),
  viaduct:new StructureActor(
    'viaduct','Виадук',viaductBlueprint,
    {enableSpanSupport:true,supportDistanceBudget:32,maxBodies:8,maxClusterVoxels:1400},
    new THREE.Vector3(-12,2,-9),
  ),
};

const cameraPresets={
  tower:{p:[34,17,31],t:[8,6,0]},
  viaduct:{p:[-27,15,23],t:[-12,5,-7]},
};
camera.position.set(...cameraPresets.tower.p);
controls.target.set(...cameraPresets.tower.t);
controls.update();

const raycaster=new THREE.Raycaster();
const centerNdc=new THREE.Vector2(0,0);

function crosshairTarget(preferredKey=null){
  raycaster.setFromCamera(centerNdc,camera);
  const meshes=[];
  for(const actor of Object.values(actors))if(!actor.fired)meshes.push(...actor.staticGroup.children);
  const hits=raycaster.intersectObjects(meshes,false);
  const preferred=preferredKey?actors[preferredKey]:null;
  if(preferred&&!preferred.fired){
    const preferredHit=hits.find(hit=>hit?.object?.userData?.actorKey===preferredKey);
    if(preferredHit)return{actor:preferred,point:preferredHit.point.clone()};
  }
  const hit=hits[0];
  if(hit?.object?.userData?.actorKey){
    const actor=actors[hit.object.userData.actorKey];
    if(actor&&!actor.fired)return{actor,point:hit.point.clone()};
  }
  let best=null,bestDist=Infinity;
  for(const actor of Object.values(actors)){
    if(actor.fired)continue;
    const p=actor.impactPoint.clone().project(camera);
    const d=Math.hypot(p.x,p.y);
    if(p.z>=-1&&p.z<=1&&d<bestDist){best=actor;bestDist=d;}
  }
  return best?{actor:best,point:best.impactPoint.clone()}:null;
}

function shotForTarget(actor,target){
  const start=camera.position.clone();
  const dx=target.x-start.x,dy=target.y-start.y,dz=target.z-start.z;
  const distance=Math.hypot(dx,dy,dz);
  const t=Math.max(.16,distance/92);
  return{
    origin:{x:start.x,y:start.y,z:start.z},
    velocity:{x:dx/t,y:dy/t+4.905*t,z:dz/t},
    mass:54,
    damageRadius:actor.key==='tower'?3.8:2.7,
  };
}

const projectile=new THREE.Mesh(
  new THREE.SphereGeometry(.29,14,10),
  new THREE.MeshStandardMaterial({color:0x161616,roughness:.26,metalness:.82,emissive:0x6f2108,emissiveIntensity:.55}),
);
projectile.castShadow=shadowsEnabled;
projectile.visible=false;
scene.add(projectile);
const trailMaterial=new THREE.LineBasicMaterial({color:0xffa25a,transparent:true,opacity:.58});
let trail=null;

function animateProjectile(shot,result){
  return new Promise(resolve=>{
    const start=shot.origin,v0=shot.velocity,flight=Math.max(.05,result.flight?.time||.3),visualDuration=.72;
    projectile.visible=true;
    if(trail){scene.remove(trail);trail.geometry.dispose();trail=null;}
    trail=new THREE.Line(new THREE.BufferGeometry(),trailMaterial);
    scene.add(trail);
    const points=[],started=performance.now();
    function frame(now){
      const u=Math.min(1,(now-started)/(visualDuration*1000));
      const t=flight*u,e=.5*9.81*t*t;
      projectile.position.set(start.x+v0.x*t,start.y+v0.y*t-e,start.z+v0.z*t);
      points.push(projectile.position.clone());
      if(points.length>2)trail.geometry.setFromPoints(points.slice(-40));
      if(u<1)requestAnimationFrame(frame);
      else{
        projectile.visible=false;
        setTimeout(()=>{if(trail){scene.remove(trail);trail.geometry.dispose();trail=null;}},180);
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

let dust=[];
function impactFx(point){
  const flash=new THREE.PointLight(0xffb05b,20,20,2);
  flash.position.set(point.x,point.y,point.z);
  scene.add(flash);
  setTimeout(()=>scene.remove(flash),130);
  const count=softwareRenderer?30:(coarse?48:84);
  const positions=new Float32Array(count*3),vel=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    positions[i*3]=point.x;positions[i*3+1]=point.y;positions[i*3+2]=point.z;
    const a=i*2.3999632297,s=.9+(i%13)*.31;
    vel[i*3]=Math.cos(a)*s;vel[i*3+1]=1.5+(i%7)*.55;vel[i*3+2]=Math.sin(a)*s;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const material=new THREE.PointsMaterial({color:0xd5b181,size:coarse?.17:.22,transparent:true,opacity:.9,depthWrite:false});
  const points=new THREE.Points(geometry,material);
  scene.add(points);
  dust.push({points,vel,age:0,life:1.55});
}

function updateDust(dt){
  for(const d of dust){
    d.age+=dt;
    const p=d.points.geometry.attributes.position.array;
    for(let i=0;i<p.length/3;i++){
      p[i*3]+=d.vel[i*3]*dt;
      p[i*3+1]+=d.vel[i*3+1]*dt;
      p[i*3+2]+=d.vel[i*3+2]*dt;
      d.vel[i*3+1]-=5.6*dt;
      d.vel[i*3]*=.984;d.vel[i*3+2]*=.984;
    }
    d.points.geometry.attributes.position.needsUpdate=true;
    d.points.material.opacity=Math.max(0,1-d.age/d.life);
  }
  dust=dust.filter(d=>{
    if(d.age<d.life)return true;
    scene.remove(d.points);d.points.geometry.dispose();d.points.material.dispose();
    return false;
  });
}

let busy=false,shotCount=0,lastTarget='tower',lastError='';

async function fireTarget(targetKey=null){
  if(busy)return false;
  const target=crosshairTarget(targetKey);
  const actor=target?.actor||null;
  if(!actor||actor.fired){
    lastError='no-target';
    a11yStatus.textContent='Нет цели в прицеле';
    return false;
  }
  busy=true;
  fireBtn.disabled=true;
  lastTarget=actor.key;
  lastError='';
  try{
    const shot=shotForTarget(actor,target.point);
    const result=fireCannonAtStructure(actor.structure.voxels,shot,actor.options);
    if(!result.flight?.hit)throw new Error('Снаряд не попал в конструкцию');
    await animateProjectile(shot,result);
    impactFx(result.flight.point);
    const spawned=actor.apply(result);
    shotCount++;
    a11yStatus.textContent=`${actor.name}: разлетелось ${spawned.fragmentCount} блоков`;
    return true;
  }catch(error){
    lastError=String(error?.message||error);
    console.error('[GOTHIC MVP]',error);
    a11yStatus.textContent='Выстрел не выполнен';
    return false;
  }finally{
    busy=false;
    fireBtn.disabled=false;
  }
}

fireBtn.addEventListener('click',()=>void fireTarget());

let accumulator=0,prev=performance.now(),fps=60,frameCounter=0,fpsStamp=performance.now();
const physicsStep=1/physicsHz;
function loop(now){
  requestAnimationFrame(loop);
  const dt=Math.min(.04,(now-prev)/1000);prev=now;
  controls.update();
  updateDust(dt);
  accumulator+=dt;
  let steps=0;
  while(accumulator>=physicsStep&&steps<2){
    physics.step(1);
    accumulator-=physicsStep;
    steps++;
  }
  syncFragments(physics.snapshot());
  frameCounter++;
  if(now-fpsStamp>750){
    fps=Math.round(frameCounter*1000/(now-fpsStamp));
    frameCounter=0;fpsStamp=now;
  }
  renderer.render(scene,camera);
}
requestAnimationFrame(loop);

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,maxDpr));
  renderer.setSize(innerWidth,innerHeight);
});

window.GothicDestructionMVP={
  fire(target){return fireTarget(target||null);},
  aim(target){
    const preset=cameraPresets[target];
    if(!preset)return false;
    camera.position.set(...preset.p);
    controls.target.set(...preset.t);
    controls.update();
    lastTarget=target;
    return true;
  },
  stats(){
    const bodies=physics.snapshot(),p=physics.stats();
    return{
      ready:true,busy,shots:shotCount,fps,lastTarget,lastError,
      viewport:{w:innerWidth,h:innerHeight,canvas:{w:renderer.domElement.clientWidth,h:renderer.domElement.clientHeight}},
      hud:{visible:[...document.querySelectorAll('[data-gameplay-hud]')].filter(el=>getComputedStyle(el).display!=='none').map(el=>el.dataset.gameplayHud)},
      tower:{fired:actors.tower.fired,voxels:actors.tower.structure.voxels.length,fragments:actors.tower.fragmentIds.length},
      viaduct:{fired:actors.viaduct.fired,voxels:actors.viaduct.structure.voxels.length,fragments:actors.viaduct.fragmentIds.length},
      fragments:{count:bodies.filter(b=>b.kind==='voxel-fragment').length,bodies},
      physics:{...p},
      quality:{softwareRenderer,rendererName,maxDpr,shadows:shadowsEnabled,physicsHz,perShotFragmentBudget,activeFragmentBudget},
      rapier:RAPIER_PROVENANCE,
    };
  },
};

loader.classList.add('hidden');
setTimeout(()=>loader.remove(),450);
const params=new URLSearchParams(location.search);
const autoTarget=params.get('autofire');
if(actors[autoTarget]){
  window.GothicDestructionMVP.aim(autoTarget);
  setTimeout(()=>void fireTarget(autoTarget),650);
}
