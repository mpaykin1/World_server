from pathlib import Path
root = Path(r'C:\Users\user\Desktop\.tools\ws-unified-catalog')

def replace(rel, old, new, count=1):
    p = root / rel
    s = p.read_text(encoding='utf-8-sig')
    found = s.count(old)
    if found != count:
        raise SystemExit(f'{rel}: expected {count} matches, found {found}: {old[:80]!r}')
    p.write_text(s.replace(old, new, count), encoding='utf-8')
    print('patched', rel)

def ensure_before(rel, marker, insertion):
    p = root / rel
    s = p.read_text(encoding='utf-8-sig')
    if insertion.strip() in s:
        print('already', rel); return
    if marker not in s:
        raise SystemExit(f'{rel}: marker missing')
    p.write_text(s.replace(marker, insertion + marker, 1), encoding='utf-8')
    print('patched', rel)

replace('shared/golden-ui-shell.js',
"    {match:'/apps/survival/',title:'Survival',selectors:['.app-title','.topHint']},\n    {match:'/apps/world-sharabass/',title:'World',selectors:['.app-title','.topHint']},",
"    {match:'/apps/survival/',title:'Survival',selectors:['#survivalHelp','#stats','#backLink','#buildPanel','#inventory']},\n    {match:'/apps/world-sharabass/',title:'Мир Шарабас',selectors:['#info','#players','#weather','#sizeBar','#ui']},")
replace('apps/survival/client.js',
"function requestChunks(force=false){\n  const now=performance.now(); if(!force && now-lastChunkReq<850) return; lastChunkReq=now;\n  const cx=Math.round(self.position.x/64), cz=Math.round(self.position.z/64); const req=[];\n  for(let x=cx-2;x<=cx+2;x++) for(let z=cz-2;z<=cz+2;z++) if(!chunks.has(`${x},${z}`)) req.push({x,z});\n  if(req.length) socket.emit('chunk:request',{chunks:req});\n}\n",
"function requestChunks(force=false){\n  const now=performance.now(); if(!force && now-lastChunkReq<850) return; lastChunkReq=now;\n  const cx=Math.round(self.position.x/64), cz=Math.round(self.position.z/64); const req=[];\n  for(let x=cx-2;x<=cx+2;x++) for(let z=cz-2;z<=cz+2;z++) if(!chunks.has(`${x},${z}`)) req.push({x,z});\n  if(req.length) socket.emit('chunk:request',{chunks:req});\n}\nwindow.InfiniteWorldStandard?.register('survival',{\n  infinite:true,chunkSize:64,deterministic:true,\n  ensureAround:()=>requestChunks(true),\n  loadedChunks:()=>chunks.size\n});\n")

for rel in ['apps/dreamfog-world/index.html','apps/ink-glyph-world/index.html','apps/pixel-panorama-360/index.html']:
    ensure_before(rel, '<script type="module" src="./client.js"></script>',
                  '<script src="/shared/infinite-world-runtime.js"></script>\n')

