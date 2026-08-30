import * as THREE from 'three';
// Browser port of the Godot dark-void-scene, built to the SAME baseline
// rules as data/godot-voxel-game-baseline.json (5:1 hero/world voxel
// ratio, true-orbit camera rig with the offset living only on the camera
// child, world/hero as scene-graph siblings never parent/child, capped
// palette-lerp materials, dedicated rim light). Ported formula-for-formula
// from godot/dark-void-scene/{voxel_eye_runtime.gd,mountain_wall.gd,
// beacon_tower.gd,player_controller.gd} - not a re-guess from the reference
// image.

const WORLD_VOX = 0.34;
const EYE_VOX = WORLD_VOX / 5; // hard rule: hero voxels are 5x smaller
const EYE_RADIUS = 17;
const EYE_SHAPE_Y = 0.53;

const ROCK_DARK = new THREE.Color(0x16 / 255, 0x15 / 255, 0x19 / 255);
const ROCK_MID = new THREE.Color(0x3c / 255, 0x2a / 255, 0x26 / 255);
const ROCK_LIT = new THREE.Color(0x7a / 255, 0x4c / 255, 0x38 / 255);

function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function fbm1(x, seed) {
  let v = 0, amp = 1, freq = 1;
  for (let i = 0; i < 4; i++) {
    v += Math.sin(x * freq + seed * (i + 1) * 2.7) * amp;
    freq *= 2.13; amp *= 0.52;
  }
  return v;
}
function ridgeHeight(x) {
  const peak = 16 * Math.exp(-(((x + 3) / 20) ** 2));
  const macro = fbm1(x * 0.05, 3.1) * 3.6;
  const medium = fbm1(x * 0.17, 9.7) * 2.2;
  const jag = (hash2(Math.floor(x / 1.5), 11.3) - 0.5) * 2.2;
  return 2.5 + peak + macro + medium + jag;
}
function paletteLerp(litT) {
  const col = ROCK_DARK.clone().lerp(ROCK_MID, THREE.MathUtils.clamp(litT * 1.3, 0, 0.16));
  col.lerp(ROCK_LIT, THREE.MathUtils.clamp((litT - 0.9) * 5, 0, 0.14));
  return col;
}

