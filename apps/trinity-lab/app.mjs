import {THREE,createKriegerRuntime,createInkRuntime,disposeRuntime,runtimeMetrics} from './scene-builders.mjs';
import {createCubeRuntime,cubeSnapshot,cubeDeterministicSignature} from './cube-evolution.mjs';
import {governorInput,userVisibility,userVisibilityDetails,viewportEvidence} from './quality-adapter.mjs';
import {analyzeGraphicsQuality} from '../../shared/graphics/graphics-quality-governor.mjs';
import {TrinitySceneRecipe,semanticIds,semanticSignature,adaptTrinityScene} from '../../shared/trinity-scene-recipe.mjs';

const worldCanvas=document.getElementById('worldCanvas'),inkCanvas=document.getElementById('inkCanvas');
const root=document.getElementById('gameRoot'),debug=document.getElementById('debug'),debugText=document.getElementById('debugText');
const debugBtn=document.getElementById('debugBtn'),modeBadge=document.getElementById('modeBadge'),buttons=[...document.querySelectorAll('[data-mode]')];
const recipe=TrinitySceneRecipe,targetIds=semanticIds(recipe),signature=semanticSignature(recipe);
const viewportLock=window.WorldServerFixedViewport.install();
const pose={position:new THREE.Vector3(0,1.82,-8.4),yaw:Math.PI,pitch:.015};
const input={keys:new Set(),touchX:0,touchY:0,pointer:null,lastX:0,lastY:0,startX:0,startY:0,zone:null};
const evidence={ink:false,growth:false,cameraMoved:false,frames:0};
const state={mode:'KRIEGER',runtime:null,lastTime:performance.now(),frameTimes:[],lastDebug:0};

function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function applyPose(camera){
  camera.position.copy(pose.position);camera.rotation.order='YXZ';camera.rotation.y=pose.yaw;camera.rotation.x=pose.pitch;
}
function updateMovement(dt){
  let forward=(input.keys.has('KeyW')?1:0)-(input.keys.has('KeyS')?1:0)+input.touchY;
  let side=(input.keys.has('KeyD')?1:0)-(input.keys.has('KeyA')?1:0)+input.touchX;
  const len=Math.hypot(forward,side);if(len>1){forward/=len;side/=len}
  if(!len)return;
  const speed=(input.keys.has('ShiftLeft')?7.5:4.2)*dt;
  const fx=-Math.sin(pose.yaw),fz=-Math.cos(pose.yaw),rx=Math.cos(pose.yaw),rz=-Math.sin(pose.yaw);
  pose.position.x+=(fx*forward+rx*side)*speed;pose.position.z+=(fz*forward+rz*side)*speed;
  pose.position.x=clamp(pose.position.x,-18,18);pose.position.z=clamp(pose.position.z,-20,22);evidence.cameraMoved=true;
}
function onPointerDown(event){
  input.pointer=event.pointerId;input.lastX=input.startX=event.clientX;input.lastY=input.startY=event.clientY;
  input.zone=event.clientX<innerWidth*.46?'move':'look';root.setPointerCapture?.(event.pointerId);event.preventDefault();
}
function onPointerMove(event){
  if(input.pointer!==event.pointerId)return;const dx=event.clientX-input.lastX,dy=event.clientY-input.lastY;input.lastX=event.clientX;input.lastY=event.clientY;
  if(input.zone==='look'){pose.yaw-=dx*.006;pose.pitch=clamp(pose.pitch-dy*.0045,-.68,.38);evidence.cameraMoved=true}
  else{input.touchX=clamp((event.clientX-input.startX)/62,-1,1);input.touchY=clamp((input.startY-event.clientY)/62,-1,1)}
  event.preventDefault();
}
function onPointerUp(event){
  if(input.pointer!==event.pointerId)return;input.pointer=null;input.touchX=0;input.touchY=0;input.zone=null;event.preventDefault();
}
root.addEventListener('pointerdown',onPointerDown,{passive:false});root.addEventListener('pointermove',onPointerMove,{passive:false});
root.addEventListener('pointerup',onPointerUp,{passive:false});root.addEventListener('pointercancel',onPointerUp,{passive:false});
addEventListener('keydown',event=>input.keys.add(event.code));addEventListener('keyup',event=>input.keys.delete(event.code));
addEventListener('resize',()=>{viewportLock.sync();state.runtime?.resize?.()},{passive:true});

