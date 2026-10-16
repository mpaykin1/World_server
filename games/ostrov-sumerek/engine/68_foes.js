/* =============================================================================
   30 · Foes — the engine side: spawning, damage, death, souls, the spawn director
        and one shared instanced renderer for every body segment.
        What a foe IS comes from packs: defineEnemy (look, numbers, spawn rules),
        defineBody (how its body moves and is drawn), defineBrain (how it thinks).
============================================================================= */
const FOES = {};              // id → finalized enemy definition
const KIND_ID = {};           // id → palette slot in the foe shaders
const SPAWNERS = [];          // enemies that rise from the sea / ground on their own, by priority
const MAX_KINDS = 16;
let foes = [];
const souls = [];
const foeAlive = (f) => f.state !== 'dissolve' && f.hp > 0;
const segRad = (f, k) => f.rads[k];
const kindCore = Array.from({ length: MAX_KINDS }, () => new THREE.Color('#06030c'));
const kindRim = Array.from({ length: MAX_KINDS }, () => new THREE.Color('#2b0f47'));
const kindAura = Array.from({ length: MAX_KINDS }, () => new THREE.Color('#8a2cff'));
const kindShape = Array.from({ length: MAX_KINDS }, () => new THREE.Vector4(0, 14, 1, 0));   // spikes, pixel grid, aura gain, style
function finalizeEnemies() {
  let k = 0;
  for (const d of REG.enemies.values()) {
    d.B = REG.bodies.get(d.body); d.Br = REG.brains.get(d.brain);
    if (!d.B) { regError(`enemy '${d.id}': unknown body '${d.body}'`); continue; }
    if (!d.Br) { regError(`enemy '${d.id}': unknown brain '${d.brain}'`); continue; }
    if (k >= MAX_KINDS) { regError(`too many enemy kinds (max ${MAX_KINDS})`); break; }
    d.seg = d.seg ?? 1; d.rad = d.rad ?? 0.5; d.spacing = d.spacing ?? d.rad * 0.7; d.hover = d.hover ?? 1;
    d.wander = d.wander ?? 1.8; d.chase = d.chase ?? 3; d.chaseR = d.chaseR ?? 8; d.dmg = d.dmg ?? 1;
    d.soul = d.soul ?? 0.2; d.danger = d.danger ?? 1; d.eye = d.eye ?? 0.1; d.eyeGap = d.eyeGap ?? 0.12;
    const L = d.look || {};
    // colours: '#hex' (sRGB) or [r, g, b] (linear, as the shader sees them)
    const setCol = (c, v, fb) => (Array.isArray(v) ? c.setRGB(v[0], v[1], v[2]) : c.set(v || fb));
    setCol(kindCore[k], L.core, '#06030c'); setCol(kindRim[k], L.rim, '#2b0f47'); setCol(kindAura[k], L.aura, '#8a2cff');
    kindShape[k].set(L.spikes ?? 0, L.pixels ?? 14, L.auraGain ?? 1, L.style ?? 0);
    d.eyeCol = toColor(L.eye, C.eye); d.eyeGlowCol = toColor(L.eyeGlow, C.eyeGlow); d.deathCol = toColor(L.death, C.violet);
    KIND_ID[d.id] = k++;
    FOES[d.id] = d;
    if (d.spawn && (d.spawn.from === 'sea' || d.spawn.from === 'land')) SPAWNERS.push(d);
  }
  SPAWNERS.sort((a, b) => (a.spawn.priority ?? 5) - (b.spawn.priority ?? 5));
}
finalizeEnemies();

