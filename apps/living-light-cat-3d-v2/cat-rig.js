import * as THREE from 'three';

const BLACK=new THREE.MeshBasicMaterial({color:0x000000,side:THREE.DoubleSide});
const WHITE=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide});
const UP=new THREE.Vector3(0,1,0);
const MID=new THREE.Vector3();
const DIR=new THREE.Vector3();

const mat=mask=>mask?WHITE:BLACK;

function ellipsoid(parent,radius,scale,pos,mask,name){
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,20,14),mat(mask));
  mesh.scale.set(...scale); mesh.position.set(...pos); mesh.name=name; parent.add(mesh); return mesh;
}
function cylinderMesh(parent,radius,length,mask,name){
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius*0.86,radius,length,10,1),mat(mask));
  mesh.position.y=-length*0.5; mesh.name=name; parent.add(mesh); return mesh;
}
function ear(parent,pos,rot,mask,name){
  const mesh=new THREE.Mesh(new THREE.ConeGeometry(0.135,0.46,8,1),mat(mask));
  mesh.position.set(...pos); mesh.rotation.set(...rot); mesh.name=name; parent.add(mesh); return mesh;
}
function createLeg(parent,{name,anchor,z,upper=.50,lower=.48,near=true}){
  const hip=new THREE.Group(); hip.name=name+'Hip'; hip.position.set(anchor[0],anchor[1],z); parent.add(hip);
  const upperMesh=cylinderMesh(hip,near?0.072:0.058,upper,false,name+'Upper');
  const knee=new THREE.Group(); knee.name=name+'Knee'; knee.position.y=-upper; hip.add(knee);
  const lowerMesh=cylinderMesh(knee,near?0.060:0.049,lower,false,name+'Lower');
  const paw=new THREE.Group(); paw.name=name+'Paw'; paw.position.y=-lower; knee.add(paw);
  const pawMesh=new THREE.Mesh(new THREE.SphereGeometry(0.078,10,7),BLACK);
  pawMesh.scale.set(1.35,0.40,0.84); pawMesh.position.set(0.035,-0.01,0); paw.add(pawMesh);
  return {hip,knee,paw,upperMesh,lowerMesh,pawMesh,upper,lower};
}
function copyMaterialForMask(node,mask){
  if(!mask)return;
  node.traverse(o=>{if(o.isMesh)o.material=WHITE;});
}
function makeTail(root,mask){
  const segments=[],joints=[];
  const geom=new THREE.CylinderGeometry(1,1,1,12,1);
  const sphere=new THREE.SphereGeometry(1,10,7);
  for(let i=0;i<24;i++){
    const seg=new THREE.Mesh(geom.clone(),mat(mask)); seg.name='tailSegment'+i; root.add(seg); segments.push(seg);
    if(i<23){const j=new THREE.Mesh(sphere.clone(),mat(mask)); j.name='tailJoint'+i; root.add(j); joints.push(j);}
  }
  return {segments,joints};
}
function placeSegment(mesh,a,b,r){
  MID.copy(a).add(b).multiplyScalar(0.5); DIR.copy(b).sub(a);
  mesh.position.copy(MID); mesh.scale.set(r,DIR.length(),r); mesh.quaternion.setFromUnitVectors(UP,DIR.normalize());
}

export function createLivingLightCatV2(parent,{mask=false}={}){
  const root=new THREE.Group(); root.name=mask?'catV2Mask':'catV2'; parent.add(root);
  const spine=new THREE.Group(); spine.name='spine'; root.add(spine);
  const torso=ellipsoid(spine,1,[1.05,0.36,0.44],[-0.15,0.15,0],mask,'torso');
  const rump=ellipsoid(spine,1,[0.62,0.45,0.48],[-0.78,0.04,0.01],mask,'rump');
  const chest=ellipsoid(spine,1,[0.43,0.52,0.40],[0.54,0.20,0],mask,'chest');

  const neck=new THREE.Group(); neck.name='neckPivot'; neck.position.set(0.72,0.46,0); spine.add(neck);
  ellipsoid(neck,0.37,[0.62,0.78,0.64],[0.05,0.07,0],mask,'neck');
  const head=new THREE.Group(); head.name='headPivot'; head.position.set(0.28,0.27,0); neck.add(head);
  ellipsoid(head,0.39,[0.98,0.86,0.82],[0,0,0],mask,'head');
  ellipsoid(head,0.19,[1.12,0.50,0.64],[0.39,-0.10,0.01],mask,'muzzle');
  ellipsoid(head,0.07,[0.72,0.50,0.58],[0.59,-0.09,0.02],mask,'nose');
  const farEar=ear(head,[-0.12,0.36,-0.20],[0.02,0.04,-0.17],mask,'earFar'); farEar.scale.set(.58,.62,.58);
  ear(head,[0.07,0.45,0.10],[-0.04,-0.04,0.08],mask,'earNear');

  const legs={
    frontNear:createLeg(spine,{name:'frontNear',anchor:[0.53,0.05],z:0.17,near:true}),
    frontFar:createLeg(spine,{name:'frontFar',anchor:[0.46,0.05],z:-0.17,near:false}),
    hindNear:createLeg(spine,{name:'hindNear',anchor:[-0.72,-0.02],z:0.17,near:true,upper:.54,lower:.45}),
    hindFar:createLeg(spine,{name:'hindFar',anchor:[-0.78,-0.02],z:-0.17,near:false,upper:.54,lower:.45})
  };
  Object.values(legs).forEach(l=>copyMaterialForMask(l.hip,mask));

  const tail=makeTail(root,mask);
  return {root,spine,torso,rump,chest,neck,head,legs,tail};
}

export function addCatWhiskers(head){
  const material=new THREE.LineBasicMaterial({color:0xffc56a,transparent:true,opacity:.56,blending:THREE.AdditiveBlending,depthWrite:false});
  const defs=[[-.08,.23,.90,.11],[-.14,.24,1.0,.02],[-.20,.22,.92,-.09],[-.25,.18,.80,-.15]];
  for(let i=0;i<defs.length;i++){
    const [y,z,len,bend]=defs[i];
    const curve=new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(.49,y,z),new THREE.Vector3(.49+len*.55,y+bend,z+.01),new THREE.Vector3(.49+len,y+bend*.35,z)
    );
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)),material);
    line.layers.set(1); line.name='whisker'+i; head.add(line);
  }
}

export function updateTailGeometry(rig,points){
  for(let i=0;i<rig.tail.segments.length;i++){
    const u=i/(rig.tail.segments.length-1),a=points[i],b=points[i+1],r=.085*(1-u)+.009*u;
    placeSegment(rig.tail.segments[i],a,b,r);
    if(i<rig.tail.joints.length){rig.tail.joints[i].position.copy(b);rig.tail.joints[i].scale.setScalar(r*.94);}
  }
}
