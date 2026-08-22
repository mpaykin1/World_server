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

async function getSession(force=false){
  if(!force&&session&&session.expiresAt>Date.now()+30000)return session;
  const r=await fetch('/api/ai3d',{cache:'no-store'}),j=await r.json();
  // For voxel_city, allow local fallback when worker is offline (preview without AI3D_WORKER_URL)
  if(!r.ok||!j.enabled){
    const msg=j.error||j.reason||'AI3D worker не настроен';
    // Check if this is a preview without worker — allow local generation
    if(msg.includes('AI3D_WORKER_URL')||msg.includes('not configured')){
      console.warn('Worker offline, will use local CPU fallback for voxel_city');
      return null;
    }
    throw new Error(msg);
  }
  session=j;return session;
}
async function authFetch(path,options={}){
  const s=await getSession();const h=new Headers(options.headers||{});h.set('Authorization',`Bearer ${s.token}`);
  let r=await fetch(`${s.workerUrl}${path}`,{...options,headers:h});
  if(r.status===401){await getSession(true);const s2=await getSession();h.set('Authorization',`Bearer ${s2.token}`);r=await fetch(`${s2.workerUrl}${path}`,{...options,headers:h});}
  return r;
}
async function health(){
  try{const r=await fetch('/api/ai3d?action=health',{cache:'no-store'}),j=await r.json();const ready=j.plugins?.voxel_city?.available;$('health').textContent=j.ok?(ready?'Worker online · Voxel City ready':'Worker online · Voxel City missing'):'Worker offline';}
  catch{$('health').textContent='Worker offline';}
}
function setProgress(p,msg){$('bar').style.width=`${Math.max(0,Math.min(100,p))}%`;if(msg)$('log').textContent=msg;}
function profile(){return PROFILES[profileName]||PROFILES.HIGH;}
function cssRgb(a){return `rgb(${a[0]},${a[1]},${a[2]})`;}

function init3D(){
  const host=$('viewer');scene=new THREE.Scene();
  persp=new THREE.PerspectiveCamera(42,host.clientWidth/host.clientHeight,.05,4000);
  ortho=new THREE.OrthographicCamera(-50,50,50,-50,.05,4000);
  activeCamera=ortho;

  // Voxel edges are crisp; MSAA is intentionally off. Resolution scaler is cheaper and more controllable.
  renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance',alpha:true});
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=false; // lighting is baked into vertex colors
  renderer.sortObjects=false;
  dynamicPixelRatio=Math.min(devicePixelRatio||1,profile().pixelRatio);
  renderer.setPixelRatio(dynamicPixelRatio);
  renderer.setSize(host.clientWidth,host.clientHeight);
  host.replaceChildren(renderer.domElement);

  renderer.domElement.addEventListener('pointerdown',pointerDown);
  renderer.domElement.addEventListener('wheel',e=>{
    e.preventDefault();
    if(frontMode){const z=Math.exp(e.deltaY*.001);ortho.zoom=Math.max(.3,Math.min(5,ortho.zoom/z));ortho.updateProjectionMatrix();}
    else{radius=Math.max(12,Math.min(1200,radius*Math.exp(e.deltaY*.001)));updatePerspective();}
  },{passive:false});
  addEventListener('resize',fitCameras);
  animate();
}

let dragging=false,lx=0,ly=0;
function pointerDown(e){if(frontMode)switchOrbit();dragging=true;lx=e.clientX;ly=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);}
addEventListener('pointermove',e=>{if(!dragging||frontMode)return;const dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;yaw-=dx*.006;pitch=Math.max(-1.35,Math.min(1.35,pitch+dy*.006));updatePerspective();});
addEventListener('pointerup',()=>dragging=false);

function updatePerspective(){
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
  frontMode=true;activeCamera=ortho;scene.fog=null;
  ortho.zoom=1;ortho.position.set(target.x,target.y,target.z+Math.max(world.source.gridWidth,world.source.gridHeight)*2);ortho.lookAt(target);
  fitCameras();setAllDetailVisible(true);$('viewMode').textContent='FRONT EXACT · FULL DETAIL';
}
function switchOrbit(){
  if(!world)return;
  frontMode=false;activeCamera=persp;$('viewMode').textContent='3D ORBIT · STREAMED LOD';
  applyFog();updatePerspective();updateStreaming(true);
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
  for(const c of result.chunks){
    const detail=new THREE.Mesh(buildGeometry(c),new THREE.MeshBasicMaterial(detailMatTemplate));
    detail.frustumCulled=true;
    const far=buildFarChunk(c);far.visible=false;
    const b=c.bounds,center=new THREE.Vector3((b[0]+b[3])/2,(b[1]+b[4])/2,(b[2]+b[5])/2);
    detail.userData.chunkId=c.id;far.userData.chunkId=c.id;
    scene.add(detail);scene.add(far);
    chunkObjects.set(c.id,{detail,far,center,bounds:b,voxels:c.voxels,triangles:c.triangles});
  }
  updatePerformanceLabel();
}
async function renderWorld(data){
  world=data;
  await buildOptimizedChunks(data);
  const t=data.camera?.target||[(data.source?.gridWidth||100)/2,(data.source?.gridHeight||70)/2,10];
  target.set(t[0],t[1],t[2]);radius=Math.max(data.source.gridWidth,data.source.gridHeight)*1.35;yaw=0;pitch=.12;updatePerspective();
  const bg=data.background||{};if(bg.top&&bg.horizon)$('viewer').style.background=`linear-gradient(${cssRgb(bg.top)},${cssRgb(bg.horizon)} 58%,#120d0c)`;
  $('stats').textContent=`${(data.voxels||[]).length.toLocaleString('ru-RU')} logical cubes · ${chunkObjects.size} chunks · greedy surface mesh`;
  switchFront();
}

