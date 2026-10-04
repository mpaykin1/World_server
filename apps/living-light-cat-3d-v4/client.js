import * as THREE from 'three';
import {LightPipeline,livingGoldProfile} from '/shared/light/index.mjs';
import {createLivingLightCatV2,addCatWhiskers} from '../living-light-cat-3d-v2/cat-rig.js';
import {MOTION_NAMES,applyMotion,resolveAutoAction} from '../living-light-cat-3d-v2/cat-motion-library.js';
import {bindTailToSpine,createTailFollower} from './tail-motion.js';

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

const colorRoot=new THREE.Group(),maskRoot=new THREE.Group();
colorScene.add(colorRoot);maskScene.add(maskRoot);

const colorCat=createLivingLightCatV2(colorRoot,{mask:false});
const maskCat=createLivingLightCatV2(maskRoot,{mask:true});
addCatWhiskers(colorCat.head);
colorRoot.scale.setScalar(1.20);
maskRoot.scale.copy(colorRoot.scale);

// Critical V4 fix: tail geometry now inherits spine/body transform.
bindTailToSpine(colorCat);
bindTailToSpine(maskCat);
const colorTail=createTailFollower();
const maskTail=createTailFollower();

const profile={
  ...livingGoldProfile,
  id:'living-cat-v4-broken-rim',
  core:[1.0,.84,.48],
  gold:[1.0,.49,.065],
  amber:[1.0,.18,.012],
  coreGain:1.34,
  goldGain:1.10,
  haloGain:.31,
  bloomGain:.40,
  bloomRadius:1.10,
  rimPower:2.1,
  depthGain:.26,
  filamentGain:.12,
  filamentThreshold:.92,
  temporalBlend:.018,
  edgeSoftness:.50,
  topGain:1.18,
  middleGain:.88,
  bottomGain:.68,
  directionalStrength:1.0,
  lightDirection:[.62,.74,.27],
  lightCutoff:.34,
  lightSoftness:.085,
  shadowFloor:0.0,
  thicknessVariation:1.0,
  projectedEdgeWeight:.90
};

const drawSize=new THREE.Vector2();
function renderSize(){
  renderer.getDrawingBufferSize(drawSize);
  return{width:Math.max(1,Math.round(drawSize.x)),height:Math.max(1,Math.round(drawSize.y))};
}
const size=renderSize();
const light=new LightPipeline({renderer,colorScene,maskScene,camera,width:size.width,height:size.height,profile});

const params=new URLSearchParams(location.search);
let requested=params.get('action')||'auto';
let elapsed=0,last=performance.now(),manualYaw=0,dragging=false,lastX=0,tapStart=0,actionIndex=0;

function currentAction(){
  if(requested!=='auto'&&MOTION_NAMES.includes(requested))return{name:requested,local:elapsed};
  return resolveAutoAction(elapsed);
}

const worldBaseColor=new THREE.Vector3();
const worldBaseMask=new THREE.Vector3();

function frame(now){
  const dt=Math.min(.05,(now-last)/1000);
  last=now;
  elapsed+=dt;
  const action=currentAction();

  applyMotion(colorCat,action.name,action.local);
  applyMotion(maskCat,action.name,action.local);

  const colorTailState=colorTail.update(colorCat,action.name,action.local,dt);
  maskTail.update(maskCat,action.name,action.local,dt);

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

  colorCat.spine.getWorldPosition(worldBaseColor);
  maskCat.spine.getWorldPosition(worldBaseMask);
  window.LivingLightCatV4={
    ready:true,
    action:action.name,
    elapsed,
    profile:profile.id,
    tailFollowsSpine:colorCat.tail.followsSpine===true,
    tail:colorTailState,
    spineWorld:[worldBaseColor.x,worldBaseColor.y,worldBaseColor.z],
    maskSpineWorld:[worldBaseMask.x,worldBaseMask.y,worldBaseMask.z],
    brokenRim:{
      projectedEdgeWeight:profile.projectedEdgeWeight,
      shadowFloor:profile.shadowFloor,
      lightCutoff:profile.lightCutoff,
      lightSoftness:profile.lightSoftness
    },
    viewport:[innerWidth,innerHeight]
  };
  requestAnimationFrame(frame);
}

renderer.domElement.addEventListener('pointerdown',e=>{
  dragging=true;lastX=e.clientX;tapStart=performance.now();
  renderer.domElement.setPointerCapture?.(e.pointerId);
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(!dragging)return;
  const dx=e.clientX-lastX;
  if(Math.abs(dx)>2){manualYaw=THREE.MathUtils.clamp(manualYaw+dx*.006,-.8,.8);lastX=e.clientX;}
});
renderer.domElement.addEventListener('pointerup',e=>{
  const tap=performance.now()-tapStart<260;
  if(tap){actionIndex=(actionIndex+1)%MOTION_NAMES.length;requested=MOTION_NAMES[actionIndex];elapsed=0;colorTail.reset();maskTail.reset();}
  dragging=false;
  renderer.domElement.releasePointerCapture?.(e.pointerId);
});
renderer.domElement.addEventListener('pointercancel',()=>dragging=false);

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;frameCamera();camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  const s=renderSize();light.resize(s.width,s.height);
});

window.LIGHT={name:'LIGHT',version:3,pipeline:light,profile};
requestAnimationFrame(frame);