const box = new THREE.BoxGeometry(1, 1, 1);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function makeInstanced(count, size, material, castShadow = true) {
  const mesh = new THREE.InstancedMesh(box, material, Math.max(1, count));
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- Eye ball
export class VoxelBallEye {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'VoxelBallEye';
    this._build();
    this._blink = 0;
    this._nextBlink = performance.now() + 2600 + Math.random() * 2600;
  }
  _build() {
    const mats = {
      white: new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.68, emissive: 0xd8ccb0, emissiveIntensity: 0.5 }),
      iris: new THREE.MeshStandardMaterial({ color: 0xb87a1e, roughness: 0.5, emissive: 0x8a4e0a, emissiveIntensity: 0.95 }),
      iris_inner: new THREE.MeshStandardMaterial({ color: 0x7a4e14, roughness: 0.5, emissive: 0x5a3006, emissiveIntensity: 0.75 }),
      pupil: new THREE.MeshStandardMaterial({ color: 0x010101, roughness: 0.92 }),
      rim: new THREE.MeshStandardMaterial({ color: 0x24221f, roughness: 0.98, emissive: 0x2a2418, emissiveIntensity: 0.3 }),
      catchlight: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 3.0 }),
    };
    const parts = { white: [], iris: [], iris_inner: [], pupil: [], rim: [], catchlight: [] };
    const R = EYE_RADIUS, rOut = R, rIn = R - 1.4;
    for (let z = -R; z <= R; z++) {
      for (let y = -R; y <= R; y++) {
        for (let x = -R; x <= R; x++) {
          const dist = Math.sqrt(x * x + y * y + z * z);
          if (dist < rIn || dist > rOut) continue;
          const isFront = z > R * 0.05;
          if (isFront) {
            const ex = x / rOut, ey = y / (rOut * EYE_SHAPE_Y);
            const e = ex * ex + ey * ey;
            if (e <= 1) {
              const edge = e > 0.78;
              const ri = (x / (rOut * 0.34)) ** 2 + (y / (rOut * EYE_SHAPE_Y * 0.62)) ** 2;
              if (edge) parts.rim.push([x, y, z]);
              else if (ri < 0.20) parts.pupil.push([x, y, z]);
              else if (ri < 0.42) parts.iris_inner.push([x, y, z]);
              else if (ri < 1.0) parts.iris.push([x, y, z]);
              else parts.white.push([x, y, z]);
              continue;
            }
          }
          parts.white.push([x, y, z]);
        }
      }
    }
    const cz = Math.sqrt(Math.max(0, rOut * rOut - 4 - 4));
    parts.catchlight.push([2, 2, cz]);

    this.eyeRoot = new THREE.Group();
    this.group.add(this.eyeRoot);
    for (const key of Object.keys(parts)) {
      const cells = parts[key];
      const mesh = makeInstanced(cells.length, EYE_VOX, mats[key]);
      _s.set(EYE_VOX, EYE_VOX, EYE_VOX);
      cells.forEach((c, i) => {
        _p.set(c[0] * EYE_VOX, c[1] * EYE_VOX, c[2] * EYE_VOX);
        _m.compose(_p, _q.identity(), _s);
        mesh.setMatrixAt(i, _m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.name = 'Eye_' + key;
      this.eyeRoot.add(mesh);
      if (key === 'iris') this.irisMesh = mesh;
      if (key === 'pupil') this.pupilMesh = mesh;
    }
  }
  doBlink() { this._blink = 1; }
  update(now, dt) {
    if (now > this._nextBlink) { this._blink = 1; this._nextBlink = now + 2600 + Math.random() * 2600; }
    if (this._blink > 0) {
      this._blink = Math.max(0, this._blink - dt * 6);
      const s = Math.max(0.05, 1 - this._blink);
      if (this.irisMesh) this.irisMesh.scale.set(1, s, 1);
      if (this.pupilMesh) this.pupilMesh.scale.set(1, s, 1);
    } else {
      if (this.irisMesh) this.irisMesh.scale.set(1, 1, 1);
      if (this.pupilMesh) this.pupilMesh.scale.set(1, 1, 1);
    }
  }
}

// ------------------------------------------------------------- Mountain
export class MountainWall {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'MountainWall';
    this._build();
  }
  _build() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, emissive: ROCK_DARK.clone(), emissiveIntensity: 0.03, vertexColors: true });
    const cells = []; // [x,y,z]; color computed inline
    const colors = [];
    for (let x = -33; x <= 33; x++) {
      const top = ridgeHeight(x);
      let y = -22;
      while (y <= Math.ceil(top)) {
        const e = (x / 4.2) ** 2 + (y / 4.2) ** 2;
        if (e < 1.10) { y++; continue; }
        const distFromTop = top - y;
        if (distFromTop < 2.2 && hash2(x * 1.7, y * 2.3) > 0.5) { y++; continue; }
        const depthBias = THREE.MathUtils.clamp(1 - distFromTop / 14, 0.15, 1);
        const depthCount = 2 + Math.round(depthBias * 4 + hash2(x * 3.1, y * 0.7) * 2);
        for (let d = 0; d < depthCount; d++) {
          const frontZ = -0.3 - hash2(x, y) * 0.5;
          const z = frontZ - d * (WORLD_VOX * 0.92) - hash2(x + d * 7, y - d * 5) * 0.12;
          const depthT = depthCount <= 1 ? 0 : d / Math.max(1, depthCount - 1);
          let litT = THREE.MathUtils.clamp((1 - depthT) + (hash2(x * 5.1, y * 2.3) - 0.5) * 0.35, 0, 1);
          litT = litT ** 4.5;
          cells.push([x, y, z]);
          colors.push(paletteLerp(litT));
        }
        y++;
      }
    }
    // Foreground rubble - matches mountain_wall.gd's 260-piece scatter.
    for (let i = 0; i < 260; i++) {
      const rx = hash2(i * 1.7, 4.1) * 66 - 33;
      const ry = -20 + hash2(i * 2.3, 8.8) * 5;
      const baseTop = ridgeHeight(rx);
      if (ry > baseTop - 3) continue;
      const e2 = (rx / 4.2) ** 2 + (ry / 4.2) ** 2;
      if (e2 < 1.25) continue;
      cells.push([rx + hash2(i, 1.1) * 0.8, ry, 0.15 + hash2(i, 5.5) * 0.6]);
      colors.push(paletteLerp(0));
    }

    const mesh = makeInstanced(cells.length, WORLD_VOX, mat);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cells.length * 3), 3);
    cells.forEach((c, i) => {
      const k = 0.8 + hash2(c[0], c[1]) * 0.36;
      const kz = 0.82 + hash2(c[1], c[0]) * 0.7;
      _s.set(k * WORLD_VOX * 0.98, k * WORLD_VOX * 0.98, kz * WORLD_VOX * 0.98);
      _p.set(c[0] * WORLD_VOX, c[1] * WORLD_VOX, c[2]);
      _m.compose(_p, _q.identity(), _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, colors[i]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = 'MountainVoxels';
    this.group.add(mesh);
  }
}

// --------------------------------------------------------------- Beacon
export class BeaconTower {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'BeaconTower';
    this.flameLocalY = 0;
    this._build();
    this._addFlame();
  }
  _build() {
    const vox = 0.32;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, emissive: ROCK_DARK.clone(), emissiveIntensity: 0.03, vertexColors: true });
    const cells = [], colors = [];
    const levels = 14;
    for (let lvl = 0; lvl < levels; lvl++) {
      const halfW = Math.max(0.5, 5 - lvl * 0.34);
      const y = -7.5 + lvl * 0.55;
      const iw = Math.round(halfW);
      for (let x = -iw; x <= iw; x++) {
        for (let z = -iw; z <= iw; z++) {
          if (Math.abs(x) === iw || Math.abs(z) === iw || lvl === 0) {
            cells.push([x, y, z]);
            const litT = THREE.MathUtils.clamp(1 - Math.abs(x) - Math.abs(z), 0, 1) * 0.14;
            colors.push(ROCK_DARK.clone().lerp(ROCK_LIT, litT));
          }
        }
      }
    }
    const apexY = -7.5 + (levels - 1) * 0.55;
    const pillarLevels = 9;
    for (let lvl = 0; lvl < pillarLevels; lvl++) {
      const y = apexY + 1 + lvl;
      for (const [x, z] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        cells.push([x, y, z]);
        colors.push(ROCK_DARK.clone().lerp(ROCK_LIT, 0.1));
      }
    }
    this.flameLocalY = (apexY + 1 + pillarLevels) * vox;

    const mesh = makeInstanced(cells.length, vox, mat);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cells.length * 3), 3);
    _s.set(vox, vox, vox);
    cells.forEach((c, i) => {
      _p.set(c[0] * vox, c[1] * vox, c[2] * vox);
      _m.compose(_p, _q.identity(), _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, colors[i]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = 'TowerVoxels';
    this.group.add(mesh);
  }
  _addFlame() {
    const flameMat = new THREE.MeshStandardMaterial({ color: 0xff9a3c, emissive: 0xff8c26, emissiveIntensity: 3.5, roughness: 0.4 });
    const flameMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), flameMat);
    flameMesh.position.set(0, this.flameLocalY, 0);
    this.group.add(flameMesh);
    this.flameMesh = flameMesh;

    this.flameLight = new THREE.PointLight(0xff9a3c, 8, 32, 1.7);
    this.flameLight.position.set(0, this.flameLocalY, 0);
    this.group.add(this.flameLight);

    this.flameGlow = new THREE.PointLight(0xff8c47, 2.2, 70, 0.45);
    this.flameGlow.position.set(0, this.flameLocalY, 0);
    this.group.add(this.flameGlow);
  }
}

