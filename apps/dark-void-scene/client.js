import * as THREE from 'three';
import { VoxelBallEye, MountainWall, BeaconTower, OrbitCameraRig, WORLD_VOX } from '/shared/dark-void-scene-runtime.mjs';
import { NavigatorDialog } from '/shared/navigator-dialog.mjs';
import { DarkVoidManifestation } from '/shared/dark-void-manifestation.mjs';
import { CreatureWorld } from '/shared/creature-visual-runtime.mjs';

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
// Mobile shell scales this real Object3D (portrait -30%) instead of the
// canvas - see DARK_VOID_MOBILE_CONTROLS_PATCH_V2's README "bind the
// real Three.js eye, never the canvas".
window.MobileGameShell?.registerEyeObject(eye.group);

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
// Keyed by e.code (not e.key) so the mobile golden joystick's synthetic
// KeyboardEvents (shared/ai3d-playable-runtime.js's emitKey - it sets
// code:'KeyW' etc, not the arrow names) drive the same path real arrow
// keys do; desktop arrow-key behavior is unchanged since code===key for
// arrow keys either way. See DARK_VOID_MOBILE_CONTROLS_PATCH_V2's
// README "make the binding exact" note.
const FORWARD_CODES = ['ArrowUp', 'KeyW'];
const BACK_CODES = ['ArrowDown', 'KeyS'];
const LEFT_CODES = ['ArrowLeft', 'KeyA'];
const RIGHT_CODES = ['ArrowRight', 'KeyD'];
const keys = new Set();
addEventListener('keydown', e => { keys.add(e.code); });
addEventListener('keyup', e => { keys.delete(e.code); });
const MOVE_SPEED = 5.5;
function updateMovement(dt) {
  let iy = 0, ix = 0;
  if (FORWARD_CODES.some(c => keys.has(c))) iy += 1;
  if (BACK_CODES.some(c => keys.has(c))) iy -= 1;
  if (LEFT_CODES.some(c => keys.has(c))) ix -= 1;
  if (RIGHT_CODES.some(c => keys.has(c))) ix += 1;
  if (!iy && !ix) return;
  const len = Math.hypot(iy, ix) || 1;
  iy /= len; ix /= len;
  const { forward, right } = rig.getForwardRight();
  eye.group.position.addScaledVector(forward, iy * MOVE_SPEED * dt);
  eye.group.position.addScaledVector(right, ix * MOVE_SPEED * dt);
}

// ---- Real world-generation backend: the same deterministic text->shape
// engine as apps/voxel-world (world-command-parser.mjs +
// world-shape-library.mjs - local parsing, no network/LLM call), placing
// actual voxel cubes near the eye instead of just acknowledging the text.
const manifestation = new DarkVoidManifestation({
  scene,
  origin: eye.group.position,
});

// Creature Factory: visible runtime bound to the production LOD policy and 13-category contract.
const creatureWorld = new CreatureWorld({ scene, viewer: eye.group, camera, renderer });
creatureWorld.spawn(26);
window.CreatureFactoryLive = creatureWorld;

// ---- Navigator intro panel (reuse the existing, working component) ----
const navigator = new NavigatorDialog({
  intro: 'Привет. Я твой навигатор по этому миру.\nТут может появиться всё, что ты захочешь.\nИ всё, что в этом мире появится… это тоже будешь ты…',
  onSubmit: text => manifestation.execute(text),
  onUndo: () => manifestation.undo(),
  onRedo: () => manifestation.redo(),
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
  creatureWorld.update(now, dt);
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
      manifestation: manifestation.stats(),
      creatureFactory: creatureWorld.stats(),
    };
  },
  // Exposed for headless/automated verification (requestAnimationFrame
  // doesn't fire for a non-visible tab, so tests need a manual render hook).
  renderOnce() { renderer.render(scene, camera); },
  // rAF doesn't fire for a non-visible/backgrounded tab (same limitation
  // as renderOnce above) - lets automated verification step movement
  // without depending on the real frame loop.
  stepMovement(dt = 0.1) { updateMovement(dt); },
  activeKeys() { return [...keys]; },
  createInWorld(text) { return manifestation.execute(text); },
  renderer, scene, camera, eye, mountain, beacon, rig, manifestation, creatureWorld,
};
