import * as THREE from 'three';

const BLACK = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
const WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

function mat(mask){ return mask ? WHITE : BLACK; }

function ellipsoid(parent, radius, scale, position, mask, name){
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), mat(mask));
  mesh.scale.set(...scale);
  mesh.position.set(...position);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, radius, length, position, rotation, mask, name){
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.92, length, 12, 1), mat(mask));
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function ear(parent, position, rotation, mask, name){
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.62, 8, 1), mat(mask));
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function makeTail(root, mask){
  const segments=[];
  const joints=[];
  const geometry=new THREE.CylinderGeometry(1,1,1,12,1);
  const sphereGeometry=new THREE.SphereGeometry(1,12,8);
  for(let i=0;i<22;i++){
    const seg=new THREE.Mesh(geometry.clone(),mat(mask));
    seg.name='tailSegment'+i;
    root.add(seg);
    segments.push(seg);
    if(i<21){
      const joint=new THREE.Mesh(sphereGeometry.clone(),mat(mask));
      joint.name='tailJoint'+i;
      root.add(joint);
      joints.push(joint);
    }
  }
  return {segments,joints};
}

export function createLivingLightCat(parent,{mask=false}={}){
  const root=new THREE.Group();
  root.name=mask?'catMaskRoot':'catRoot';
  parent.add(root);

  const body=new THREE.Group();
  body.name='bodyRig';
  root.add(body);

  ellipsoid(body,1,[0.69,1.17,0.50],[-0.48,0.08,0],mask,'body');
  ellipsoid(body,1,[0.84,0.77,0.54],[-0.43,-0.72,0.02],mask,'rump');
  ellipsoid(body,1,[0.40,0.83,0.39],[0.03,0.48,0.01],mask,'chest');
  ellipsoid(body,0.58,[0.72,0.86,0.74],[-0.15,0.94,0],mask,'shoulderBridge');

  cylinder(body,0.072,1.18,[0.17,-0.63,0.15],[0,0,-0.015],mask,'frontLegNear');
  cylinder(body,0.060,1.12,[0.05,-0.66,-0.14],[0,0,0.012],mask,'frontLegFar');

  const neck=new THREE.Group();
  neck.name='neckPivot';
  neck.position.set(0.02,1.08,0);
  body.add(neck);
  ellipsoid(neck,0.42,[0.70,0.78,0.66],[0.10,0.09,0],mask,'neck');

  const head=new THREE.Group();
  head.name='headPivot';
  head.position.set(0.36,0.43,0);
  neck.add(head);

  ellipsoid(head,0.48,[0.96,0.89,0.84],[0.0,0.0,0],mask,'head');
  ellipsoid(head,0.235,[1.08,0.53,0.68],[0.43,-0.11,0.01],mask,'muzzle');
  ellipsoid(head,0.17,[0.84,0.48,0.66],[0.29,-0.27,0.00],mask,'chin');
  ellipsoid(head,0.075,[0.72,0.50,0.58],[0.64,-0.09,0.02],mask,'nose');

  const farEar=ear(head,[-0.13,0.39,-0.22],[0.02,0.05,-0.20],mask,'earFar');
  farEar.scale.set(0.52,0.58,0.52);
  ear(head,[0.08,0.49,0.10],[-0.04,-0.04,0.08],mask,'earNear');

  const tail=makeTail(root,mask);
  return {root,body,neck,head,tail};
}

export function addCatWhiskers(head){
  const material=new THREE.LineBasicMaterial({
    color:0xffc56a,
    transparent:true,
    opacity:0.58,
    blending:THREE.AdditiveBlending,
    depthWrite:false,
    depthTest:true
  });
  const defs=[
    [-0.08,0.23,0.92,0.12],
    [-0.14,0.24,1.02,0.02],
    [-0.20,0.22,0.94,-0.10],
    [-0.25,0.18,0.80,-0.16]
  ];
  const lines=[];
  for(let i=0;i<defs.length;i++){
    const [y,z,length,bend]=defs[i];
    const curve=new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0.52,y,z),
      new THREE.Vector3(0.52+length*0.55,y+bend,z+0.01),
      new THREE.Vector3(0.52+length,y+bend*0.35,z)
    );
    const geometry=new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
    const line=new THREE.Line(geometry,material);
    line.name='whiskerOverlay'+i;
    line.layers.set(1);
    head.add(line);
    lines.push(line);
  }
  return lines;
}

const UP=new THREE.Vector3(0,1,0);
const midpoint=new THREE.Vector3();
const direction=new THREE.Vector3();

function placeSegment(mesh,a,b,radius){
  midpoint.copy(a).add(b).multiplyScalar(0.5);
  direction.copy(b).sub(a);
  const length=direction.length();
  mesh.position.copy(midpoint);
  mesh.scale.set(radius,length,radius);
  mesh.quaternion.setFromUnitVectors(UP,direction.normalize());
}

export function updateTailGeometry(rig,points){
  const {segments,joints}=rig.tail;
  for(let i=0;i<segments.length;i++){
    const a=points[i],b=points[i+1];
    const u=i/(segments.length-1);
    placeSegment(segments[i],a,b,0.095*(1-u)+0.010*u);
    if(i<joints.length){
      joints[i].position.copy(b);
      const r=0.092*(1-u)+0.009*u;
      joints[i].scale.setScalar(r);
    }
  }
}
