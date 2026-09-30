const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const sourcePath = path.join(ROOT, "apps", "kaykit-knight-standalone", "index.html");
const manifestPath = path.join(ROOT, "assets", "characters", "kaykit-knight", "manifest.json");
const outDir = path.join(ROOT, "apps", "blocky-avatar-139");
const outPath = path.join(outDir, "index.html");

const source = fs.readFileSync(sourcePath, "utf8");
const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (scripts.length < 2) throw new Error("Expected embedded Three.js and GLTFLoader runtimes");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const modelPath = path.join(ROOT, "assets", "characters", "kaykit-knight", manifest.model);
const modelB64 = fs.readFileSync(modelPath).toString("base64");
const packs = manifest.animationGroups.map((relativePath) => ({
  label: path.basename(relativePath, ".glb").replace(/^Rig_Medium_/, ""),
  data: fs.readFileSync(path.join(ROOT, "assets", "characters", "kaykit-knight", relativePath)).toString("base64"),
}));

const runtimeThree = scripts[0];
const runtimeLoader = scripts[1];
const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="theme-color" content="#9fc8e8">
<title>World Server Blocky — 139 animations</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#9fc8e8;color:#fff;font-family:Inter,system-ui,-apple-system,sans-serif}
body{height:100dvh;overscroll-behavior:none}
#stage{position:fixed;inset:0;background:linear-gradient(#9fc8e8 0%,#d9ebf5 64%,#8bb56c 64%,#6d9254 100%)}
canvas{display:block;width:100%;height:100%;touch-action:none}
#top{position:fixed;top:max(10px,env(safe-area-inset-top));left:12px;right:12px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;pointer-events:none}
.badge{pointer-events:auto;background:#101720c7;border:1px solid #ffffff35;backdrop-filter:blur(12px);padding:8px 10px;border-radius:12px;font-size:12px;line-height:1.2;box-shadow:0 8px 24px #0003}
#title{font-weight:900;letter-spacing:.04em}#count{font-variant-numeric:tabular-nums}
#controls{position:fixed;left:10px;right:10px;bottom:max(10px,env(safe-area-inset-bottom));display:grid;grid-template-columns:46px minmax(0,1fr) 46px 58px;gap:7px;z-index:4}
button,select{height:46px;border:1px solid #ffffff38;border-radius:13px;background:#101720dc;color:#fff;font:700 14px system-ui;backdrop-filter:blur(14px);box-shadow:0 6px 18px #0003}
select{min-width:0;padding:0 10px}
button:active{transform:scale(.96)}
#hint{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(max(10px,env(safe-area-inset-bottom)) + 56px);padding:5px 9px;border-radius:10px;background:#10172094;font-size:11px;white-space:nowrap;opacity:.82;pointer-events:none}
#error{position:fixed;inset:0;display:none;place-items:center;padding:24px;background:#101720;color:#fff;text-align:center;z-index:10}
</style>
</head>
<body>
<div id="stage"></div>
<div id="top">
  <div class="badge"><div id="title">WORLD SERVER BLOCKY</div><div id="name">Загрузка анимаций…</div></div>
  <div class="badge" id="count">0 / 139</div>
</div>
<div id="controls">
  <button id="prev" aria-label="Предыдущая анимация">◀</button>
  <select id="select" aria-label="Анимация"></select>
  <button id="next" aria-label="Следующая анимация">▶</button>
  <button id="play">ПАУЗА</button>
</div>
<div id="hint">Проведи пальцем по персонажу — поворот</div>
<div id="error"></div>
<script>${runtimeThree}</script>
<script>${runtimeLoader}</script>
<script>
const MODEL_B64=${JSON.stringify(modelB64)};
const ANIM_PACKS=${JSON.stringify(packs)};
const EXPECTED_CLIPS=${manifest.compatibleAnimationClipCount};
const $=(id)=>document.getElementById(id);
const stage=$("stage"), select=$("select"), nameEl=$("name"), countEl=$("count");
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(31,innerWidth/innerHeight,.01,100);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xd7eeff,0x56733f,1.7));
const sun=new THREE.DirectionalLight(0xfff1d2,2.4);sun.position.set(4,7,5);sun.castShadow=true;scene.add(sun);
const fill=new THREE.DirectionalLight(0x78a9dd,.8);fill.position.set(-4,3,-4);scene.add(fill);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:0x789c5b,roughness:1}));
floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const anchor=new THREE.Group();scene.add(anchor);
const blockRoot=new THREE.Group();anchor.add(blockRoot);
let model,mixer,clips=[],actions=[],active=0,playing=true,yaw=.22,pitch=0,zoom=1;
const bones={};
const vA=new THREE.Vector3(),vB=new THREE.Vector3(),vC=new THREE.Vector3(),vD=new THREE.Vector3();
const qA=new THREE.Quaternion(),qB=new THREE.Quaternion(),qC=new THREE.Quaternion();
const UP=new THREE.Vector3(0,1,0);
function b64buf(s){const bin=atob(s),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a.buffer}
function parseB64(s){return new Promise((resolve,reject)=>new THREE.GLTFLoader().parse(b64buf(s),"",resolve,reject))}
function mat(color){return new THREE.MeshStandardMaterial({color,roughness:.86,metalness:0})}
const skin=mat(0xc78f68),hair=mat(0x4b3329),shirt=mat(0x2e8897),shirtDark=mat(0x246c78),pants=mat(0x334c75),shoe=mat(0x2b2d31);
function faceTexture(){
  const c=document.createElement("canvas");c.width=c.height=16;const x=c.getContext("2d");x.imageSmoothingEnabled=false;
  x.fillStyle="#c78f68";x.fillRect(0,0,16,16);
  x.fillStyle="#4b3329";x.fillRect(0,0,16,4);x.fillRect(0,4,2,3);x.fillRect(14,4,2,3);
  x.fillStyle="#ffffff";x.fillRect(3,6,3,2);x.fillRect(10,6,3,2);
  x.fillStyle="#243b55";x.fillRect(4,6,1,2);x.fillRect(11,6,1,2);
  x.fillStyle="#6f3f32";x.fillRect(6,11,4,1);
  const t=new THREE.CanvasTexture(c);t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;t.encoding=THREE.sRGBEncoding;return t;
}
const faceMat=new THREE.MeshStandardMaterial({map:faceTexture(),roughness:.9});
const headMats=[skin,skin,hair,skin,faceMat,faceMat];
function cube(material){const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);m.castShadow=true;m.receiveShadow=true;blockRoot.add(m);return m}
const parts={
  torso:cube([shirtDark,shirtDark,shirt,shirtDark,shirt,shirtDark]),
  pelvis:cube(pants),
  upperArmL:cube(shirt),lowerArmL:cube(skin),handL:cube(skin),
  upperArmR:cube(shirt),lowerArmR:cube(skin),handR:cube(skin),
  upperLegL:cube(pants),lowerLegL:cube(pants),footL:cube(shoe),
  upperLegR:cube(pants),lowerLegR:cube(pants),footR:cube(shoe),
  head:cube(headMats)
};
function findBones(){const byNorm=new Map();model.traverse(o=>{if(o.name)byNorm.set(o.name.toLowerCase().replace(/[^a-z0-9]/g,""),o)});const norm=n=>n.toLowerCase().replace(/[^a-z0-9]/g,"");["hips","spine","chest","head","upperarm.l","lowerarm.l","hand.l","upperarm.r","lowerarm.r","hand.r","upperleg.l","lowerleg.l","foot.l","toes.l","upperleg.r","lowerleg.r","foot.r","toes.r"].forEach(n=>bones[n]=model.getObjectByName(n)||byNorm.get(norm(n)));for(const n of Object.keys(bones))if(!bones[n])throw new Error("Missing bone "+n+"; available="+[...byNorm.keys()].slice(0,40).join(","))}
function localBonePos(b,out){b.getWorldPosition(out);return blockRoot.worldToLocal(out)}
function segment(mesh,a,b,w,d,extra=1.04){
  localBonePos(a,vA);localBonePos(b,vB);vC.subVectors(vB,vA);const len=Math.max(.02,vC.length());
  mesh.position.copy(vA).add(vB).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(UP,vC.normalize());mesh.scale.set(w,len*extra,d)
}
function follow(mesh,bone,sx,sy,sz,offsetY=0){
  bone.getWorldPosition(vA);bone.getWorldQuaternion(qA);vB.set(0,offsetY,0).applyQuaternion(qA);vA.add(vB);blockRoot.worldToLocal(vA);mesh.position.copy(vA);
  blockRoot.getWorldQuaternion(qB);qB.invert();mesh.quaternion.copy(qB.multiply(qA));mesh.scale.set(sx,sy,sz)
}
function updateBlockAvatar(){
  if(!model)return;model.updateMatrixWorld(true);blockRoot.updateMatrixWorld(true);
  segment(parts.torso,bones.hips,bones.chest,.58,.30,1.08);follow(parts.pelvis,bones.hips,.50,.22,.30,.04);
  segment(parts.upperArmL,bones["upperarm.l"],bones["lowerarm.l"],.19,.19);segment(parts.lowerArmL,bones["lowerarm.l"],bones["hand.l"],.18,.18);follow(parts.handL,bones["hand.l"],.18,.18,.18,.035);
  segment(parts.upperArmR,bones["upperarm.r"],bones["lowerarm.r"],.19,.19);segment(parts.lowerArmR,bones["lowerarm.r"],bones["hand.r"],.18,.18);follow(parts.handR,bones["hand.r"],.18,.18,.18,.035);
  segment(parts.upperLegL,bones["upperleg.l"],bones["lowerleg.l"],.22,.23);segment(parts.lowerLegL,bones["lowerleg.l"],bones["foot.l"],.21,.22);segment(parts.footL,bones["foot.l"],bones["toes.l"],.22,.28,1.12);
  segment(parts.upperLegR,bones["upperleg.r"],bones["lowerleg.r"],.22,.23);segment(parts.lowerLegR,bones["lowerleg.r"],bones["foot.r"],.21,.22);segment(parts.footR,bones["foot.r"],bones["toes.r"],.22,.28,1.12);
  follow(parts.head,bones.head,.52,.52,.52,.19)
}
function boxRatio(){
  const b=new THREE.Box3().setFromObject(blockRoot);const corners=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])corners.push(new THREE.Vector3(x,y,z).applyMatrix4(blockRoot.matrixWorld).project(camera));
  const ys=corners.map(p=>(1-p.y)*.5*innerHeight);return (Math.max(...ys)-Math.min(...ys))/innerHeight
}
function fit(target=.89){
  updateBlockAvatar();const b=new THREE.Box3().setFromObject(blockRoot),s=b.getSize(vA),c=b.getCenter(vB),h=Math.max(.5,s.y);
  const dist=(h*.5)/Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))/target;
  camera.position.set(c.x+h*.42,c.y+h*.03,c.z+dist);camera.lookAt(c.x,c.y+h*.01,c.z);camera.updateMatrixWorld(true);renderer.render(scene,camera)
}
function choose(i,fade=.14){
  if(!clips.length)return;i=(i+clips.length)%clips.length;const old=actions[active],a=actions[i];if(old&&old!==a)old.fadeOut(fade);
  a.reset().setEffectiveWeight(1).fadeIn(fade).play();active=i;select.selectedIndex=i;nameEl.textContent=clips[i].name;countEl.textContent=(i+1)+" / "+clips.length
}
async function boot(){
  try{
    const base=await parseB64(MODEL_B64);model=base.scene;anchor.add(model);model.traverse(o=>{if(o.isMesh)o.visible=false});findBones();mixer=new THREE.AnimationMixer(model);
    const used=new Map();
    for(const pack of ANIM_PACKS){const g=await parseB64(pack.data);for(const original of g.animations){const c=original.clone();const baseName=c.name||"Animation";const n=used.get(baseName)||0;used.set(baseName,n+1);c.name=n?pack.label+" · "+baseName:baseName;clips.push(c)}}
    if(clips.length!==EXPECTED_CLIPS)throw new Error("Expected "+EXPECTED_CLIPS+" clips, got "+clips.length);
    actions=clips.map(c=>mixer.clipAction(c,model));clips.forEach((c,i)=>{const o=document.createElement("option");o.textContent=(i+1)+". "+c.name;select.appendChild(o)});
    updateBlockAvatar();fit(.89);const idle=Math.max(0,clips.findIndex(c=>/idle/i.test(c.name)));choose(idle,0);
    requestAnimationFrame(()=>{updateBlockAvatar();renderer.render(scene,camera);window.__BLOCKY_TEST__={ready:true,clips:clips.length,screenHeightRatio:boxRatio(),source:"KayKit Rig_Medium CC0",visual:"original blocky World Server skin"}});
  }catch(err){console.error(err);$("error").style.display="grid";$("error").textContent="Ошибка загрузки автономного персонажа: "+err.message;window.__BLOCKY_TEST__={ready:false,error:String(err)}}
}
select.onchange=()=>choose(select.selectedIndex);$("prev").onclick=()=>choose(active-1);$("next").onclick=()=>choose(active+1);$("play").onclick=()=>{playing=!playing;mixer.timeScale=playing?1:0;$("play").textContent=playing?"ПАУЗА":"ИГРАТЬ"};
let dragging=false,lastX=0,lastY=0;
renderer.domElement.addEventListener("pointerdown",e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)});
renderer.domElement.addEventListener("pointermove",e=>{if(!dragging)return;yaw+=(e.clientX-lastX)*.008;pitch=Math.max(-.2,Math.min(.22,pitch+(e.clientY-lastY)*.003));lastX=e.clientX;lastY=e.clientY});
renderer.domElement.addEventListener("pointerup",()=>dragging=false);
renderer.domElement.addEventListener("pointercancel",()=>dragging=false);
const clock=new THREE.Clock();
function loop(){requestAnimationFrame(loop);const dt=Math.min(.05,clock.getDelta());if(mixer&&playing)mixer.update(dt);if(model){anchor.rotation.y=yaw;anchor.rotation.x=pitch;anchor.scale.setScalar(zoom);updateBlockAvatar()}renderer.render(scene,camera)}
requestAnimationFrame(loop);
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);if(model)fit(.89)});
boot();
</script>
</body>
</html>`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, html);
console.log(JSON.stringify({ outPath, bytes: Buffer.byteLength(html), expectedClips: manifest.compatibleAnimationClipCount, packs: packs.length }));
