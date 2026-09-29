import * as THREE from "three";
import {GLTFLoader} from "https://unpkg.com/three@0.165.0/examples/jsm/loaders/GLTFLoader.js";
import {validVoxelManifest} from "../../shared/graphics/voxel-art-contract.mjs";

const stage = document.getElementById("stage");
const status = document.getElementById("status");
const root = "/apps/voxel-world/voxel-art/";
const mobile = matchMedia("(pointer:coarse)").matches;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91bad0);
const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 120);
const renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: "low-power"});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.2 : 1.65));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xcde6f9, 0x465a35, 2.3));
const sunlight = new THREE.DirectionalLight(0xffe3ad, 3);
sunlight.position.set(5, 12, 8);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(1024, 1024);
sunlight.shadow.camera.left = -12;
sunlight.shadow.camera.right = 12;
sunlight.shadow.camera.top = 12;
sunlight.shadow.camera.bottom = -12;
scene.add(sunlight);
const loader = new GLTFLoader();
const cache = new Map();
let manifest = null;
let current = null;
let villager = null;
let mixers = [];
let phase = 0;
let drag = null;
let yaw = -.65, elevation = .60;
let activeKind = "barren";
const clock = new THREE.Clock();

function resize() {
  const w = innerWidth, h = innerHeight;
  const aspect = w / h, span = mobile ? 5.8 : 5.3;
  camera.left = -span * aspect;
  camera.right = span * aspect;
  camera.top = span;
  camera.bottom = -span;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
addEventListener("resize", resize);
resize();

function orbit() {
  const dist = 15;
  camera.position.set(Math.sin(yaw) * dist * Math.cos(elevation),
    5 + Math.sin(elevation) * dist, Math.cos(yaw) * dist * Math.cos(elevation));
  camera.lookAt(0, 1.4, 0);
}
orbit();
renderer.domElement.addEventListener("pointerdown", e => {
  drag = {id: e.pointerId, x: e.clientX, y: e.clientY};
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener("pointermove", e => {
  if (!drag || drag.id !== e.pointerId) return;
  yaw -= (e.clientX - drag.x) * .008;
  elevation = Math.max(.16, Math.min(1.2, elevation - (e.clientY - drag.y) * .006));
  drag.x = e.clientX; drag.y = e.clientY;
  orbit();
});
renderer.domElement.addEventListener("pointerup", () => { drag = null; });
renderer.domElement.addEventListener("pointercancel", () => { drag = null; });

async function get(kind) {
  if (!cache.has(kind)) {
    if (!manifest.has(kind)) throw new Error("Отсутствует модель: " + kind);
    cache.set(kind, loader.loadAsync(root + manifest.get(kind).file)
      .catch(error => { cache.delete(kind); throw error; }));
  }
  return cache.get(kind);
}
async function show(kind) {
  if (!manifest || !manifest.has(kind)) return;
  const requested = kind;
  activeKind = kind;
  status.textContent = "Создаём " + kind + "…";
  try {
    const [asset, walker] = await Promise.all([get(kind), get("villager")]);
    if (activeKind !== requested) return;
    if (current) scene.remove(current);
    if (villager) scene.remove(villager);
    mixers.forEach(m => m.stopAllAction());
    mixers = [];
    current = asset.scene.clone(true);
    current.traverse(node => {
      if (node.isMesh) {node.castShadow = !mobile; node.receiveShadow = true;}
    });
    scene.add(current);
    if (kind !== "volcano") {
      villager = walker.scene.clone(true);
      villager.position.set(-3, .45, 2.4);
      villager.scale.setScalar(.58);
      scene.add(villager);
    } else villager = null;
    if (asset.animations.length) {
      const mixer = new THREE.AnimationMixer(current);
      for (const clip of asset.animations) mixer.clipAction(clip).play();
      mixers.push(mixer);
    }
    const meta = manifest.get(kind);
    status.textContent = kind + " · " + Math.round(meta.bytes / 1024) +
      " КБ · " + meta.triangles + " треугольников · " +
      (meta.clips.join(", ") || "без клипов");
    document.querySelectorAll("button[data-kind]").forEach(b => {
      b.setAttribute("aria-pressed", String(b.dataset.kind === kind));
    });
  } catch (error) {
    status.textContent = "Ошибка модели: " + error.message;
  }
}
document.getElementById("choices").addEventListener("click", event => {
  const kind = event.target.closest("button[data-kind]")?.dataset.kind;
  if (kind) show(kind);
});
async function start() {
  try {
    const response = await fetch(root + "manifest.json");
    if (!response.ok) throw new Error("manifest HTTP " + response.status);
    const data = await response.json();
    if (!validVoxelManifest(data)) throw new Error("Некорректный манифест");
    manifest = new Map(data.entities.map(asset => [asset.type, asset]));
    await show("barren");
  } catch (error) { status.textContent = "Не удалось загрузить библиотеку: " + error.message; }
}
function frame() {
  const dt = Math.min(clock.getDelta(), .05);
  phase += dt;
  mixers.forEach(m => m.update(dt));
  if (villager) {
    villager.position.x = -2.7 + Math.sin(phase * .6) * 1.5;
    villager.rotation.y = Math.cos(phase * .6) >= 0 ? .35 : Math.PI - .35;
    villager.rotation.z = Math.sin(phase * 7) * .025;
  }
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);
start();
