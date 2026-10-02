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

function whisker(parent, y, z, length, bend, mask, name){
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0.62, y, z),
    new THREE.Vector3(0.62 + length * 0.55, y + bend, z),
    new THREE.Vector3(0.62 + length, y + bend * 0.45, z)
  );
  const geometry = new THREE.TubeGeometry(curve, 18, 0.008, 5, false);
  const mesh = new THREE.Mesh(geometry, mat(mask));
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

  ellipsoid(body,1,[0.88,1.26,0.58],[-0.42,0.08,0],mask,'body');
  ellipsoid(body,1,[0.88,0.83,0.62],[-0.36,-0.72,0.02],mask,'rump');
  ellipsoid(body,1,[0.54,0.86,0.48],[0.18,0.50,0.01],mask,'chest');

  cylinder(body,0.10,1.25,[0.19,-0.61,0.17],[0,0,-0.02],mask,'frontLegNear');
  cylinder(body,0.085,1.18,[0.06,-0.64,-0.16],[0,0,0.015],mask,'frontLegFar');

  const neck=new THREE.Group();
  neck.name='neckPivot';
  neck.position.set(0.05,1.10,0);
  body.add(neck);
  ellipsoid(neck,0.48,[0.75,0.82,0.72],[0.08,0.08,0],mask,'neck');

  const head=new THREE.Group();
  head.name='headPivot';
  head.position.set(0.38,0.46,0);
  neck.add(head);

  ellipsoid(head,0.56,[1.0,0.90,0.88],[0.0,0.0,0],mask,'head');
  ellipsoid(head,0.30,[1.05,0.62,0.78],[0.48,-0.10,0.01],mask,'muzzle');
  ellipsoid(head,0.11,[0.78,0.55,0.65],[0.75,-0.08,0.02],mask,'nose');

  ear(head,[-0.12,0.52,-0.14],[0.02,0.05,-0.18],mask,'earFar');
  ear(head,[0.18,0.57,0.13],[-0.04,-0.04,0.10],mask,'earNear');

  whisker(head,-0.10,0.28,0.96,0.10,mask,'whiskerA');
  whisker(head,-0.16,0.30,1.06,-0.01,mask,'whiskerB');
  whisker(head,-0.22,0.27,0.92,-0.12,mask,'whiskerC');

  const tail=makeTail(root,mask);
  return {root,body,neck,head,tail};
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
    placeSegment(segments[i],a,b,0.105*(1-u)+0.030*u);
    if(i<joints.length){
      joints[i].position.copy(b);
      const r=0.10*(1-u)+0.028*u;
      joints[i].scale.setScalar(r);
    }
  }
}
