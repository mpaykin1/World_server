import * as THREE from 'three';
import {createLivingWatercolor3D,createWatercolorStyle} from '../../shared/graphics/living-watercolor-3d.js';
import {
  createIllustrationCamera,createWatercolorHouse,createWatercolorTree,
  createWatercolorVolcano,createWatercolorPlant
} from '../../shared/graphics/living-watercolor-generators.js';
import {WATERCOLOUR_REFERENCE_PROFILES,measureWatercolorImageData,scoreWatercolorMetrics} from '../../shared/graphics/living-watercolor-reference-gate.js';
import {createIllustrationOfficeWorker,createIllustrationCharacterAnimator} from '../../shared/graphics/illustration-character-rig.js';
import {createKayKitIllustrationWorker} from '../../shared/graphics/illustration-character-kaykit.js';

const referenceMatchProfiles={
  house:{...WATERCOLOUR_REFERENCE_PROFILES.house,matchMeanBias:6,matchStdBias:5,matchEdgeBias:.050},
  tree:{...WATERCOLOUR_REFERENCE_PROFILES.tree,matchMeanBias:4,matchStdBias:5,matchEdgeBias:.008},
  volcano:{...WATERCOLOUR_REFERENCE_PROFILES.volcano,matchMeanBias:4,matchStdBias:12,matchEdgeBias:-.040},
  plant:{...WATERCOLOUR_REFERENCE_PROFILES.plant,matchMeanBias:11,matchStdBias:9,matchEdgeBias:.040}
};

const scene=new THREE.Scene();
const camera=createIllustrationCamera(THREE,{width:innerWidth,height:innerHeight,viewHeight:7.5,position:[6.4,4.8,9.6],lookAt:[0,1.4,0]});
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(renderer.domElement);

const quality=window.GoldenQualityDirector?.create?.({renderer,targetFps:50});
const style=createWatercolorStyle({
  seed:'living-watercolor-v2',inkColor:'#2e425d',paperColor:'#f6f1e7',washColor:'#78899d',
  washOpacity:.68,washLayers:9,edgeWidth:.048,edgeJitter:.37,granulation:.55,bleed:.29,
  shadowWash:.12,motion:.13,pigmentPooling:.34,paperGap:.18,paintedLight:.72
});
const watercolor=createLivingWatercolor3D({THREE,renderer,scene,camera,style});watercolor.attachCompositor({replaceSource:true,getReferenceProfile:()=>{
  const base=referenceMatchProfiles[active];if(!base)return null;
  const mobile=innerWidth/Math.max(1,innerHeight)<.62;
  if(mobile&&active==='volcano')return{...base,matchEdgeBias:-.085,matchBlur:2.0};
  if(mobile&&active==='plant')return{...base,matchEdgeBias:.070};
  return base;
}});

scene.add(new THREE.HemisphereLight(0xffffff,0xa8b0ba,2.9));
const key=new THREE.DirectionalLight(0xffffff,.72);key.position.set(4,8,5);scene.add(key);
const stage=new THREE.Group();scene.add(stage);

const names=['house','tree','volcano','plant'];
const selectableNames=[...names,'worker'];
const makers={house:createWatercolorHouse,tree:createWatercolorTree,volcano:createWatercolorVolcano,plant:createWatercolorPlant};
const labels={all:'Living Watercolor 3D · v2',house:'Домик · watercolor v2',tree:'Дерево · watercolor v2',volcano:'Вулкан · watercolor v2',plant:'Электростанция · watercolor v2',worker:'Работник · animated watercolor'};
const items={};
for(const name of names){
  const o=makers[name](THREE,{seed:'reference:'+name,ink:style.inkColor,wash:name==='tree'?'#93a1b0':'#aeb7c0'});
  o.visible=false;stage.add(o);watercolor.apply(o,{seed:'reference:'+name});
  watercolor.addGroundWash(o,{x:0,z:0,width:name==='plant'?3.5:name==='volcano'?3.2:2.8,depth:name==='tree'?1.6:1.9,opacity:name==='volcano'?.065:name==='plant'?.075:style.shadowWash,seed:name+':shadow'});
  items[name]=o;
}
const smokeVol=watercolor.createBrushEmitter({parent:items.volcano,origin:new THREE.Vector3(0,2.28,0),count:18,scale:.58,rise:.62,spread:.56,wind:.045,seed:'volcano-smoke-v3',opacity:.14});
const smokePlant=watercolor.createBrushEmitter({parent:items.plant,origin:new THREE.Vector3(-.64,3.58,0),count:9,scale:.34,rise:.40,spread:.30,wind:.08,seed:'plant-smoke-v2',opacity:.09});

