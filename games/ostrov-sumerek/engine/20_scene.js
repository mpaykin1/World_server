/* -----------------------------------------------------------------------------
   6 · Renderer, scene, textures
----------------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const canvas = $('c');
const loadingEl = $('loading');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1 && matchMedia('(hover: none)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
} catch (err) {
  loadingEl.textContent = 'Нужен браузер с поддержкой WebGL — без него остров не поднимется.';
  throw err;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.02);
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 900);

function loadTexture(uri) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const t = new THREE.Texture(img);
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
      t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
      resolve(t);
    };
    img.onerror = reject;
    img.src = uri;
  });
}
const [atlasTex, coinTex, heartTex, waterTex, weaponsTex] =
  await Promise.all([ASSETS.atlas, ASSETS.coin, ASSETS.hearts, ASSETS.water, ASSETS.weapons].map(loadTexture));
// one texture per character sheet (packs/*/art @hero); heroTex is the one on the hero right now
const HERO_TEX = {};
await Promise.all(Object.entries(ASSETS.heroes || { wanderer: ASSETS.hero }).map(async ([k, u]) => { HERO_TEX[k] = await loadTexture(u); }));
let heroTex = HERO_TEX.wanderer || Object.values(HERO_TEX)[0];
document.documentElement.style.setProperty('--img-hearts', `url("${ASSETS.hearts}")`);
document.documentElement.style.setProperty('--img-coin', `url("${ASSETS.coin}")`);

// uniforms shared by many materials (one write per frame updates all of them)
const U = {
  time: { value: 0 },
  right: { value: new THREE.Vector3(1, 0, 0) },      // camera right, horizontal (cylindrical billboards)
  camRight: { value: new THREE.Vector3(1, 0, 0) },   // camera right (spherical billboards)
  camUp: { value: new THREE.Vector3(0, 1, 0) },
  pScale: { value: 400 },                             // pixels per world unit at distance 1
  fogD: { value: 0.02 },
};
function fogShader(opts) {
  const uniforms = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  Object.assign(uniforms, opts.uniforms);
  return new THREE.ShaderMaterial({ ...opts, uniforms, fog: true });
}
function makeInstGeo(base, count, attrs) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.attributes.position);
  g.setAttribute('uv', base.attributes.uv);
  const out = {};
  for (const name in attrs) {
    const [arr, size] = attrs[name];
    const a = new THREE.InstancedBufferAttribute(arr, size);
    a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, a); out[name] = a;
  }
  g.instanceCount = count;
  return { geo: g, attrs: out };
}

/* -----------------------------------------------------------------------------
   7 · Scene objects
----------------------------------------------------------------------------- */
// sky dome (follows the camera)
const skyU = {
  uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
  uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 0.2, -1) }, uMoonDir: { value: new THREE.Vector3(0, 0.6, 1) },
  uTime: U.time, uNight: { value: 0 }, uSunVis: { value: 1 },
  uAurora: { value: 0 }, uAuroraA: { value: new THREE.Color('#3dffa8') }, uAuroraB: { value: new THREE.Color('#b56bff') },
};
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16),
  new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false }));
sky.renderOrder = -10; sky.frustumCulled = false;
scene.add(sky);

// lights: hemisphere + key (sun / moon) + companion wisp + beacon
const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1.5);
const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.target.position.set(W / 2, 0, D / 2);
const wispLight = new THREE.PointLight(0xffcf7a, 0, 12, 1.3);
const beaconLight = new THREE.PointLight(0xffa04a, 0, 60, 1.05);
// two short-lived lights for muzzle flashes, explosions, slams (always in the scene: a stable light count keeps Lambert from recompiling)
const flashLights = [new THREE.PointLight(0xffc070, 0, 9, 1.4), new THREE.PointLight(0xffc070, 0, 9, 1.4)];
scene.add(hemi, keyLight, keyLight.target, wispLight, beaconLight, ...flashLights);

