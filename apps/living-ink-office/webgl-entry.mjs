import * as THREE from '../../vendor/three-r160/three.module.min.js';
import {createNprContext} from '../../shared/living-ink-webgl-npr.mjs';
import {createOfficeScene} from '../../shared/living-ink-webgl-scene.mjs';

const canvas=document.getElementById('living-ink');
const ctx=createNprContext(canvas);
const office=createOfficeScene(ctx,12345);
const camera=ctx.camera;

const QUALITY_SYSTEMS=[
  'depth-buffer-hidden-line',
  'real-mesh-npr',
  'semantic-edge-selector',
  'rigged-procedural-human-2',
  'detailed-prop-factory',
  'stylized-contact-ao',
  'selective-glass-2',
  'watercolor-compositor',
  'architectural-camera-director',
  'artistic-lod-3'
];

const hud=document.createElement('div');
hud.id='living-ink-touch-hud';
hud.innerHTML='<div class="li-stick"><div class="li-knob"></div></div><div class="li-look">LOOK</div><button class="li-frame" type="button">FRAME</button>';
document.body.appendChild(hud);
const style=document.createElement('style');
style.textContent=`
  #living-ink-touch-hud{position:fixed;inset:0;pointer-events:none;z-index:10}
  .li-stick{position:absolute;left:max(18px,env(safe-area-inset-left));bottom:max(26px,env(safe-area-inset-bottom));width:112px;height:112px;border:1px solid rgba(67,86,106,.18);border-radius:50%;background:rgba(248,244,237,.15)}
  .li-knob{position:absolute;left:37px;top:37px;width:38px;height:38px;border-radius:50%;border:1px solid rgba(67,86,106,.26);background:rgba(248,244,237,.48)}
  .li-look{position:absolute;right:max(18px,env(safe-area-inset-right));bottom:max(36px,env(safe-area-inset-bottom));font:800 9px system-ui;letter-spacing:.14em;color:rgba(67,86,106,.22)}
  .li-frame{position:absolute;left:max(14px,env(safe-area-inset-left));top:max(14px,env(safe-area-inset-top));pointer-events:auto;border:1px solid rgba(67,86,106,.18);border-radius:999px;padding:7px 11px;background:rgba(248,244,237,.70);color:rgba(67,86,106,.48);font:800 9px system-ui;letter-spacing:.12em}
  .li-frame.active{background:rgba(113,128,142,.13);color:rgba(67,86,106,.78)}
  @media (pointer:fine){.li-stick,.li-look{display:none}}
`;
document.head.appendChild(style);

const active=new Map(),move={x:0,y:0},knob=hud.querySelector('.li-knob'),frameButton=hud.querySelector('.li-frame');
const keys=Object.create(null);
let yaw=0,pitch=-.01,mode='walkthrough',savedPose=null;

function updateCameraRotation(){
  const dir=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
  camera.lookAt(camera.position.clone().add(dir));
}

addEventListener('keydown',e=>keys[e.key]=true);
addEventListener('keyup',e=>keys[e.key]=false);
canvas.addEventListener('pointerdown',e=>{
  const side=e.clientX<innerWidth*.48?'move':'look';
  active.set(e.pointerId,{side,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY});
  canvas.setPointerCapture?.(e.pointerId);e.preventDefault();
},{passive:false});
canvas.addEventListener('pointermove',e=>{
  const a=active.get(e.pointerId);if(!a)return;
  if(a.side==='move'){
    move.x=Math.max(-1,Math.min(1,(e.clientX-a.startX)/46));
    move.y=Math.max(-1,Math.min(1,-(e.clientY-a.startY)/46));
    knob.style.transform=`translate(${move.x*30}px,${-move.y*30}px)`;
  }else if(mode==='walkthrough'){
    yaw+=(e.clientX-a.lastX)*.0040;
    pitch=Math.max(-.28,Math.min(.22,pitch-(e.clientY-a.lastY)*.0027));
    a.lastX=e.clientX;a.lastY=e.clientY;updateCameraRotation();
  }
  e.preventDefault();
},{passive:false});
function endPointer(e){
  const a=active.get(e.pointerId);if(a?.side==='move'){move.x=move.y=0;knob.style.transform='translate(0px,0px)';}
  active.delete(e.pointerId);e.preventDefault();
}
canvas.addEventListener('pointerup',endPointer,{passive:false});
canvas.addEventListener('pointercancel',endPointer,{passive:false});