function spawnFoe(type, x, y, z, rising) {
  if (foes.length >= MAX_FOES) return null;
  const def = FOES[type];
  if (!def) { console.warn('[foes] unknown enemy', type); return null; }
  const f = {
    type, def, body: def.B, brain: def.Br, n: def.seg, segs: [], rads: [], vel: new THREE.Vector3(), kb: new THREE.Vector3(),
    state: rising ? 'rise' : 'wander', t: 0, alpha: rising ? 0 : 1,
    target: new THREE.Vector3(x, y, z), seed: Math.random() * 50, timer: 0, blink: 0, trail: 0, extent: def.seg * def.spacing + def.rad + 1,
    hp: def.hp, maxHp: def.hp, flash: 0, stun: 0, slow: 0, burn: 0, burnDps: 0, burnTick: 0, shock: 0, hitT: 0, numAcc: 0, numT: 0, soulAcc: 0,
    // movement intent written by the brain each frame, executed by the body
    speed: 0, turn: 1.3, ty: y, yk: 2.6, harmful: false, arrive: 0.01,
  };
  def.B.init(f, x, y, z);
  if (def.Br.init) def.Br.init(f);
  foes.push(f);
  emit('spawn', f);
  return f;
}
function seaSpot(minD, maxD) {
  const spots = world.seaSpots;
  let best = spots[0], bestS = -1e9;
  for (let k = 0; k < 40; k++) {
    const sp = spots[Math.floor(Math.random() * spots.length)];
    const d = Math.hypot(sp[0] + 0.5 - player.pos.x, sp[1] + 0.5 - player.pos.z);
    const s = d > minD && d < maxD ? 100 - Math.abs(d - (minD + maxD) / 2) : -Math.abs(d - minD);
    if (s > bestS) { bestS = s; best = sp; }
  }
  return best;
}
function landSpot(minD, maxD) {
  const cells = world.landCells;
  let best = cells[0], bestS = -1e9;
  for (let k = 0; k < 40; k++) {
    const c = cells[Math.floor(Math.random() * cells.length)];
    const d = Math.hypot(c[0] + 0.5 - player.pos.x, c[1] + 0.5 - player.pos.z);
    const s = d > minD && d < maxD ? 100 - Math.abs(d - (minD + maxD) / 2) : -Math.abs(d - minD);
    if (s > bestS) { bestS = s; best = c; }
  }
  return best;
}
// a foe rises out of the sea (or out of the ground): ripples / dust, a low whoosh
function spawnFrom(def) {
  const sp = def.spawn, dist = sp.dist || [12, 26];
  let x, z, y;
  if (sp.from === 'land') {
    if (!world.landCells.length) return null;
    const c = landSpot(dist[0], dist[1]);
    x = c[0] + 0.5; z = c[1] + 0.5; y = world.stand[c[0] + c[1] * W] - 0.8;
  } else {
    if (!world.seaSpots.length) return null;
    const c = seaSpot(dist[0], dist[1]);
    x = c[0] + 0.5; z = c[1] + 0.5; y = SEA - 0.6;
  }
  const f = spawnFoe(def.id, x, y, z, true);
  if (!f) return null;
  SFX.rise();
  if (sp.from === 'land') {
    for (let k = 0; k < 16; k++) dust.emit(x + rr(-0.4, 0.4), y + 0.9, z + rr(-0.4, 0.4), rr(-0.8, 0.8), rr(0.5, 2), rr(-0.8, 0.8), rr(0.9, 1.6), 0.3, 0.9, C.dirt, 0.7, 2, 1, 0);
  } else {
    ripple(x, z, 1.6);
    for (let k = 0; k < 16; k++) dust.emit(x + rr(-0.4, 0.4), SEA + 0.1, z + rr(-0.4, 0.4), rr(-0.6, 0.6), rr(0.5, 2), rr(-0.6, 0.6), rr(0.9, 1.6), 0.4, 1.1, C.smoke, 0.6, -0.3, 1, 0);
  }
  if (sp.onSpawn) sp.onSpawn(f);
  return f;
}
// shared by bodies: the head steers with inertia toward the brain's target; knock-back and stun jitter on top
function steerFoe(f, dt) {
  const head = f.segs[0];
  let sp = f.speed;
  if (f.slow > 0) sp *= 0.35;
  if (f.stun > 0 || f.hold) sp = 0;
  let tx = f.target.x - head.x, tz = f.target.z - head.z;
  const L = Math.hypot(tx, tz);
  if (L > 0.01) { const q = sp / Math.max(L, f.arrive); tx *= q; tz *= q; }
  const k = damp(f.stun > 0 ? 6 : f.turn, dt);
  f.vel.x += (tx - f.vel.x) * k; f.vel.z += (tz - f.vel.z) * k;
  head.x = clamp(head.x + (f.vel.x + f.kb.x) * dt, -8, W + 8);
  head.z = clamp(head.z + (f.vel.z + f.kb.z) * dt, -8, D + 8);
  f.kb.multiplyScalar(Math.exp(-5 * dt));
  if (f.stun > 0) { head.x += rr(-0.04, 0.04); head.z += rr(-0.04, 0.04); }
  head.y += (f.ty - head.y) * damp(f.yk, dt);
}
// spawn rules see a small snapshot of the run
function spawnCtx() {
  return { play: G.play, collected: G.collected, total: G.total, all: G.all, tod: G.tod, night: G.tod > 0.6, biome: G.biome,
    prog: G.total ? G.collected / G.total : 0, kills: G.kills };
}
function foeAllowed(def) {
  const sp = def.spawn, bf = (REG.biomes.get(G.biome) || {}).foes;
  if (sp.biomes && !sp.biomes.includes(G.biome)) return false;
  if (bf && typeof bf === 'object' && bf[def.id] === 0) return false;
  return true;
}
function spawnDirector(dt) {
  if (G.state !== 'play' || dt <= 0) return;
  const ctx = spawnCtx();
  G.spawnT -= dt;
  if (G.spawnT <= 0) {
    for (const d of SPAWNERS) {
      if (!foeAllowed(d)) continue;
      let max = typeof d.spawn.max === 'function' ? d.spawn.max(ctx) : d.spawn.max || 0;
      const bf = (REG.biomes.get(G.biome) || {}).foes;
      if (bf && typeof bf === 'object' && bf[d.id] !== undefined) max = Math.round(max * bf[d.id]);
      const em = eventSpawnMul(d);                     // a world event may press harder (event.spawnMul)
      if (em !== 1) max = Math.round(max * em);
      if (foes.filter((f) => f.type === d.id && f.state !== 'dissolve').length < max) {
        spawnFrom(d); G.spawnT = (d.spawn.every ?? 3) / Math.max(0.25, em); break;
      }
    }
  }
  // the guardian of the beacon wakes when every coin is taken (biome.guardian, default 'warden')
  if (G.all && !G.wardenSpawned) { G.wardenT -= dt; if (G.wardenT <= 0) spawnGuardian(); }
}
function spawnGuardian() {
  G.wardenSpawned = true;
  const gid = (REG.biomes.get(G.biome) || {}).guardian || 'warden';
  const def = FOES[gid];
  if (!def) { G.wardenDown = true; return; }       // no guardian: the ring simply opens
  const r = world.ring, b = world.beacon;
  const p = def.spawn && def.spawn.place ? def.spawn.place() : { x: r.x + (r.x - b.x) * 1.4, y: world.tower.base - 2.5, z: r.z + (r.z - b.z) * 1.4 };
  const f = spawnFoe(gid, p.x, p.y, p.z, true);
  if (!f) return;
  G.warden = f;
  if (def.spawn && def.spawn.onSpawn) def.spawn.onSpawn(f);
}