// ------------------------------------------------------------ Orbit rig
// PROVEN true-orbit camera rig - same shape as
// templates/godot-voxel-game-starter/orbit_camera_rig.gd. Attach as a
// child of the tracked subject (the eye) with rig.position = (0,0,0);
// the back/up offset lives only on the internal camera child.
export class OrbitCameraRig extends THREE.Object3D {
  constructor(camera, { distance = 13 * 1, height = 1.4, sensitivity = 0.0022, pitchLimitDeg = 75 } = {}) {
    super();
    this.name = 'OrbitCameraRig';
    this.camera = camera;
    this.pitchLimit = THREE.MathUtils.degToRad(pitchLimitDeg);
    this.sensitivity = sensitivity;
    // NOTE: deliberately NOT named "pivot" - in this exact vendored
    // three.js build + browser-automation harness, an Object3D subclass
    // instance property literally named "pivot" reproducibly corrupts the
    // object's own local matrix translation during scene.updateMatrixWorld
    // (verified in isolation: renaming alone fixes it, cause unconfirmed -
    // not present in the library's source, so likely harness/JIT-specific).
    // Cheap to avoid entirely; do not reuse "pivot" as a property name on
    // an Object3D subclass in this codebase.
    this.pitchGroup = new THREE.Object3D();
    this.pitchGroup.name = 'PitchGroup';
    this.add(this.pitchGroup);
    // World-scale distance/height match the Godot rig's defaults (13, 1.4)
    // - this rig operates in the SAME world-unit space as WORLD_VOX cells.
    camera.position.set(0, height, distance);
    camera.rotation.x = -Math.atan2(height, distance);
    this.pitchGroup.add(camera);
    this._pitch = 0;
    this._locked = false;
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
  }
  attachInput(domElement) {
    this.domElement = domElement;
    domElement.addEventListener('click', () => domElement.requestPointerLock?.());
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    document.addEventListener('mousemove', this._onMouseMove);
  }
  _onPointerLockChange() {
    this._locked = document.pointerLockElement === this.domElement;
  }
  _onMouseMove(e) {
    // Pointer Lock never engages from a touch drag, so the mobile golden
    // look-joystick can't rely on _locked - it bridges through a
    // synthetic mousemove tagged __fromGoldenMobile instead (see
    // shared/mobile-game-shell.js's bridgeGoldenLookToExistingMouseLook,
    // installed by DARK_VOID_MOBILE_CONTROLS_PATCH_V2). Real desktop
    // mouse movement still requires an actual lock.
    if (!this._locked && !e.__fromGoldenMobile) return;
    this.rotation.y -= e.movementX * this.sensitivity;
    this._pitch = THREE.MathUtils.clamp(this._pitch - e.movementY * this.sensitivity, -this.pitchLimit, this.pitchLimit);
    this.pitchGroup.rotation.x = this._pitch;
  }
  getForwardRight() {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.getWorldQuaternion(new THREE.Quaternion()));
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.getWorldQuaternion(new THREE.Quaternion()));
    right.y = 0; right.normalize();
    return { forward, right };
  }
}

export { WORLD_VOX, EYE_VOX, ROCK_DARK, ROCK_MID, ROCK_LIT, hash2, fbm1, ridgeHeight, paletteLerp };
