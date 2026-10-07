import * as THREE from 'three';

function lineMaterial(color, opacity) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
}

function curvePoints(curve, samples) {
  const points = [];
  for (let i = 0; i <= samples; i++) points.push(curve.getPoint(i / samples));
  return points;
}

export function createLightWhisker({
  start,
  control,
  end,
  coreColor = 0xffe6ad,
  haloColor = 0xff8a20,
  samples = 20
}) {
  const curve = new THREE.QuadraticBezierCurve3(start, control, end);
  const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints(curve, samples));
  const root = new THREE.Group();
  const halo = new THREE.Line(geometry.clone(), lineMaterial(haloColor, 0.22));
  const core = new THREE.Line(geometry, lineMaterial(coreColor, 0.72));
  halo.scale.setScalar(1.002);
  root.add(halo, core);
  root.userData.lightKind = 'whisker';
  return root;
}

export function createLightWhiskerBundle(definitions, options = {}) {
  const group = new THREE.Group();
  for (const item of definitions) group.add(createLightWhisker({ ...options, ...item }));
  group.userData.lightKind = 'whisker-bundle';
  return group;
}