// terrain material (mesh is rebuilt per island)
const terrainMat = new THREE.MeshLambertMaterial({ map: atlasTex, vertexColors: true });
const cutU = { uCutA: { value: new THREE.Vector3() }, uCutB: { value: new THREE.Vector3() }, uCutR: { value: 1.9 }, uCutOn: { value: 0 } };
terrainMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, cutU);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aCut;\nvarying float vCut;\nvarying vec3 vWPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCut = aCut;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
uniform vec3 uCutA, uCutB; uniform float uCutR, uCutOn;
varying float vCut; varying vec3 vWPos;
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }`)
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (vCut > 0.5 && uCutOn > 0.0) {
    vec3 pa = vWPos - uCutA, ba = uCutB - uCutA;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float k = (1.0 - smoothstep(uCutR * 0.55, uCutR, length(pa - ba * h))) * step(0.03, h) * uCutOn;
    if (bayer4(gl_FragCoord.xy) < k * 0.92) discard;
  }`);
};

// water
const waterU = {
  uTex: { value: waterTex }, uHeight: { value: null }, uTime: U.time, uSea: { value: SEA },
  uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() }, uFoam: { value: new THREE.Color() },
  uSky: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uRipples: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0)) },
};
const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2),
  fogShader({ uniforms: waterU, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false }));
water.position.set(W / 2, SEA, D / 2);
water.renderOrder = 1;
scene.add(water);
let rippleIdx = 0;
function ripple(x, z, strength = 1) {
  const r = waterU.uRipples.value[rippleIdx++ % 8];
  r.set(x, z, U.time.value, strength);
}

// low sea mist: three drifting layers, cleared where the ground rises above them
const mistColor = new THREE.Color();
const mistAlpha = { value: 0.2 };
const mists = [[0.12, 0.012, 0.006], [0.55, -0.009, 0.011], [1.0, 0.007, -0.01]].map(([dy, ax, az], k) => {
  const u = { uHeight: { value: null }, uTime: U.time, uAlpha: mistAlpha, uLayer: { value: SEA + dy }, uColor: { value: mistColor }, uDrift: { value: new THREE.Vector2(ax, az) } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(180, 180).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: u, vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthWrite: false }));
  m.position.set(W / 2, SEA + dy, D / 2);
  m.renderOrder = 8 + k;
  scene.add(m);
  return m;
});