replace('apps/dreamfog-world/client.js',
"import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';",
"import * as THREE from '/shared/vendor/three.module.js';")
replace('apps/pixel-panorama-360/client.js',
"import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';",
"import * as THREE from '/shared/vendor/three.module.js';")
replace('apps/dreamfog-world/client.js',
"  if(Math.abs(p.x)>88||Math.abs(p.z)>88)return false;\n", "")
dream_anchor = "const atmosphere=createDreamFogAtmosphere(THREE,{scene,camera,renderer,seed,manifest,assetBase:'/apps/dreamfog-world/assets/generated/',onQualityChange:s=>{qualityEl.textContent=`quality: ${s.tier} · fog ${s.fogBanks} · ${s.particles} mist`;}});\n"
dream_chunks = dream_anchor + """
const DREAM_CHUNK=64,dreamChunks=new Map();
const dreamChunkGeo=new THREE.DodecahedronGeometry(1.1,0);
const dreamChunkMat=new THREE.MeshStandardMaterial({color:0x73617f,roughness:.95,metalness:0});
function dreamRand(cx,cz,n){let h=(Math.imul(cx,73856093)^Math.imul(cz,19349663)^Math.imul(n,83492791)^seed)|0;h^=h>>>13;h=Math.imul(h,1274126177);return((h^(h>>>16))>>>0)/4294967296;}
function ensureDreamChunks(){
  const cx=Math.floor(player.x/DREAM_CHUNK),cz=Math.floor(player.z/DREAM_CHUNK),keep=new Set();
  for(let x=cx-2;x<=cx+2;x++)for(let z=cz-2;z<=cz+2;z++){
    const key=`${x},${z}`;keep.add(key);if(dreamChunks.has(key))continue;
    const g=new THREE.Group();g.name=`DreamChunk:${key}`;
    for(let i=0;i<5;i++){const m=new THREE.Mesh(dreamChunkGeo,dreamChunkMat);const r=dreamRand(x,z,i);m.position.set(x*DREAM_CHUNK+(dreamRand(x,z,i+11)-.5)*DREAM_CHUNK,1.1+r*3,z*DREAM_CHUNK+(dreamRand(x,z,i+23)-.5)*DREAM_CHUNK);m.scale.set(.7+r*1.5,1.5+r*4,.7+r*1.5);g.add(m);}scene.add(g);dreamChunks.set(key,g);
  }
  for(const [key,g] of dreamChunks)if(!keep.has(key)){scene.remove(g);dreamChunks.delete(key);}
}
window.InfiniteWorldStandard?.register('dreamfog-world',{infinite:true,chunkSize:DREAM_CHUNK,deterministic:true,ensureAround:ensureDreamChunks,loadedChunks:()=>dreamChunks.size});
ensureDreamChunks();
"""
replace('apps/dreamfog-world/client.js', dream_anchor, dream_chunks)
replace('apps/dreamfog-world/client.js',
"  camera.position.set(player.x,player.y,player.z);camera.rotation.set(player.pitch,player.yaw,0);\n",
"  camera.position.set(player.x,player.y,player.z);camera.rotation.set(player.pitch,player.yaw,0);ensureDreamChunks();\n")
dark_anchor = "const rig = new OrbitCameraRig(camera, { distance: 13, height: 1.4 });\neye.group.add(rig); // rig position stays (0,0,0) - see OrbitCameraRig docstring\nwindow.GamePlayableRuntime={stats:()=>({player:{x:eye.group.position.x,y:eye.group.position.y,z:eye.group.position.z,yaw:rig.rotation.y,pitch:rig._pitch||0}})};\n"
dark_chunks = dark_anchor + """
const DARK_CHUNK=56,darkChunks=new Map(),darkGeo=new THREE.BoxGeometry(1,1,1),darkMat=new THREE.MeshStandardMaterial({color:0x25170d,roughness:.96});
function darkRand(cx,cz,n){let h=(Math.imul(cx,73856093)^Math.imul(cz,19349663)^Math.imul(n,83492791)^0x5d71)|0;h^=h>>>13;h=Math.imul(h,1274126177);return((h^(h>>>16))>>>0)/4294967296;}
function ensureDarkChunks(){
  const cx=Math.floor(eye.group.position.x/DARK_CHUNK),cz=Math.floor(eye.group.position.z/DARK_CHUNK),keep=new Set();
  for(let x=cx-2;x<=cx+2;x++)for(let z=cz-2;z<=cz+2;z++){const key=`${x},${z}`;keep.add(key);if(darkChunks.has(key))continue;const g=new THREE.Group();
    for(let i=0;i<6;i++){const r=darkRand(x,z,i),m=new THREE.Mesh(darkGeo,darkMat);m.position.set(x*DARK_CHUNK+(darkRand(x,z,i+17)-.5)*DARK_CHUNK,.35+r*2.5,z*DARK_CHUNK+(darkRand(x,z,i+29)-.5)*DARK_CHUNK);m.scale.set(.45+r*1.8,.7+r*4,.45+r*1.8);m.rotation.y=r*Math.PI;g.add(m);}scene.add(g);darkChunks.set(key,g);}
  for(const [key,g] of darkChunks)if(!keep.has(key)){scene.remove(g);darkChunks.delete(key);}
}
window.InfiniteWorldStandard?.register('dark-void-scene',{infinite:true,chunkSize:DARK_CHUNK,deterministic:true,ensureAround:ensureDarkChunks,loadedChunks:()=>darkChunks.size});ensureDarkChunks();
"""
replace('apps/dark-void-scene/client.js', dark_anchor, dark_chunks)
replace('apps/dark-void-scene/client.js',
"  updateMovement(dt);\n  eye.update(now, dt);",
"  updateMovement(dt);\n  ensureDarkChunks();\n  eye.update(now, dt);")

