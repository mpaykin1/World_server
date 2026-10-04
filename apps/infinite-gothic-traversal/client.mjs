import * as THREE from 'three';
import {
  BUILDING_HALF,
  CELL_SIZE,
  CORRIDOR_HALF,
  buildTraversalCell,
  buildTraversalWindow,
  clampToWalkable,
  isWalkable,
  traversalProof,
  worldToCell,
} from '../../shared/infinite-gothic-traversal.mjs';

const root=document.querySelector('#scene');
const loader=document.querySelector('#loader');
const a11y=document.querySelector('#a11y');
const coarse=matchMedia('(pointer:coarse)').matches;
const WORLD_SEED='world-server-infinite-gothic-v1';
const MAX_DETAIL_RADIUS=2;
const PROXY_RADIUS=5;
const PLAYER_Y=1.18;

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x08111b);
scene.fog=new THREE.FogExp2(0x0d1722,coarse?.015:.0125);

const camera=new THREE.PerspectiveCamera(coarse?64:58,innerWidth/innerHeight,.08,220);
const renderer=new THREE.WebGLRenderer({antialias:!coarse,powerPreference:'high-performance'});
const gl=renderer.getContext();
const debugInfo=gl.getExtension('WEBGL_debug_renderer_info');
const rendererName=String(debugInfo?gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));
const software=/swiftshader|llvmpipe|software/i.test(rendererName);
const DETAIL_RADIUS=software?1:MAX_DETAIL_RADIUS;
const maxDpr=software?.25:(coarse?1.15:1.55);
renderer.setPixelRatio(Math.min(devicePixelRatio||1,maxDpr));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=software?THREE.NoToneMapping:THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.18;
renderer.shadowMap.enabled=!software&&!coarse;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
root.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x7199c8,0x1b120d,1.45));
const keyLight=new THREE.DirectionalLight(0xffd6a1,3.2);
keyLight.position.set(24,36,18);
keyLight.castShadow=renderer.shadowMap.enabled;
keyLight.shadow.mapSize.set(1024,1024);
keyLight.shadow.camera.left=-52;keyLight.shadow.camera.right=52;
keyLight.shadow.camera.top=42;keyLight.shadow.camera.bottom=-42;
keyLight.shadow.camera.near=1;keyLight.shadow.camera.far=120;
scene.add(keyLight);
const rim=new THREE.DirectionalLight(0x5e92d6,1.55);
rim.position.set(-28,18,-30);scene.add(rim);

const moon=new THREE.Mesh(
  new THREE.SphereGeometry(6,24,16),
  new THREE.MeshBasicMaterial({color:0xb9cbe0}),
);
moon.position.set(-78,54,-120);
scene.add(moon);

const abyss=new THREE.Mesh(
  new THREE.PlaneGeometry(420,420),
  new THREE.MeshStandardMaterial({color:0x071019,roughness:1,metalness:0}),
);
abyss.rotation.x=-Math.PI/2;
abyss.position.y=-9;
scene.add(abyss);

const cubeGeometry=new THREE.BoxGeometry(.98,.98,.98);
const makeMaterial=(color,options={})=>software
  ? new THREE.MeshBasicMaterial({color,transparent:Boolean(options.transparent),opacity:options.opacity??1,fog:true})
  : new THREE.MeshStandardMaterial({color,...options});
const materials=new Map([
  [3,makeMaterial(0x82878e,{roughness:.86,metalness:.03})],
  [5,makeMaterial(0x6b4a31,{roughness:.92})],
  [9,software
    ? new THREE.MeshBasicMaterial({color:0x6ecce7,transparent:true,opacity:.86,fog:true})
    : new THREE.MeshStandardMaterial({color:0x6ecce7,emissive:0x164b67,emissiveIntensity:2.4,roughness:.2,transparent:true,opacity:.82})],
  [10,makeMaterial(0x68494a,{roughness:.9})],
  [13,makeMaterial(0x9aa3ae,{roughness:.3,metalness:.7})],
]);
const fallbackMaterial=materials.get(3);

let detailGroup=new THREE.Group();
let proxyGroup=new THREE.Group();
scene.add(detailGroup,proxyGroup);