function streamingOrigin(){
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
function animate(now=performance.now()){
  requestAnimationFrame(animate);frameCount++;
  if(!frontMode)updateStreaming();
  if(now-lastFpsTime>=1500){
    measuredFps=Math.round(frameCount*1000/(now-lastFpsTime));frameCount=0;lastFpsTime=now;
    adaptResolution();updatePerformanceLabel();
  }
  renderer?.render(scene,activeCamera);
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
    // Try server first, fallback to local CPU if worker offline (preview without AI3D_WORKER_URL)
    let useLocal=false;
    let sessionCheck=null;
    try{
      sessionCheck=await getSession();
    }catch(e){
      if(String(e.message).includes('AI3D_WORKER_URL')||String(e.message).includes('not configured')){
        useLocal=true;
        console.warn('Worker offline — using local CPU voxel generation');
        $('health').textContent='Worker offline — локальная генерация (CPU)';
        setProgress(10,'Worker offline — генерирую локально в браузере…');
      } else throw e;
    }
    if(useLocal||!sessionCheck){
      // Local CPU fallback: generate voxel-city.json directly in browser
      const localData=await generateLocalVoxelCity(file,{
        voxelGridWidth:Number($('grid').value),maxDepth:Number($('depth').value),maxThickness:Number($('thickness').value),
        structureCell:Number($('structureCell').value)
      });
      await renderWorld(localData);
      // Create a fake sky backplate from reference
      const skyBlob=await createSkyBackplate(file);
      if(skyBlob) setSkyBackplate(skyBlob);
      setProgress(100,'Готово: локальный voxel world (без сервера) — можно ходить WASD');
      return;
    }
    const form=new FormData();form.set('mode','voxel_city');
    form.set('params',JSON.stringify({
      voxelGridWidth:Number($('grid').value),maxDepth:Number($('depth').value),maxThickness:Number($('thickness').value),
      structureCell:Number($('structureCell').value),paletteColors:64,depthLayers:10,foundation:true,useDepthAnything:true,depthInputSize:518
    }));
    form.set('file',file,file.name);setProgress(3,'Создаю server job…');
    const r=await authFetch('/v1/jobs',{method:'POST',body:form}),j=await r.json();
    if(!r.ok)throw new Error(j.detail||j.error||'Worker rejected job');
    poll(j.id).catch(e=>setProgress(0,e.message));
  }catch(e){setProgress(0,e.message);}
};

async function generateLocalVoxelCity(file, params){
  // Simple local CPU voxel generation: image -> palette -> heightfield -> voxels
  // This is a lightweight browser fallback when worker is offline.
  // It creates a voxel-city.json that can be rendered by the same mesher.
  const img=await createImageBitmap(file);
  const canvas=document.createElement('canvas');
  const w=params.voxelGridWidth||80, h=Math.round(w * (img.height/img.width));
  canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext('2d');
  ctx.drawImage(img,0,0,w,h);
  const data=ctx.getImageData(0,0,w,h).data;
  // Simple palette: quantize to 8 colors
  const voxels=[];
  const palette=[[34,139,34],[139,69,19],[128,128,128],[210,180,140],[70,70,70],[0,100,0],[255,255,255],[0,0,0]];
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const idx=(y*w+x)*4;
      const r=data[idx],g=data[idx+1],b=data[idx+2],a=data[idx+3];
      if(a<10) continue;
      // Simple height based on brightness (for demo)
      const brightness=(r+g+b)/3;
      const height=Math.floor((brightness/255)* (params.maxDepth||12));
      const colIdx=Math.floor((r+g+b)/3 / 32) % palette.length;
      const color=palette[colIdx];
      // Create a column of voxels up to height
      for(let z=0; z<Math.min(height, params.maxThickness||4); z++){
        voxels.push({x, y: h-1-y, z, color, material: z===height-1 ? 'top' : 'side'});
      }
      // Foundation
      if(params.foundation!==false){
        voxels.push({x, y: h-1-y, z: -1, color:[100,100,100], material:'foundation'});
      }
    }
  }
  // Add a simple sky
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
$('reset').onclick=()=>{if(world){yaw=0;pitch=.12;radius=Math.max(world.source.gridWidth,world.source.gridHeight)*1.35;switchFront();}};
$('quality').onchange=e=>{
  const v=e.target.value;
  adaptive=v==='AUTO';
  profileName=adaptive?'HIGH':v;
  dynamicPixelRatio=Math.min(devicePixelRatio||1,profile().pixelRatio);
  renderer.setPixelRatio(dynamicPixelRatio);fitCameras();applyFog();updateStreaming(true);
};

window.AI3DVoxelRuntime={
  setStreamingCenter(x,y,z){streamingCenter=new THREE.Vector3(Number(x)||0,Number(y)||0,Number(z)||0);updateStreaming(true);},
  clearStreamingCenter(){streamingCenter=null;updateStreaming(true);},
  setQuality(name){const n=String(name||'').toUpperCase();if(n==='AUTO'||PROFILES[n]){$('quality').value=n;$('quality').dispatchEvent(new Event('change'));}},
  stats(){return {fps:measuredFps,pixelRatio:dynamicPixelRatio,renderer:renderer?.info?.render,mesher:mesherStats,chunks:chunkObjects.size};}
};

init3D();health();