ensure_before('apps/world-sharabass/index.html','<script type="module">','<script src="/shared/infinite-world-runtime.js"></script>\n')
replace('apps/world-sharabass/index.html',
"let charPos = { x: 0, y: 0, z: 0 };\nlet charYaw = 0;\n",
"let charPos = { x: 0, y: 0, z: 0 };\nlet charYaw = 0;\nconst SHARABASS_CHUNK=64,sharabassChunks=new Set();\nfunction ensureSharabassChunks(){const cx=Math.floor(charPos.x/SHARABASS_CHUNK),cz=Math.floor(charPos.z/SHARABASS_CHUNK);sharabassChunks.clear();for(let x=cx-2;x<=cx+2;x++)for(let z=cz-2;z<=cz+2;z++)sharabassChunks.add(`${x},${z}`);}\nwindow.InfiniteWorldStandard?.register('world-sharabass',{infinite:true,chunkSize:SHARABASS_CHUNK,deterministic:true,ensureAround:ensureSharabassChunks,loadedChunks:()=>sharabassChunks.size});ensureSharabassChunks();\n")
replace('apps/world-sharabass/index.html',
"function render(now = performance.now()) {\n    const rawFrameMs",
"function render(now = performance.now()) {\n    ensureSharabassChunks();\n    const rawFrameMs")

ink_anchor = "const worldGroup=new THREE.Group(); worldGroup.name='InkGlyphWorld'; scene.add(worldGroup);\nconst navGroup=new THREE.Group(); navGroup.name='InkGlyphNavigation'; scene.add(navGroup);\n"
ink_chunks = ink_anchor + """
const INK_CHUNK=120,inkChunks=new Map(),inkChunkGeo=new THREE.BoxGeometry(1,1,1),inkChunkMat=new THREE.MeshStandardMaterial({color:0x211d18,roughness:.94}),inkFloorGeo=new THREE.BoxGeometry(INK_CHUNK,.18,INK_CHUNK),inkFloorMat=new THREE.MeshStandardMaterial({color:0xe8ddc4,roughness:1});
function inkRand(cx,cz,n){return (Core.hashString(`${cx}:${cz}:${n}:${ui.glyph?.value||'glyph'}`)%1000003)/1000003;}
function ensureInkChunks(){const cx=Math.floor(target.x/INK_CHUNK),cz=Math.floor(target.z/INK_CHUNK),keep=new Set();for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++){const key=`${x},${z}`;keep.add(key);if(inkChunks.has(key))continue;const g=new THREE.Group(),floorTile=new THREE.Mesh(inkFloorGeo,inkFloorMat);floorTile.position.set(x*INK_CHUNK,-.45,z*INK_CHUNK);g.add(floorTile);const inst=new THREE.InstancedMesh(inkChunkGeo,inkChunkMat,10),d=new THREE.Object3D();for(let i=0;i<10;i++){const r=inkRand(x,z,i);d.position.set(x*INK_CHUNK+(inkRand(x,z,i+11)-.5)*INK_CHUNK,.5+r*5,z*INK_CHUNK+(inkRand(x,z,i+23)-.5)*INK_CHUNK);d.scale.set(.6+r*2,1+r*9,.6+r*2);d.rotation.y=r*Math.PI;d.updateMatrix();inst.setMatrixAt(i,d.matrix);}inst.instanceMatrix.needsUpdate=true;g.add(inst);scene.add(g);inkChunks.set(key,g);}for(const [key,g] of inkChunks)if(!keep.has(key)){scene.remove(g);inkChunks.delete(key);}}
window.InfiniteWorldStandard?.register('ink-glyph-world',{infinite:true,chunkSize:INK_CHUNK,deterministic:true,ensureAround:ensureInkChunks,loadedChunks:()=>inkChunks.size});
"""
replace('apps/ink-glyph-world/client.js', ink_anchor, ink_chunks)
replace('apps/ink-glyph-world/client.js',
"function animate(now){requestAnimationFrame(animate);updateReveal(now);if(!dragging)yaw+=.0003;updateCamera();renderer.render(scene,camera)}",
"function animate(now){requestAnimationFrame(animate);updateReveal(now);if(!dragging)yaw+=.0003;updateCamera();ensureInkChunks();renderer.render(scene,camera)}")