function disposeGroup(group){
  scene.remove(group);
  group.traverse(object=>{
    if(object.isInstancedMesh)object.dispose?.();
    if(object.geometry&&object.userData?.ownedGeometry)object.geometry.dispose?.();
    if(object.material&&object.userData?.ownedMaterial)object.material.dispose?.();
  });
}
function addVoxelMeshes(voxels,group){
  const buckets=new Map();
  for(const voxel of voxels){
    if(!buckets.has(voxel.blockType))buckets.set(voxel.blockType,[]);
    buckets.get(voxel.blockType).push(voxel);
  }
  const matrix=new THREE.Matrix4();
  for(const [type,list] of buckets){
    const mesh=new THREE.InstancedMesh(cubeGeometry,materials.get(type)||fallbackMaterial,list.length);
    for(let i=0;i<list.length;i++){
      const voxel=list[i];
      let sx=.98,sy=.98,sz=.98;
      if(voxel.role==='spire'){sx=.86;sz=.86;}
      if(voxel.role==='buttress'){sx=.94;sz=.94;}
      matrix.compose(
        new THREE.Vector3(voxel.x,voxel.y,voxel.z),
        new THREE.Quaternion(),
        new THREE.Vector3(sx,sy,sz),
      );
      mesh.setMatrixAt(i,matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
    mesh.castShadow=renderer.shadowMap.enabled&&type!==9;
    mesh.receiveShadow=renderer.shadowMap.enabled;
    group.add(mesh);
  }
}

function proxyHeight(cx,cz){
  const n=Math.abs(Math.imul(cx+101,73856093)^Math.imul(cz-37,19349663));
  return 12+(n%10);
}
function rebuildProxies(centerCx,centerCz){
  const positions=[],bridgeX=[],bridgeZ=[];
  const detailed=(dx,dz)=>Math.abs(dx)<=DETAIL_RADIUS&&Math.abs(dz)<=DETAIL_RADIUS;
  for(let dz=-PROXY_RADIUS;dz<=PROXY_RADIUS;dz++)for(let dx=-PROXY_RADIUS;dx<=PROXY_RADIUS;dx++){
    const cx=centerCx+dx,cz=centerCz+dz;
    if(!detailed(dx,dz))positions.push({cx,cz,height:proxyHeight(cx,cz)});
    if(dx<PROXY_RADIUS&&!(detailed(dx,dz)&&detailed(dx+1,dz)))bridgeX.push({cx,cz});
    if(dz<PROXY_RADIUS&&!(detailed(dx,dz)&&detailed(dx,dz+1)))bridgeZ.push({cx,cz});
  }
  const material=software
    ? new THREE.MeshBasicMaterial({color:0x25303c,fog:true})
    : new THREE.MeshStandardMaterial({color:0x25303c,roughness:1,metalness:0});
  const geometry=new THREE.BoxGeometry(BUILDING_HALF*2+1,1,BUILDING_HALF*2+1);
  const mesh=new THREE.InstancedMesh(geometry,material,positions.length);
  mesh.userData.ownedGeometry=true;mesh.userData.ownedMaterial=true;
  const matrix=new THREE.Matrix4();
  for(let i=0;i<positions.length;i++){
    const p=positions[i],height=p.height;
    matrix.compose(
      new THREE.Vector3(p.cx*CELL_SIZE,height/2-.5,p.cz*CELL_SIZE),
      new THREE.Quaternion(),
      new THREE.Vector3(1,height,1),
    );
    mesh.setMatrixAt(i,matrix);
  }
  mesh.instanceMatrix.needsUpdate=true;
  proxyGroup.add(mesh);

  const span=CELL_SIZE-BUILDING_HALF*2;
  const bridgeMaterial=software
    ? new THREE.MeshBasicMaterial({color:0x202b36,fog:true})
    : new THREE.MeshStandardMaterial({color:0x202b36,roughness:1,metalness:0});
  const xGeometry=new THREE.BoxGeometry(span,.72,CORRIDOR_HALF*2+1);
  const zGeometry=new THREE.BoxGeometry(CORRIDOR_HALF*2+1,.72,span);
  const xMesh=new THREE.InstancedMesh(xGeometry,bridgeMaterial,bridgeX.length);
  const zMesh=new THREE.InstancedMesh(zGeometry,bridgeMaterial,bridgeZ.length);
  xMesh.userData.ownedGeometry=true;xMesh.userData.ownedMaterial=true;
  zMesh.userData.ownedGeometry=true;
  for(let i=0;i<bridgeX.length;i++){
    const p=bridgeX[i];
    matrix.makeTranslation((p.cx+.5)*CELL_SIZE,-.64,p.cz*CELL_SIZE);
    xMesh.setMatrixAt(i,matrix);
  }
  for(let i=0;i<bridgeZ.length;i++){
    const p=bridgeZ[i];
    matrix.makeTranslation(p.cx*CELL_SIZE,-.64,(p.cz+.5)*CELL_SIZE);
    zMesh.setMatrixAt(i,matrix);
  }
  xMesh.instanceMatrix.needsUpdate=true;zMesh.instanceMatrix.needsUpdate=true;
  proxyGroup.add(xMesh,zMesh);
}

const player={x:-CELL_SIZE/2,z:0,yaw:-Math.PI/2,pitch:0};
let currentCell=worldToCell(player.x,player.z);
let activeWindow=null;
let rebuilds=0;
let renderedVoxelCount=0;
const visited=new Set();

function rebuildWorld(force=false){
  const next=worldToCell(player.x,player.z);
  if(!force&&next.cx===currentCell.cx&&next.cz===currentCell.cz)return false;
  currentCell=next;
  visited.add(`${next.cx},${next.cz}`);
  const window=buildTraversalWindow({
    centerCx:next.cx,centerCz:next.cz,radius:DETAIL_RADIUS,seed:WORLD_SEED,
  });
  const voxelMap=new Map();
  for(const cell of window.cells)for(const voxel of cell.voxels)voxelMap.set(`${voxel.x},${voxel.y},${voxel.z}`,voxel);
  for(const edge of window.edges)for(const voxel of edge.voxels)voxelMap.set(`${voxel.x},${voxel.y},${voxel.z}`,voxel);
  const voxels=[...voxelMap.values()];

  const oldDetail=detailGroup,oldProxy=proxyGroup;
  detailGroup=new THREE.Group();proxyGroup=new THREE.Group();
  scene.add(detailGroup,proxyGroup);
  addVoxelMeshes(voxels,detailGroup);
  rebuildProxies(next.cx,next.cz);
  disposeGroup(oldDetail);disposeGroup(oldProxy);

  activeWindow=window;
  renderedVoxelCount=voxels.length;
  rebuilds++;
  return true;
}

function forwardVector(){
  return{x:-Math.sin(player.yaw),z:-Math.cos(player.yaw)};
}
function rightVector(){
  const f=forwardVector();
  return{x:-f.z,z:f.x};
}
function attemptMove(dx,dz){
  const next=clampToWalkable(
    {x:player.x,z:player.z},
    {x:player.x+dx,z:player.z+dz},
  );
  player.x=next.x;player.z=next.z;
  rebuildWorld(false);
  return !next.blocked;
}

const keys=new Set();
addEventListener('keydown',event=>{
  keys.add(event.code);
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code))event.preventDefault();
});
addEventListener('keyup',event=>keys.delete(event.code));

