import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createVoxelModRegistry} from '../../shared/voxel-mod-registry.mjs';
import {createGothicCityMod} from '../../shared/mods/gothic-city.mjs';
import {fireCannonAtStructure} from '../../shared/voxel-structural-destruction.mjs';
import {createRapierCollapseRuntime,loadPinnedRapier,RAPIER_PROVENANCE} from '../../shared/physics/rapier-collapse-runtime.mjs';

const root=document.querySelector('#scene'),fireBtn=document.querySelector('#fire'),statusEl=document.querySelector('#status');
const cameraBtn=document.querySelector('#camera'),resetBtn=document.querySelector('#reset'),loader=document.querySelector('#loader');
const targetBtns=[...document.querySelectorAll('.target')];
const coarse=matchMedia('(pointer:coarse)').matches;
const key3=v=>`${v.x},${v.y},${v.z}`;

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x0b121c);
scene.fog=new THREE.FogExp2(0x101925,0.018);

const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,260);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,coarse?1.35:1.75));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.08;
root.appendChild(renderer.domElement);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.075;controls.minDistance=13;controls.maxDistance=92;
controls.maxPolarAngle=Math.PI*.48;controls.minPolarAngle=.18;controls.enablePan=false;

const hemi=new THREE.HemisphereLight(0x7198c7,0x21160f,1.25);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffdfb0,3.4);
sun.position.set(22,38,24);sun.castShadow=true;sun.shadow.mapSize.set(coarse?1024:2048,coarse?1024:2048);
sun.shadow.camera.left=-46;sun.shadow.camera.right=46;sun.shadow.camera.top=40;sun.shadow.camera.bottom=-34;sun.shadow.camera.near=1;sun.shadow.camera.far=100;scene.add(sun);
const rim=new THREE.DirectionalLight(0x6aa6ff,1.45);rim.position.set(-25,18,-28);scene.add(rim);

const groundMat=new THREE.MeshStandardMaterial({color:0x24272b,roughness:1,metalness:0});
const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,150),groundMat);ground.rotation.x=-Math.PI/2;ground.position.y=-.52;ground.receiveShadow=true;scene.add(ground);
const grid=new THREE.GridHelper(120,120,0x49505a,0x272d34);grid.position.y=-.5;grid.material.opacity=.2;grid.material.transparent=true;scene.add(grid);

const moon=new THREE.Mesh(new THREE.SphereGeometry(5,24,18),new THREE.MeshBasicMaterial({color:0xbdd2e9}));
moon.position.set(-52,43,-80);scene.add(moon);

const MAT={
  3:new THREE.MeshStandardMaterial({color:0x8d9095,roughness:.86,metalness:.02}),
  10:new THREE.MeshStandardMaterial({color:0x6f4b49,roughness:.9,metalness:.01}),
  9:new THREE.MeshStandardMaterial({color:0x72cbe5,emissive:0x194e70,emissiveIntensity:2.2,roughness:.2,metalness:.05,transparent:true,opacity:.78}),
  13:new THREE.MeshStandardMaterial({color:0x9ca4ae,roughness:.34,metalness:.7}),
  5:new THREE.MeshStandardMaterial({color:0x795233,roughness:.92}),
};
const FALL_MAT={
  3:new THREE.MeshStandardMaterial({color:0xa7a9ad,roughness:.8,metalness:.02}),
  10:new THREE.MeshStandardMaterial({color:0x81524f,roughness:.86}),
  9:MAT[9],13:MAT[13],5:MAT[5],
};
const cube=new THREE.BoxGeometry(.96,.96,.96);