frameButton.addEventListener('pointerdown',e=>e.stopPropagation());
frameButton.addEventListener('click',e=>{
  e.stopPropagation();
  if(mode==='walkthrough'){
    savedPose={position:camera.position.clone(),yaw,pitch};
    mode='illustration';frameButton.classList.add('active');
    camera.position.set(.15,1.70,-.35);
    const target=new THREE.Vector3(0,1.03,9.7);camera.lookAt(target);
    camera.fov=innerWidth<innerHeight?47:42;camera.updateProjectionMatrix();
  }else{
    mode='walkthrough';frameButton.classList.remove('active');
    camera.position.copy(savedPose?.position||new THREE.Vector3(0,1.62,-2.2));
    yaw=savedPose?.yaw||0;pitch=savedPose?.pitch||-.01;
    camera.fov=innerWidth<innerHeight?58:48;camera.updateProjectionMatrix();updateCameraRotation();
  }
});

function updateMovement(dt){
  if(mode!=='walkthrough')return;
  const kf=(keys.w||keys.W||keys.ArrowUp?1:0)-(keys.s||keys.S||keys.ArrowDown?1:0);
  const ks=(keys.d||keys.D||keys.ArrowRight?1:0)-(keys.a||keys.A||keys.ArrowLeft?1:0);
  const forward=Math.max(-1,Math.min(1,kf+move.y)),strafe=Math.max(-1,Math.min(1,ks+move.x));
  const mag=Math.min(1,Math.hypot(forward,strafe)||1),speed=2.85*mag;
  const fx=Math.sin(yaw),fz=Math.cos(yaw),rx=Math.sin(yaw+Math.PI/2),rz=Math.cos(yaw+Math.PI/2);
  camera.position.x=Math.max(-6.25,Math.min(6.25,camera.position.x+(fx*forward+rx*strafe)*speed*dt));
  camera.position.z=Math.max(-2.2,Math.min(28.2,camera.position.z+(fz*forward+rz*strafe)*speed*dt));
  camera.position.y=1.62;updateCameraRotation();
}

let last=performance.now(),frames=0,startAt=last,frameTimes=[];
function tick(now){
  const dt=Math.min(.033,(now-last)/1000);last=now;updateMovement(dt);office.update(now);
  const rm=ctx.render();frames++;frameTimes.push(dt*1000);if(frameTimes.length>180)frameTimes.shift();
  const sorted=frameTimes.slice().sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)]||0;
  const elapsed=Math.max(.001,(now-startAt)/1000);
  window.__livingInkMetrics={
    fps:frames/elapsed,p95FrameMs:p95,drawCalls:rm.drawCalls,triangles:rm.triangles,
    meshes:rm.meshes,edgeSets:rm.edgeSets,hiddenLine:rm.hiddenLine,depthTest:rm.depthTest,
    standalone:true,backend:'three-webgl-npr-v3'
  };
  window.__livingInkScene={
    ...office.metrics(),qualitySystems:QUALITY_SYSTEMS.slice(),qualityProfile:'asqura-npr-v3',
    renderer:'three-webgl-npr-v3',cameraMode:mode,
    camera:{x:camera.position.x,y:camera.position.y,z:camera.position.z,yaw,pitch}
  };
  requestAnimationFrame(tick);
}
window.__LIVING_INK_STANDALONE__=true;
window.__livingInkReady=true;
ctx.resize();updateCameraRotation();requestAnimationFrame(tick);
