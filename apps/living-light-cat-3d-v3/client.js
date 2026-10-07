import * as THREE from 'three';
import {LightPipeline,livingGoldProfile} from '/shared/light/index.mjs';
import {createLivingLightCatV2,addCatWhiskers} from '../living-light-cat-3d-v2/cat-rig.js';
import {MOTION_NAMES,applyMotion,resolveAutoAction} from '../living-light-cat-3d-v2/cat-motion-library.js';

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.setSize(innerWidth,innerHeight);
renderer.setClearColor(0,1);
document.body.appendChild(renderer.domElement);

const colorScene=new THREE.Scene();
const maskScene=new THREE.Scene();
colorScene.background=new THREE.Color(0);
maskScene.background=new THREE.Color(0);

const camera=new THREE.PerspectiveCamera(28,innerWidth/innerHeight,.1,100);
function frameCamera(){
  const portrait=innerWidth/innerHeight<.72;
  camera.position.set(.05,portrait?.02:.08,portrait?16.2:10.2);
  camera.lookAt(.05,-.08,0);
}
frameCamera();

const colorRoot=new THREE.Group();
const maskRoot=new THREE.Group();
colorScene.add(colorRoot);
maskScene.add(maskRoot);

const colorCat=createLivingLightCatV2(colorRoot,{mask:false});
const maskCat=createLivingLightCatV2(maskRoot,{mask:true});
addCatWhiskers(colorCat.head);
colorRoot.scale.setScalar(1.20);
maskRoot.scale.copy(colorRoot.scale);

const profile={
  ...livingGoldProfile,
  id:'living-cat-reference-partial-rim',
  core:[1.0,.86,.52],
  gold:[1.0,.50,.07],
  amber:[1.0,.18,.012],
  coreGain:1.38,
  goldGain:1.12,
  haloGain:.34,
  bloomGain:.46,
  bloomRadius:1.18,
  rimPower:2.15,
  depthGain:.34,
  filamentGain:.14,
  filamentThreshold:.91,
  temporalBlend:.025,
  edgeSoftness:.52,
  topGain:1.22,
  middleGain:.92,
  bottomGain:.72,
  directionalStrength:1.0,
  lightDirection:[.58,.76,.30],
  lightCutoff:.31,
  lightSoftness:.19,
  shadowFloor:.012,
  thicknessVariation:1.0
};

const drawSize=new THREE.Vector2();
function renderSize(){
  renderer.getDrawingBufferSize(drawSize);
  return{width:Math.max(1,Math.round(drawSize.x)),height:Math.max(1,Math.round(drawSize.y))};
}
const size=renderSize();
const light=new LightPipeline({renderer,colorScene,maskScene,camera,width:size.width,height:size.height,profile});

const params=new URLSearchParams(location.search);
let requested=params.get('action')||'sit';
let elapsed=0,last=performance.now(),manualYaw=0,dragging=false,lastX=0,tapStart=0,actionIndex=0;

function currentAction(){
  if(requested!=='auto'&&MOTION_NAMES.includes(requested))return{name:requested,local:elapsed};
  return resolveAutoAction(elapsed);
}

function frame(now){
  const dt=Math.min(.05,(now-last)/1000);
  last=now;
  elapsed+=dt;
  const action=currentAction();
  applyMotion(colorCat,action.name,action.local);
  applyMotion(maskCat,action.name,action.local);

  colorCat.root.rotation.y+=manualYaw;
  maskCat.root.rotation.y+=manualYaw;

  camera.layers.set(0);
  light.render(elapsed);

  const background=colorScene.background;
  colorScene.background=null;
  renderer.autoClear=false;
  renderer.clearDepth();
  camera.layers.set(1);
  renderer.render(colorScene,camera);
  camera.layers.set(0);
  renderer.autoClear=true;
  colorScene.background=background;

  window.LivingLightCatV3={
    ready:true,
    action:action.name,
    elapsed,
    profile:profile.id,
    lightDirection:profile.lightDirection,
    directionalStrength:profile.directionalStrength,
    shadowFloor:profile.shadowFloor,
    thicknessVariation:profile.thicknessVariation,
    viewport:[innerWidth,innerHeight]
  };
  requestAnimationFrame(frame);
}

renderer.domElement.addEventListener('pointerdown',e=>{
  dragging=true;
  lastX=e.clientX;
  tapStart=performance.now();
  renderer.domElement.setPointerCapture?.(e.pointerId);
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(!dragging)return;
  const dx=e.clientX-lastX;
  if(Math.abs(dx)>2){
    manualYaw=THREE.MathUtils.clamp(manualYaw+dx*.006,-.8,.8);
    lastX=e.clientX;
  }
});
renderer.domElement.addEventListener('pointerup',e=>{
  const tap=performance.now()-tapStart<260;
  if(tap){
    actionIndex=(actionIndex+1)%MOTION_NAMES.length;
    requested=MOTION_NAMES[actionIndex];
    elapsed=0;
  }
  dragging=false;
  renderer.domElement.releasePointerCapture?.(e.pointerId);
});
renderer.domElement.addEventListener('pointercancel',()=>dragging=false);

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;
  frameCamera();
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  const s=renderSize();
  light.resize(s.width,s.height);
});

window.LIGHT={name:'LIGHT',version:2,pipeline:light,profile};
requestAnimationFrame(frame);