function meshVoxels(voxels,center=null,falling=false){
  const group=new THREE.Group(),buckets=new Map();
  for(const voxel of voxels){
    const type=voxel.blockType;
    if(!buckets.has(type))buckets.set(type,[]);
    buckets.get(type).push(voxel);
  }
  const matrix=new THREE.Matrix4();
  for(const [type,list] of buckets){
    const material=(falling?FALL_MAT:MAT)[type]||MAT[3];
    const mesh=new THREE.InstancedMesh(cube,material,list.length);
    for(let i=0;i<list.length;i++){
      const v=list[i],cx=center?.x||0,cy=center?.y||0,cz=center?.z||0;
      const s=v.role==='spire'?.88:v.role==='arch'?.94:.96;
      matrix.compose(new THREE.Vector3(v.x-cx,v.y-cy,v.z-cz),new THREE.Quaternion(),new THREE.Vector3(s,s,s));
      mesh.setMatrixAt(i,matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  return group;
}
function disposeGroup(group){
  if(!group)return;scene.remove(group);
  group.traverse(o=>{if(o.isInstancedMesh)o.dispose?.();});
}
function addRubble(seedX,seedZ,count=80){
  const mat=new THREE.MeshStandardMaterial({color:0x56595e,roughness:1}),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.45,.3,.5),mat,count),m=new THREE.Matrix4();
  for(let i=0;i<count;i++){
    const a=i*2.3999632297,r=4+(i%11)*.37,x=seedX+Math.cos(a)*r,z=seedZ+Math.sin(a)*r,s=.45+(i%5)*.06;
    m.compose(new THREE.Vector3(x,-.3,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(i*.17,i*.31,i*.11)),new THREE.Vector3(s,s,s));
    mesh.setMatrixAt(i,m);
  }
  mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
}
addRubble(8,0,60);addRubble(-12,-8,90);

const registry=createVoxelModRegistry();registry.register(createGothicCityMod());
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
groundCollider=groundCollider.setTranslation(0,-1,0).setFriction(.9);world.createCollider(groundCollider);
const physics=createRapierCollapseRuntime({RAPIER,world,maxBodies:12,maxColliders:1800});

class StructureActor{
  constructor(name,blueprint,shot,options={}){
    this.name=name;this.blueprint=blueprint;this.structure=blueprint.structure;this.shot=shot;this.options=options;
    this.staticGroup=meshVoxels(this.structure.voxels);scene.add(this.staticGroup);
    this.dynamic=new Map();this.fired=false;this.lastResult=null;
  }
  rebuild(voxels,dynamicKeys){
    disposeGroup(this.staticGroup);
    this.staticGroup=meshVoxels(voxels.filter(v=>!dynamicKeys.has(key3(v))));scene.add(this.staticGroup);
  }
  apply(result){
    const remaining=result.damage?.remaining||this.structure.voxels;
    const spawned=physics.spawn(result.collapse,remaining),ids=new Set(spawned.spawned.map(x=>x.id)),dynamicKeys=new Set();
    for(const plan of result.collapse.bodies){
      if(!ids.has(plan.id))continue;
      for(const key of plan.voxelKeys)dynamicKeys.add(key);
      const keySet=new Set(plan.voxelKeys),members=remaining.filter(v=>keySet.has(key3(v)));
      const group=meshVoxels(members,plan.centerOfMass,true);scene.add(group);this.dynamic.set(plan.id,group);
    }
    this.rebuild(remaining,dynamicKeys);this.fired=true;this.lastResult=result;
    return spawned;
  }
  sync(states){
    for(const state of states){
      const group=this.dynamic.get(state.id);if(!group)continue;
      group.position.set(state.position.x,state.position.y,state.position.z);
      group.quaternion.set(state.rotation.x,state.rotation.y,state.rotation.z,state.rotation.w);
    }
  }
}
const actors={
  tower:new StructureActor('Башня',towerBlueprint,{
    origin:{x:29,y:1.45,z:0},velocity:{x:-82,y:.5,z:0},mass:52,damageRadius:3.8,
  },{supportMargin:.65,maxBodies:6,maxClusterVoxels:1500}),
  viaduct:new StructureActor('Виадук',viaductBlueprint,{
    origin:{x:-12,y:1.5,z:17},velocity:{x:0,y:.35,z:-84},mass:58,damageRadius:2.7,
  },{enableSpanSupport:true,supportDistanceBudget:32,maxBodies:8,maxClusterVoxels:1400}),
};

function cannonAt(position,axis='x'){
  const group=new THREE.Group(),iron=new THREE.MeshStandardMaterial({color:0x30343a,roughness:.42,metalness:.72}),wood=new THREE.MeshStandardMaterial({color:0x6a462c,roughness:.93});
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.25,.4,3.6,14),iron);
  if(axis==='x')barrel.rotation.z=Math.PI/2;else barrel.rotation.x=Math.PI/2;
  barrel.position.set(position.x,position.y+1.15,position.z);barrel.castShadow=true;group.add(barrel);
  for(const side of [-.75,.75]){
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.72,.72,.22,14),wood);
    if(axis==='x'){wheel.rotation.x=Math.PI/2;wheel.position.set(position.x+.35,position.y+.58,position.z+side);}
    else{wheel.rotation.z=Math.PI/2;wheel.position.set(position.x+side,position.y+.58,position.z+.35);}
    wheel.castShadow=true;group.add(wheel);
  }
  scene.add(group);
}
cannonAt({x:28,y:0,z:0},'x');cannonAt({x:-12,y:0,z:16},'z');

