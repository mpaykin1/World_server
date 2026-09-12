import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';

const $ = id => document.getElementById(id);
const CHUNK_SIZE = 16;
const PROFILES = {
  SAFE:  {renderChunks:4, detailChunks:2.5, pixelRatio:.85, targetFps:48, fogDensity:.014},
  HIGH:  {renderChunks:7, detailChunks:4.5, pixelRatio:1.15, targetFps:55, fogDensity:.009},
  ULTRA: {renderChunks:11,detailChunks:7.0, pixelRatio:1.45, targetFps:58, fogDensity:.006}
};

let session=null,renderer,scene,persp,ortho,activeCamera,world,currentJob,skyPlane,skyObjectUrl;
let yaw=0,pitch=0,radius=180,target=new THREE.Vector3(),frontMode=true,skyVisible=true,fogVisible=true;
let chunkObjects=new Map(),mesherStats=null,profileName='HIGH',adaptive=true;
let streamingCenter=null;
let frameCount=0,lastFpsTime=performance.now(),measuredFps=0,lastStreamUpdate=0;
let dynamicPixelRatio=1;

// --- Playable controller state (independent of AI worker) ---
let occupancySet=new Set();
let playableMode=false;
let player={ x:0, y:1.65, z:0, vx:0, vy:0, vz:0, yaw:0, pitch:0, radius:0.35, eyeHeight:1.65, height:1.65, speed:4.2, onGround:false };
// matches apps/voxel-world/client.js's jump()/JUMP pattern, scaled to this
// runtime's own gravity (9.8 here vs 25 there) for a comparable ~1-voxel
// jump height (v^2/2g): input capture existed (Space was added to
// keysHeld and preventDefault'd) but nothing ever actually applied an
// upward impulse - e2e/golden-controls.spec.js's jump-y-only test caught
// this real, previously-untested gap.
const JUMP_SPEED = 5.0;
let keysHeld=new Set();
let pointerLocked=false;
let lastPlayerUpdate=performance.now();
let defaultCityLoaded=false;
let autoplayStarted=false;
let initialVisibleFacing={yaw:0,label:'metadata',score:0,maxDistance:0};

async function getSession(force=false){
  if(!force&&session&&((session.enabled===false)||session.expiresAt>Date.now()+30000))return session;
  const r=await fetch('/api/ai3d',{cache:'no-store'}),j=await r.json();
  if(!r.ok)throw new Error(j.error||j.reason||'AI3D API недоступен');
  session=j;return session;
}
async function authFetch(path,options={}){
  const s=await getSession();const h=new Headers(options.headers||{});h.set('Authorization',`Bearer ${s.token}`);
  let r=await fetch(`${s.workerUrl}${path}`,{...options,headers:h});
  if(r.status===401){await getSession(true);const s2=await getSession();h.set('Authorization',`Bearer ${s2.token}`);r=await fetch(`${s2.workerUrl}${path}`,{...options,headers:h});}
  return r;
}
async function health(){
  try{
    const [hr,s]=await Promise.all([
      fetch('/api/ai3d?action=health',{cache:'no-store'}).then(r=>r.json()).catch(()=>({ok:false})),
      getSession(true).catch(()=>({enabled:false}))
    ]);
    if(hr.ok)$('health').textContent='Worker online · Voxel City ready';
    else if(s.enabled===false)$('health').textContent='Vercel fallback ready · external worker offline';
    else $('health').textContent='Voxel service checking…';
  }catch{$('health').textContent='Vercel fallback ready';}
}
function setProgress(p,msg){$('bar').style.width=`${Math.max(0,Math.min(100,p))}%`;if(msg)$('log').textContent=msg;}
function profile(){return PROFILES[profileName]||PROFILES.HIGH;}
function cssRgb(a){return `rgb(${a[0]},${a[1]},${a[2]})`;}

function init3D(){
  const host=$('viewer');scene=new THREE.Scene();const worldQualityHemi=new THREE.HemisphereLight(0xc9b2d6,0x241d22,.95);scene.add(worldQualityHemi);const worldQualitySun=new THREE.DirectionalLight(0xffc28a,1.15);worldQualitySun.position.set(-80,90,120);scene.add(worldQualitySun);
  persp=new THREE.PerspectiveCamera(70,host.clientWidth/host.clientHeight,.05,4000);
  ortho=new THREE.OrthographicCamera(-50,50,50,-50,.05,4000);
  activeCamera=ortho;

  renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance',alpha:true});
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=false;
  renderer.sortObjects=false;
  dynamicPixelRatio=Math.min(devicePixelRatio||1,profile().pixelRatio);
  renderer.setPixelRatio(dynamicPixelRatio);
  renderer.setSize(host.clientWidth,host.clientHeight);
  host.replaceChildren(renderer.domElement);
  window.GoldenPaintingAtmosphere?.registerThree({THREE,scene,renderer,getCamera:()=>activeCamera||persp,worldId:'ai3d-voxel-city'});
  window.WorldQualityAutopilot?.registerRenderer('ai3d-voxel-city',renderer,{
    initialTier:matchMedia('(pointer:coarse)').matches?'BALANCED':'HIGH',targetFps:matchMedia('(pointer:coarse)').matches?43:55,
    onQualityChange(q){if(!adaptive)return;profileName=q.tier==='SAFE'?'SAFE':q.tier==='ULTRA'?'ULTRA':'HIGH';dynamicPixelRatio=Math.min(devicePixelRatio||1,Number(q.dpr)||profile().pixelRatio);renderer.setPixelRatio(dynamicPixelRatio);renderer.setSize(host.clientWidth,host.clientHeight,false);if(typeof setWorldMaterialQuality==='function')setWorldMaterialQuality(q.pbrQuality||0);if(world){applyFog();updateStreaming(true)}},
    getStats(){return{fps:measuredFps,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}}
  });

  renderer.domElement.addEventListener('pointerdown',pointerDown);
  renderer.domElement.addEventListener('click',()=>{
    if(playableMode && !pointerLocked){
      try{ renderer.domElement.requestPointerLock(); }catch{}
    }
  });
  renderer.domElement.addEventListener('wheel',e=>{
    e.preventDefault();
    if(playableMode) return;
    if(frontMode){const z=Math.exp(e.deltaY*.001);ortho.zoom=Math.max(.3,Math.min(5,ortho.zoom/z));ortho.updateProjectionMatrix();}
    else{radius=Math.max(12,Math.min(1200,radius*Math.exp(e.deltaY*.001)));updatePerspective();}
  },{passive:false});
  document.addEventListener('pointerlockchange',()=>{
    pointerLocked = document.pointerLockElement===renderer.domElement;
    if(window.__AI3D_PLAYABLE_SCENE__) window.__AI3D_PLAYABLE_SCENE__.state.pointerLocked=pointerLocked;
  });
  document.addEventListener('mousemove',e=>{
    if(pointerLocked && playableMode){
      yaw-=e.movementX*0.0023;
      pitch=Math.max(-1.45,Math.min(1.45,pitch-e.movementY*0.0023));
      player.yaw=yaw; player.pitch=pitch;
    }
  });
  addEventListener('keydown',e=>{
    if(playableMode && ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)){
      keysHeld.add(e.code);
      if(e.code.startsWith('Arrow')) e.preventDefault();
      if(e.code==='Space'){
        e.preventDefault();
        if(player.onGround){ player.vy=JUMP_SPEED; player.onGround=false; }
      }
    }
  });
  addEventListener('keyup',e=>{
    keysHeld.delete(e.code);
  });
  addEventListener('goldenlook',e=>{if(!playableMode)return;const d=e.detail||{};yaw-=(Number(d.dx)||0)*.005;pitch=Math.max(-1.45,Math.min(1.45,pitch-(Number(d.dy)||0)*.005));player.yaw=yaw;player.pitch=pitch;});
  addEventListener('resize',fitCameras);
  animate();
}

