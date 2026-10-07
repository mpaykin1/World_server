import * as THREE from 'three';

const black = new THREE.MeshBasicMaterial({ color: 0x030303, side: THREE.DoubleSide });
const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

function material(asMask) { return asMask ? white : black; }

function ellipsoid(parent, radius, scale, position, asMask, name) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), material(asMask));
  mesh.scale.set(...scale);
  mesh.position.set(...position);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function segment(parent, length, radius, asMask, name) {
  const pivot = new THREE.Group();
  pivot.name = name;
  parent.add(pivot);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.72, radius, length, 9, 1),
    material(asMask)
  );
  mesh.position.y = -length * 0.5;
  mesh.name = name + 'Mesh';
  pivot.add(mesh);
  return pivot;
}

function limb(parent, side, y, asMask, prefix) {
  const hip = new THREE.Group();
  hip.name = prefix + 'Hip';
  hip.position.set(0.33 * side, y, 0.04);
  parent.add(hip);
  const upper = segment(hip, 0.72, 0.075, asMask, prefix + 'Upper');
  const knee = new THREE.Group();
  knee.name = prefix + 'Knee';
  knee.position.y = -0.72;
  upper.add(knee);
  const lower = segment(knee, 0.68, 0.058, asMask, prefix + 'Lower');
  return { hip, upper, knee, lower, side };
}

function tailChain(parent, asMask, count = 9) {
  const bones = [];
  let current = new THREE.Group();
  current.name = 'tailRoot';
  current.position.set(-0.42, 0.35, -0.05);
  current.rotation.z = Math.PI * 0.58;
  parent.add(current);

  for (let i = 0; i < count; i++) {
    const length = 0.36 - i * 0.018;
    const radius = 0.12 - i * 0.009;
    const joint = new THREE.Group();
    joint.name = 'tailBone' + i;
    current.add(joint);

    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.max(0.025, radius * 0.72), radius, length, 9, 1),
      material(asMask)
    );
    mesh.rotation.z = Math.PI / 2;
    mesh.position.x = -length * 0.5;
    joint.add(mesh);
    bones.push(joint);

    const next = new THREE.Group();
    next.position.x = -length;
    joint.add(next);
    current = next;
  }
  return bones;
}

export function createSilhouetteCreature(parent, { asMask = false, scale = 1 } = {}) {
  const root = new THREE.Group();
  root.name = asMask ? 'silhouetteMaskRig' : 'silhouetteColorRig';
  root.scale.setScalar(scale);
  parent.add(root);

  ellipsoid(root, 1, [0.52, 0.82, 0.38], [0, 0.72, 0], asMask, 'torso');

  const neck = new THREE.Group();
  neck.name = 'neckPivot';
  neck.position.set(0.06, 1.36, 0);
  root.add(neck);
  ellipsoid(neck, 0.24, [0.72, 0.9, 0.72], [0, 0.16, 0], asMask, 'neck');

  const head = new THREE.Group();
  head.name = 'headPivot';
  head.position.set(0.02, 0.34, 0);
  neck.add(head);
  ellipsoid(head, 0.42, [0.92, 0.82, 0.88], [0.08, 0.18, 0], asMask, 'head');

  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.38, 6), material(asMask));
  earL.position.set(-0.16, 0.54, 0); earL.rotation.z = -0.08; head.add(earL);
  const earR = earL.clone(); earR.position.x = 0.25; earR.rotation.z = 0.08; head.add(earR);

  const armL = limb(root, -1, 1.08, asMask, 'armL');
  const armR = limb(root, 1, 1.08, asMask, 'armR');
  const legL = limb(root, -1, 0.35, asMask, 'legL');
  const legR = limb(root, 1, 0.35, asMask, 'legR');
  const tail = tailChain(root, asMask);

  return { root, neck, head, armL, armR, legL, legR, tail };
}

export function clonePose(source, target) {
  target.root.position.copy(source.root.position);
  target.root.quaternion.copy(source.root.quaternion);
  target.root.scale.copy(source.root.scale);
  target.neck.quaternion.copy(source.neck.quaternion);
  target.head.quaternion.copy(source.head.quaternion);

  for (const key of ['armL', 'armR', 'legL', 'legR']) {
    target[key].hip.quaternion.copy(source[key].hip.quaternion);
    target[key].knee.quaternion.copy(source[key].knee.quaternion);
  }
  target.tail.forEach((bone, i) => bone.quaternion.copy(source.tail[i].quaternion));
}