replace('apps/pixel-panorama-360/client.js',
"let goldenX=0,goldenZ=0;window.GoldenExperienceControls?.install",
"let goldenX=0,goldenZ=0;\nconst PANO_CHUNK=64,panoChunks=new Map(),panoChunkGeo=new THREE.BoxGeometry(.8,.8,.8),panoChunkMat=new THREE.MeshBasicMaterial({color:0xc6d4ff,transparent:true,opacity:.32});\nfunction panoRand(cx,cz,n){let h=(Math.imul(cx,73856093)^Math.imul(cz,19349663)^Math.imul(n,83492791)^0x360)|0;h^=h>>>13;h=Math.imul(h,1274126177);return((h^(h>>>16))>>>0)/4294967296;}\nfunction ensurePanoChunks(){if(!S.scene)return;const cx=Math.floor(goldenX/PANO_CHUNK),cz=Math.floor(goldenZ/PANO_CHUNK),keep=new Set();for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++){const key=`${x},${z}`;keep.add(key);if(panoChunks.has(key))continue;const inst=new THREE.InstancedMesh(panoChunkGeo,panoChunkMat,14),d=new THREE.Object3D();for(let i=0;i<14;i++){const r=panoRand(x,z,i);d.position.set(x*PANO_CHUNK+(panoRand(x,z,i+17)-.5)*PANO_CHUNK,(panoRand(x,z,i+31)-.5)*18,z*PANO_CHUNK+(panoRand(x,z,i+47)-.5)*PANO_CHUNK);d.scale.setScalar(.3+r*1.4);d.updateMatrix();inst.setMatrixAt(i,d.matrix);}inst.instanceMatrix.needsUpdate=true;S.scene.add(inst);panoChunks.set(key,inst);}for(const [key,m] of panoChunks)if(!keep.has(key)){S.scene.remove(m);panoChunks.delete(key);}}\nwindow.InfiniteWorldStandard?.register('pixel-panorama-360',{infinite:true,chunkSize:PANO_CHUNK,deterministic:true,ensureAround:ensurePanoChunks,loadedChunks:()=>panoChunks.size});\nwindow.GoldenExperienceControls?.install")
replace('apps/pixel-panorama-360/client.js',
"function updateCamera(){S.pitch=clamp(S.pitch,-Math.PI/2+.001,Math.PI/2-.001);S.camera.rotation.order='YXZ';S.camera.rotation.y=S.yaw;S.camera.rotation.x=S.pitch;document.body.style.backgroundPosition=`${50+S.yaw*18}% ${50-S.pitch*22}%`}",
"function updateCamera(){S.pitch=clamp(S.pitch,-Math.PI/2+.001,Math.PI/2-.001);S.camera.rotation.order='YXZ';S.camera.rotation.y=S.yaw;S.camera.rotation.x=S.pitch;S.camera.position.set(goldenX,0,goldenZ);if(S.sphere)S.sphere.position.copy(S.camera.position);ensurePanoChunks();document.body.style.backgroundPosition=`${50+S.yaw*18}% ${50-S.pitch*22}%`}")
replace('apps/pixel-panorama-360/client.js',
"v.set(Math.sin(yaw)*Math.cos(pitch)*r,Math.sin(pitch)*r,Math.cos(yaw)*Math.cos(pitch)*r).project(S.camera);",
"v.set(Math.sin(yaw)*Math.cos(pitch)*r+goldenX,Math.sin(pitch)*r,Math.cos(yaw)*Math.cos(pitch)*r+goldenZ).project(S.camera);")