let dragging=false,lx=0,ly=0;
function pointerDown(e){
  if(playableMode) return;
  if(frontMode)switchOrbit();
  dragging=true;lx=e.clientX;ly=e.clientY;
  try{ renderer.domElement.setPointerCapture(e.pointerId);}catch{}
}
addEventListener('pointermove',e=>{if(!dragging||frontMode||playableMode)return;const dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;yaw-=dx*.006;pitch=Math.max(-1.35,Math.min(1.35,pitch+dy*.006));updatePerspective();});
addEventListener('pointerup',()=>dragging=false);

function updatePerspective(){
  if(playableMode) return;
  const cp=Math.cos(pitch),sp=Math.sin(pitch),cy=Math.cos(yaw),sy=Math.sin(yaw);
  persp.position.set(target.x+radius*sy*cp,target.y+radius*sp,target.z+radius*cy*cp);
  persp.lookAt(target);
}
function fitCameras(){
  const host=$('viewer');if(!renderer)return;
  renderer.setSize(host.clientWidth,host.clientHeight,false);
  const aspect=host.clientWidth/Math.max(1,host.clientHeight);
  persp.aspect=aspect;persp.updateProjectionMatrix();
  if(world){
    const gw=world.source.gridWidth+4,gh=world.source.gridHeight+4;
    let halfW=gw/2,halfH=gh/2;if(aspect>gw/gh)halfW=halfH*aspect;else halfH=halfW/aspect;
    ortho.left=-halfW;ortho.right=halfW;ortho.top=halfH;ortho.bottom=-halfH;ortho.updateProjectionMatrix();
  }
}
function switchFront(){
  if(!world)return;
  playableMode=false;
  frontMode=true;activeCamera=ortho;scene.fog=null;
  ortho.zoom=1;ortho.position.set(target.x,target.y,target.z+Math.max(world.source.gridWidth,world.source.gridHeight)*2);ortho.lookAt(target);
  fitCameras();setAllDetailVisible(true);$('viewMode').textContent='FRONT EXACT · FULL DETAIL';
  if(document.pointerLockElement) document.exitPointerLock();
}
function switchOrbit(){
  if(!world)return;
  playableMode=false;
  frontMode=false;activeCamera=persp;$('viewMode').textContent='3D ORBIT · STREAMED LOD';
  applyFog();updatePerspective();updateStreaming(true);
  if(document.pointerLockElement) document.exitPointerLock();
}
function switchPlayable(){
  if(!world) return;
  frontMode=false; playableMode=true; activeCamera=persp;
  $('viewMode').textContent='PLAYABLE · WASD + MOUSE';
  applyFog(); updateStreaming(true);
  // camera will be controlled by player
}
function applyFog(){
  if(frontMode||!fogVisible||!world){scene.fog=null;return;}
  const bg=world.background||{},h=bg.horizon||[70,55,55];
  const c=new THREE.Color(h[0]/255,h[1]/255,h[2]/255);
  scene.fog=new THREE.FogExp2(c,profile().fogDensity/Math.max(1,CHUNK_SIZE/16));
}
function setAllDetailVisible(on){
  for(const o of chunkObjects.values()){o.detail.visible=on;o.far.visible=false;}
}

function setSkyBackplate(blob){
  if(skyPlane){scene.remove(skyPlane);skyPlane.geometry.dispose();skyPlane.material.map?.dispose();skyPlane.material.dispose();skyPlane=null;}
  if(skyObjectUrl)URL.revokeObjectURL(skyObjectUrl);
  skyObjectUrl=URL.createObjectURL(blob);
  new THREE.TextureLoader().load(skyObjectUrl,tex=>{
    tex.colorSpace=THREE.SRGBColorSpace;
    const gw=world.source.gridWidth,gh=world.source.gridHeight;
    const geom=new THREE.PlaneGeometry(gw,gh);
    const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:THREE.DoubleSide});
    skyPlane=new THREE.Mesh(geom,mat);skyPlane.position.set((gw-1)/2,(gh-1)/2,-12);skyPlane.visible=skyVisible;scene.add(skyPlane);
  });
}

