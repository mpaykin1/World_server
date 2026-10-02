import * as THREE from 'three';
import { updateTailGeometry } from './cat-rig.js';

const tailCurve=new THREE.CatmullRomCurve3([],false,'catmullrom',0.42);

function tailControlPoints(t,mode='live'){
  const fixed=mode==='tail-near'?1:mode==='tail-far'?-1:null;
  const swing=fixed ?? Math.sin(t*0.82);
  const depth=fixed ?? Math.sin(t*0.64+0.8);
  const controls=[
    [-0.88,-0.82, 0.00],
    [-0.94,-1.12, 0.03],
    [-0.54,-1.30, 0.05],
    [ 0.10,-1.34, 0.06],
    [ 0.86,-1.29, 0.08],
    [ 1.48,-1.13, 0.05],
    [ 1.77,-0.80,-0.02],
    [ 1.71,-0.48,-0.08],
    [ 1.39,-0.30,-0.12],
    [ 0.96,-0.27,-0.09],
    [ 0.55,-0.36,-0.04]
  ];
  return controls.map((p,i)=>{
    const u=i/(controls.length-1);
    const lag=Math.sin(t*1.05-u*3.5);
    return new THREE.Vector3(
      p[0] + swing*u*0.10 + lag*u*0.035,
      p[1] + Math.sin(t*0.74-u*2.1)*u*0.045,
      p[2] + depth*u*0.28 + lag*u*0.10
    );
  });
}

function sampleTail(t,mode){
  tailCurve.points=tailControlPoints(t,mode);
  return tailCurve.getPoints(22);
}

export function applyCatPose(rig,t,{mode='live',manualYaw=0}={}){
  let headYaw=Math.sin(t*0.58)*0.38;
  let headPitch=Math.sin(t*0.43+1.0)*0.09;
  if(mode==='head-left') headYaw=-0.45;
  if(mode==='head-right') headYaw=0.45;
  if(mode!=='live') headPitch=0;

  rig.root.rotation.y=manualYaw + Math.sin(t*0.22)*0.035;
  rig.root.rotation.x=-0.015 + Math.sin(t*0.31)*0.008;
  rig.body.scale.y=1+Math.sin(t*1.55)*0.012;
  rig.body.scale.x=1-Math.sin(t*1.55)*0.006;

  rig.neck.rotation.y=headYaw*0.28;
  rig.neck.rotation.x=headPitch*0.30;
  rig.head.rotation.y=headYaw;
  rig.head.rotation.x=headPitch;
  rig.head.rotation.z=Math.sin(t*0.34+0.7)*0.025;

  updateTailGeometry(rig,sampleTail(t,mode));
}