function damageFoe(f, amount, dirX, dirZ, o = {}) {
  if (!foeAlive(f)) return false;
  let dmg = amount, kind = '';
  if (o.w && o.w.kind) dmg *= o.w.kind === 'melee' ? STATS.melee : STATS.ranged;     // hero & relic bonuses
  if (o.crit && Math.random() < o.crit) { dmg *= o.critMul || 2; kind = 'crit'; }
  const bm = !o.silent && f.brain.damageMul ? f.brain.damageMul(f, o) : 1;           // e.g. an exposed boss
  if (bm !== 1) { dmg *= bm; if (bm > 1 && !o.dot && !o.quiet) kind = 'crit'; }
  if (o.dot) kind = o.dot;
  else if (o.freeze) kind = 'frost';
  else if (o.shock) kind = 'shock';
  f.hp -= dmg;
  f.hitT = 2.5;
  if (!o.dot) f.flash = Math.max(f.flash, o.quiet ? 0.35 : 1);
  const def = f.def;
  const kb = (o.kb || 0) * (def.kbTaken ?? (def.boss ? 0.2 : 1));
  f.kb.x += dirX * kb; f.kb.z += dirZ * kb;
  if (o.stun) f.stun = Math.max(f.stun, o.stun * (def.stunTaken ?? (def.boss ? 0.35 : 1)));
  if (o.freeze) f.slow = Math.max(f.slow, o.freeze);
  if (o.burn) { f.burn = Math.max(f.burn, o.burn.t); f.burnDps = Math.max(f.burnDps, o.burn.dps); }
  if (o.shock) f.shock = 0.35;
  if (f.brain.onDamaged) f.brain.onDamaged(f, dmg, o);
  else if (f.state === 'wander' || f.state === 'flee') { f.state = 'chase'; f.timer = 0; }
  if (o.leech) {
    combat.leech += dmg;
    while (combat.leech >= o.leech) {
      combat.leech -= o.leech;
      if (player.hp < player.maxHp) { player.hp++; updateHearts(false); dmgNumber(tmpE.set(player.pos.x, player.pos.y + 1.6, player.pos.z), 1, 'heal'); }
    }
  }
  const at = o.at || f.segs[0];
  if (o.silent) { /* debug kill: no numbers, no sparks */ }
  else if (o.quiet) {
    f.numAcc += dmg;
    if (G.time - f.numT > 0.25) { dmgNumber(at, f.numAcc, 'beam'); f.numAcc = 0; f.numT = G.time; }
  } else {
    dmgNumber(at, dmg, kind);
    const c = kind === 'frost' ? C.ice : kind === 'shock' ? C.zapCore : kind === 'burn' ? C.fire : C.hitSpark;
    if (!o.dot) for (let k = 0; k < (kind === 'crit' ? 12 : 7); k++) glow.emit(at.x, at.y, at.z, dirX * rr(1, 4) + rr(-1.5, 1.5), rr(0.5, 3), dirZ * rr(1, 4) + rr(-1.5, 1.5), rr(0.15, 0.35), 0.1, 0.02, c, 1, 8, 1, kind === 'crit' ? 2 : 1);
    if (!o.dot) SFX.hit(Math.min(3, dmg / 15), kind === 'crit');
  }
  if (def.soulEvery && !o.silent) {                 // big foes shake souls out as they are hurt
    f.soulAcc += dmg;
    if (f.soulAcc >= def.soulEvery && f.hp > 0) { f.soulAcc -= def.soulEvery; dropSoul(at, 1); }
  }
  emit('hit', f, dmg, o);
  if (f.hp <= 0) killFoe(f);
  return true;
}
function killFoe(f) {
  f.state = 'dissolve'; f.hp = 0;
  G.kills++;
  const h = f.segs[0], def = f.def;
  const big = !!def.boss;
  for (const s of f.segs) {
    for (let k = 0; k < (big ? 6 : 3); k++) glow.emit(s.x, s.y, s.z, rr(-2, 2), rr(0.5, 3), rr(-2, 2), rr(0.5, 1), 0.14, 0.02, def.deathCol, 1, -0.5, 1, 1);
    dust.emit(s.x, s.y, s.z, rr(-1, 1), rr(0.5, 1.5), rr(-1, 1), rr(0.8, 1.4), segRad(f, 0) * 0.8, segRad(f, 0) * 1.6, C.smoke, 0.6, -0.3, 1.2, 0);
  }
  SFX.foeDie(big);
  rig.trauma = Math.min(1, rig.trauma + (big ? 0.8 : 0.12));
  if (Math.random() < def.soul + STATS.soul) dropSoul(h, big ? 6 : 1);
  if (def.onDeath) def.onDeath(f);
  if (f === G.warden) {
    G.wardenDown = true; G.warden = null;
    G.flash = 0.45; FX.uFlashColor.value.setRGB(0.95, 0.75, 1);
    combat.waves.push({ x: h.x, y: Math.max(groundBelow(h.x, h.y, h.z), SEA) + 0.1, z: h.z, r: 7, t: 0, dur: 0.9, col: def.deathCol });
    toast(def.downText || `${def.name} повержен — зажги маяк!`, 4200, false, 3);
  }
  emit('kill', f);
}
function dropSoul(p, n = 1) {
  for (let i = 0; i < n; i++) souls.push({ pos: p.clone(), vel: new THREE.Vector3(rr(-1.5, 1.5), rr(2, 4), rr(-1.5, 1.5)), t: -i * 0.15 });
}
function updateSouls(dt) {
  for (let i = souls.length - 1; i >= 0; i--) {
    const s = souls[i];
    s.t += dt;
    if (s.t < 0) continue;
    if (s.t < 0.7) s.vel.multiplyScalar(Math.exp(-3 * dt));
    else {
      const to = tmpA.set(player.pos.x - s.pos.x, player.pos.y + 0.8 - s.pos.y, player.pos.z - s.pos.z);
      const d = to.length();
      s.vel.lerp(to.multiplyScalar(10 / (d || 1)), damp(4, dt));
      if (d < 0.6 && G.state === 'play') {
        if (player.hp < player.maxHp) { player.hp++; updateHearts(false); dmgNumber(tmpE.set(player.pos.x, player.pos.y + 1.6, player.pos.z), 1, 'heal'); }
        SFX.soul();
        souls.splice(i, 1);
        continue;
      }
    }
    s.pos.addScaledVector(s.vel, dt);
    if (s.t > 14) souls.splice(i, 1);
  }
}
function renderSouls() {
  for (const s of souls) {
    if (s.t < 0) continue;
    const fl = 0.85 + 0.15 * Math.sin(G.time * 12 + s.t * 7);
    glow.spark(s.pos.x, s.pos.y, s.pos.z, 0.26, C.soul, fl, 0);
    glow.spark(s.pos.x, s.pos.y, s.pos.z, 0.9, C.soulHalo, 0.35 * fl, 0);
  }
}
// every frame: status effects, the brain decides (target, speed, height, harmful), the body moves
function updateFoes(dt) {
  const px = player.pos.x, py = player.pos.y + 0.75, pz = player.pos.z;
  const prog = G.total ? G.collected / G.total : 0;
  const canChase = G.state === 'play' && player.respawn <= 0;
  spawnDirector(dt);
  let danger = 0;
  for (let i = foes.length - 1; i >= 0; i--) {
    const f = foes[i], def = f.def, head = f.segs[0];
    f.t += dt;
    f.flash = Math.max(0, f.flash - dt * 7);
    f.stun = Math.max(0, f.stun - dt); f.slow = Math.max(0, f.slow - dt); f.shock = Math.max(0, f.shock - dt); f.hitT = Math.max(0, f.hitT - dt);
    if (f.burn > 0 && f.state !== 'dissolve') {
      f.burn -= dt; f.burnTick -= dt;
      if (f.burnTick <= 0) { f.burnTick = 0.5; damageFoe(f, f.burnDps * 0.5, 0, 0, { dot: 'burn', at: head }); }
      if (Math.random() < dt * 30) { const s = f.segs[Math.floor(Math.random() * f.n)]; glow.emit(s.x + rr(-0.2, 0.2), s.y, s.z + rr(-0.2, 0.2), 0, rr(1, 2.4), 0, rr(0.3, 0.6), 0.16, 0.02, C.fire, 1, -1, 1, 0); }
    }
    const dxp = px - head.x, dzp = pz - head.z, dist = Math.hypot(dxp, dzp);
    const s = { px, py, pz, dxp, dzp, dist, prog, canChase, chaseR: def.chaseR + prog * 4 };
    if (f.state === 'rise') {
      f.alpha = Math.min(1, f.alpha + dt * 0.9);
      f.speed = 0.4; f.turn = 1.3; f.yk = 1.2; f.harmful = false;
      f.ty = typeof def.riseY === 'function' ? def.riseY(f) : def.riseY ?? SEA + 1.4;
      if (f.t > (def.riseTime ?? 1.8)) { f.state = f.brain.afterRise || 'wander'; f.timer = 0; }
    } else if (f.state === 'dissolve') {
      f.alpha -= dt * (def.dissolve ?? 0.6);
      for (const sg of f.segs) sg.y += dt * (0.6 + Math.random());
      if (Math.random() < 0.6) { const sg = f.segs[Math.floor(Math.random() * f.n)]; glow.emit(sg.x, sg.y, sg.z, rr(-1, 1), rr(0.5, 2), rr(-1, 1), rr(0.6, 1.2), 0.12, 0.02, def.deathCol, 0.9, -0.5, 1, 1); }
      if (f.alpha <= 0) { foes.splice(i, 1); continue; }
    } else if (dt > 0) {
      // a rise cut short (onDamaged may switch state mid-surfacing) still fades in fully, else it stays half-seen and harmless
      if (f.alpha < 1) f.alpha = Math.min(1, f.alpha + dt * 0.9);
      f.brain.think(f, dt, s);
    }
    if (f.state !== 'dissolve' && dt > 0) f.body.step(f, dt, s);
    else if (f.body.follow) f.body.follow(f, dt);
    // touching the hero hurts when the brain says so (stalkers always, the warden only in a dive)
    if (f.harmful && f.state !== 'rise' && f.state !== 'dissolve' && f.alpha > 0.6 && canChase && f.stun <= 0 && !f.hold) {
      const k = f.body.touch ? f.body.touch(f, px, py, pz) : -1;
      if (k >= 0) {
        const sg = f.segs[k];
        if (hurt(def.dmg, sg.x, sg.z) && f.brain.onHurtHero) f.brain.onHurtHero(f);
      }
    }
    if (f.state !== 'dissolve') danger = Math.max(danger, smooth(9, 2.4, Math.hypot(px - head.x, py - head.y, pz - head.z)) * def.danger);
    if (f.body.trail) f.body.trail(f, dt);
    f.blink -= dt;
    if (f.blink < -rr(2.5, 5)) f.blink = 0.12;
  }
  G.dangerT = danger;
}