function disposeChunks(){
  for(const o of chunkObjects.values()){
    scene.remove(o.detail);scene.remove(o.far);
    o.detail.geometry.dispose();o.detail.material.dispose();
    o.far.geometry.dispose();o.far.material.dispose();
  }
  chunkObjects.clear();
}
function buildGeometry(c){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(c.positions),3));
  g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(c.colors),3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(c.indices),1));
  g.computeBoundingBox();g.computeBoundingSphere();
  return g;
}
function buildFarChunk(c){
  const b=c.bounds;
  const sx=Math.max(.1,b[3]-b[0]+1),sy=Math.max(.1,b[4]-b[1]+1),sz=Math.max(.1,b[5]-b[2]+1);
  const g=new THREE.BoxGeometry(sx,sy,sz);
  const color=new THREE.Color((c.avgColor[0]||100)/255,(c.avgColor[1]||100)/255,(c.avgColor[2]||100)/255);
  const m=new THREE.MeshBasicMaterial({color,transparent:false});
  const mesh=new THREE.Mesh(g,m);
  mesh.position.set((b[0]+b[3])/2,(b[1]+b[4])/2,(b[2]+b[5])/2);
  mesh.frustumCulled=true;
  return mesh;
}
async function buildOptimizedChunks(data){
  disposeChunks();setProgress(93,'Browser: chunked greedy meshing in Web Worker…');
  if(!window.Worker)throw new Error('Web Worker недоступен');
  const result=await new Promise((resolve,reject)=>{
    const w=new Worker('./mesher-worker.js');
    const timer=setTimeout(()=>{w.terminate();reject(new Error('Mesher worker timeout'));},60000);
    w.onmessage=e=>{if(e.data?.type==='result'){clearTimeout(timer);w.terminate();resolve(e.data);}};
    w.onerror=e=>{clearTimeout(timer);w.terminate();reject(new Error(e.message||'Mesher worker error'));};
    w.postMessage({type:'build',voxels:data.voxels||[],palette:data.palette||[],chunkSize:CHUNK_SIZE});
  });
  mesherStats=result.stats;
  const detailMatTemplate={vertexColors:true,side:THREE.FrontSide};
  let requestedWorldMaterialQuality=0;
  function makeWorldDetailMaterial(){return(!frontMode&&requestedWorldMaterialQuality>0)?new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.FrontSide,roughness:requestedWorldMaterialQuality>1?.72:.82,metalness:.05}):new THREE.MeshBasicMaterial(detailMatTemplate)}
  function applyWorldMaterialMode(){for(const o of chunkObjects.values()){const old=o.detail.material;o.detail.material=makeWorldDetailMaterial();old?.dispose?.()}}
  function setWorldMaterialQuality(q){requestedWorldMaterialQuality=Math.max(0,Math.min(2,Number(q)||0));applyWorldMaterialMode()}
  for(const c of result.chunks){
    const detail=new THREE.Mesh(buildGeometry(c),makeWorldDetailMaterial());
    detail.frustumCulled=true;
    const far=buildFarChunk(c);far.visible=false;
    const b=c.bounds,center=new THREE.Vector3((b[0]+b[3])/2,(b[1]+b[4])/2,(b[2]+b[5])/2);
    detail.userData.chunkId=c.id;far.userData.chunkId=c.id;
    scene.add(detail);scene.add(far);
    chunkObjects.set(c.id,{detail,far,center,bounds:b,voxels:c.voxels,triangles:c.triangles});
  }
  updatePerformanceLabel();
  // build occupancy for collision after chunks built
  buildOccupancy(data);
}
function buildOccupancy(data){
  occupancySet=new Set();
  for(const v of (data.voxels||[])){
    const x=v[0], y=v[1], z=v[2];
    occupancySet.add(`${x},${y},${z}`);
  }
}
function isOccupied(ix,iy,iz){
  return occupancySet.has(`${ix},${iy},${iz}`);
}
function collidesAt(x,y,z){
  // check player cylinder collision: check voxels around player's feet/head
  const r=player.radius;
  const h=player.height;
  const minY=Math.floor(y - player.eyeHeight + 0.1);
  const maxY=Math.floor(y + 0.2);
  const minX=Math.floor(x - r), maxX=Math.floor(x + r);
  const minZ=Math.floor(z - r), maxZ=Math.floor(z + r);
  for(let ix=minX;ix<=maxX;ix++) for(let iy=minY;iy<=maxY;iy++) for(let iz=minZ;iz<=maxZ;iz++){
    if(isOccupied(ix,iy,iz)){
      // precise AABB vs cylinder check simplified to box
      const bx0=ix-0.5,bx1=ix+0.5,by0=iy-0.5,by1=iy+0.5,bz0=iz-0.5,bz1=iz+0.5;
      const px0=x - r, px1=x + r, pz0=z - r, pz1=z + r, py0=y - player.eyeHeight, py1=y + 0.2;
      if(px1>bx0 && px0<bx1 && py1>by0 && py0<by1 && pz1>bz0 && pz0<bz1) return true;
    }
  }
  return false;
}
function findGroundY(x,z){
  // find highest occupied voxel below (x,z) within 5 units down
  for(let y=Math.floor(player.y); y>=Math.floor(player.y)-6; y--){
    const ix=Math.floor(x), iz=Math.floor(z);
    if(isOccupied(ix,y,iz)) return y+1+0.05; // top of block
    // also check neighboring for foundation
    if(isOccupied(ix,y,iz) || isOccupied(ix-1,y,iz) || isOccupied(ix+1,y,iz) || isOccupied(ix,y,iz-1) || isOccupied(ix,y,iz+1)){}
  }
  // search directly: any voxel at y==0 or y==-1 under footprint?
  for(let dy=2; dy>=-6; dy--){
    const yy=Math.floor(player.y+dy);
    if(isOccupied(Math.floor(x), yy, Math.floor(z))) return yy+1+0.05;
  }
  // fallback: if no ground found, keep player at current y
  return null;
}
function resolveSpawn(worldData){
  if(worldData.spawn && Array.isArray(worldData.spawn.position)) return worldData.spawn.position;
  if(worldData.playerSpawn && Array.isArray(worldData.playerSpawn)) return worldData.playerSpawn;
  if(worldData.spawnPoint && Array.isArray(worldData.spawnPoint)) return worldData.spawnPoint;
  // compute center
  const sx=(worldData.source.gridWidth||128)/2, sz=(worldData.source.gridDepth||worldData.source.gridWidth||40)/2;
  // find empty near center at ground y=1.65
  for(let y=1; y<10; y++) for(let r=0;r<20;r++) for(let dx=-r;dx<=r;dx++) for(let dz=-r;dz<=r;dz++){
    const x=sx+dx, z=sz+dz, yy=y;
    if(!isOccupied(Math.floor(x),Math.floor(yy),Math.floor(z)) && !isOccupied(Math.floor(x),Math.floor(yy+1),Math.floor(z))) return [x,y+player.eyeHeight,z];
  }
  return [sx,1.65,sz];
}
function measureInitialViewDepthGrid(spawnPos,yaw,maxDistance,pitchAngle=0){
  const verticalTan=Math.tan(THREE.MathUtils.degToRad((Number(persp?.fov)||70)/2));
  const horizontalTan=Math.max(.15,verticalTan*Math.max(.35,Number(persp?.aspect)||1));
  const fx=-Math.sin(yaw),fz=-Math.cos(yaw),rx=-fz,rz=fx,cp=Math.cos(pitchAngle),sp=Math.sin(pitchAngle);
  const forwardX=fx*cp,forwardY=sp,forwardZ=fz*cp,upX=-fx*sp,upY=cp,upZ=-fz*sp;
  let nearSurfaceCoverage=0,centerNearSurfaceCoverage=0,centerMidFar=0;const centerDepthBands=new Set();
  for(let by=0;by<8;by++)for(let bx=0;bx<12;bx++){
    const sx=-1+(bx+.5)/6,sy=1-(by+.5)/4;
    let dx=forwardX+rx*sx*horizontalTan+upX*sy*verticalTan,dy=forwardY+upY*sy*verticalTan,dz=forwardZ+rz*sx*horizontalTan+upZ*sy*verticalTan;
    const inv=1/Math.max(.0001,Math.hypot(dx,dy,dz));dx*=inv;dy*=inv;dz*=inv;
    let hit=Infinity;
    for(let t=.75;t<=maxDistance;t+=.5){
      const sampleY=Math.floor(spawnPos[1]+dy*t);
      if(isOccupied(Math.floor(spawnPos[0]+dx*t),sampleY,Math.floor(spawnPos[2]+dz*t))){
        // Traversable support floor is expected in the lower viewport and must not
        // consume the near-occluder budget. Only geometry reaching into the player's
        // body/eye volume can classify a ray as a framing blocker.
        if(sampleY>=spawnPos[1]-1)hit=t;
        break;
      }
    }
    const center=Math.abs(sx)<=.42&&Math.abs(sy)<=.68;
    if(hit<14){nearSurfaceCoverage++;if(center)centerNearSurfaceCoverage++;}
    else if(center&&Number.isFinite(hit)){
      centerMidFar++;
      const r=(Math.min(maxDistance,hit)-14)/Math.max(1,maxDistance-14);
      centerDepthBands.add(Math.max(0,Math.min(3,Math.floor(r*4))));
    }
  }
  return{nearSurfaceCoverage,centerNearSurfaceCoverage,centerMidFar,centerDepthBands:centerDepthBands.size,sampleCount:96,source:'occupancy-ray-depth-grid'};
}
function chooseInitialPlayableFacing(worldData,spawnPos,pitchAngle=0){
  const voxels=Array.isArray(worldData?.voxels)?worldData.voxels:[];
  const metadataYaw=Number(worldData?.spawn?.yaw);
  // Sample a bounded full ring and score what the active perspective camera can
  // actually place on screen. The previous horizontal-only richness cone over-counted
  // off-screen geometry (especially in portrait WebKit/Chromium), so a direction
  // could look "rich" while the visible frame was mostly sky/ground with the city
  // pushed to an edge.
  const candidates=[{yaw:Number.isFinite(metadataYaw)?metadataYaw:0,label:'metadata'}];
  const directionSteps=24;
  for(let i=0;i<directionSteps;i++)candidates.push({yaw:-Math.PI+i*(Math.PI*2/directionSteps),label:`scan-${i}`});
  const unique=[];const seen=new Set();
  for(const c of candidates){const key=Math.round(c.yaw*100000);if(!seen.has(key)){seen.add(key);unique.push(c);}}
  const maxDistance=Math.min(Math.max(24,profile().detailChunks*CHUNK_SIZE),PROFILES.SAFE.renderChunks*CHUNK_SIZE);
  const nearDistance=10;
  const legacyCosHalf=Math.cos(35*Math.PI/180),legacyCenterCos=Math.cos(12*Math.PI/180);
  const verticalTan=Math.tan(THREE.MathUtils.degToRad((Number(persp?.fov)||70)/2));
  const frustumAspect=Math.max(.35,Number(persp?.aspect)||1);
  const horizontalTan=Math.max(.15,verticalTan*frustumAspect);
  const cp=Math.cos(pitchAngle),sp=Math.sin(pitchAngle);
  const measured=[];
  for(const c of unique){
    const fx=-Math.sin(c.yaw),fz=-Math.cos(c.yaw);
    const screenBins=new Set(),nearSurfaceBins=new Set(),centerNearSurfaceBins=new Set();
    let score=0,nearOccluders=0,centerOccluders=0,visibleNearOccluders=0,visibleCenterOccluders=0,centerMidFar=0,centerNearestDistance=Infinity;const centerDepthBands=new Set();
    for(const v of voxels){
      if(!Array.isArray(v)||v.length<3)continue;
      const dx=Number(v[0])-spawnPos[0],dy=Number(v[1])-spawnPos[1],dz=Number(v[2])-spawnPos[2],d=Math.hypot(dx,dz);
      if(d<2||d>maxDistance)continue;
      const horizontalForward=dx*fx+dz*fz;
      const alignment=horizontalForward/d;
      const eyeLevel=Number(v[1])>=spawnPos[1]-.5;
      const footprintLevel=Number(v[1])>=spawnPos[1]-1;
      // Preserve the established geometric blocker contract used by the hard autoplay
      // guard, while the new visible* metrics describe what is actually on screen.
      if(alignment>=legacyCosHalf&&d<nearDistance&&eyeLevel){
        nearOccluders++;
        if(alignment>=legacyCenterCos)centerOccluders++;
      }
      const forward=horizontalForward*cp+dy*sp;
      if(forward<=1)continue;
      const side=dx*(-fz)+dz*fx;
      const vertical=dy*cp-horizontalForward*sp;
      const screenX=side/(forward*horizontalTan);
      const screenY=vertical/(forward*verticalTan);
      // Estimate the actual screen footprint of nearby voxel faces, not just voxel centers.
      // A close wall can dominate the frame while center-point blocker counters remain zero.
      if(d<14&&footprintLevel){
        const halfX=Math.min(1,.75/(forward*horizontalTan)),halfY=Math.min(1,.75/(forward*verticalTan));
        const minX=Math.max(-1,screenX-halfX),maxX=Math.min(1,screenX+halfX),minY=Math.max(-1,screenY-halfY),maxY=Math.min(1,screenY+halfY);
        if(minX<=maxX&&minY<=maxY){
          const x0=Math.max(0,Math.min(11,Math.floor((minX+1)*6))),x1=Math.max(0,Math.min(11,Math.floor((maxX+1)*6)));
          const y0=Math.max(0,Math.min(7,Math.floor((minY+1)*4))),y1=Math.max(0,Math.min(7,Math.floor((maxY+1)*4)));
          for(let bx=x0;bx<=x1;bx++)for(let by=y0;by<=y1;by++){
            const key=`${bx}:${by}`;nearSurfaceBins.add(key);
            const cx=-1+(bx+.5)/6,cy=-1+(by+.5)/4;if(Math.abs(cx)<=.42&&Math.abs(cy)<=.68)centerNearSurfaceBins.add(key);
          }
        }
      }
      if(Math.abs(screenX)>1||Math.abs(screenY)>1)continue;
      score++;
      const bx=Math.max(0,Math.min(3,Math.floor((screenX+1)*2)));
      const by=Math.max(0,Math.min(2,Math.floor((screenY+1)*1.5)));
      screenBins.add(`${bx}:${by}`);
      if(d<nearDistance&&eyeLevel)visibleNearOccluders++;
      if(Math.abs(screenX)<=.42&&Math.abs(screenY)<=.68){
        centerNearestDistance=Math.min(centerNearestDistance,forward);
        if(d<nearDistance&&eyeLevel)visibleCenterOccluders++;
        else if(d>=nearDistance){
          centerMidFar++;
          const depthRatio=(Math.max(nearDistance,Math.min(maxDistance,forward))-nearDistance)/Math.max(1,maxDistance-nearDistance);
          centerDepthBands.add(Math.max(0,Math.min(3,Math.floor(depthRatio*4))));
        }
      }
    }
    const depthGrid=measureInitialViewDepthGrid(spawnPos,c.yaw,maxDistance,pitchAngle);
    measured.push({...c,score,nearOccluders,centerOccluders,visibleNearOccluders,visibleCenterOccluders,nearSurfaceCoverage:depthGrid.nearSurfaceCoverage,centerNearSurfaceCoverage:depthGrid.centerNearSurfaceCoverage,voxelProxyNearSurfaceCoverage:nearSurfaceBins.size,voxelProxyCenterNearSurfaceCoverage:centerNearSurfaceBins.size,renderDepthCenterMidFar:depthGrid.centerMidFar,renderDepthCenterBands:depthGrid.centerDepthBands,renderDepthSampleCount:depthGrid.sampleCount,framingEvidenceSource:depthGrid.source,centerMidFar,centerDepthBands:centerDepthBands.size,centerNearestDistance:Number.isFinite(centerNearestDistance)?centerNearestDistance:maxDistance,screenCoverage:screenBins.size,maxDistance,frustumAspect});
  }
  const richestCandidate=measured.reduce((best,c)=>!best||c.score>best.score?c:best,null);
  const richest=richestCandidate?.score||0;
  const readableFloor=Math.max(250,richest*.6);
  const readable=measured.filter(c=>c.score>=readableFloor);
  const bestCenterMidFar=readable.reduce((best,c)=>Math.max(best,c.centerMidFar||0),0);
  const centerContentFloor=Math.max(20,bestCenterMidFar*.35);
  const centered=readable.filter(c=>(c.centerMidFar||0)>=centerContentFloor);
  const improved=centered.filter(c=>c.centerOccluders<(richestCandidate?.centerOccluders??Infinity)&&c.nearOccluders<(richestCandidate?.nearOccluders??Infinity));
  const pool=improved.length?improved:(centered.length?centered:readable);
  // The hard autoplay contract requires useful forward clearance, so prefer candidates
  // that actually satisfy it whenever one exists; never trade playability for denser pixels.
  const clearanceQualified=pool.filter(c=>c.centerNearestDistance>6);
  const rankedPool=clearanceQualified.length?clearanceQualified:pool;
  // A clear screen center is useful only when it also contains mid/far world content.
  // Keep established blocker improvements, then prefer central depth and broad screen
  // coverage before raw richness.
  rankedPool.sort((a,b)=>a.centerNearSurfaceCoverage-b.centerNearSurfaceCoverage||a.nearSurfaceCoverage-b.nearSurfaceCoverage||a.visibleCenterOccluders-b.visibleCenterOccluders||b.renderDepthCenterBands-a.renderDepthCenterBands||b.renderDepthCenterMidFar-a.renderDepthCenterMidFar||b.centerDepthBands-a.centerDepthBands||b.centerMidFar-a.centerMidFar||b.screenCoverage-a.screenCoverage||a.visibleNearOccluders-b.visibleNearOccluders||b.centerNearestDistance-a.centerNearestDistance||a.nearOccluders-b.nearOccluders||a.centerOccluders-b.centerOccluders||b.score-a.score);
  const fallback=measured.slice().sort((a,b)=>b.score-a.score)[0]||{yaw:0,label:'fallback',score:0,nearOccluders:0,centerOccluders:0,visibleNearOccluders:0,visibleCenterOccluders:0,nearSurfaceCoverage:0,centerNearSurfaceCoverage:0,centerMidFar:0,centerDepthBands:0,centerNearestDistance:maxDistance,screenCoverage:0,maxDistance,frustumAspect};
  const selected=rankedPool[0]||fallback;
  const nearCoverage=measured.map(c=>c.nearSurfaceCoverage||0).sort((a,b)=>a-b);
  const centerCoverage=measured.map(c=>c.centerNearSurfaceCoverage||0).sort((a,b)=>a-b);
  const percentile=(values,p)=>values.length?values[Math.max(0,Math.min(values.length-1,Math.floor((values.length-1)*p)))]:0;
  // Trigger the existing bounded position fallback before the hard acceptance ceiling.
  // Exact-head pixels proved 36/96 full-frame + 12/36 center can still be wall-dominated,
  // so treat that composition as yaw-space exhaustion without weakening the <=38/<=14 gates.
  const yawSpaceExhausted=(selected.centerNearSurfaceCoverage||0)>=12||(selected.nearSurfaceCoverage||0)>=36;
  return {...selected,readableFloor,centerContentFloor,richestScore:richest,richestNearOccluders:richestCandidate?.nearOccluders||0,richestCenterOccluders:richestCandidate?.centerOccluders||0,richestCenterMidFar:richestCandidate?.centerMidFar||0,candidateCount:measured.length,yawSpaceExhausted,nearSurfaceCoverageRange:{min:nearCoverage[0]||0,median:percentile(nearCoverage,.5),max:nearCoverage.at(-1)||0},centerNearSurfaceCoverageRange:{min:centerCoverage[0]||0,median:percentile(centerCoverage,.5),max:centerCoverage.at(-1)||0}};
}
function chooseInitialPlayableView(worldData,spawnPos,pitchAngle=0){
  const baseFacing=chooseInitialPlayableFacing(worldData,spawnPos,pitchAngle);
  const base={spawnPos:[...spawnPos],facing:baseFacing,spawnOffset:[0,0],offsetDistance:0};
  const isFinalViewEligible=view=>view.facing.centerNearestDistance>6&&view.facing.score>=view.facing.readableFloor&&view.facing.centerMidFar>=view.facing.centerContentFloor;
  if(!baseFacing.yawSpaceExhausted){
    const eligible=isFinalViewEligible(base);
    base.facing={...baseFacing,spawnFallbackUsed:false,spawnOffset:[0,0],spawnCandidateCount:1,spawnEligibleCandidateCount:eligible?1:0,spawnRejectedCandidateCount:eligible?0:1,finalViewEligible:eligible,baseYawSpaceExhausted:false};
    return base;
  }
  // Yaw-only search is exhausted: sample the complete deterministic 2-unit lattice
  // inside the existing six-world-unit safety radius. The previous sparse axes/diagonals
  // skipped collision-clear intermediate positions that can escape a near wall without
  // widening the search radius or changing gameplay/framing thresholds.
  const offsets=[];
  for(let dx=-6;dx<=6;dx+=2)for(let dz=-6;dz<=6;dz+=2)if((dx||dz)&&Math.hypot(dx,dz)<=6)offsets.push([dx,dz]);
  const views=[base];
  for(const [dx,dz] of offsets){
    const candidate=[spawnPos[0]+dx,spawnPos[1],spawnPos[2]+dz];
    if(collidesAt(candidate[0],candidate[1],candidate[2]))continue;
    views.push({spawnPos:candidate,facing:chooseInitialPlayableFacing(worldData,candidate,pitchAngle),spawnOffset:[dx,dz],offsetDistance:Math.hypot(dx,dz)});
  }
  // Cross-position ranking must not bypass the same hard eligibility contract used
  // by the per-yaw scorer. Only alternate views that preserve forward clearance,
  // readable richness and centered mid/far content may compete with the canonical base.
  const eligibleAlternates=views.slice(1).filter(isFinalViewEligible);
  const rankingPool=isFinalViewEligible(base)?[base,...eligibleAlternates]:eligibleAlternates;
  rankingPool.sort((a,b)=>Number(a.facing.yawSpaceExhausted)-Number(b.facing.yawSpaceExhausted)||a.facing.centerNearSurfaceCoverage-b.facing.centerNearSurfaceCoverage||a.facing.nearSurfaceCoverage-b.facing.nearSurfaceCoverage||b.facing.renderDepthCenterBands-a.facing.renderDepthCenterBands||b.facing.renderDepthCenterMidFar-a.facing.renderDepthCenterMidFar||b.facing.centerDepthBands-a.facing.centerDepthBands||b.facing.centerMidFar-a.facing.centerMidFar||b.facing.screenCoverage-a.facing.screenCoverage||b.facing.centerNearestDistance-a.facing.centerNearestDistance||a.offsetDistance-b.offsetDistance);
  const selected=rankingPool[0]||base;
  selected.facing={...selected.facing,spawnFallbackUsed:selected.offsetDistance>0,spawnOffset:selected.spawnOffset,spawnCandidateCount:views.length,spawnEligibleCandidateCount:rankingPool.length,spawnRejectedCandidateCount:views.length-rankingPool.length,finalViewEligible:isFinalViewEligible(selected),baseYawSpaceExhausted:baseFacing.yawSpaceExhausted};
  return selected;
}
function chooseInitialPlayablePitch(spawnPos,facing,basePitch){
  const offsets=[0,.12,.24,-.12];
  const seen=new Set(),candidates=[];
  for(const offset of offsets){
    const candidate=Math.max(-.35,Math.min(.45,basePitch+offset));
    const key=Math.round(candidate*10000);if(seen.has(key))continue;seen.add(key);
    const depth=measureInitialViewDepthGrid(spawnPos,facing.yaw,facing.maxDistance,candidate);
    candidates.push({pitch:candidate,...depth});
  }
  candidates.sort((a,b)=>a.centerNearSurfaceCoverage-b.centerNearSurfaceCoverage||a.nearSurfaceCoverage-b.nearSurfaceCoverage||b.centerDepthBands-a.centerDepthBands||b.centerMidFar-a.centerMidFar||Math.abs(a.pitch-basePitch)-Math.abs(b.pitch-basePitch));
  const selected=candidates[0]||{pitch:basePitch};
  return {...selected,candidateCount:candidates.length,basePitch};
}
async function renderWorld(data){
  world=data;
  await buildOptimizedChunks(data);
  const t=data.camera?.target||[(data.source?.gridWidth||100)/2,(data.source?.gridHeight||70)/2,10];
  target.set(t[0],t[1],t[2]);radius=Math.max(data.source.gridWidth,data.source.gridHeight)*1.35;yaw=0;pitch=.12;updatePerspective();
  const bg=data.background||{};if(bg.top&&bg.horizon)$('viewer').style.background=`linear-gradient(${cssRgb(bg.top)},${cssRgb(bg.horizon)} 58%,#120d0c)`;
  $('stats').textContent=`${(data.voxels||[]).length.toLocaleString('ru-RU')} logical cubes · ${chunkObjects.size} chunks · greedy surface mesh`;
  // always keep front as fallback, but if default city autoplay, switch to playable
  if(defaultCityLoaded){
    const spawnPos=resolveSpawn(data);
    const spawnPitch=Number(data?.spawn?.pitch);
    const initialPitch=Number.isFinite(spawnPitch)?spawnPitch:.12;
    const initialView=chooseInitialPlayableView(data,spawnPos,initialPitch);
    const initialPitchChoice=chooseInitialPlayablePitch(initialView.spawnPos,initialView.facing,initialPitch);
    player.x=initialView.spawnPos[0]; player.y=initialView.spawnPos[1]; player.z=initialView.spawnPos[2]; player.vy=0; player.onGround=true;
    initialVisibleFacing={...initialView.facing,selectedPitch:initialPitchChoice.pitch,pitchSelection:initialPitchChoice};
    yaw=initialVisibleFacing.yaw; player.yaw=yaw; pitch=initialPitchChoice.pitch; player.pitch=pitch;
    switchPlayable();
    console.log('default-city visible facing',initialVisibleFacing);
    // notify playable runtime
    if(window.__AI3D_PLAYABLE_SCENE__){
      window.__AI3D_PLAYABLE_SCENE__.reportReady({walkable:true,collisions:true,grounding:true,playerSpawn:true});
    }
    setProgress(100,'Готово: default-city загружен — WASD/стрелки + мышь, клик для захвата.');
  } else {
    switchFront();
  }
}