let dust=[];
function impactFx(point,color=0xd4b184){
  const flash=new THREE.PointLight(0xffb25d,18,18,2);flash.position.set(point.x,point.y,point.z);scene.add(flash);
  setTimeout(()=>scene.remove(flash),150);
  const count=coarse?90:150,positions=new Float32Array(count*3),vel=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    positions[i*3]=point.x;positions[i*3+1]=point.y;positions[i*3+2]=point.z;
    const a=Math.random()*Math.PI*2,s=.8+Math.random()*4.6;
    vel[i*3]=Math.cos(a)*s;vel[i*3+1]=1.4+Math.random()*5.2;vel[i*3+2]=Math.sin(a)*s;
  }
  const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const mat=new THREE.PointsMaterial({color,size:coarse?.19:.24,transparent:true,opacity:.9,depthWrite:false});
  const pts=new THREE.Points(geom,mat);scene.add(pts);dust.push({pts,vel,life:1.8,age:0});
}
function updateDust(dt){
  for(const d of dust){d.age+=dt;const p=d.pts.geometry.attributes.position.array;
    for(let i=0;i<p.length/3;i++){p[i*3]+=d.vel[i*3]*dt;p[i*3+1]+=d.vel[i*3+1]*dt;p[i*3+2]+=d.vel[i*3+2]*dt;d.vel[i*3+1]-=5.2*dt;d.vel[i*3]*=.985;d.vel[i*3+2]*=.985;}
    d.pts.geometry.attributes.position.needsUpdate=true;d.pts.material.opacity=Math.max(0,1-d.age/d.life);
  }
  dust=dust.filter(d=>{if(d.age<d.life)return true;scene.remove(d.pts);d.pts.geometry.dispose();d.pts.material.dispose();return false;});
}

const projectile=new THREE.Mesh(new THREE.SphereGeometry(.28,14,10),new THREE.MeshStandardMaterial({color:0x151515,roughness:.28,metalness:.8,emissive:0x5b1d08,emissiveIntensity:.4}));
projectile.castShadow=true;projectile.visible=false;scene.add(projectile);
const trailGeom=new THREE.BufferGeometry(),trailMat=new THREE.LineBasicMaterial({color:0xffa35a,transparent:true,opacity:.5});
let trail=null;

function shotOptions(actor){return actor.options||{};}
function computeShot(actor){return fireCannonAtStructure(actor.structure.voxels,actor.shot,shotOptions(actor));}

let selected='tower',busy=false,shotCount=0,cameraIndex=0;
const cameraPresets=[
  {p:[34,20,40],t:[-2,7,-4]},
  {p:[30,10,25],t:[7,6,0]},
  {p:[-35,15,20],t:[-12,5,-8]},
  {p:[5,26,34],t:[-2,5,-4]},
];
function setCamera(index){
  const preset=cameraPresets[index%cameraPresets.length];camera.position.set(...preset.p);controls.target.set(...preset.t);controls.update();
}
setCamera(0);

function setSelected(next){
  if(!actors[next]||busy)return;selected=next;
  for(const b of targetBtns)b.classList.toggle('active',b.dataset.target===next);
  statusEl.textContent=`${actors[next].name}: готова к структурному тесту · выбери выстрел.`;
}
for(const b of targetBtns)b.addEventListener('click',()=>setSelected(b.dataset.target));
cameraBtn.addEventListener('click',()=>{cameraIndex=(cameraIndex+1)%cameraPresets.length;setCamera(cameraIndex);});
resetBtn.addEventListener('click',()=>location.reload());

