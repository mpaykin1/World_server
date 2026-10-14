/* Foe brains. think(f, dt, s) decides the state and writes the movement intent for the body:
     f.target (x, z), f.speed, f.turn (steering responsiveness), f.ty (head height), f.yk, f.arrive,
     f.harmful (touching the hero hurts)
   s = { px, py, pz, dxp, dzp, dist, prog, canChase, chaseR } — the hero relative to the head.
   Optional: init(f), afterRise ('wander'), onHurtHero(f), onDamaged(f, dmg, o), damageMul(f, o),
   drawFx(f) (ribbons / sprites each frame). */

// wanders the island, chases when the hero comes close, backs off after biting
defineBrain('stalker', {
  think(f, dt, s) {
    const def = f.def, head = f.segs[0];
    if (f.state === 'wander') {
      f.timer -= dt;
      if (f.timer <= 0 || Math.hypot(f.target.x - head.x, f.target.z - head.z) < 1.5) {
        const c = world.landCells[Math.floor(Math.random() * world.landCells.length)];
        f.target.set(lerp(c[0] + 0.5, s.px, 0.35), 0, lerp(c[1] + 0.5, s.pz, 0.35));
        f.timer = rr(4, 8);
      }
      if (s.canChase && s.dist < s.chaseR && player.invuln < 0.2 && !f.hold) f.state = 'chase';
    } else if (f.state === 'chase') {
      f.target.set(s.px, 0, s.pz);
      if (!s.canChase || s.dist > s.chaseR + 6) { f.state = 'wander'; f.timer = 0; }
    } else if (f.state === 'flee') {
      f.timer -= dt;
      f.target.set(head.x - s.dxp * 3, 0, head.z - s.dzp * 3);
      if (f.timer <= 0) { f.state = 'wander'; f.timer = 0; }
    }
    f.speed = f.state === 'chase' ? def.chase + s.prog * 1.1 : f.state === 'flee' ? 4.4 : def.wander;
    f.turn = f.state === 'chase' ? 2.4 : 1.3;
    f.ty = Math.max(terrainTop(head.x, head.z), SEA) + def.hover + 0.3 * Math.sin(f.t * 1.7 + f.seed);
    if (f.state === 'chase' && s.dist < 4) f.ty = lerp(f.ty, s.py, 0.6);
    f.yk = 2.6; f.arrive = 0.01; f.harmful = true;
  },
  onHurtHero(f) { f.state = 'flee'; f.timer = 2.6; },
});