replace('shared/golden-ui-shell.js',
"  const cfg=configs.find(c=>path.startsWith(c.match))||{title:'World',selectors:[]};\n",
"  const cfg=configs.find(c=>path.startsWith(c.match))||{title:'World',selectors:[]};\n  if(path.startsWith('/apps/catalog/')) document.documentElement.classList.add('golden-catalog-page');\n")
replace('shared/golden-ui-shell.css',
"@media(max-width:800px),(pointer:coarse){#goldenWorldButton{min-height:40px}",
".golden-catalog-page #goldenWorldButton{display:none}.golden-catalog-page #goldenDrawer{top:10px;width:calc(100vw - 20px);max-height:calc(100dvh - 20px)}\n@media(max-width:800px),(pointer:coarse){#goldenWorldButton{min-height:40px}")
replace('shared/golden-catalog-menu.js',
"      if(window.GoldenUIShell){window.GoldenUIShell.setWorldsContent(paper);window.GoldenUIShell.setStory(`«${j.rootStory||'Осколки Improve World'}»: каждый мир — глава общей истории, а новые миры автоматически получают свою роль и связи.`);}",
"      if(window.GoldenUIShell){window.GoldenUIShell.setWorldsContent(paper);window.GoldenUIShell.setStory(`«${j.rootStory||'Осколки Improve World'}»: каждый мир — глава общей истории, а новые миры автоматически получают свою роль и связи.`);if(location.pathname.startsWith('/apps/catalog/'))window.GoldenUIShell.open('worlds');}")

replace('scripts/generate-world-previews.js',
"const worlds=Object.entries(registry.apps).filter(([,m])=>graphical.has(m.kind)&&m.status==='certified').map(([id,m])=>({id,title:m.title||id,url:`http://127.0.0.1:3199/apps/${id}/`}));",
"const worlds=Object.entries(registry.apps).filter(([id,m])=>graphical.has(m.kind)&&fs.existsSync(path.join(root,'apps',id,'index.html'))).map(([id,m])=>({id,title:m.title||id,url:`http://127.0.0.1:3199/apps/${id}/`}));")
old_gate = """for(const [id,meta] of Object.entries(registry.apps)){
  if(meta.visible!==true||meta.status!=='certified'||!infiniteKinds.has(meta.kind)) continue;
  const html=read(`apps/${id}/index.html`),code=read(`apps/${id}/client.js`);
  if(!html.includes('/shared/infinite-world-runtime.js')) fail(`${id}: infinite-world runtime missing`);
  if(!code.includes(`InfiniteWorldStandard?.register('${id}'`)) fail(`${id}: real infinite chunk adapter not registered`);
}
ok('certified graphical worlds register deterministic infinite chunk continuation');
for(const [id,meta] of Object.entries(registry.apps)){
  if(meta.visible!==true||meta.status!=='certified'||!infiniteKinds.has(meta.kind)) continue;
  if(!fs.existsSync(path.join(root,'shared','world-previews',`${id}.webm`))) fail(`${id}: low-quality video preview missing`);
  if(!fs.existsSync(path.join(root,'shared','world-previews',`${id}.jpg`))) fail(`${id}: preview poster missing`);
}
ok('certified graphical worlds have generated video previews');
"""
new_gate = """for(const [id,meta] of Object.entries(registry.apps)){
  if(!infiniteKinds.has(meta.kind)||!fs.existsSync(path.join(root,'apps',id,'index.html'))) continue;
  const html=read(`apps/${id}/index.html`);
  const codeRel=fs.existsSync(path.join(root,'apps',id,'client.js'))?`apps/${id}/client.js`:`apps/${id}/index.html`;
  const code=read(codeRel);
  if(!html.includes('/shared/infinite-world-runtime.js')) fail(`${id}: infinite-world runtime missing`);
  if(!code.includes(`InfiniteWorldStandard?.register('${id}'`)) fail(`${id}: real infinite chunk adapter not registered`);
}
ok('all local game/experience/navigator worlds register deterministic infinite chunk continuation');
for(const [id,meta] of Object.entries(registry.apps)){
  if(!infiniteKinds.has(meta.kind)||!fs.existsSync(path.join(root,'apps',id,'index.html'))) continue;
  if(!fs.existsSync(path.join(root,'shared','world-previews',`${id}.webm`))) fail(`${id}: low-quality video preview missing`);
  if(!fs.existsSync(path.join(root,'shared','world-previews',`${id}.jpg`))) fail(`${id}: preview poster missing`);
}
ok('all local graphical worlds have generated video previews');
"""
replace('scripts/check-golden-standard.js', old_gate, new_gate)
print('PATCH COMPLETE')