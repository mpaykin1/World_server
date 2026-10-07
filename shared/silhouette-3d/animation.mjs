import * as THREE from 'three';

const euler = new THREE.Euler();

function setQuat(object, x, y, z) {
  euler.set(x, y, z, 'XYZ');
  object.quaternion.setFromEuler(euler);
}

function animateLimb(ref, t, phase, amplitude) {
  const swing = Math.sin(t * 2.15 + phase) * amplitude;
  setQuat(ref.hip, swing * 0.34, Math.sin(t * 0.8 + phase) * 0.08, ref.side * 0.05);
  setQuat(ref.knee, -0.24 - Math.max(0, swing) * 0.62, 0, ref.side * 0.025);
}

export function animateSilhouetteCreature(refs, time, amplitude = 1) {
  refs.root.position.y = Math.sin(time * 1.7) * 0.022 * amplitude;

  const headYaw = Math.sin(time * 0.58) * 0.58 * amplitude;
  const headPitch = Math.sin(time * 0.37 + 0.8) * 0.12 * amplitude;
  const headRoll = Math.sin(time * 0.43 + 1.7) * 0.055 * amplitude;
  setQuat(refs.neck, headPitch * 0.36, headYaw * 0.32, headRoll * 0.25);
  setQuat(refs.head, headPitch, headYaw, headRoll);

  animateLimb(refs.armL, time, 0, amplitude * 0.35);
  animateLimb(refs.armR, time, Math.PI, amplitude * 0.35);
  animateLimb(refs.legL, time, Math.PI, amplitude * 0.18);
  animateLimb(refs.legR, time, 0, amplitude * 0.18);

  refs.tail.forEach((bone, i) => {
    const u = i / Math.max(1, refs.tail.length - 1);
    const phase = time * 1.15 - i * 0.42;
    const yaw = Math.sin(phase) * (0.18 + u * 0.34) * amplitude;
    const pitch = Math.cos(phase * 0.83) * (0.06 + u * 0.18) * amplitude;
    const roll = Math.sin(phase * 0.57 + 1.1) * (0.04 + u * 0.11) * amplitude;
    setQuat(bone, pitch, yaw, roll);
  });
}
