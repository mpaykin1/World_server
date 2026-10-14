/* =============================================================================
   86 · Weather and world events.
        Precipitation is one THREE.Points cloud animated entirely in the vertex shader
        (flakes wrap around the camera — no per-particle CPU work). The biome sets the
        everyday weather; an event (storm, blizzard …) takes over for a while and blends
        its own palette, post levers and spawn pressure in by its intensity.
============================================================================= */
const PRECIP_N = 2600;
const PRECIP_VERT = /* glsl */`
attribute float aRnd;
uniform float uTime, uFall, uSway, uSize, uScale, uDensity, uBox, uFogD;
uniform vec3 uCenter, uDrift;
varying float vA; varying float vR;
void main() {
  vec3 p = position * uBox;
  float sp = 0.7 + 0.6 * aRnd;
  p.y -= uTime * uFall * sp;
  p.xz += uDrift.xz * sp;                                         // wind, integrated on the CPU (gusts never jolt)
  p.x += sin(uTime * 1.3 + aRnd * 40.0) * uSway;
  p.z += cos(uTime * 1.1 + aRnd * 31.0) * uSway;
  vec3 wp = uCenter + mod(p - uCenter, uBox) - uBox * 0.5;     // an endless field wrapped around the camera
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = max(-mv.z, 0.1);
  float on = step(aRnd, uDensity);
  gl_PointSize = on * clamp(uSize * uScale / d, 1.0, 48.0);
  vA = on * exp(-uFogD * uFogD * d * d * 0.55) * smoothstep(0.8, 3.0, d);
  vR = aRnd;
}`;
const PRECIP_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uAlpha, uShape;
varying float vA; varying float vR;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float a;
  if (uShape < 0.5) a = pow(max(0.0, 1.0 - length(p)), 1.4);                          // soft flake / mote
  else if (uShape < 1.5) a = step(abs(p.x), 0.07) * (1.0 - smoothstep(0.35, 1.0, abs(p.y))) * (0.6 + 0.4 * vR);   // rain streak
  else { vec2 q = abs(p); a = step(max(q.x, q.y * 1.4), 0.5 + 0.3 * vR); }            // ash flake
  a *= vA * uAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;
