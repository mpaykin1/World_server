import * as THREE from 'three';
import {
  createSilhouetteCreature,
  animateSilhouetteCreature,
  clonePose
} from '/shared/silhouette-3d/index.mjs';
import { LightPipeline, livingGoldProfile } from '/shared/light/index.mjs';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const colorScene = new THREE.Scene();
const maskScene = new THREE.Scene();
colorScene.background = new THREE.Color(0x000000);
maskScene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0.25, 0.55, 6.8);
camera.lookAt(0, 0.8, 0);

const colorRoot = new THREE.Group();
const maskRoot = new THREE.Group();
colorScene.add(colorRoot);
maskScene.add(maskRoot);

const colorRig = createSilhouetteCreature(colorRoot, { asMask: false, scale: 1.25 });
const maskRig = createSilhouetteCreature(maskRoot, { asMask: true, scale: 1.25 });

const pipeline = new LightPipeline({
  renderer,
  colorScene,
  maskScene,
  camera,
  width: innerWidth,
  height: innerHeight,
  profile: livingGoldProfile
});

let yaw = 0.15;
let pitch = -0.04;
let dragging = false;
let px = 0;
let py = 0;
let last = performance.now();
let elapsed = 0;

function syncRootPose() {
  colorRoot.rotation.set(pitch, yaw, 0);
  maskRoot.rotation.copy(colorRoot.rotation);
  clonePose(colorRig, maskRig);
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;
  animateSilhouetteCreature(colorRig, elapsed, 1);
  syncRootPose();
  pipeline.render(elapsed);
  requestAnimationFrame(frame);
}

function pointerDown(e) {
  dragging = true;
  px = e.clientX;
  py = e.clientY;
  renderer.domElement.setPointerCapture?.(e.pointerId);
}

function pointerMove(e) {
  if (!dragging) return;
  yaw += (e.clientX - px) * 0.008;
  pitch = THREE.MathUtils.clamp(pitch + (e.clientY - py) * 0.006, -0.85, 0.85);
  px = e.clientX;
  py = e.clientY;
}

function pointerUp(e) {
  dragging = false;
  renderer.domElement.releasePointerCapture?.(e.pointerId);
}

renderer.domElement.addEventListener('pointerdown', pointerDown);
renderer.domElement.addEventListener('pointermove', pointerMove);
renderer.domElement.addEventListener('pointerup', pointerUp);
renderer.domElement.addEventListener('pointercancel', pointerUp);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  pipeline.resize(innerWidth, innerHeight);
});

window.LIGHT = { name: 'LIGHT', version: 1, pipeline, profile: livingGoldProfile };
window.Silhouette3DLive = {
  renderer,
  camera,
  colorScene,
  maskScene,
  colorRig,
  maskRig,
  pipeline,
  snapshot() {
    return {
      headQuaternion: colorRig.head.quaternion.toArray(),
      tailQuaternions: colorRig.tail.map(b => b.quaternion.toArray()),
      camera: camera.position.toArray(),
      viewport: [innerWidth, innerHeight]
    };
  }
};

requestAnimationFrame(frame);