renderer.domElement.addEventListener('click',()=>{
  if(!coarse&&document.pointerLockElement!==renderer.domElement)renderer.domElement.requestPointerLock?.();
});
addEventListener('mousemove',event=>{
  if(document.pointerLockElement!==renderer.domElement)return;
  player.yaw-=event.movementX*.0024;
  player.pitch=Math.max(-1.18,Math.min(1.18,player.pitch-event.movementY*.0021));
});

const touch={
  moveId:null,lookId:null,
  moveStartX:0,moveStartY:0,moveX:0,moveY:0,
  lookX:0,lookY:0,
};
renderer.domElement.addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch')return;
  try{renderer.domElement.setPointerCapture?.(event.pointerId);}catch{}
  if(event.clientX<innerWidth*.5&&touch.moveId===null){
    touch.moveId=event.pointerId;
    touch.moveStartX=event.clientX;touch.moveStartY=event.clientY;
    touch.moveX=0;touch.moveY=0;
  }else if(touch.lookId===null){
    touch.lookId=event.pointerId;
    touch.lookX=event.clientX;touch.lookY=event.clientY;
  }
});
renderer.domElement.addEventListener('pointermove',event=>{
  if(event.pointerType!=='touch')return;
  if(event.pointerId===touch.moveId){
    const max=70;
    touch.moveX=Math.max(-1,Math.min(1,(event.clientX-touch.moveStartX)/max));
    touch.moveY=Math.max(-1,Math.min(1,(event.clientY-touch.moveStartY)/max));
  }else if(event.pointerId===touch.lookId){
    const dx=event.clientX-touch.lookX,dy=event.clientY-touch.lookY;
    touch.lookX=event.clientX;touch.lookY=event.clientY;
    player.yaw-=dx*.006;
    player.pitch=Math.max(-1.18,Math.min(1.18,player.pitch-dy*.0052));
  }
});
function releasePointer(event){
  if(event.pointerId===touch.moveId){
    touch.moveId=null;touch.moveX=0;touch.moveY=0;
  }
  if(event.pointerId===touch.lookId)touch.lookId=null;
}
renderer.domElement.addEventListener('pointerup',releasePointer);
renderer.domElement.addEventListener('pointercancel',releasePointer);