// ── one instanced renderer for every foe segment (smoke serpents, jelly bells …) ──
const FSEG = 16, MAX_FOES = 12, NFS = MAX_FOES * FSEG;
const fPos = new Float32Array(NFS * 3), fRad = new Float32Array(NFS), fAlpha = new Float32Array(NFS), fSeed = new Float32Array(NFS), fFx = new Float32Array(NFS * 4), fKind = new Float32Array(NFS);
const foeInst = makeInstGeo(quadBase, 0, { aPos: [fPos, 3], aRad: [fRad, 1], aAlpha: [fAlpha, 1], aSeed: [fSeed, 1], aFx: [fFx, 4], aKind: [fKind, 1] });
const foeKindU = { uCoreK: { value: kindCore }, uRimK: { value: kindRim }, uAuraK: { value: kindAura }, uShapeK: { value: kindShape } };
const foeBody = new THREE.Mesh(foeInst.geo, fogShader({
  uniforms: { uTime: U.time, uRight: U.camRight, uUp: U.camUp, uScale: { value: 1 }, ...foeKindU },
  vertexShader: SHADE_VERT, fragmentShader: SHADE_FRAG, transparent: true, depthWrite: false,
}));
const foeAura = new THREE.Mesh(foeInst.geo, fogShader({
  uniforms: { uTime: U.time, uRight: U.camRight, uUp: U.camUp, uScale: { value: 1.9 }, ...foeKindU },
  vertexShader: SHADE_VERT, fragmentShader: AURA_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
foeBody.frustumCulled = foeAura.frustumCulled = false;
foeAura.renderOrder = 11; foeBody.renderOrder = 12;
scene.add(foeAura, foeBody);
let foeN = 0;
// bodies call this to draw one segment: position, radius, alpha, seed (+ the foe's status flashes)
function putSegment(f, x, y, z, rad, alpha, seed) {
  if (foeN >= NFS) return;
  const n = foeN++, i3 = n * 3, i4 = n * 4;
  fPos[i3] = x; fPos[i3 + 1] = y; fPos[i3 + 2] = z;
  fRad[n] = rad; fAlpha[n] = alpha; fSeed[n] = seed;
  fFx[i4] = f.flash; fFx[i4 + 1] = f.slow > 0 ? Math.min(1, f.slow) : 0; fFx[i4 + 2] = f.burn > 0 ? Math.min(1, f.burn * 2) : 0; fFx[i4 + 3] = f.shock > 0 ? 1 : 0;
  fKind[n] = KIND_ID[f.type];
}
// two glowing eyes that always face the camera (shared by bodies)
function drawEyes(f, at, rad) {
  if (f.alpha <= 0.05 || f.blink > 0 || f.stun > 0) return;
  const cr = U.camRight.value;
  tmpC.copy(camera.position).sub(at).normalize();
  const off = rad * 0.62, ex = at.x + tmpC.x * off, ey = at.y + rad * 0.2 + tmpC.y * off, ez = at.z + tmpC.z * off;
  const g = f.def.eyeGap;
  glow.spark(ex - cr.x * g, ey, ez - cr.z * g, f.def.eye, f.def.eyeCol, f.alpha, 1);
  glow.spark(ex + cr.x * g, ey, ez + cr.z * g, f.def.eye, f.def.eyeCol, f.alpha, 1);
  glow.spark(ex, ey, ez, f.def.eye * 9, f.def.eyeGlowCol, 0.22 * f.alpha, 0);
}
function renderFoes() {
  foeN = 0;
  for (const f of foes) f.body.render(f);
  foeInst.geo.instanceCount = foeN;
  foeBody.visible = foeAura.visible = foeN > 0;
  for (const nm of ['aPos', 'aRad', 'aAlpha', 'aSeed', 'aFx', 'aKind']) foeInst.attrs[nm].needsUpdate = true;
}