// Accepted simple worker stays as an instant fallback while the full KayKit motion library loads.
const worker=createIllustrationOfficeWorker(THREE,{seed:'reference:worker',ink:style.inkColor,wash:'#aeb7c0'});
worker.visible=false;stage.add(worker);watercolor.apply(worker,{seed:'reference:worker'});
watercolor.addGroundWash(worker,{x:0,z:0,width:1.7,depth:.82,opacity:.08,seed:'worker:shadow'});
items.worker=worker;
const workerAnimator=createIllustrationCharacterAnimator(worker);

let workerDriver=null,workerLoadPromise=null,lastFrameTime=performance.now();
const workerControls=document.getElementById('workerControls');
const workerClipSelect=document.getElementById('workerClip');
const workerNextButton=document.getElementById('workerNext');
const workerButton=document.querySelector('[data-object="worker"]');

function populateWorkerClips(driver){
  if(!workerClipSelect)return;
  workerClipSelect.innerHTML='';
  for(const name of driver.listClips()){
    const option=document.createElement('option');
    option.value=name;option.textContent=name;workerClipSelect.appendChild(option);
  }
  if(driver.activeClip)workerClipSelect.value=driver.activeClip;
  if(workerButton)workerButton.textContent='Работник · '+driver.clipCount;
  const hint=document.getElementById('hint');
  if(hint)hint.textContent=`Работник: ${driver.clipCount} уникальных движений / ${driver.sourceClipCount} KayKit clips`;
}

function nextWorkerClip(){
  if(!workerDriver)return workerAnimator.next();
  const clips=workerDriver.listClips();
  if(!clips.length)return null;
  const current=Math.max(-1,clips.indexOf(workerDriver.activeClip));
  const next=clips[(current+1)%clips.length];
  workerDriver.playClip(next,{fade:.12});
  if(workerClipSelect)workerClipSelect.value=next;
  return next;
}

async function ensureKayKitWorker(){
  if(workerDriver)return workerDriver;
  if(workerLoadPromise)return workerLoadPromise;
  if(active==='worker')document.getElementById('label').textContent='Работник · загружаю KayKit animations…';
  workerLoadPromise=createKayKitIllustrationWorker(THREE,{
    parent:stage,
    baseUrl:'/assets/characters/kaykit-knight',
    ink:style.inkColor,
    wash:'#aeb7c0',
    scale:3.0,
    initialSemantic:'idle'
  }).then(driver=>{
    workerDriver=driver;
    driver.root.visible=active==='worker';
    worker.visible=false;
    items.worker=driver.root;
    watercolor.apply(driver.root,{seed:'reference:worker:kaykit'});
    watercolor.addGroundWash(driver.root,{x:0,z:0,width:1.7,depth:.82,opacity:.08,seed:'worker:kaykit:shadow'});
    populateWorkerClips(driver);
    if(active==='worker'){setLayout('worker');document.getElementById('label').textContent='Работник · '+(driver.activeClip||'KayKit');}
    return driver;
  }).catch(error=>{
    console.error('KayKit illustration worker failed to load',error);
    if(active==='worker')document.getElementById('label').textContent='Работник · fallback';
    workerLoadPromise=null;
    return null;
  });
  return workerLoadPromise;
}

workerClipSelect?.addEventListener('change',()=>{
  if(workerDriver)workerDriver.playClip(workerClipSelect.value,{fade:.12});
});
workerNextButton?.addEventListener('click',()=>nextWorkerClip());

let active=(new URLSearchParams(location.search).get('object')||'house');
if(!selectableNames.includes(active)&&active!=='all')active='house';
let targetX=0,targetY=0,currentX=0,currentY=0,lastGate=null,gateDue=0;

