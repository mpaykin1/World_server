/* -----------------------------------------------------------------------------
   10 · State
----------------------------------------------------------------------------- */
const DEFAULT_SEED = 1337;
const DEFAULT_BIOME = 'dusk';
const G = {
  state: 'loading', biome: DEFAULT_BIOME, time: 0, play: 0, collected: 0, total: 20, hits: 0, seed: DEFAULT_SEED, sunAz: 0,
  tod: 0.04, todT: 0.04, dawn: 0, danger: 0, dangerT: 0, hurt: 0, blip: 0, blipT: 8, flash: 0, fade: 0, desat: 0, bars: 0.08,
  all: false, endT: 0, timeScale: 1, idle: 0, combo: 0, comboT: 0, beatT: 0, toastT: 0, focus: 0.5,
  firstShade: false, warnedWater: false, toastP: 0, best: null, newBest: false, timerT: 0, mmT: 0,
  hitstop: 0, kills: 0, spawnT: 2, wardenSpawned: false, wardenDown: false, warden: null, wardenT: 1.5, bossCam: 0,
};
let world = null, heightTex = null;
const C = {
  gold: new THREE.Color(1.0, 0.72, 0.18).multiplyScalar(2.4), goldHot: new THREE.Color(1, 0.95, 0.7).multiplyScalar(3),
  ember: new THREE.Color(1.0, 0.42, 0.1).multiplyScalar(3), wispCore: new THREE.Color(1, 0.94, 0.72).multiplyScalar(4),
  wispHalo: new THREE.Color(1, 0.7, 0.28).multiplyScalar(1.5), eye: new THREE.Color(1, 0.3, 0.95).multiplyScalar(4),
  eyeGlow: new THREE.Color(0.7, 0.15, 1).multiplyScalar(1.3), smoke: new THREE.Color(0.05, 0.02, 0.09),
  spray: new THREE.Color(0.82, 0.93, 1.0), sand: new THREE.Color('#d9bf86'), dirt: new THREE.Color('#7a5236'),
  heart: new THREE.Color(1, 0.3, 0.35).multiplyScalar(2.6), violet: new THREE.Color(0.75, 0.25, 1).multiplyScalar(2.6),
};
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3(), tmpE = new THREE.Vector3();

/* -----------------------------------------------------------------------------
   11 · Voxel queries
----------------------------------------------------------------------------- */
function blockAt(x, y, z) {
  if (y < 0) return B.STONE;
  if (x < 0 || z < 0 || x >= W || z >= D || y >= H) return 0;
  return world.vox[x + W * (z + D * y)];
}
const solidAt = (x, y, z) => blockAt(x, y, z) !== 0;
function boxSolid(x0f, y0f, z0f, x1f, y1f, z1f) {
  const x0 = Math.floor(x0f), x1 = Math.floor(x1f - 1e-7), y0 = Math.floor(y0f), y1 = Math.floor(y1f - 1e-7), z0 = Math.floor(z0f), z1 = Math.floor(z1f - 1e-7);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (solidAt(x, y, z)) return true;
  return false;
}
const PL = { halfW: 0.27, height: 1.35, speed: 4.7, accG: 16, accA: 5, grav: 30, jumpV: 11.6 };
const hits = (px, py, pz) => boxSolid(px - PL.halfW, py, pz - PL.halfW, px + PL.halfW, py + PL.height, pz + PL.halfW);
function groundBelow(px, py, pz) {
  const x = Math.floor(px), z = Math.floor(pz);
  for (let y = Math.min(H - 1, Math.floor(py)); y >= 0; y--) if (solidAt(x, y, z)) return y + 1;
  return 0;
}
function terrainTop(px, pz) {
  const x = Math.floor(px), z = Math.floor(pz);
  if (x < 0 || z < 0 || x >= W || z >= D) return 1;
  return world.hgt[x + z * W];
}
function rayFree(o, d, maxT) {
  for (let t = 0.9; t < maxT; t += 0.2) {
    const b = blockAt(Math.floor(o.x + d.x * t), Math.floor(o.y + d.y * t), Math.floor(o.z + d.z * t));
    if (b && !BLK[b].leafy) return Math.max(2.6, t - 0.45);
  }
  return maxT;
}