function streamingOrigin(){
  if(playableMode) return new THREE.Vector3(player.x, player.y, player.z);
  if(streamingCenter)return streamingCenter;
  return activeCamera?.position||target;
}
function updateStreaming(force=false){
  if(frontMode)return;
  const now=performance.now();if(!force&&now-lastStreamUpdate<180)return;lastStreamUpdate=now;
  const p=profile(),origin=streamingOrigin();
  const maxDist=p.renderChunks*CHUNK_SIZE,detailDist=p.detailChunks*CHUNK_SIZE;
  for(const o of chunkObjects.values()){
    const dx=o.center.x-origin.x,dz=o.center.z-origin.z;
    const d=Math.hypot(dx,dz);
    const show=d<=maxDist;
    o.detail.visible=show&&d<=detailDist;
    o.far.visible=show&&d>detailDist;
  }
}
function updatePerformanceLabel(){
  if(!$('perfMetric')||!renderer)return;
  const calls=renderer.info.render.calls,tri=renderer.info.render.triangles;
  const red=mesherStats?.triangleReductionPercent;
  $('perfMetric').textContent=`FPS ${measuredFps||'…'} · calls ${calls} · tris ${tri.toLocaleString()}${red!==undefined?` · greedy -${red}% naive tris`:''}`;
}
function adaptResolution(){
  if(!adaptive||frontMode||!renderer)return;
  const p=profile(),dpr=devicePixelRatio||1;
  let next=dynamicPixelRatio;
  if(measuredFps>0&&measuredFps<p.targetFps-6)next*=.90;
  else if(measuredFps>p.targetFps+7)next*=1.06;
  next=Math.max(.55,Math.min(dpr,p.pixelRatio,next));
  if(Math.abs(next-dynamicPixelRatio)>.04){
    dynamicPixelRatio=next;renderer.setPixelRatio(dynamicPixelRatio);fitCameras();
  }
}
const GOLDEN_STEP_HEIGHTS=[.25,.5,.75,1.0,1.05];
function goldenPlayableHorizontal(axis,delta,allowStep){
  if(!delta)return true;
  const start={x:player.x,y:player.y,z:player.z};
  const tx=axis==='x'?start.x+delta:start.x;
  const tz=axis==='z'?start.z+delta:start.z;
  if(!collidesAt(tx,start.y,tz)){player[axis]+=delta;return true;}
  if(allowStep){
    for(const h of GOLDEN_STEP_HEIGHTS){
      const ry=start.y+h;
      if(collidesAt(start.x,ry,start.z))continue;
      if(collidesAt(tx,ry,tz))continue;
      player.y=ry;player[axis]+=delta;player.vy=Math.max(0,player.vy);return true;
    }
  }
  return false;
}
function updatePlayer(dt){
  if(!playableMode || !world) return;
  const wasGrounded=player.onGround;
  // gather input from both custom keysHeld and __AI3D_PLAYABLE_SCENE__ input (WASD/arrows)
  let f=0,s=0;
  const sceneInput = window.__AI3D_PLAYABLE_SCENE__ ? window.__AI3D_PLAYABLE_SCENE__.input() : null;
  if(sceneInput){
    f=(sceneInput.forward?1:0)-(sceneInput.back?1:0);
    s=(sceneInput.right?1:0)-(sceneInput.left?1:0);
  } else {
    if(keysHeld.has('KeyW')||keysHeld.has('ArrowUp')) f+=1;
    if(keysHeld.has('KeyS')||keysHeld.has('ArrowDown')) f-=1;
    if(keysHeld.has('KeyD')||keysHeld.has('ArrowRight')) s+=1;
    if(keysHeld.has('KeyA')||keysHeld.has('ArrowLeft')) s-=1;
  }
  const len=Math.hypot(f,s);
  if(len>0){ f/=len; s/=len; }
  const speed=player.speed * ((sceneInput && sceneInput.run)|| keysHeld.has('ShiftLeft') ? 1.8 : 1);
  const move=window.GameGoldenPhysics.canonicalXZ(yaw,f,s,speed);
  const wishX=move.x;
  const wishZ=move.z;
  // gravity
  player.vy -= 9.8 * dt;
  // Golden Standard: collision is axis-separated and can climb <= 1 voxel stairs.
  goldenPlayableHorizontal('x',wishX*dt,wasGrounded);
  goldenPlayableHorizontal('z',wishZ*dt,wasGrounded);
  // vertical
  let ny = player.y + player.vy * dt;
  const groundProbeY = findGroundY(player.x, player.z);
  // collision check vertical against voxels
  if(collidesAt(player.x, ny, player.z)){
    if(player.vy>0) ny = Math.floor(ny) - 0.2;
    else ny = Math.floor(ny + player.eyeHeight) + 0.5 - 0.01 + player.eyeHeight;
    player.vy=0;
  }
  player.y = ny;
  // ground detection: if we are just above ground, snap and mark onGround
  const feetY = player.y - player.eyeHeight;
  // search for ground within 0.3 below feet
  let groundY=null;
  for(let dy=0; dy<=1; dy++){
    const checkY=Math.floor(feetY - dy*0.5);
    if(isOccupied(Math.floor(player.x), checkY, Math.floor(player.z)) ||
       isOccupied(Math.floor(player.x+player.radius*0.5), checkY, Math.floor(player.z)) ||
       isOccupied(Math.floor(player.x-player.radius*0.5), checkY, Math.floor(player.z)) ||
       isOccupied(Math.floor(player.x), checkY, Math.floor(player.z+player.radius*0.5)) ||
       isOccupied(Math.floor(player.x), checkY, Math.floor(player.z-player.radius*0.5))){
      groundY=checkY+1+0.05;
      break;
    }
  }
  if(groundY!==null && player.y - player.eyeHeight <= groundY + 0.15 && player.vy <= 0){
    player.y = groundY + player.eyeHeight;
    player.vy = 0;
    player.onGround = true;
    if(window.__AI3D_PLAYABLE_SCENE__) window.__AI3D_PLAYABLE_SCENE__.state.grounding=true;
  } else {
    player.onGround = false;
    if(player.y < -10){ // fell off, respawn
      const sp=resolveSpawn(world);
      player.x=sp[0]; player.y=sp[1]; player.z=sp[2]; player.vy=0;
    }
  }
  // apply camera
  persp.position.set(player.x, player.y, player.z);
  persp.rotation.order='YXZ';
  persp.rotation.y=yaw;
  persp.rotation.x=pitch;
  // frame notify
  if(window.__AI3D_PLAYABLE_SCENE__) window.__AI3D_PLAYABLE_SCENE__.frame();
}
function animate(now=performance.now()){
  requestAnimationFrame(animate);
  const dt=Math.min(0.05,(now - lastPlayerUpdate)/1000); lastPlayerUpdate=now;
  frameCount++;
  if(playableMode) updatePlayer(dt);
  if(!frontMode)updateStreaming();
  if(now-lastFpsTime>=1500){
    measuredFps=Math.round(frameCount*1000/(now-lastFpsTime));frameCount=0;lastFpsTime=now;
    adaptResolution();updatePerformanceLabel();
  }
  renderer?.render(scene,activeCamera);
}

