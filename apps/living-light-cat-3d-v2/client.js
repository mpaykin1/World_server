import * as THREE from 'three';
import {LightPipeline,livingGoldProfile} from '/shared/light/index.mjs';
import {createLivingLightCatV2,addCatWhiskers} from './cat-rig.js';
import {MOTION_NAMES,applyMotion,resolveAutoAction} from './cat-motion-library.js';

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2)); renderer.setSize(innerWidth,innerHeight); renderer.setClearColor(0,1); document.body.appendChild(renderer.domElement);

const colorScene=new THREE.Scene(),maskScene=new THREE.Scene();
colorScene.background=new THREE.Color(0); maskScene.background=new THREE.Color(0);
const camera=new THREE.PerspectiveCamera(28,innerWidth/innerHeight,.1,100);
function frameCamera(){const portrait=innerWidth/innerHeight<.72;camera.position.set(.05,portrait?.02:.08,portrait?16.2:10.2);camera.lookAt(.05,-.08,0);}
frameCamera();

const colorRoot=new THREE.Group(),maskRoot=new THREE.Group(); colorScene.add(colorRoot); maskScene.add(maskRoot);
const colorCat=createLivingLightCatV2(colorRoot,{mask:false}),maskCat=createLivingLightCatV2(maskRoot,{mask:true});
addCatWhiskers(colorCat.head); colorRoot.scale.setScalar(1.20); maskRoot.scale.copy(colorRoot.scale);

const profile={...livingGoldProfile,id:'living-cat-motion-gold',core:[1,.82,.38],gold:[1,.46,.055],amber:[1,.17,.010],
  coreGain:1.26,goldGain:1.02,haloGain:.28,bloomGain:.36,bloomRadius:1.05,rimPower:2.05,depthGain:.42,
  filamentGain:.12,filamentThreshold:.915,temporalBlend:.10,edgeSoftness:.58,topGain:1.20,middleGain:.92,bottomGain:.72};

const drawSize=new THREE.Vector2();
function renderSize(){renderer.getDrawingBufferSize(drawSize);return{width:Math.max(1,Math.round(drawSize.x)),height:Math.max(1,Math.round(drawSize.y))};}
const rs=renderSize();
const light=new LightPipeline({renderer,colorScene,maskScene,camera,width:rs.width,height:rs.height,profile});

const params=new URLSearchParams(location.search); let requested=params.get('action')||'auto';
let elapsed=0,last=performance.now(),manualYaw=0,dragging=false,lastX=0,tapStart=0,actionIndex=0;
function currentAction(){if(requested!=='auto'&&MOTION_NAMES.includes(requested))return{name:requested,local:elapsed};return resolveAutoAction(elapsed);}

function frame(now){
  const dt=Math.min(.05,(now-last)/1000); last=now; elapsed+=dt;
  const action=currentAction(); applyMotion(colorCat,action.name,action.local); applyMotion(maskCat,action.name,action.local);
  colorCat.root.rotation.y+=manualYaw; maskCat.root.rotation.y+=manualYaw;
  camera.layers.set(0); light.render(elapsed);
  const bg=colorScene.background; colorScene.background=null; renderer.autoClear=false; renderer.clearDepth(); camera.layers.set(1); renderer.render(colorScene,camera);
  camera.layers.set(0); renderer.autoClear=true; colorScene.background=bg;
  window.LivingLightCatMotion={ready:true,action:action.name,elapsed,actions:MOTION_NAMES,profile:profile.id,
    bodyY:colorCat.spine.position.y,bodyRoll:colorCat.spine.rotation.z,
    legAngles:Object.fromEntries(Object.entries(colorCat.legs).map(([k,l])=>[k,[l.hip.rotation.z,l.knee.rotation.z]])),
    tailDepth:colorCat.tail.segments.at(-1).position.z,viewport:[innerWidth,innerHeight]};
  requestAnimationFrame(frame);
}
renderer.domElement.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;tapStart=performance.now();renderer.domElement.setPointerCapture?.(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-lastX;if(Math.abs(dx)>2){manualYaw=THREE.MathUtils.clamp(manualYaw+dx*.006,-.8,.8);lastX=e.clientX;}});
renderer.domElement.addEventListener('pointerup',e=>{const tap=performance.now()-tapStart<260;if(tap){actionIndex=(actionIndex+1)%MOTION_NAMES.length;requested=MOTION_NAMES[actionIndex];elapsed=0;}dragging=false;renderer.domElement.releasePointerCapture?.(e.pointerId);});
renderer.domElement.addEventListener('pointercancel',()=>dragging=false);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;frameCamera();camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);const s=renderSize();light.resize(s.width,s.height);});
window.LIGHT={name:'LIGHT',version:1,pipeline:light,profile}; requestAnimationFrame(frame);