function setCanvasMode(mode){
  worldCanvas.style.display=mode==='INK'?'none':'block';inkCanvas.style.display=mode==='INK'?'block':'none';
}
function createModeRuntime(mode){
  if(mode==='INK')return createInkRuntime(inkCanvas,recipe);
  if(mode==='CUBE')return createCubeRuntime(worldCanvas,recipe);
  return createKriegerRuntime(worldCanvas,recipe);
}
function switchMode(mode){
  if(!['KRIEGER','INK','CUBE'].includes(mode))throw new Error('invalid mode');
  if(state.runtime){disposeRuntime(state.runtime);state.runtime=null}
  state.mode=mode;setCanvasMode(mode);state.runtime=createModeRuntime(mode);applyPose(state.runtime.camera);state.runtime.resize?.();
  buttons.forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));modeBadge.textContent='TRINITY / '+mode;
  if(mode==='CUBE')evidence.growth=false;updateDebug(true);
}
buttons.forEach(button=>button.addEventListener('click',()=>switchMode(button.dataset.mode)));
debugBtn.addEventListener('click',()=>debug.classList.toggle('open'));

function sameRecipeProof(){
  const a=adaptTrinityScene(recipe,'KRIEGER'),b=adaptTrinityScene(recipe,'INK'),c=adaptTrinityScene(recipe,'CUBE');
  return a.signature===b.signature&&b.signature===c.signature&&a.seed===b.seed&&b.seed===c.seed;
}
function frameStats(){
  const xs=state.frameTimes.slice().sort((a,b)=>a-b),avg=state.frameTimes.reduce((a,b)=>a+b,0)/Math.max(1,state.frameTimes.length);
  const p95=xs.length?xs[Math.min(xs.length-1,Math.floor(xs.length*.95))]:0;return {fps:avg?1000/avg:0,p95};
}
function idsEqual(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i])}
function inkGates(runtime){
  const ids=[...runtime.objects.keys()].sort(),m=runtime.ctx?.metrics||{};
  const semantic=(m.edgeSets||0)>0&&idsEqual(ids,targetIds);if(semantic&&evidence.frames>3)evidence.ink=true;
  return {SEMANTIC_INK_GATE:semantic?'PASS':'FAIL',WATERCOLOR_GATE:'PARTIAL',STYLE_PERSISTENCE_GATE:evidence.cameraMoved&&semantic?'PASS':'PARTIAL',DEPTH_READABILITY_GATE:(m.meshes||0)>5?'PASS':'FAIL'};
}
function cubeGates(runtime){
  const snap=cubeSnapshot(runtime),det=cubeDeterministicSignature(recipe)===cubeDeterministicSignature(recipe);
  const final=snap.progress>=.995?idsEqual(snap.semanticIds,targetIds):null;if(snap.progress>.25&&snap.physicalObjects>1)evidence.growth=true;
  return {REAL_GROWTH_GATE:snap.physicalObjects>1?'PASS':'PENDING',DETERMINISM_GATE:det?'PASS':'FAIL',
    INTERMEDIATE_STATE_GATE:snap.progress>.18&&snap.progress<.96&&snap.physicalObjects>1?'PASS':'PENDING',
    FINAL_SEMANTIC_EQUIVALENCE_GATE:final===null?'PENDING':final?'PASS':'FAIL'};
}
function capabilityState(runtime,metrics,viewport){
  return {
    GEOMETRY:metrics.triangles>0?'REAL':'MISSING',MATERIALS:metrics.materials>=2?'REAL':'PARTIAL',
    LIGHTING:metrics.lights>=2?'REAL':'PARTIAL',CHARACTER:runtime.objects.has('character.walker')?'PARTIAL':'MISSING',
    ANIMATION:runtime.objects.has('character.walker')?'PARTIAL':'MISSING',INK:evidence.ink?'REAL':'PARTIAL',
    GROWTH:evidence.growth?'PARTIAL':'MISSING',FX:runtime.objects.has('water.rill')&&runtime.objects.has('light.lamp')?'PARTIAL':'MISSING',
    VIEWPORT:viewport.consistent&&viewport.scrollX===0&&viewport.scrollY===0?'REAL':'PARTIAL',
    PERFORMANCE:state.frameTimes.length>=30?'REAL':'PARTIAL'
  };
}
function debugSnapshot(){
  const runtime=state.runtime,metrics=runtimeMetrics(runtime),viewport=viewportEvidence(runtime),perf=frameStats(),visibilityDetails=userVisibilityDetails(runtime,recipe),visibility=visibilityDetails.percent;
  const capabilities=capabilityState(runtime,metrics,viewport),base={mode:state.mode,seed:recipe.seed,signature,sharedRecipe:sameRecipeProof(),capabilities,metrics,viewport,visibility,visibilityDetails,performance:perf};
  if(state.mode==='KRIEGER'){const report=analyzeGraphicsQuality(governorInput(runtime,recipe),{styleProfile:'krieger_industrial'});base.gates=report.gates;base.governor=report;base.nativeKriegerAuthoring='MISSING';base.kriegerAdapter='PARTIAL'}
  if(state.mode==='INK')base.gates=inkGates(runtime);
  if(state.mode==='CUBE'){base.cube=cubeSnapshot(runtime);base.gates=cubeGates(runtime)}
  return base;
}
function formatDebug(d){
  const cap=Object.entries(d.capabilities).map(([k,v])=>k.padEnd(13)+' '+v).join('\n');
  const gates=Object.entries(d.gates||{}).map(([k,v])=>k.padEnd(34)+' '+String(v)).join('\n');
  const v=d.viewport,m=d.metrics,p=d.performance;
  let extra='';if(d.mode==='KRIEGER')extra='\nNATIVE_KRIEGER_AUTHORING   '+d.nativeKriegerAuthoring+'\nKRIEGER_CLASS_ADAPTER      '+d.kriegerAdapter;
  if(d.mode==='CUBE')extra+='\nGROWTH OPS                 '+JSON.stringify(d.cube.operations);
  return [
    'SCENE RECIPE: '+(d.sharedRecipe?'SAME':'DIFFERENT'),'SEED: '+d.seed,'SIGNATURE: '+d.signature,'MODE: '+d.mode,'USER VISIBILITY: '+d.visibility+'%',
    '',cap,extra,'','GATES',gates,'','OBJECTS/MESHES: '+m.meshes,'TRIANGLES: '+m.triangles,'DRAW CALLS: '+m.drawCalls,
    'FPS: '+p.fps.toFixed(1)+'  frame p95: '+p.p95.toFixed(1)+' ms','DPR: '+v.dpr.toFixed(2),
    'CANVAS: '+v.backing.join('x')+' / CSS '+v.css.join('x'),'CAMERA ASPECT: '+v.rendererAspect.toFixed(4),
    'SCROLL: '+v.scrollX+','+v.scrollY,'VIEWPORT SYNC: '+(v.consistent?'PASS':'FAIL')
  ].join('\n');
}
function updateDebug(force=false){
  const now=performance.now();if(!force&&now-state.lastDebug<280)return;state.lastDebug=now;
  try{debugText.textContent=formatDebug(debugSnapshot())}catch(error){debugText.textContent='DEBUG ERROR\n'+error.stack}
}
function animate(time){
  const dt=Math.min(.05,(time-state.lastTime)/1000);state.lastTime=time;if(dt>0){state.frameTimes.push(dt*1000);if(state.frameTimes.length>180)state.frameTimes.shift()}
  updateMovement(dt);const runtime=state.runtime;if(runtime){applyPose(runtime.camera);runtime.update?.(time);runtime.render?.();evidence.frames++;updateDebug()}
  requestAnimationFrame(animate);
}

window.__trinityLab={
  recipe,seed:recipe.seed,signature,targetIds:[...targetIds],getDebug:debugSnapshot,setMode:switchMode,
  setCubeProgress(value){if(state.mode!=='CUBE')switchMode('CUBE');state.runtime.setProgress(value);state.runtime.render();updateDebug(true);return cubeSnapshot(state.runtime)},
  restartCube(){if(state.mode!=='CUBE')switchMode('CUBE');state.runtime.restart();updateDebug(true);return cubeSnapshot(state.runtime)},
  snapshot(){const d=debugSnapshot();return {mode:d.mode,seed:d.seed,signature:d.signature,visibility:d.visibility,viewport:d.viewport,metrics:d.metrics,capabilities:d.capabilities,gates:d.gates,cube:d.cube||null}},
  moveCamera(dx=0,dz=0){pose.position.x+=dx;pose.position.z+=dz;evidence.cameraMoved=true;return pose.position.toArray()}
};

switchMode('KRIEGER');requestAnimationFrame(animate);