function fitCamera(){
  const aspect=innerWidth/Math.max(1,innerHeight);
  camera.userData.viewHeight=aspect<.62?9.15:7.15;
  camera.updateForViewport(innerWidth,innerHeight);
}
function setLayout(mode){
  if(mode==='all'){
    const layout={house:[-2.15,1.35,.58],tree:[1.85,1.25,.54],volcano:[-2.05,-2.10,.54],plant:[2.05,-2.15,.50]};
    for(const n of names){const [x,z,s]=layout[n];const o=items[n];o.visible=true;o.position.set(x,0,z);o.scale.setScalar(s);o.rotation.set(0,0,0);}
    items.worker.visible=false;
  }else{
    for(const n of selectableNames){const o=items[n];o.visible=n===mode;o.position.set(0,0,0);o.scale.setScalar(1);o.rotation.set(0,0,0);}
    if(mode==='worker'&&workerDriver)items.worker.scale.setScalar(workerDriver.root.userData.baseScale||3);
    const mobile=innerWidth/Math.max(1,innerHeight)<.62;
    const posDesktop={house:[.00,-.30,0],tree:[.36,-1.05,0],volcano:[.04,-.22,0],plant:[-.55,-1.00,0],worker:[.30,-.10,0]};
    const posMobile={house:[.00,-.30,0],tree:[.36,-1.05,0],volcano:[.02,-.30,0],plant:[-.46,-1.20,0],worker:[.48,-.22,0]};
    items[mode].position.set(...((mobile?posMobile:posDesktop)[mode]||[0,0,0]));
  }
  const mobile=innerWidth/Math.max(1,innerHeight)<.62;
  const zoomDesktop={all:.82,house:1.38,tree:1.11,volcano:1.18,plant:1.55,worker:1.08};
  const zoomMobile={all:.78,house:1.44,tree:1.11,volcano:1.17,plant:2.13,worker:1.12};
  camera.zoom=(mobile?zoomMobile:zoomDesktop)[mode]??1;
  camera.updateProjectionMatrix();
}
function show(mode){
  active=mode;setLayout(mode);
  const mobile=innerWidth/Math.max(1,innerHeight)<.62;
  for(const n of selectableNames)items[n].traverse?.(obj=>{if(obj.userData?.watercolorSemantic&&obj.material){if(obj.userData.__baseSemanticOpacity==null)obj.userData.__baseSemanticOpacity=obj.material.opacity;obj.material.opacity=obj.userData.__baseSemanticOpacity;}});
  if(mobile&&mode==='volcano')items.volcano.traverse?.(obj=>{if(obj.userData?.watercolorSemantic&&obj.material)obj.material.opacity=.18;});
  document.querySelectorAll('#chooser button').forEach(b=>b.classList.toggle('active',b.dataset.object===mode));
  document.getElementById('label').textContent=labels[mode]||labels.house;
  if(workerControls)workerControls.hidden=mode!=='worker';
  if(mode==='worker')ensureKayKitWorker();
  history.replaceState(null,'','?object='+mode);gateDue=performance.now()+850;lastGate=null;
}
document.querySelectorAll('#chooser button').forEach(button=>button.addEventListener('click',()=>{
  const mode=button.dataset.object||'house';
  if(mode==='worker'&&active==='worker')nextWorkerClip();
  else show(mode);
}));
show(active);fitCamera();

addEventListener('pointermove',e=>{
  if(e.target.closest?.('#chooser'))return;
  targetX=(e.clientX/innerWidth-.5)*.32;targetY=(e.clientY/innerHeight-.5)*.08;
},{passive:true});
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);fitCamera();gateDue=performance.now()+850;});

function scoreActive(){
  if(active==='all'||!names.includes(active))return null;
  try{const imageData=watercolor.captureImageData();if(!imageData)return null;const metrics=measureWatercolorImageData(imageData);return{metrics,gate:scoreWatercolorMetrics(metrics,active)};}catch{return null;}
}
function animate(t){
  currentX+=(targetX-currentX)*.032;currentY+=(targetY-currentY)*.032;
  stage.rotation.y=currentX;stage.rotation.x=currentY;
  items.tree.rotation.z=Math.sin(t*.00045)*.010;
  const dt=Math.min(.05,Math.max(0,(t-lastFrameTime)/1000));lastFrameTime=t;
  if(workerDriver)workerDriver.update(dt);else workerAnimator.tick(t);
  if(active==='worker')document.getElementById('label').textContent='Работник · '+(workerDriver?.activeClip||workerAnimator.action);
  watercolor.tick(t);renderer.render(scene,camera);watercolor.present(t);
  if(gateDue&&t>=gateDue){gateDue=0;lastGate=scoreActive();}
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

window.__LIVING_WATERCOLOR_3D_READY__={
  ready:true,version:'2.0.0',
  features:[
    'watercolor-wash-shader','irregular-ink-shell','artistic-lod',
    'orthographic-illustration-camera','organic-geometry','reference-shaped-generators',
    'semantic-ink-strokes','pigment-pooling','paper-gaps','procedural-paper','soft-wash-shadow',
    'coherent-brush-smoke','reference-fidelity-gate','golden-quality-hook','paper-space-compositor',
    'illustration-character-rig','animated-painted-masses','character-action-controller',
    'kaykit-rig-medium-driver','139-source-kaykit-clips','132-unique-kaykit-motions','clip-selector'
  ],
  show,
  setWorkerAction:(action)=>workerDriver?workerDriver.playSemantic(action):workerAnimator.setAction(action),
  playWorkerClip:(name)=>workerDriver?.playClip(name),
  nextWorkerAction:()=>nextWorkerClip(),
  workerClips:()=>workerDriver?.listClips()||[],
  workerSemantics:()=>workerDriver?.listSemantics()||[],
  scoreReference:()=>{lastGate=scoreActive();return lastGate;},
  stats:()=>({runtime:watercolor.diagnostics(),quality:quality?.telemetry?.()||null,objects:5,active,workerAction:workerDriver?.activeClip||workerAnimator.action,workerClipCount:workerDriver?.clipCount||0,workerSourceClipCount:workerDriver?.sourceClipCount||0,referenceGate:lastGate,smoke:[smokeVol.particles.length,smokePlant.particles.length]})
};