// hero billboard (Lambert so the dusk light and the wisp's glow touch it like the terrain)
const heroGeo = new THREE.PlaneGeometry(1, 1.5);
heroGeo.translate(0, 0.75, 0);
{ const n = heroGeo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 0.55, 0.835); }
const heroMat = new THREE.MeshLambertMaterial({ map: heroTex, emissive: 0xffffff, emissiveMap: heroTex, emissiveIntensity: 0.12, alphaTest: 0.5 });
const hero = new THREE.Mesh(heroGeo, heroMat);
hero.rotation.order = 'YXZ';
hero.renderOrder = 2;
scene.add(hero);
function setHeroFrame(f, facing) {
  const w = 1 / 6, e = w * 0.002;
  if (facing >= 0) { heroTex.repeat.x = w - 2 * e; heroTex.offset.x = f * w + e; }
  else { heroTex.repeat.x = -(w - 2 * e); heroTex.offset.x = (f + 1) * w - e; }
}
setHeroFrame(4, 1);
const shadowU = { uA: { value: 0.5 } };
const heroShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  new THREE.ShaderMaterial({ uniforms: shadowU, vertexShader: UV_VERT, fragmentShader: SHADOW_FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
heroShadow.renderOrder = 2;
scene.add(heroShadow);

// pickups: coins (spin strip) and hearts — instanced billboards, + additive halos and light beams for coins
const pickupMat = (map, frames, cells, fps, size, glow, bob) => fogShader({
  uniforms: { uMap: { value: map }, uTime: U.time, uRight: U.right, uFrames: { value: frames }, uCells: { value: cells }, uFps: { value: fps }, uBob: { value: bob }, uSize: { value: size }, uGlow: { value: glow } },
  vertexShader: PICK_VERT, fragmentShader: PICK_FRAG,
});
const coinMat = pickupMat(coinTex, 4, 4, 8, 0.95, 1.2, 0.12);
const heartMat = pickupMat(heartTex, 1, 3, 0, 0.9, 0.5, 0.1);
const glowMat = (frag, size, bob, color, intensity) => fogShader({
  uniforms: { uTime: U.time, uRight: U.right, uFrames: { value: 1 }, uCells: { value: 1 }, uFps: { value: 0 }, uBob: { value: bob }, uSize: { value: size }, uColor: { value: new THREE.Color(...color) }, uIntensity: { value: intensity } },
  vertexShader: PICK_VERT, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const coinHaloMat = glowMat(HALO_FRAG, 2.6, 0.12, [1.0, 0.68, 0.22], 0.35);
const coinBeamMat = glowMat(BEAM_FRAG, 1.0, 0.0, [1.0, 0.78, 0.35], 0.2);
const heartHaloMat = glowMat(HALO_FRAG, 2.2, 0.1, [1.0, 0.25, 0.3], 0.3);
const beamBase = new THREE.PlaneGeometry(0.5, 7); beamBase.translate(0, 3.0, 0);
const quadBase = new THREE.PlaneGeometry(1, 1);
let coinObj = null, heartObj = null;     // rebuilt per island

// particle pools: additive glow + normal-blended dust/smoke
class Particles {
  constructor(max, blending, order) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.c = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.s = new Float32Array(max); this.a = new Float32Array(max); this.sh = new Float32Array(max);
    this.life = new Float32Array(max); this.full = new Float32Array(max); this.g = new Float32Array(max);
    this.dr = new Float32Array(max); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max);
    this.fl = new Float32Array(max);          // floor height for particles that bounce (casings, chips, leaves); -1e9 = none
    const geo = new THREE.BufferGeometry();
    const mk = (arr, n) => { const at = new THREE.BufferAttribute(arr, n); at.setUsage(THREE.DynamicDrawUsage); return at; };
    this.attrs = [mk(this.p, 3), mk(this.c, 3), mk(this.s, 1), mk(this.a, 1), mk(this.sh, 1)];
    ['position', 'aColor', 'aSize', 'aAlpha', 'aShape'].forEach((nm, i) => geo.setAttribute(nm, this.attrs[i]));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uScale: U.pScale, uFogD: U.fogD }, vertexShader: PART_VERT, fragmentShader: PART_FRAG,
      transparent: true, depthWrite: false, blending,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = order;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, col, alpha, grav = 0, drag = 0, shape = 0, floor = false) {
    if (this.n >= this.max) return;
    const i = this.n++, i3 = i * 3;
    this.fl[i] = floor ? Math.max(groundBelow(x, y + 0.2, z), SEA - 0.05) : -1e9;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.c[i3] = col.r; this.c[i3 + 1] = col.g; this.c[i3 + 2] = col.b;
    this.life[i] = life; this.full[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.s[i] = s0;
    this.a0[i] = alpha; this.a[i] = alpha; this.g[i] = grav; this.dr[i] = drag; this.sh[i] = shape;
  }
  spark(x, y, z, size, col, alpha, shape = 0) { this.emit(x, y, z, 0, 0, 0, 1e-4, size, size, col, alpha, 0, 0, shape); }
  kill(i) {
    const j = --this.n;
    if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    for (const arr of [this.p, this.c, this.v]) { arr[i3] = arr[j3]; arr[i3 + 1] = arr[j3 + 1]; arr[i3 + 2] = arr[j3 + 2]; }
    for (const arr of [this.s, this.a, this.sh, this.life, this.full, this.g, this.dr, this.s0, this.s1, this.a0, this.fl]) arr[i] = arr[j];
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const i3 = i * 3, t = this.life[i] / this.full[i];
      const k = 1 / (1 + this.dr[i] * dt);
      this.v[i3 + 1] -= this.g[i] * dt;
      this.v[i3] *= k; this.v[i3 + 1] *= k; this.v[i3 + 2] *= k;
      this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
      if (this.p[i3 + 1] < this.fl[i]) {      // tumble to rest on the ground
        this.p[i3 + 1] = this.fl[i];
        this.v[i3 + 1] = Math.abs(this.v[i3 + 1]) > 1.2 ? -this.v[i3 + 1] * 0.35 : 0;
        this.v[i3] *= 0.6; this.v[i3 + 2] *= 0.6;
      }
      this.s[i] = lerp(this.s1[i], this.s0[i], t);
      this.a[i] = this.a0[i] * Math.min(1, t * 3);
      i++;
    }
  }
  flush() {
    this.geo.setDrawRange(0, this.n);
    for (const a of this.attrs) a.needsUpdate = true;
  }
  clear() { this.n = 0; }
}
const glow = new Particles(2400, THREE.AdditiveBlending, 14);
const dust = new Particles(1200, THREE.NormalBlending, 13);

// fireflies (night) + golden motes (dusk): GPU-animated points
const FLIES = 640;
const flyGeo = new THREE.BufferGeometry();
const flyBase = new Float32Array(FLIES * 3), flyPhase = new Float32Array(FLIES), flyKind = new Float32Array(FLIES), flySpeed = new Float32Array(FLIES);
for (let i = 0; i < FLIES; i++) { flyPhase[i] = Math.random(); flyKind[i] = i < 260 ? 1 : 0; flySpeed[i] = rr(0.6, 1.3); }
flyGeo.setAttribute('position', new THREE.BufferAttribute(flyBase, 3));
flyGeo.setAttribute('aPhase', new THREE.BufferAttribute(flyPhase, 1));
flyGeo.setAttribute('aKind', new THREE.BufferAttribute(flyKind, 1));
flyGeo.setAttribute('aSpeed', new THREE.BufferAttribute(flySpeed, 1));
const flyU = { uTime: U.time, uScale: U.pScale, uFogD: U.fogD, uFly: { value: 0 }, uMote: { value: 1 }, uFlyCol: { value: new THREE.Color(0.75, 1.0, 0.35).multiplyScalar(2.2) }, uMoteCol: { value: new THREE.Color(1.0, 0.82, 0.55) } };
const flies = new THREE.Points(flyGeo, new THREE.ShaderMaterial({ uniforms: flyU, vertexShader: FLY_VERT, fragmentShader: FLY_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
flies.frustumCulled = false; flies.renderOrder = 15;
scene.add(flies);

// beacon: pixel flame, goal ring, two lighthouse beams
const flameU = { uTime: U.time, uLevel: { value: 0.1 }, uRight: U.right, uSize: { value: new THREE.Vector2(0.9, 1.4) } };
const flameGeo = new THREE.PlaneGeometry(1, 1); flameGeo.translate(0, 0.5, 0);
const flame = new THREE.Mesh(flameGeo, new THREE.ShaderMaterial({ uniforms: flameU, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
flame.frustumCulled = false; flame.renderOrder = 16;
scene.add(flame);
const ringU = { uTime: U.time, uOn: { value: 0 } };
const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.2, 48, 1), new THREE.ShaderMaterial({ uniforms: ringU, vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
ring.rotation.x = -Math.PI / 2; ring.renderOrder = 7;
scene.add(ring);
const lbeamGeo = new THREE.CylinderGeometry(6.5, 0.28, 46, 24, 1, true);
lbeamGeo.translate(0, 23, 0); lbeamGeo.rotateZ(-Math.PI / 2);
const lbeamU = { uI: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.82, 0.5) } };
const lbeamMat = new THREE.ShaderMaterial({ uniforms: lbeamU, vertexShader: LBEAM_VERT, fragmentShader: LBEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const lbeams = new THREE.Group();
for (let k = 0; k < 2; k++) { const m = new THREE.Mesh(lbeamGeo, lbeamMat); m.rotation.y = k * Math.PI; m.frustumCulled = false; m.renderOrder = 17; lbeams.add(m); }
scene.add(lbeams);