function keyboardAxes(){
  let forward=0,strafe=0;
  if(keys.has('KeyW')||keys.has('ArrowUp'))forward+=1;
  if(keys.has('KeyS')||keys.has('ArrowDown'))forward-=1;
  if(keys.has('KeyD')||keys.has('ArrowRight'))strafe+=1;
  if(keys.has('KeyA')||keys.has('ArrowLeft'))strafe-=1;
  return{forward,strafe};
}
function updateMovement(dt){
  const keyboard=keyboardAxes();
  let forward=keyboard.forward-touch.moveY;
  let strafe=keyboard.strafe+touch.moveX;
  const mag=Math.hypot(forward,strafe);
  if(mag>1){forward/=mag;strafe/=mag;}
  if(Math.abs(forward)<.02&&Math.abs(strafe)<.02)return;
  const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?10.5:7.1)*dt;
  const f=forwardVector(),r=rightVector();
  attemptMove((f.x*forward+r.x*strafe)*speed,(f.z*forward+r.z*strafe)*speed);
}
function updateCamera(){
  camera.position.set(player.x,PLAYER_Y,player.z);
  camera.rotation.order='YXZ';
  camera.rotation.y=player.yaw;
  camera.rotation.x=player.pitch;
  camera.rotation.z=0;
}

let previous=performance.now(),fps=60,frames=0,fpsStamp=performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt=Math.min(.045,(now-previous)/1000);previous=now;
  updateMovement(dt);
  updateCamera();
  frames++;
  if(now-fpsStamp>=750){
    fps=Math.round(frames*1000/(now-fpsStamp));frames=0;fpsStamp=now;
  }
  renderer.render(scene,camera);
}

function resetPlayer(){
  player.x=-CELL_SIZE/2;player.z=0;player.yaw=-Math.PI/2;player.pitch=0;
  currentCell={cx:Number.NaN,cz:Number.NaN};
  rebuildWorld(true);updateCamera();
}
function testTravel(direction,cells=6){
  const distance=Math.max(1,Math.min(40,Math.trunc(cells)))*CELL_SIZE;
  const dir={
    east:{x:1,z:0},west:{x:-1,z:0},north:{x:0,z:-1},south:{x:0,z:1},
  }[direction];
  if(!dir)throw new RangeError('Unknown test direction');
  player.x=0;player.z=0;
  currentCell={cx:Number.NaN,cz:Number.NaN};rebuildWorld(true);
  const step=3.5,total=Math.ceil(distance/step);
  let blockedSteps=0;
  for(let i=0;i<total;i++)if(!attemptMove(dir.x*step,dir.z*step))blockedSteps++;
  updateCamera();
  return{
    direction,cells,
    position:{x:player.x,z:player.z},
    cell:worldToCell(player.x,player.z),
    blockedSteps,
    walkable:isWalkable(player.x,player.z),
  };
}

rebuildWorld(true);
updateCamera();
requestAnimationFrame(loop);
loader.classList.add('hidden');
setTimeout(()=>loader.remove(),500);
a11y.textContent='Бесконечный готический мир загружен';

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,maxDpr));
  renderer.setSize(innerWidth,innerHeight);
});

window.InfiniteGothicTraversal={
  reset:resetPlayer,
  testTravel,
  proof(cells=200){return traversalProof({cells,seed:WORLD_SEED});},
  stats(){
    return{
      ready:true,
      player:{x:player.x,z:player.z,yaw:player.yaw,pitch:player.pitch},
      currentCell:{...currentCell},
      activeCells:activeWindow?.cells.length||0,
      activeEdges:activeWindow?.edges.length||0,
      detailRadius:DETAIL_RADIUS,
      renderedVoxels:renderedVoxelCount,
      rebuilds,
      visitedCells:visited.size,
      fps,
      renderer:{software,name:rendererName,maxDpr},
      viewport:{w:innerWidth,h:innerHeight,canvasW:renderer.domElement.clientWidth,canvasH:renderer.domElement.clientHeight},
      topology:{cellSize:CELL_SIZE,corridorHalf:CORRIDOR_HALF,walkable:isWalkable(player.x,player.z)},
    };
  },
};
