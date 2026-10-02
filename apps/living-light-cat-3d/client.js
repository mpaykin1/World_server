import * as THREE from 'three';
import { LightPipeline, livingGoldProfile } from '/shared/light/index.mjs';
import { createLivingLightCat, addCatWhiskers } from './cat-rig.js';
import { applyCatPose } from './cat-animation.js';

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.setSize(innerWidth,innerHeight);
renderer.setClearColor(0x000000,1);
document.body.appendChild(renderer.domElement);

const colorScene=new THREE.Scene();
const maskScene=new THREE.Scene();
colorScene.background=new THREE.Color(0x000000);
maskScene.background=new THREE.Color(0x000000);

const camera=new THREE.PerspectiveCamera(29,innerWidth/innerHeight,0.1,100);
function frameCamera(){
  const portrait=innerWidth/innerHeight<0.72;
  camera.position.set(0.30,portrait?0.02:0.18,portrait?13.6:9.3);
  camera.lookAt(0.18,-0.05,0);
}
frameCamera();

const colorRoot=new THREE.Group();
const maskRoot=new THREE.Group();
colorScene.add(colorRoot);
maskScene.add(maskRoot);

const colorCat=createLivingLightCat(colorRoot,{mask:false});
const maskCat=createLivingLightCat(maskRoot,{mask:true});
addCatWhiskers(colorCat.head);
colorRoot.scale.setScalar(1.08);
maskRoot.scale.copy(colorRoot.scale);

const catGoldProfile={
  ...livingGoldProfile,
  id:'living-cat-gold',
  core:[1.0,0.965,0.78],
  gold:[1.0,0.50,0.085],
  amber:[1.0,0.20,0.018],
  coreGain:2.25,
  goldGain:1.18,
  haloGain:0.38,
  bloomGain:0.58,
  bloomRadius:1.35,
  rimPower:2.05,
  depthGain:0.42,
  filamentGain:0.12,
  filamentThreshold:0.915,
  temporalBlend:0.58,
  edgeSoftness:0.58,
  topGain:1.20,
  middleGain:1.04,
  bottomGain:0.94
};

const light=new LightPipeline({
  renderer,
  colorScene,
  maskScene,
  camera,
  width:innerWidth,
  height:innerHeight,
  profile:catGoldProfile
});

const params=new URLSearchParams(location.search);
const qa=params.get('qa')||'live';
let elapsed=0;
let last=performance.now();
let dragging=false;
let lastX=0;
let manualYaw=0;

function frame(now){
  const dt=Math.min(0.05,(now-last)/1000);
  last=now;
  elapsed+=dt;
  applyCatPose(colorCat,elapsed,{mode:qa,manualYaw});
  applyCatPose(maskCat,elapsed,{mode:qa,manualYaw});
  camera.layers.set(0);
  light.render(elapsed);
  const savedBackground=colorScene.background;
  colorScene.background=null;
  renderer.autoClear=false;
  renderer.clearDepth();
  camera.layers.set(1);
  renderer.render(colorScene,camera);
  camera.layers.set(0);
  renderer.autoClear=true;
  colorScene.background=savedBackground;
  window.LivingLightCat3D={
    ready:true,
    mode:qa,
    elapsed,
    headQuaternion:colorCat.head.quaternion.toArray(),
    tailDepth:colorCat.tail.segments.at(-1).position.z,
    profile:catGoldProfile.id,
    viewport:[innerWidth,innerHeight]
  };
  requestAnimationFrame(frame);
}

renderer.domElement.addEventListener('pointerdown',e=>{
  dragging=true;
  lastX=e.clientX;
  renderer.domElement.setPointerCapture?.(e.pointerId);
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(!dragging)return;
  manualYaw=THREE.MathUtils.clamp(manualYaw+(e.clientX-lastX)*0.006,-0.9,0.9);
  lastX=e.clientX;
});
renderer.domElement.addEventListener('pointerup',e=>{
  dragging=false;
  renderer.domElement.releasePointerCapture?.(e.pointerId);
});
renderer.domElement.addEventListener('pointercancel',()=>{dragging=false;});

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;
  frameCamera();
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  light.resize(innerWidth,innerHeight);
});

window.LIGHT={name:'LIGHT',version:1,pipeline:light,profile:catGoldProfile};
requestAnimationFrame(frame);
