import * as THREE from 'three';
import { VoxelBallEye, MountainWall, BeaconTower, OrbitCameraRig, WORLD_VOX } from '/shared/dark-void-scene-runtime.mjs';
import { NavigatorDialog } from '/shared/navigator-dialog.mjs';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020201);
scene.fog = new THREE.FogExp2(0x0a0603, 0.05);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.05, 300);

// ---- World (static) - siblings, never parented under the hero ----
const mountain = new MountainWall();
mountain.group.position.set(0, 0.5, 10);
scene.add(mountain.group);

const beacon = new BeaconTower();
beacon.group.position.set(26, 1.5, -22);
scene.add(beacon.group);

// ---- Hero: the eye, free to move ----
const eye = new VoxelBallEye();
eye.group.position.set(0, 0.5, 10); // starts embedded-looking at the mountain's socket
scene.add(eye.group);

const rig = new OrbitCameraRig(camera, { distance: 13, height: 1.4 });
eye.group.add(rig); // rig position stays (0,0,0) - see OrbitCameraRig docstring
rig.attachInput(renderer.domElement);

// ---- Lighting: dim ambient + dedicated rim/key light (no sun-disc risk
// in three.js since there's no procedural-sky sun-disc feature here) ----
scene.add(new THREE.AmbientLight(0x0a0806, 1.2));
const rim = new THREE.DirectionalLight(0xbf9e6b, 0.9);
rim.position.set(-10, 14, 6);
rim.target.position.set(0, 0, 10);
scene.add(rim); scene.add(rim.target);
const eyeFill = new THREE.SpotLight(0xa6b3f2, 3.2, 40, THREE.MathUtils.degToRad(35), 0.5);
eyeFill.position.set(2, 6, 25);
eyeFill.target.position.set(0, 0, 10);
scene.add(eyeFill); scene.add(eyeFill.target);

// ---- Movement: the eye moves relative to the rig's current facing ----
const keys = new Set();
addEventListener('keydown', e => { keys.add(e.key); });
addEventListener('keyup', e => { keys.delete(e.key); });
const MOVE_SPEED = 5.5;
function updateMovement(dt) {
  let iy = 0, ix = 0;
  if (keys.has('ArrowUp')) iy += 1;
  if (keys.has('ArrowDown')) iy -= 1;
  if (keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('ArrowRight')) ix += 1;
  if (!iy && !ix) return;
  const len = Math.hypot(iy, ix) || 1;
  iy /= len; ix /= len;
  const { forward, right } = rig.getForwardRight();
  eye.group.position.addScaledVector(forward, iy * MOVE_SPEED * dt);
  eye.group.position.addScaledVector(right, ix * MOVE_SPEED * dt);
}

// ---- Navigator intro panel (reuse the existing, working component) ----
const navigator = new NavigatorDialog({
  intro: 'Привет. Я твой навигатор по этому миру.\nТут может появиться всё, что ты захочешь.\nИ всё, что в этом мире появится… это тоже будешь ты…',
  onEyeMode: () => 'idle',
});
navigator.setStatus('');

document.getElementById('dvLoading')?.classList.add('hidden');

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updateMovement(dt);
  eye.update(now, dt);
  const pulse = 0.86 + 0.14 * Math.sin(now * 0.0021);
  if (beacon.flameLight) beacon.flameLight.intensity = 8 * pulse;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

window.DarkVoidSceneRuntime = {
  stats() {
    return {
      eyePos: eye.group.position.toArray(),
      mountainPos: mountain.group.position.toArray(),
      beaconPos: beacon.group.position.toArray(),
      worldVox: WORLD_VOX,
    };
  },
  // Exposed for headless/automated verification (requestAnimationFrame
  // doesn't fire for a non-visible tab, so tests need a manual render hook).
  renderOnce() { renderer.render(scene, camera); },
  renderer, scene, camera, eye, mountain, beacon, rig,
};