async function preprocessForServerless(file){
  const bitmap=await createImageBitmap(file);
  const maxW=96;
  const width=Math.min(maxW,bitmap.width);
  const height=Math.max(32,Math.round(width*bitmap.height/Math.max(1,bitmap.width)));
  const cv=document.createElement('canvas');cv.width=width;cv.height=height;
  const cx=cv.getContext('2d',{willReadFrequently:true});
  cx.drawImage(bitmap,0,0,width,height);bitmap.close?.();
  const rgba=cx.getImageData(0,0,width,height).data;
  const rgb=new Uint8Array(width*height*3);
  for(let i=0,j=0;i<rgba.length;i+=4){rgb[j++]=rgba[i];rgb[j++]=rgba[i+1];rgb[j++]=rgba[i+2];}
  let binary='';const step=0x8000;
  for(let i=0;i<rgb.length;i+=step)binary+=String.fromCharCode(...rgb.subarray(i,i+step));
  return {width,height,rgbBase64:btoa(binary)};
}
async function generateServerlessFallback(file){
  setProgress(8,'External AI3D worker не настроен. Использую Vercel serverless voxel fallback…');
  const pixels=await preprocessForServerless(file);
  const payload={
    ...pixels,
    maxDepth:Number($('depth').value),
    maxThickness:Number($('thickness').value),
    structureCell:Number($('structureCell').value),
    depthLayers:10
  };
  setProgress(28,'Отправляю reference pixels на World_server…');
  const r=await fetch('/api/ai3d-voxel-generate',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  const j=await r.json();
  if(!r.ok||!j.ok)throw new Error(j.error||'Serverless voxel generation failed');
  setProgress(78,`World_server построил ${j.world?.voxels?.length?.toLocaleString('ru-RU')||0} кубиков. Строю render chunks…`);
  await renderWorld(j.world);
  $('corrMetric').textContent='UNTESTED';
  $('frontMetric').textContent='SERVERLESS FALLBACK';
  setProgress(100,'Готово: город построен на Vercel без AI3D_WORKER_URL.');
}
async function loadJsonFile(job,predicate){
  const f=(job.files||[]).find(predicate);if(!f)return null;
  const r=await authFetch(f.url);if(!r.ok)throw new Error(`Не удалось загрузить ${f.name}`);return r.json();
}
async function poll(id){
  const r=await authFetch(`/v1/jobs/${id}`),j=await r.json();
  if(!r.ok)throw new Error(j.detail||j.error||'Job error');
  currentJob=j;setProgress(j.progress,`${j.status}: ${j.message||''}`);
  if(j.status==='failed')throw new Error(j.error||'Generation failed');
  if(j.status!=='completed'){setTimeout(()=>poll(id).catch(e=>setProgress(0,e.message)),1100);return;}
  const data=await loadJsonFile(j,f=>f.role==='voxel_world'||f.name==='voxel-city.json');
  if(!data)throw new Error('voxel-city.json не найден');
  await renderWorld(data);
  const skyFile=(j.files||[]).find(f=>f.role==='voxel_sky_backplate'||f.name==='voxel-sky-backplate.png');
  if(skyFile){const sr=await authFetch(skyFile.url);if(sr.ok)setSkyBackplate(await sr.blob());}
  const vr=await loadJsonFile(j,f=>f.role==='voxel_verification'||f.name==='voxel-verification-report.json');
  if(vr){
    const m=vr.frontProjection2D||{};
    $('frontMetric').textContent=`COLOR ${m.cityColorSimilarityPercent ?? '?'}% · EDGE ${m.maskedEdgeSimilarityPercent ?? '?'}%`;
    $('corrMetric').textContent=vr.image3dCorrespondence?.status||'UNTESTED';
  }
  setProgress(100,'Готово: server voxel world + greedy chunks + LOD/streaming.');
}

$('generate').onclick=async()=>{
  try{
    const file=$('file').files?.[0];if(!file)throw new Error('Выбери картинку.');
    $('reference').src=URL.createObjectURL(file);
    const s=await getSession(true).catch(()=>({enabled:false}));
    if(!s.enabled){
      try{
        await generateServerlessFallback(file);
      }catch(err){
        console.warn('Serverless fallback failed, using local CPU:', err.message);
        const localData=await generateLocalVoxelCity(file,{
          voxelGridWidth:Number($('grid').value),maxDepth:Number($('depth').value),maxThickness:Number($('thickness').value),
          structureCell:Number($('structureCell').value)
        });
        await renderWorld(localData);
        const skyBlob=await createSkyBackplate(file);
        if(skyBlob) setSkyBackplate(skyBlob);
        setProgress(100,'Готово: локальный voxel world (без сервера) — fallback после ошибки Vercel');
      }
      return;
    }
    const form=new FormData();form.set('mode','voxel_city');
    form.set('params',JSON.stringify({
      voxelGridWidth:Number($('grid').value),maxDepth:Number($('depth').value),maxThickness:Number($('thickness').value),
      structureCell:Number($('structureCell').value),paletteColors:64,depthLayers:10,foundation:true,useDepthAnything:true,depthInputSize:518
    }));
    form.set('file',file,file.name);setProgress(3,'Создаю external worker job…');
    const r=await authFetch('/v1/jobs',{method:'POST',body:form}),j=await r.json();
    if(!r.ok)throw new Error(j.detail||j.error||'Worker rejected job');
    poll(j.id).catch(e=>setProgress(0,e.message));
  }catch(e){setProgress(0,e.message);}
};

async function generateLocalVoxelCity(file, params){
  const img=await createImageBitmap(file);
  const canvas=document.createElement('canvas');
  const w=params.voxelGridWidth||80, h=Math.round(w * (img.height/img.width));
  canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext('2d');
  ctx.drawImage(img,0,0,w,h);
  const data=ctx.getImageData(0,0,w,h).data;
  const voxels=[];
  const palette=[[34,139,34],[139,69,19],[128,128,128],[210,180,140],[70,70,70],[0,100,0],[255,255,255],[0,0,0]];
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const idx=(y*w+x)*4;
      const r=data[idx],g=data[idx+1],b=data[idx+2],a=data[idx+3];
      if(a<10) continue;
      const brightness=(r+g+b)/3;
      const height=Math.floor((brightness/255)* (params.maxDepth||12));
      const colIdx=Math.floor((r+g+b)/3 / 32) % palette.length;
      const color=palette[colIdx];
      for(let z=0; z<Math.min(height, params.maxThickness||4); z++){
        voxels.push({x, y: h-1-y, z, color, material: z===height-1 ? 'top' : 'side'});
      }
      if(params.foundation!==false){
        voxels.push({x, y: h-1-y, z: -1, color:[100,100,100], material:'foundation'});
      }
    }
  }
  return {
    source:{gridWidth:w, gridHeight:h, gridDepth: params.maxDepth||16},
    voxels,
    palette,
    camera:{target:[w/2,h/2,5]},
    background:{top:[135,206,235], horizon:[70,55,55]},
    voxelsCount: voxels.length
  };
}
async function createSkyBackplate(file){
  try{
    const img=await createImageBitmap(file);
    const canvas=document.createElement('canvas');
    canvas.width=512; canvas.height=128;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(img,0,0,512,128);
    return await new Promise(res=>canvas.toBlob(b=>res(b), 'image/png'));
  }catch{return null;}
}