// the beacon's guardian: orbits with orb volleys → winds up (marks the landing) → dives →
// shockwave (jump it) → hangs exposed for a moment (takes ×1.5) → orbits again; furious below half health
function spawnOrb(pos, vx, vy, vz) {
  addProj({ w: null, kind: 'orb', team: 1, pos: pos.clone(), vel: new THREE.Vector3(vx, vy, vz), life: 3.2, age: 0,
    r: 0.32, size: 0.5, dmg: 1, kb: 0, grav: 0, ric: 'none', bounce: 0, rest: 0, pierce: 0, rehit: 99, stuck: 0, hit: new Map(), fx: 0, tracer: true, col: C.orbCore });
}
function wardenFire(f, dt, dist) {
  f.fireT -= dt;
  if (f.charge > 0) {
    f.charge -= dt;
    const h = f.segs[0];
    glow.spark(h.x, h.y, h.z, 1.2 + (0.7 - f.charge) * 2, C.orbHalo, 0.5, 0);
    if (f.charge <= 0) {
      const dx = player.pos.x - h.x, dz = player.pos.z - h.z, dy = player.pos.y + 0.8 - h.y;
      const base = Math.atan2(dz, dx), d = Math.hypot(dx, dz) || 1;
      const n = f.hp < f.maxHp * 0.5 ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const a = base + (i / (n - 1) - 0.5) * 0.95;
        spawnOrb(h, Math.cos(a) * 7, dy / d * 7, Math.sin(a) * 7);
      }
      SFX.orb();
    }
  } else if (f.fireT <= 0 && dist < 18 && G.state === 'play') {
    f.fireT = f.hp < f.maxHp * 0.5 ? 2.4 : 3.2;
    f.charge = 0.75;
  }
}
function bossImpact(f, rage) {
  const h = f.segs[0];
  const gy = Math.max(groundBelow(h.x, h.y + 0.5, h.z), SEA);
  combat.waves.push({ x: h.x, y: gy + 0.08, z: h.z, r: 4.2, t: 0, dur: 0.6, col: C.violet, hurt: true, hit: false });
  for (let k = 0; k < 30; k++) {
    const an = k / 30 * TAU;
    dust.emit(h.x + Math.cos(an) * 0.6, gy + 0.1, h.z + Math.sin(an) * 0.6, Math.cos(an) * rr(4, 7), rr(0.5, 2), Math.sin(an) * rr(4, 7), rr(0.5, 0.9), 0.25, 0.8, C.dirt, 0.7, 2, 3, 0);
  }
  for (let k = 0; k < 18; k++) glow.emit(h.x, gy + 0.3, h.z, rr(-4, 4), rr(2, 6), rr(-4, 4), rr(0.4, 0.8), 0.12, 0.03, C.violet, 1, 8, 1, 1);
  if (gy <= SEA + 0.1) ripple(h.x, h.z, 2.5);
  flashLight(tmpE.set(h.x, gy + 1, h.z), 0xc070ff, 16);
  rig.trauma = Math.min(1, rig.trauma + clamp(1 - Math.hypot(player.pos.x - h.x, player.pos.z - h.z) / 14, 0.15, 0.7));
  SFX.slam();
  if (rage) for (let i = 0; i < 10; i++) {          // furious: a ring of orbs bursts out of the crater
    const a = i / 10 * TAU + f.t;
    spawnOrb(tmpE.set(h.x, gy + 1.0, h.z), Math.cos(a) * 5.5, 0, Math.sin(a) * 5.5);
  }
}
function bossThink(f, dt, px, pz, dist) {
  const b = world.beacon, h = f.segs[0];
  const away = Math.hypot(px - b.x, pz - b.z) > 19;
  const rage = f.hp < f.maxHp * 0.5;
  f.modeT -= dt;
  switch (f.mode) {
    case 'orbit': {
      if (away) { f.target.set(b.x + Math.cos(f.t * 0.4) * 7, 0, b.z + Math.sin(f.t * 0.4) * 7); break; }
      f.orbitA += dt * (rage ? 0.7 : 0.5) * f.orbitDir;
      f.target.set(px + Math.cos(f.orbitA) * 4.4, 0, pz + Math.sin(f.orbitA) * 4.4);
      if (f.modeT <= 0 && f.charge <= 0 && dist < 13 && G.state === 'play') { f.mode = 'windup'; f.modeT = rage ? 0.8 : 1.0; f.locked = false; SFX.windup(); }
      break;
    }
    case 'windup': {
      f.target.set(h.x, 0, h.z);
      const k = 1 - f.modeT / (rage ? 0.8 : 1.0);
      glow.spark(h.x, h.y, h.z, 1.4 + k * 2.6, C.orbHalo, 0.35 + k * 0.4, 0);
      if (Math.random() < 0.7) glow.emit(h.x + rr(-2, 2), h.y + rr(-1.5, 1.5), h.z + rr(-2, 2), 0, 0, 0, 0.25, 0.12, 0.02, C.orbCore, 1, 0, 0, 1);
      if (!f.locked && f.modeT < 0.35) { f.locked = true; f.diveTo.set(px, Math.max(groundBelow(px, player.pos.y + 0.5, pz), SEA), pz); }
      if (f.modeT <= 0) { f.mode = 'dive'; f.modeT = 1.1; SFX.dash(); rig.trauma = Math.min(1, rig.trauma + 0.2); }
      break;
    }
    case 'dive':
      f.target.set(f.diveTo.x, 0, f.diveTo.z);
      if (Math.hypot(f.diveTo.x - h.x, f.diveTo.z - h.z) < 0.9 || f.modeT <= 0) { bossImpact(f, rage); f.mode = 'recover'; f.modeT = rage ? 1.5 : 2.0; }
      break;
    case 'recover':
      f.target.set(h.x, 0, h.z);
      if (Math.random() < dt * 8) glow.emit(h.x + rr(-0.8, 0.8), h.y + 0.6, h.z + rr(-0.8, 0.8), 0, rr(0.5, 1.4), 0, rr(0.5, 0.9), 0.16, 0.03, C.violet, 0.8, -0.3, 1, 1);
      if (f.modeT <= 0) {
        f.mode = 'orbit'; f.modeT = rage ? rr(4.5, 6) : rr(6.5, 8.5);
        f.orbitDir = Math.random() < 0.5 ? 1 : -1; f.orbitA = Math.atan2(h.z - pz, h.x - px);
        f.fireT = Math.min(f.fireT, 1.2);
      }
      break;
  }
}
defineBrain('warden', {
  afterRise: 'chase',
  init(f) {
    const h = f.segs[0];
    Object.assign(f, { mode: 'orbit', modeT: 4.5, orbitA: Math.atan2(h.z - player.pos.z, h.x - player.pos.x), orbitDir: 1,
      diveTo: new THREE.Vector3(), locked: false, fireT: 3, charge: 0 });
  },
  think(f, dt, s) {
    const def = f.def, head = f.segs[0];
    if (f.state === 'wander') {          // only when spawned by hand (debug): drift until the hero is near
      if (s.canChase && s.dist < s.chaseR && !f.hold) f.state = 'chase';
      f.target.set(head.x, 0, head.z);
    }
    if (f.state === 'chase') bossThink(f, dt, s.px, s.pz, s.dist);
    const bm = f.state === 'chase' ? f.mode : '';
    let sp = f.state === 'chase' ? def.chase + s.prog * 0.6 : def.wander;
    if (bm === 'dive') sp = 12.5; else if (bm === 'windup') sp = 0.5; else if (bm === 'recover') sp = 0.7;
    f.speed = sp;
    f.arrive = bm === 'orbit' ? 1.2 : 0.01;
    f.turn = bm === 'dive' ? 9 : f.state === 'chase' ? 2.4 : 1.3;
    const gnd = Math.max(terrainTop(head.x, head.z), SEA);
    f.ty = bm === 'windup' ? gnd + def.hover + 1.1 : bm === 'dive' ? gnd + 0.95 : bm === 'recover' ? gnd + 1.05 + 0.15 * Math.sin(f.t * 3)
      : gnd + def.hover + 0.3 * Math.sin(f.t * 1.7 + f.seed);
    f.yk = bm === 'dive' ? 7 : 2.6;
    f.harmful = bm === 'dive';
    if (bm === 'orbit') wardenFire(f, dt, s.dist);
  },
  damageMul: (f) => (f.mode === 'recover' ? 1.5 : 1),
  // the marked landing spot while it winds up and dives
  drawFx(f) {
    if (!((f.mode === 'windup' && f.locked) || f.mode === 'dive')) return;
    const q = f.diveTo, pulse = 0.5 + 0.5 * Math.sin(G.time * 22);
    ring3(q.x, q.y + 0.07, q.z, 1.1 + 0.15 * pulse, 0.16, C.lock, 0.5 + 0.4 * pulse, 24);
    ring3(q.x, q.y + 0.07, q.z, 3.9, 0.07, C.violet, 0.22 + 0.15 * pulse, 40);
  },
});