const precipU = {
  uTime: U.time, uFall: { value: 1 }, uSway: { value: 0.5 }, uSize: { value: 0.08 }, uScale: U.pScale, uDensity: { value: 0 },
  uBox: { value: 34 }, uFogD: U.fogD, uCenter: { value: new THREE.Vector3() }, uDrift: { value: new THREE.Vector3() },
  uColor: { value: new THREE.Color('#ffffff') }, uAlpha: { value: 0.8 }, uShape: { value: 0 },
};
const precip = (() => {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(PRECIP_N * 3), rnd = new Float32Array(PRECIP_N);
  for (let i = 0; i < PRECIP_N; i++) { pos[i * 3] = Math.random(); pos[i * 3 + 1] = Math.random(); pos[i * 3 + 2] = Math.random(); rnd[i] = Math.random(); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: precipU, vertexShader: PRECIP_VERT, fragmentShader: PRECIP_FRAG, transparent: true, depthWrite: false }));
  m.frustumCulled = false; m.renderOrder = 15; m.visible = false;
  scene.add(m);
  return m;
})();
const weather = { kind: null, level: 0, target: null, wind: new THREE.Vector3(), cur: new THREE.Vector3() };
// event state: one at a time; intensity eases in and out
const EVT = { cur: null, k: 0, lin: 0, t: 0, dur: 0, cool: 20, checkT: 8, ending: false };
function eventsReset() {
  if (EVT.cur && EVT.cur.onEnd) EVT.cur.onEnd();
  EVT.cur = null; EVT.k = EVT.lin = 0; EVT.t = 0; EVT.cool = 25; EVT.checkT = 8; EVT.ending = false;
}
function startEvent(ev) {
  EVT.cur = ev; EVT.t = 0; EVT.ending = false;
  EVT.dur = Array.isArray(ev.duration) ? rr(ev.duration[0], ev.duration[1]) : ev.duration ?? 30;
  if (ev.toast) toast(ev.toast, 3200, !!ev.warn, 1);
  if (ev.onStart) ev.onStart();
  emit('event', ev, true);
}
function forceEvent(id, instant = true) {
  const ev = REG.events.get(id);
  if (!ev) return false;
  if (EVT.cur) endEvent();
  startEvent(ev);
  if (instant) EVT.k = EVT.lin = 1;
  return true;
}
function endEvent() {
  const ev = EVT.cur;
  if (!ev) return;
  if (ev.onEnd) ev.onEnd();
  emit('event', ev, false);
  EVT.cur = null; EVT.cool = ev.cooldown ?? 60; EVT.k = EVT.lin = 0;
}
function eventAllowed(ev) {
  if (ev.biomes && !ev.biomes.includes(G.biome)) return false;
  const bev = (REG.biomes.get(G.biome) || {}).events;              // a biome may list its events explicitly
  if (bev && !bev.includes(ev.id)) return false;
  return !ev.when || ev.when(spawnCtx());
}
// spawn pressure of the running event, eased by its intensity: spawnMul is a number or { foeId: mul }
function eventSpawnMul(def) {
  const ev = EVT.cur;
  if (!ev || !ev.spawnMul || EVT.k <= 0) return 1;
  const m = typeof ev.spawnMul === 'number' ? ev.spawnMul : ev.spawnMul[def.id] ?? 1;
  return lerp(1, m, EVT.k);
}
// sound beds: the biome's ambience, blended toward the event's ({ waves, wind, drone, rain, gust })
const AMB = { waves: 1, wind: 1, drone: 1, rain: 0, gust: 0 };
function ambienceMix() {
  const b = (REG.biomes.get(G.biome) || {}).ambience || {}, e = EVT.cur && EVT.cur.ambience;
  for (const key in AMB) {
    const base = b[key] ?? (key === 'rain' || key === 'gust' ? 0 : 1);
    AMB[key] = e && e[key] !== undefined ? lerp(base, e[key], EVT.k) : base;
  }
  return AMB;
}
// a bolt from the sky (storms, packs): jagged ribbon, flash, light, delayed thunder, hurts foes near the strike
function skyBolt(x, z, o = {}) {
  const gy = Math.max(groundBelow(x, H - 1, z), SEA);
  const top = new THREE.Vector3(x + rr(-3, 3), gy + 22, z + rr(-3, 3)), end = new THREE.Vector3(x, gy + 0.05, z);
  const pts = [top];
  for (let i = 1; i < 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(lerp(top.x, x, t) + rr(-1.4, 1.4), lerp(top.y, gy, t), lerp(top.z, z, t) + rr(-1.4, 1.4))); }
  pts.push(end);
  combat.bolts.push({ pts, life: 0.38, full: 0.38 });
  flashLight(end.clone().setY(gy + 2), o.light ?? 0xbfd6ff, 26);
  G.flash = Math.max(G.flash, o.flash ?? 0.28); FX.uFlashColor.value.setRGB(0.55, 0.65, 1).multiplyScalar(0.6);
  const col = toColor(o.col, C.zapCore);
  for (let k = 0; k < 26; k++) glow.emit(x, gy + 0.2, z, rr(-4, 4), rr(1, 6), rr(-4, 4), rr(0.2, 0.5), 0.1, 0.02, col, 1, 12, 0.6, 1);
  for (let k = 0; k < 10; k++) dust.emit(x + rr(-0.5, 0.5), gy + 0.3, z + rr(-0.5, 0.5), rr(-1.2, 1.2), rr(0.8, 2.4), rr(-1.2, 1.2), rr(0.9, 1.6), 0.4, 1.3, C.smokeLight, 0.6, -0.4, 1.4, 0);
  if (gy <= SEA + 0.1) ripple(x, z, 2.2);
  const d = Math.hypot(player.pos.x - x, player.pos.z - z);
  rig.trauma = Math.min(1, rig.trauma + clamp(0.5 - d / 40, 0.05, 0.4));
  playSound(o.sound || 'thunder', { k: clamp(1 - d / 45, 0.2, 1), jitter: 0.2 });
  if (o.dmg !== 0) for (const f of foes) {
    if (!foeAlive(f)) continue;
    const h = f.segs[0], fd = Math.hypot(h.x - x, h.z - z);
    if (fd < (o.r ?? 2.4) + f.def.rad) damageFoe(f, o.dmg ?? 70, (h.x - x) / (fd || 1), (h.z - z) / (fd || 1), { kb: 4, stun: 0.8, shock: true, at: h });
  }
  return end;
}
function updateEvents(dt) {
  if (EVT.cur && (G.noEvents || G.state === 'victory')) EVT.ending = true;      // the lit beacon clears any sky
  if (EVT.cur && G.state !== 'paused') {
    const ev = EVT.cur;
    EVT.t += dt;
    if (EVT.t > EVT.dur) EVT.ending = true;
    EVT.lin = clamp(EVT.lin + (EVT.ending ? -dt / (ev.fadeOut ?? 4) : dt / (ev.fadeIn ?? 4)), 0, 1);
    EVT.k = EVT.lin * EVT.lin * (3 - 2 * EVT.lin);                              // eased: the sky turns, never snaps
    if (ev.onTick && G.state === 'play') ev.onTick(dt, EVT.k);
    if (EVT.ending && EVT.lin <= 0) endEvent();
  } else if (!EVT.cur && G.state === 'play') {
    EVT.cool -= dt; EVT.checkT -= dt;
    if (EVT.cool <= 0 && EVT.checkT <= 0 && !G.noEvents) {
      EVT.checkT = 20;
      for (const ev of REG.events.values()) {
        if (eventAllowed(ev) && Math.random() < (ev.chance ?? 0.2)) { startEvent(ev); break; }
      }
    }
  }
  updateWeather(dt);
}
// the weather the biome wants, unless an event brings its own
function updateWeather(dt) {
  const biome = REG.biomes.get(G.biome) || {};
  const ev = EVT.cur && EVT.cur.weather ? EVT.cur.weather : null;
  const base = biome.weather || null;
  const want = ev && EVT.k > 0.02 ? ev : base;
  const kindId = want ? want.kind : null;
  const level = want ? (ev && want === ev ? lerp(base && base.kind === ev.kind ? base.density : 0, ev.density ?? 1, EVT.k) : want.density ?? 0.5) : 0;
  if (kindId !== weather.kind) {
    weather.level = Math.max(0, weather.level - dt * 0.6);          // fade the old kind out before switching
    if (weather.level <= 0.01) {
      weather.kind = kindId;
      const K = kindId ? REG.weather.get(kindId) : null;
      if (K) {
        precipU.uColor.value.set(K.color); precipU.uSize.value = K.size ?? 0.08; precipU.uFall.value = K.fall ?? 1;
        precipU.uSway.value = K.sway ?? 0.4; precipU.uShape.value = K.shape ?? 0; precipU.uAlpha.value = K.alpha ?? 0.8;
        precipU.uBox.value = K.box ?? 30;
        if (K.glow) precipU.uColor.value.multiplyScalar(K.glow);          // additive kinds may glow past 1 (bloom picks it up)
        precip.material.blending = K.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
        precip.material.needsUpdate = true;
      }
    }
  } else weather.level += ((kindId ? level : 0) - weather.level) * damp(0.8, dt);
  const w = want && want.wind ? want.wind : [0.4, 0, 0.2];
  const gust = 1 + 0.35 * Math.sin(G.time * 0.7) * Math.sin(G.time * 0.23 + 1.3);     // slow harmonic gusts
  weather.wind.set(w[0] * gust, 0, w[w.length - 1] * gust);
  weather.cur.lerp(weather.wind, damp(0.5, dt));
  precipU.uDrift.value.addScaledVector(weather.cur, dt);
  precipU.uDensity.value = clamp(weather.level, 0, 1);
  precipU.uCenter.value.copy(camera.position);
  precip.visible = weather.level > 0.01 && !!weather.kind;
}
// events and weather lean on the palette: called by applyPalette after the phases are mixed
function eventPalette(pal) {
  const ev = EVT.cur;
  if (!ev || !ev.palette || EVT.k <= 0) return;
  const k = EVT.k * (ev.paletteMix ?? 0.85);     // never a full override: the hour still shows through
  for (const key in ev.palette) {
    const v = pal[key], t = ev.palette[key];
    if (v === undefined) continue;
    if (v && v.isColor) v.lerp(tmpCol.set(t), k);
    else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) v[i] = lerp(v[i], t[i], k);
    else pal[key] = lerp(v, t, k);
  }
}
const tmpCol = new THREE.Color();