$('front').onclick=switchFront;
$('orbit').onclick=switchOrbit;
$('skyToggle').onclick=()=>{skyVisible=!skyVisible;if(skyPlane)skyPlane.visible=skyVisible;$('skyToggle').textContent=`Sky: ${skyVisible?'ON':'OFF'}`;};
$('fogToggle').onclick=()=>{fogVisible=!fogVisible;applyFog();$('fogToggle').textContent=`Haze: ${fogVisible?'ON':'OFF'}`;};
$('reset').onclick=()=>{
  if(playableMode && world){
    const sp=resolveSpawn(world); player.x=sp[0]; player.y=sp[1]; player.z=sp[2]; player.vy=0;
  } else if(world){yaw=0;pitch=.12;radius=Math.max(world.source.gridWidth,world.source.gridHeight)*1.35;switchFront();}
};
$('quality').onchange=e=>{
  const v=e.target.value;
  adaptive=v==='AUTO';
  profileName=adaptive?'HIGH':v;
  dynamicPixelRatio=Math.min(devicePixelRatio||1,profile().pixelRatio);
  renderer.setPixelRatio(dynamicPixelRatio);fitCameras();applyFog();updateStreaming(true);
};

// --- Immutable default-city autoplay (no AI worker / no serverless / no GPU dependency for generation) ---
async function autoLoadDefaultCity(){
  if(autoplayStarted) return; autoplayStarted=true;
  try{
    setProgress(5,'Загружаю default-city (gothic reference)…');
    // GPU availability check — generation is CPU-only, rendering degrades gracefully
    if(!window.WebGLRenderingContext){
      setProgress(0,'WebGL недоступен — default-city generation не требует GPU, рендер ограничен');
    }
    const r=await fetch('./default-city.json',{cache:'no-store'});
    if(!r.ok) throw new Error('default-city.json HTTP '+r.status);
    const data=await r.json();
    if(!Array.isArray(data.voxels) || data.voxels.length===0) throw new Error('default-city voxels empty');
    defaultCityLoaded=true;
    setProgress(30,`Default-city: ${data.voxels.length.toLocaleString('ru-RU')} voxels, immutable ${data.defaultCity?.immutable?'YES':'NO'}`);
    await renderWorld(data);
    setProgress(100,'Готово: высокодетализированный gothic voxel city — WASD/стрелки + мышь (клик для захвата), collision + gravity активны.');
    console.log('default-city autoload OK', {voxels:data.voxels.length, chunks:chunkObjects.size, spawn:player});
  }catch(e){
    console.warn('autoLoadDefaultCity failed:', e.message);
    setProgress(0,'Default-city не загружен: '+e.message+' — выбери картинку для генерации.');
  }
}