function animateProjectile(actor,result){
  return new Promise(resolve=>{
    const start=actor.shot.origin,v0=actor.shot.velocity,flight=Math.max(.05,result.flight?.time||.3),visualDuration=1.1;
    projectile.visible=true;
    if(trail){scene.remove(trail);trail.geometry.dispose();}
    const points=[],started=performance.now();
    function frame(now){
      const u=Math.min(1,(now-started)/(visualDuration*1000)),t=flight*u,e=.5*9.81*t*t;
      projectile.position.set(start.x+v0.x*t,start.y+v0.y*t-e,start.z+v0.z*t);points.push(projectile.position.clone());
      if(points.length>2){trailGeom.setFromPoints(points.slice(-48));trail=new THREE.Line(trailGeom.clone(),trailMat);scene.add(trail);}
      if(u<1)requestAnimationFrame(frame);else{projectile.visible=false;resolve();}
    }
    requestAnimationFrame(frame);
  });
}

async function fireSelected(){
  if(busy)return;const actor=actors[selected];
  if(actor.fired){statusEl.textContent=`${actor.name} уже разрушена. Выбери вторую цель или нажми «Восстановить».`;return;}
  busy=true;fireBtn.disabled=true;statusEl.textContent=`${actor.name}: рассчитываю траекторию и несущие связи…`;
  try{
    const result=computeShot(actor);
    if(!result.flight?.hit)throw new Error('Ядро не попало в конструкцию');
    await animateProjectile(actor,result);impactFx(result.flight.point);
    const spawned=actor.apply(result);shotCount++;
    statusEl.textContent=`${actor.name}: выбито ${result.damage.destroyed.length} блоков · динамических частей ${spawned.spawned.length} · Rapier ${RAPIER_PROVENANCE.version}`;
  }catch(error){
    console.error('[GOTHIC MVP]',error);statusEl.textContent='Ошибка: '+(error?.message||error);
  }finally{busy=false;fireBtn.disabled=false;}
}
fireBtn.addEventListener('click',fireSelected);

let accumulator=0,prev=performance.now(),fps=60,frameCounter=0,fpsStamp=performance.now();
function loop(now){
  requestAnimationFrame(loop);const dt=Math.min(.04,(now-prev)/1000);prev=now;controls.update();updateDust(dt);
  accumulator+=dt;let steps=0;while(accumulator>=1/60&&steps<3){physics.step(1);accumulator-=1/60;steps++;}
  const states=physics.snapshot();actors.tower.sync(states);actors.viaduct.sync(states);
  frameCounter++;if(now-fpsStamp>750){fps=Math.round(frameCounter*1000/(now-fpsStamp));frameCounter=0;fpsStamp=now;}
  renderer.render(scene,camera);
}
requestAnimationFrame(loop);

addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio||1,coarse?1.35:1.75));renderer.setSize(innerWidth,innerHeight);});

window.GothicDestructionMVP={
  fire(target=selected){setSelected(target);return fireSelected();},
  stats(){
    const p=physics.stats(),bodies=physics.snapshot();
    return{
      ready:true,selected,shots:shotCount,busy,fps,
      viewport:{w:innerWidth,h:innerHeight,canvas:{w:renderer.domElement.clientWidth,h:renderer.domElement.clientHeight}},
      tower:{fired:actors.tower.fired,voxels:actors.tower.structure.voxels.length,dynamic:actors.tower.dynamic.size},
      viaduct:{fired:actors.viaduct.fired,voxels:actors.viaduct.structure.voxels.length,dynamic:actors.viaduct.dynamic.size},
      physics:{...p,bodies},rapier:RAPIER_PROVENANCE,
    };
  }
};

statusEl.textContent=`Готово: башня ${actors.tower.structure.voxels.length} voxels · виадук ${actors.viaduct.structure.voxels.length} voxels · выбери цель.`;
loader.classList.add('hidden');
setTimeout(()=>loader.remove(),650);
