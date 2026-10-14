/* =============================================================================
   26 · Combat state, aim
============================================================================= */
const combat = {
  arsenal: ['fists'], cur: 'fists', cd: 0, combo: 0, comboT: 0, atk: null, lastAtk: 9, buf: 0,
  ammo: {}, regen: {}, reload: 0, reloadDur: 1, charge: 0, charging: false, heat: 0, over: false,
  recoil: 0, trail: [], dash: 0, dashDir: new THREE.Vector3(), dashHit: new Set(), shots: 0, leech: 0,
  flail: { on: false, spin: 0, ang: 0, ball: new THREE.Vector3(), vel: new THREE.Vector3(), hits: new Map(), whoosh: 0 },
  beam: { on: false, segs: [] }, bolts: [], waves: [],
};
const held = { ang: 1, x: 0, y: 0, z: 0, rot: 0, fx: 1, fy: 1, px: 0, py: 0, size: 2, cell: 32 };
const aim = { dir: new THREE.Vector3(0, 0, -1), point: new THREE.Vector3(), cx: 0, cy: 0, cursorT: 0, target: null, screen: 0, auto: true, pitch: 0 };
const curWeapon = () => WEAPONS[combat.cur];
const screenAngleOf = (v) => {
  const cr = U.camRight.value, cu = U.camUp.value;
  return Math.atan2(v.x * cu.x + v.y * cu.y + v.z * cu.z, v.x * cr.x + v.y * cr.y + v.z * cr.z);
};
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function updateAim(dt) {
  const w = curWeapon();
  const ox = player.pos.x, oy = player.pos.y + 0.85, oz = player.pos.z;
  aim.cursorT = input.src.mouse ? Math.max(aim.cursorT, 1) : aim.cursorT - dt;
  let tgt = null;
  if (aim.cursorT > 0 && !IS_TOUCH) {
    _ndc.set(aim.cx / innerWidth * 2 - 1, -(aim.cy / innerHeight) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    _plane.constant = -oy;
    if (_ray.ray.intersectPlane(_plane, aim.point)) {
      let bd = 1.8;
      for (const f of foes) {
        if (!foeAlive(f)) continue;
        const h = f.segs[0], d = Math.hypot(h.x - aim.point.x, h.z - aim.point.z) - f.def.rad;
        if (d < bd) { bd = d; tgt = f; }
      }
      tmpA.set(aim.point.x - ox, 0, aim.point.z - oz);
      if (tmpA.lengthSq() > 0.04) aim.dir.copy(tmpA.normalize());
      aim.auto = false;
    }
  } else {
    const R = w.ranged ? (w.range || 15) : w.reach + 1.2;
    let best = 1e9;
    for (const f of foes) {
      if (!foeAlive(f)) continue;
      const h = f.segs[0], dx = h.x - ox, dz = h.z - oz, d = Math.hypot(dx, dz);
      if (d > R + f.def.rad) continue;
      const cos = (dx * player.look.x + dz * player.look.z) / (d || 1);
      const score = d * (1.7 - cos);
      if (cos > -0.3 && score < best) { best = score; tgt = f; }
    }
    if (tgt) aim.dir.set(tgt.segs[0].x - ox, 0, tgt.segs[0].z - oz).normalize();
    else aim.dir.copy(player.look);
    aim.auto = true;
  }
  aim.target = tgt;
  aim.pitch = 0;
  if (tgt) { const h = tgt.segs[0], d = Math.hypot(h.x - ox, h.z - oz) || 1; aim.pitch = clamp(Math.atan2(h.y - oy, d), -0.55, 0.55); }
  aim.screen = screenAngleOf(aim.dir);
}

/* =============================================================================
   27 · Weapon handling: equip, reload, melee swings, ranged fire
============================================================================= */
function resetCombat() {
  const start = (HERO && HERO.start) || STARTERS;
  Object.assign(combat, { arsenal: [...start], cur: start[0], cd: 0, combo: 0, comboT: 0, atk: null, lastAtk: 9, buf: 0, ammo: {}, regen: {}, reload: 0,
    charge: 0, charging: false, heat: 0, over: false, recoil: 0, dash: 0, shots: 0, leech: 0 });
  for (const id of combat.arsenal) if (WEAPONS[id] && WEAPONS[id].mag) combat.ammo[id] = WEAPONS[id].mag;     // a hero may start armed
  combat.trail.length = 0; combat.bolts.length = 0; combat.waves.length = 0; combat.beam.segs.length = 0;
  combat.beam.on = false; combat.flail.on = false; combat.flail.spin = 0; combat.flail.hits.clear();
  SFX.beam(false);
  projs.length = 0; souls.length = 0;
  whud.nwT = 0; whud.nw.hidden = true;
  hudWeapon();
}
function equip(id) {
  if (!combat.arsenal.includes(id) || combat.cur === id) return;
  combat.cur = id; combat.atk = null; combat.charging = false; combat.charge = 0; combat.reload = 0;
  combat.flail.on = false; combat.flail.spin = 0; combat.trail.length = 0;
  if (combat.beam.on) { combat.beam.on = false; SFX.beam(false); }
  combat.cd = Math.max(combat.cd, 0.15);
  SFX.equip();
  hudWeapon();
}
function cycleWeapon(d) {
  const a = combat.arsenal;
  if (a.length < 2) return;
  equip(a[(a.indexOf(combat.cur) + d + a.length) % a.length]);
}
function startReload() {
  const w = curWeapon();
  if (!w.mag || w.regen || combat.reload > 0 || combat.ammo[w.id] >= w.mag) return;
  combat.reload = combat.reloadDur = w.reload;
  SFX.reload();
}
function engaged() {
  const w = curWeapon();
  return !!(combat.atk || combat.lastAtk < 0.6 || combat.charging || combat.beam.on || combat.flail.on || combat.dash > 0 || (w.ranged && !aim.auto));
}
function updateCombat(dt) {
  const w = curWeapon();
  combat.cd = Math.max(0, combat.cd - dt);
  combat.comboT = Math.max(0, combat.comboT - dt);
  combat.recoil = Math.max(0, combat.recoil - dt * 5);
  combat.lastAtk += dt;
  // a click during a swing or a cooldown is remembered for a moment, so combos chain without holding
  combat.buf = input.pressed ? 0.3 : Math.max(0, combat.buf - dt);
  for (const id of combat.arsenal) {
    const ww = WEAPONS[id];
    if (!ww.regen || combat.ammo[id] >= ww.mag) continue;
    combat.regen[id] = (combat.regen[id] || 0) + dt;
    if (combat.regen[id] >= ww.regen) { combat.regen[id] = 0; combat.ammo[id]++; }
  }
  if (combat.reload > 0) {
    combat.reload -= dt;
    if (combat.reload <= 0) { combat.reload = 0; combat.ammo[w.id] = w.mag; SFX.reloadEnd(); }
  }
  if (combat.dash > 0) updateDash(dt);
  if (w.F && w.F.continuous) w.F.update(dt, w);
  else {
    if (combat.beam.on) { combat.beam.on = false; SFX.beam(false); }
    combat.heat = Math.max(0, combat.heat - dt);
  }
  if (w.kind === 'melee') {
    if (w.A.hold) w.A.update(dt, w);
    else {
      if (combat.atk) advanceMelee(dt);
      if (!combat.atk && combat.cd <= 0 && (combat.buf > 0 || input.atk)) { combat.buf = 0; startMelee(w); }
    }
  } else if (!w.F.continuous) rangedInput(dt, w);
  emit('tick', dt);
  input.pressed = input.released = false;
}

// pose of a melee weapon over the swing — the curve lives in the anim registry (packs/*/anims.js)
const poseOf = (w, t, step, fin) => w.A.pose(w, t, step, fin);
function startMelee(w) {
  const step = w.combo && combat.comboT > 0 ? (combat.combo + 1) % w.combo : 0;
  const fin = !!(w.fin && w.combo && step === w.combo - 1);
  combat.combo = step;
  combat.atk = { w, t: 0, dur: w.dur * (fin ? 1.25 : 1), step, fin, hit: new Set(), dir: aim.dir.clone(), impact: false, chopped: false, pose: poseOf(w, 0, step, fin) };
  combat.cd = w.cd * (fin ? 1.3 : 1);
  combat.lastAtk = 0;
  combat.trail.length = 0;
  const L = w.A.lunge || [2.2, 3.4], lunge = fin ? L[1] : L[0];
  player.vel.x += aim.dir.x * lunge; player.vel.z += aim.dir.z * lunge;
  if (w.sfx) playSound(w.sfx, { k: fin ? 1 : 0 }); else SFX.swing(w.A.swing ?? 1);
  if (fin && w.fin.dash) {
    combat.dash = 0.2; combat.dashDir.copy(aim.dir); combat.dashHit = combat.atk.hit;
    player.invuln = Math.max(player.invuln, 0.35);
    SFX.dash();
  }
}
function advanceMelee(dt) {
  const a = combat.atk, w = a.w;
  a.t = Math.min(1, a.t + dt / a.dur);
  a.pose = poseOf(w, a.t, a.step, a.fin);
  if (a.pose.active) meleeSweep(a);
  if (w.A.impactAt !== undefined && !a.impact && a.t >= w.A.impactAt) { a.impact = true; w.A.impact(a); }
  if (w.chop && a.pose.active && !a.chopped) tryChop(a);
  if (a.t >= 1) { combat.atk = null; combat.comboT = 0.42; }
}
function meleeSweep(a) {
  const w = a.w;
  const ox = player.pos.x, oy = player.pos.y + 0.8, oz = player.pos.z;
  const reach = w.reach * (a.fin ? 1.15 : 1);
  const half = w.arc * (a.fin ? 1.2 : 1) * Math.PI / 360;
  parryOrbs(a, reach, half);
  for (const f of foes) {
    if (!foeAlive(f) || a.hit.has(f)) continue;
    for (let k = 0; k < f.n; k++) {
      const s = f.segs[k], r = segRad(f, k);
      const dx = s.x - ox, dz = s.z - oz, d = Math.hypot(dx, dz);
      if (d > reach + r || Math.abs(s.y - oy) > 1.7 + r) continue;
      if (half < Math.PI && d > r + 0.4) {
        const cos = (dx * a.dir.x + dz * a.dir.z) / d;
        if (Math.acos(clamp(cos, -1, 1)) > half + Math.atan2(r, d)) continue;
      }
      a.hit.add(f);
      const mul = a.fin ? w.fin.mul : 1, dl = d || 1;
      damageFoe(f, w.dmg * mul, dx / dl, dz / dl, { kb: (a.fin && w.fin.kb) || w.kb, crit: w.crit, critMul: w.critMul, burn: w.burn, leech: w.leech, at: s, w });
      G.hitstop = Math.max(G.hitstop, w.hitstop || (a.fin ? 0.05 : 0.022));
      if (w.flame) for (let q = 0; q < 6; q++) glow.emit(s.x, s.y, s.z, rr(-1.5, 1.5), rr(0.5, 3), rr(-1.5, 1.5), rr(0.3, 0.6), 0.14, 0.03, C.fire, 1, -1, 1.5, 1);
      if (w.onHit) w.onHit(f, s);
      break;
    }
  }
}
function parryOrbs(a, reach, half) {
  const ox = player.pos.x, oy = player.pos.y + 0.8, oz = player.pos.z;
  for (const o of projs) {
    if (o.team !== 1 || o.dead) continue;
    const dx = o.pos.x - ox, dz = o.pos.z - oz, d = Math.hypot(dx, dz);
    if (d > reach + 0.5 || Math.abs(o.pos.y - oy) > 1.9) continue;
    if (half < Math.PI && d > 0.6 && Math.acos(clamp((dx * a.dir.x + dz * a.dir.z) / d, -1, 1)) > half + 0.35) continue;
    breakOrb(o);
    G.hitstop = Math.max(G.hitstop, 0.04);
  }
}
function slamImpact(a) {
  const w = a.w;
  const cx = player.pos.x + a.dir.x * 1.2, cz = player.pos.z + a.dir.z * 1.2;
  const gy = groundBelow(cx, player.pos.y + 1.2, cz);
  combat.waves.push({ x: cx, y: Math.max(gy, SEA) + 0.08, z: cz, r: w.aoe.r, t: 0, dur: 0.5, col: w.trail });
  for (const f of foes) {
    if (!foeAlive(f)) continue;
    const h = f.segs[0], dx = h.x - cx, dz = h.z - cz, d = Math.hypot(dx, dz);
    if (d > w.aoe.r + f.def.rad || Math.abs(h.y - gy) > 3.5) continue;
    const near = d < 1.5 ? 1 : w.aoe.mul;
    damageFoe(f, w.dmg * near, dx / (d || 1), dz / (d || 1), { kb: w.kb * (1 - d / (w.aoe.r + 2)), stun: w.stun, at: h, w });
  }
  for (let k = 0; k < 26; k++) {
    const an = k / 26 * TAU;
    dust.emit(cx + Math.cos(an) * 0.4, gy + 0.1, cz + Math.sin(an) * 0.4, Math.cos(an) * rr(3, 5), rr(0.5, 1.6), Math.sin(an) * rr(3, 5), rr(0.4, 0.8), 0.2, 0.6, C.dirt, 0.7, 2, 3, 0);
  }
  for (let k = 0; k < 14; k++) glow.emit(cx, gy + 0.2, cz, rr(-3, 3), rr(2, 5), rr(-3, 3), rr(0.3, 0.6), 0.1, 0.02, C.spark, 1, 10, 1, 1);
  if (Math.max(gy, SEA) <= SEA + 0.1) ripple(cx, cz, 2);
  G.hitstop = Math.max(G.hitstop, w.hitstop);
  rig.trauma = Math.min(1, rig.trauma + 0.55);
  flashLight(tmpE.set(cx, gy + 0.6, cz), 0xffb060, 9);
  SFX.slam();
}
function tryChop(a) {
  for (const d of [0.7, 1.15, 1.6]) for (const hh of [0.3, 0.9, 1.5]) {
    const x = Math.floor(player.pos.x + a.dir.x * d), y = Math.floor(player.pos.y + hh), z = Math.floor(player.pos.z + a.dir.z * d);
    const bb = BLK[blockAt(x, y, z)];
    if (bb && bb.trunk && fellTree(x, z)) {
      a.chopped = true;
      G.hitstop = Math.max(G.hitstop, 0.08);
      rig.trauma = Math.min(1, rig.trauma + 0.35);
      return;
    }
  }
}
function updateDash(dt) {
  combat.dash -= dt;
  const p = player.vis;
  for (let k = 0; k < 3; k++) glow.emit(p.x + rr(-0.25, 0.25), p.y + rr(0.1, 1.4), p.z + rr(-0.25, 0.25), 0, rr(0, 0.4), 0, rr(0.25, 0.45), 0.15, 0.02, C.dash, 0.9, 0, 0, 1);
  const w = WEAPONS.katana;
  for (const f of foes) {
    if (!foeAlive(f) || combat.dashHit.has(f)) continue;
    for (let k = 0; k < f.n; k++) {
      const s = f.segs[k];
      const dx = s.x - player.pos.x, dz = s.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d < 1.5 + segRad(f, k) && Math.abs(s.y - player.pos.y - 0.8) < 1.8) {
        combat.dashHit.add(f);
        damageFoe(f, w.dmg * w.fin.mul, combat.dashDir.x, combat.dashDir.z, { kb: w.fin.kb, at: s, w });
        G.hitstop = Math.max(G.hitstop, 0.05);
        break;
      }
    }
  }
}
function updateFlail(dt, w) {
  const fl = combat.flail;
  fl.spin = clamp(fl.spin + (input.atk ? dt * 2.6 : -dt * 2.2), 0, 1);
  if (fl.spin > 0 && !fl.on) {
    fl.on = true; fl.ang = Math.atan2(aim.dir.z, aim.dir.x);
    fl.ball.set(player.pos.x + aim.dir.x * 0.8, player.pos.y + 0.8, player.pos.z + aim.dir.z * 0.8); fl.vel.set(0, 0, 0);
  }
  if (fl.spin <= 0) { fl.on = false; return; }
  combat.lastAtk = 0;
  const speed = 5 + 7 * fl.spin;
  fl.ang += dt * speed;
  const R = w.reach * (0.45 + 0.55 * fl.spin);
  tmpB.set(player.pos.x + Math.cos(fl.ang) * R, player.pos.y + 0.75 + Math.sin(fl.ang * 2) * 0.15, player.pos.z + Math.sin(fl.ang) * R);
  fl.vel.addScaledVector(tmpC.subVectors(tmpB, fl.ball), 140 * dt);
  fl.vel.multiplyScalar(Math.exp(-10 * dt));
  fl.ball.addScaledVector(fl.vel, dt);
  fl.whoosh -= dt;
  if (fl.whoosh <= 0) { fl.whoosh = TAU / speed; SFX.swing(0.8 + fl.spin * 0.4); }
  for (const f of foes) {
    if (!foeAlive(f)) continue;
    const last = fl.hits.get(f);
    if (last !== undefined && G.time - last < w.tick) continue;
    for (let k = 0; k < f.n; k++) {
      const s = f.segs[k], rr2 = segRad(f, k) + 0.45;
      if (s.distanceToSquared(fl.ball) > rr2 * rr2) continue;
      fl.hits.set(f, G.time);
      const dx = s.x - player.pos.x, dz = s.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
      damageFoe(f, w.dmg * (0.6 + 0.4 * fl.spin), dx / d, dz / d, { kb: w.kb, at: s, w });
      break;
    }
  }
}
function rangedInput(dt, w) {
  if (combat.reload > 0) return;
  const id = w.id;
  if (w.charge) {
    if (input.atk && combat.cd <= 0) {
      if (!combat.charging) { combat.charging = true; combat.charge = 0; SFX.draw(); }
      combat.charge = Math.min(1, combat.charge + dt / w.charge);
      combat.lastAtk = 0;
    } else if (combat.charging) {
      fireRanged(w, combat.charge);
      combat.charging = false; combat.charge = 0; combat.cd = 0.28;
    }
    return;
  }
  if (!(input.atk || combat.buf > 0) || combat.cd > 0) return;
  combat.buf = 0;
  if (w.mag && combat.ammo[id] <= 0) {
    if (w.regen) { if (input.pressed) SFX.empty(); } else startReload();
    return;
  }
  fireRanged(w, 1);
  combat.cd = w.cd;
  if (w.mag) { combat.ammo[id]--; if (combat.ammo[id] <= 0 && !w.regen) startReload(); }
}
function fireRanged(w, charge) {
  combat.lastAtk = 0; combat.shots++;
  const m = muzzleWorld(tmpE);
  const o = tmpB.copy(m);
  if (solidAt(Math.floor(o.x), Math.floor(o.y), Math.floor(o.z))) o.set(player.pos.x, player.pos.y + 0.85, player.pos.z);
  const cp = Math.cos(aim.pitch);
  const dir = tmpD.set(aim.dir.x * cp, Math.sin(aim.pitch), aim.dir.z * cp);
  w.F.trigger(w, o, dir, charge);
  combat.recoil = Math.min(2, combat.recoil + (w.recoil || 0.7));
  muzzleFlash(w, m, dir);
  if (w.casing) ejectCasing(m);
  if (w.sfx) playSound(w.sfx, { k: charge }); else SFX.shot(w.id, charge);
  rig.trauma = Math.min(1, rig.trauma + (w.recoil ? 0.12 * w.recoil : 0.035));
  if (w.kick) { player.vel.x -= aim.dir.x * w.kick; player.vel.z -= aim.dir.z * w.kick; }
}
function spawnShot(w, o, d, charge) {
  const sp = Array.isArray(w.speed) ? lerp(w.speed[0], w.speed[1], charge) : w.speed;
  const dmg = Array.isArray(w.dmg) ? lerp(w.dmg[0], w.dmg[1], charge) : w.dmg;
  const kb = Array.isArray(w.kb) ? lerp(w.kb[0], w.kb[1], charge) : (w.kb || 1);
  return addProj({
    w, kind: w.proj, team: 0, pos: o.clone(), vel: d.clone().multiplyScalar(sp), life: w.life, age: 0,
    r: w.r, size: w.size, dmg, kb, grav: w.grav || 0, ric: w.ric || 'none', bounce: w.bounce || 0, rest: w.rest || 0.6,
    pierce: w.pierce || 0, rehit: w.rehit || 99, stuck: 0, stuckDir: null, hit: new Map(), fx: 0,
    tracer: w.tracer ? combat.shots % w.tracer === 0 : true, col: w.color || C.spark, charge,
  });
}
// every projectile goes through here: resolves its kind (p.pk) and wall response (p.rc) once
function addProj(p) {
  p.pk = REG.projectiles.get(p.kind) || REG.projectiles.get('bullet');
  p.rc = REG.ricochets.get(p.ric || 'none') || REG.ricochets.get('none');
  if (projs.length >= MAX_PROJ) projs.shift();
  projs.push(p);
  return p;
}
let flashIdx = 0;
function flashLight(p, color, intensity) {
  const L = flashLights[flashIdx++ % flashLights.length];
  L.position.copy(p); L.color.set(color); L.intensity = intensity;
}
// weapon.flash: false (bows, slings) | { col, light, big, smoke } — defaults to a warm flash in the weapon colour
function muzzleFlash(w, m, dir) {
  const fl = w.flash === undefined ? {} : w.flash;
  if (fl === false) return;
  const c = toColor(fl.col, w.color || C.flashWarm), big = !!fl.big;
  glow.spark(m.x, m.y, m.z, big ? 1.5 : 0.9, c, 1, 0);
  for (let k = 0; k < (big ? 9 : 5); k++) glow.emit(m.x, m.y, m.z, dir.x * rr(2, 7) + rr(-1, 1), dir.y * 3 + rr(0, 1.6), dir.z * rr(2, 7) + rr(-1, 1), rr(0.08, 0.18), 0.08, 0.02, c, 1, 0, 3, 1);
  flashLight(m, fl.light ?? 0xffc070, big ? 11 : 6);
  if (fl.smoke) for (let k = 0; k < 6; k++) dust.emit(m.x, m.y, m.z, dir.x * rr(1, 3), rr(0.3, 1), dir.z * rr(1, 3), rr(0.5, 1), 0.2, 0.7, C.smokeLight, 0.5, -0.4, 2, 0);
}
function ejectCasing(m) {
  const cr = U.camRight.value, s = -player.facing;
  dust.emit(m.x, m.y, m.z, cr.x * s * rr(1.2, 2.4) + rr(-0.5, 0.5), rr(2.2, 3.6), cr.z * s * rr(1.2, 2.4) + rr(-0.5, 0.5),
    1.6, 0.07, 0.07, C.brass, 1, 18, 0.3, 1, true);
}