window.AI3DVoxelRuntime={
  setStreamingCenter(x,y,z){streamingCenter=new THREE.Vector3(Number(x)||0,Number(y)||0,Number(z)||0);updateStreaming(true);},
  clearStreamingCenter(){streamingCenter=null;updateStreaming(true);},
  setQuality(name){const n=String(name||'').toUpperCase();if(n==='AUTO'||PROFILES[n]){$('quality').value=n;$('quality').dispatchEvent(new Event('change'));}},
  setPlayerView(nextYaw,nextPitch=0){yaw=Number(nextYaw)||0;pitch=Math.max(-1.45,Math.min(1.45,Number(nextPitch)||0));player.yaw=yaw;player.pitch=pitch;},
  // alias: VoxelWorldRuntime (apps/voxel-world) exposes the same operation as
  // setView - e2e/golden-controls.spec.js calls the canonical setView name
  // against both runtimes, so this runtime needs to answer to it too.
  setView(nextYaw,nextPitch=0){this.setPlayerView(nextYaw,nextPitch);},
  stats(){return {fps:measuredFps,pixelRatio:dynamicPixelRatio,renderer:renderer?.info?.render,mesher:mesherStats,chunks:chunkObjects.size, voxels:world?world.voxels.length:0, player:{x:player.x,y:player.y,z:player.z,yaw,pitch,onGround:player.onGround, playable:playableMode}, defaultCityLoaded,initialVisibleFacing};},
  collidesAt(x,y,z){ return collidesAt(x,y,z); },
  getOccupancySize(){ return occupancySet.size; }
};
// expose for Playwright and delivery gate — do NOT count HTTP 200 as ready
window.__AI3D_DEFAULT_CITY_AUTOPLAY__ = { autoLoad: autoLoadDefaultCity, get state(){ return {loaded:defaultCityLoaded, playable:playableMode, spawned: !!(player && player.x), onGround:player.onGround}; } };

init3D();health();
autoLoadDefaultCity();

try{if(typeof renderer!=='undefined')window.GoldenPerformanceAutoTune?.registerRenderer(renderer,{targetFps:matchMedia('(pointer:coarse)').matches?45:55,minDpr:.75,maxDpr:Math.min(devicePixelRatio||1,2)});}catch{}
