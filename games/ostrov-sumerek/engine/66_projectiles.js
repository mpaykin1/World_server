/* =============================================================================
   28 · Projectiles: voxel-aware flight with different ricochets
============================================================================= */
const projs = [];
const MAX_PROJ = 320;
function updateProjectiles(dt) {
  if (dt <= 0) return;
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    if (p.dead) { projs.splice(i, 1); continue; }
    p.age += dt;
    if (p.stuck > 0) { p.stuck -= dt; if (p.stuck <= 0) projs.splice(i, 1); continue; }
    p.life -= dt;
    if (p.life <= 0) {
      if (p.w && p.w.aoe) explode(p.pos, p.w);
      else if (p.pk.expire) p.pk.expire(p);
      projs.splice(i, 1);
      continue;
    }
    const sp = p.vel.length();
    const steps = Math.max(1, Math.ceil(sp * dt / 0.2)), h = dt / steps;
    let dead = false;
    for (let s = 0; s < steps && !dead && p.stuck <= 0; s++) {
      p.vel.y -= p.grav * h;
      if (p.rc.friction && p.grounded) { const fr = Math.exp(-p.rc.friction * h); p.vel.x *= fr; p.vel.z *= fr; }
      if (p.pk.steer) p.pk.steer(p, h);
      dead = projMove(p, h);
      if (!dead && p.stuck <= 0) dead = projHit(p);
    }
    if (dead) { projs.splice(i, 1); continue; }
    projTrail(p, dt);
  }
}
function projMove(p, h) {
  p.grounded = false;
  for (let ax = 0; ax < 3; ax++) {
    const v = ax === 0 ? p.vel.x : ax === 1 ? p.vel.y : p.vel.z;
    if (v === 0) continue;
    const nx = p.pos.x + (ax === 0 ? v * h : 0), ny = p.pos.y + (ax === 1 ? v * h : 0), nz = p.pos.z + (ax === 2 ? v * h : 0);
    if (solidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz)) && !(p.pk.through && p.pk.through(p))) {      // through(p): phases past voxels
      if (projWall(p, ax)) return true;
      if (p.stuck > 0) return false;
    } else p.pos.set(nx, ny, nz);
  }
  if (p.pos.y < SEA - 0.15 && !p.pk.noWater) {
    ripple(p.pos.x, p.pos.z, p.pk.splash ?? 0.8);
    for (let k = 0; k < 6; k++) dust.emit(p.pos.x, SEA + 0.05, p.pos.z, rr(-1, 1), rr(1.5, 3.5), rr(-1, 1), rr(0.3, 0.6), 0.08, 0.05, C.spray, 0.9, 14, 0.5, 1);
    if (p.w && p.w.aoe) explode(p.pos, p.w);
    return true;
  }
  if (Math.abs(p.pos.x - W / 2) > 70 || Math.abs(p.pos.z - D / 2) > 70 || p.pos.y > 40) return true;
  return false;
}
// the wall response lives in the ricochet registry (packs/*/ricochets.js)
function projWall(p, ax) {
  const comp = ax === 0 ? 'x' : ax === 1 ? 'y' : 'z';
  return p.rc.hit(p, comp, p.vel.length() || 1);
}
function ricochetFx(p, comp, vol = 1) {
  for (let k = 0; k < 5; k++) glow.emit(p.pos.x, p.pos.y, p.pos.z, rr(-2.5, 2.5) + p.vel.x * 0.1, rr(0.5, 3), rr(-2.5, 2.5) + p.vel.z * 0.1, rr(0.15, 0.35), 0.08, 0.02, C.spark, 1, 8, 1, 1);
  if (p.pk.loudRicochet || Math.random() < vol) SFX.ricochet(!!p.pk.loudRicochet);
}
function impact(p) {
  if (p.pk.impact) p.pk.impact(p);
  if (p.w && p.w.aoe) explode(p.pos, p.w);
  return true;
}
function breakOrb(o) {
  o.dead = true;
  orbBurst(o.pos);
  for (let k = 0; k < 6; k++) glow.emit(o.pos.x, o.pos.y, o.pos.z, rr(-3, 3), rr(-1, 3), rr(-3, 3), rr(0.2, 0.4), 0.08, 0.02, C.white, 1, 6, 1, 2);
  SFX.parry();
}
function projHit(p) {
  if (p.team === 0) {           // shots knock the warden's orbs out of the air
    for (const o of projs) {
      if (o.team !== 1 || o.dead) continue;
      const rr2 = o.r + p.r + 0.12;
      if (o.pos.distanceToSquared(p.pos) > rr2 * rr2) continue;
      breakOrb(o);
      if (p.pierce > 0) { p.pierce--; return false; }
      return !p.pk.passOrbs;
    }
  }
  if (p.team === 1) {
    if (G.state === 'play' && player.respawn <= 0) {
      const dx = player.pos.x - p.pos.x, dy = player.pos.y + 0.75 - p.pos.y, dz = player.pos.z - p.pos.z;
      if (dx * dx + dy * dy + dz * dz < (0.5 + p.r) ** 2) { hurt(1, p.pos.x, p.pos.z); orbBurst(p.pos); return true; }
    }
    return false;
  }
  for (const f of foes) {
    if (!foeAlive(f)) continue;
    const hd = f.segs[0];
    if (Math.abs(hd.x - p.pos.x) > f.extent || Math.abs(hd.z - p.pos.z) > f.extent) continue;
    for (let k = 0; k < f.n; k++) {
      const s = f.segs[k], rr2 = segRad(f, k) + p.r;
      if (s.distanceToSquared(p.pos) > rr2 * rr2) continue;
      const last = p.hit.get(f);
      if (last !== undefined && p.age - last < p.rehit) break;
      p.hit.set(f, p.age);
      const sp = Math.hypot(p.vel.x, p.vel.z) || 1;
      damageFoe(f, p.dmg, p.vel.x / sp, p.vel.z / sp, { kb: p.kb, freeze: p.w.freeze, at: s, w: p.w });
      if (p.w.aoe) { explode(p.pos, p.w); return true; }
      if (p.w.foeBounce && p.bounce > 0) {
        const n = tmpA.subVectors(p.pos, s);
        if (n.lengthSq() < 1e-6) n.set(-p.vel.x, 0, -p.vel.z);
        n.normalize();
        p.vel.reflect(n).multiplyScalar(0.8); p.vel.y = Math.abs(p.vel.y) + 2;
        p.pos.copy(s).addScaledVector(n, rr2 + 0.03);
        p.bounce--; SFX.tick();
        return false;
      }
      if (p.pierce > 0) { p.pierce--; return false; }
      return true;
    }
  }
  return false;
}
function explode(pos, w) {
  const R = w.aoe, q = tmpC.copy(pos);
  for (const f of foes) {
    if (!foeAlive(f)) continue;
    const h = f.segs[0], d = h.distanceTo(q);
    if (d > R + f.def.rad) continue;
    const fall = 1 - clamp(d / (R + f.def.rad), 0, 1) * 0.6;
    damageFoe(f, w.dmg * fall, (h.x - q.x) / (d || 1), (h.z - q.z) / (d || 1), { kb: w.kb * fall, burn: { dps: 4, t: 1.5 }, at: h, w });
  }
  const pd = Math.hypot(player.pos.x - q.x, player.pos.z - q.z);
  if (pd < R && G.state === 'play') {
    const k = (1 - pd / R) * 7;
    player.vel.x += (player.pos.x - q.x) / (pd || 1) * k; player.vel.z += (player.pos.z - q.z) / (pd || 1) * k;
    player.vel.y = Math.max(player.vel.y, k * 0.8); player.onGround = false;
  }
  blastLeaves(q, R * 0.8);
  for (let k = 0; k < 34; k++) glow.emit(q.x, q.y + 0.2, q.z, rr(-4, 4), rr(0.5, 6), rr(-4, 4), rr(0.3, 0.7), rr(0.3, 0.6), 0.05, k % 3 ? C.fire : C.flashWarm, 1, 2, 2.5, 0);
  for (let k = 0; k < 16; k++) glow.emit(q.x, q.y + 0.2, q.z, rr(-6, 6), rr(2, 8), rr(-6, 6), rr(0.4, 0.9), 0.09, 0.03, C.spark, 1, 14, 0.5, 1);
  for (let k = 0; k < 18; k++) dust.emit(q.x + rr(-0.6, 0.6), q.y + rr(0, 0.8), q.z + rr(-0.6, 0.6), rr(-1.5, 1.5), rr(0.8, 2.4), rr(-1.5, 1.5), rr(1, 1.8), 0.5, 1.6, C.smokeLight, 0.6, -0.5, 1.5, 0);
  combat.waves.push({ x: q.x, y: Math.max(groundBelow(q.x, q.y + 0.5, q.z), SEA) + 0.1, z: q.z, r: R, t: 0, dur: 0.4, col: C.fire });
  flashLight(q, 0xffa040, 18);
  const cd = camera.position.distanceTo(q);
  rig.trauma = Math.min(1, rig.trauma + clamp(1.1 - cd / 20, 0.15, 0.7));
  if (q.y < SEA + 1.2) ripple(q.x, q.z, 2);
  SFX.explode();
}
function orbBurst(q) {
  for (let k = 0; k < 10; k++) glow.emit(q.x, q.y, q.z, rr(-2, 2), rr(-1, 2), rr(-2, 2), rr(0.3, 0.5), 0.12, 0.02, C.orbCore, 1, 0, 2, 1);
}
// particle trails come from the projectile kind: trail(p) emits and returns the delay to the next puff
function projTrail(p, dt) {
  p.fx -= dt;
  if (p.fx > 0) return;
  p.fx = p.pk.trail ? p.pk.trail(p) || 0.05 : 1;
}

/* =============================================================================
   29 · Tesla chain lightning and the prism beam (hitscan, reflections)
============================================================================= */
function marchVoxel(o, d, maxT) {
  let px = Math.floor(o.x), py = Math.floor(o.y), pz = Math.floor(o.z);
  for (let t = 0.05; t <= maxT; t += 0.07) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y < SEA && d.y < 0) return { t, point: new THREE.Vector3(x, SEA + 0.02, z), axis: 1, water: true };
    const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
    if (cx === px && cy === py && cz === pz) continue;
    if (solidAt(cx, cy, cz)) {
      let axis = cx !== px ? 0 : cy !== py ? 1 : 2;
      const changed = (cx !== px) + (cy !== py) + (cz !== pz);
      if (changed > 1) {
        const ad = [Math.abs(d.x) * (cx !== px), Math.abs(d.y) * (cy !== py), Math.abs(d.z) * (cz !== pz)];
        axis = ad[0] >= ad[1] && ad[0] >= ad[2] ? 0 : ad[1] >= ad[2] ? 1 : 2;
      }
      return { t, point: new THREE.Vector3(x - d.x * 0.05, y - d.y * 0.05, z - d.z * 0.05), axis, water: false };
    }
    px = cx; py = cy; pz = cz;
  }
  return null;
}
function teslaChain(w, o, dir) {
  let first = null, best = 1e9;
  for (const f of foes) {
    if (!foeAlive(f)) continue;
    const h = f.segs[0], dx = h.x - o.x, dz = h.z - o.z, d = Math.hypot(dx, dz);
    if (d > w.range + f.def.rad) continue;
    const cos = (dx * dir.x + dz * dir.z) / ((d || 1) * Math.hypot(dir.x, dir.z) || 1);
    if (cos < 0.72 && f !== aim.target) continue;
    const s = d * (2 - cos) * (f === aim.target ? 0.6 : 1);
    if (s < best) { best = s; first = f; }
  }
  const pts = [o.clone()];
  if (!first) {
    const hit = marchVoxel(o, dir, w.range);
    const end = hit ? hit.point : o.clone().addScaledVector(dir, w.range);
    pts.push(end);
    for (let k = 0; k < 6; k++) glow.emit(end.x, end.y, end.z, rr(-2, 2), rr(0, 2.5), rr(-2, 2), rr(0.15, 0.35), 0.08, 0.02, C.zapCore, 1, 6, 1, 1);
  } else {
    const hitSet = new Set();
    let cur = first, dmg = w.dmg;
    while (cur && hitSet.size <= w.jumps) {
      hitSet.add(cur);
      const h = cur.segs[0], prev = pts[pts.length - 1];
      pts.push(h.clone());
      const dx = h.x - prev.x, dz = h.z - prev.z, d = Math.hypot(dx, dz) || 1;
      damageFoe(cur, dmg, dx / d, dz / d, { kb: 1.5, stun: w.stun, shock: true, at: h, w });
      dmg *= 0.82;
      let next = null, nd = w.jumpR;
      for (const f of foes) {
        if (!foeAlive(f) || hitSet.has(f)) continue;
        const dd = f.segs[0].distanceTo(h);
        if (dd < nd) { nd = dd; next = f; }
      }
      cur = next;
    }
  }
  combat.bolts.push({ pts, life: 0.22, full: 0.22 });
}
function updateBeam(dt, w) {
  const firing = input.atk && !combat.over && G.state === 'play' && combat.dash <= 0;
  if (firing) { combat.heat = Math.min(w.heat, combat.heat + dt); if (combat.heat >= w.heat) { combat.over = true; SFX.overheat(); } }
  else combat.heat = Math.max(0, combat.heat - dt * (combat.over ? w.heat / w.cool : 1.3));
  if (combat.over && combat.heat <= 0) combat.over = false;
  const on = firing && !combat.over;
  if (on !== combat.beam.on) { combat.beam.on = on; SFX.beam(on); }
  combat.beam.segs.length = 0;
  if (!on) return;
  combat.lastAtk = 0;
  let o = muzzleWorld(new THREE.Vector3());
  if (solidAt(Math.floor(o.x), Math.floor(o.y), Math.floor(o.z))) o.set(player.pos.x, player.pos.y + 0.85, player.pos.z);
  const cp = Math.cos(aim.pitch);
  const d = new THREE.Vector3(aim.dir.x * cp, Math.sin(aim.pitch), aim.dir.z * cp);
  let left = w.range;
  for (let b = 0; b <= w.reflect && left > 0.2; b++) {
    const hit = marchVoxel(o, d, left);
    const end = hit ? hit.point : o.clone().addScaledVector(d, left);
    combat.beam.segs.push([o.clone(), end.clone()]);
    beamDamage(o, end, w.dps * dt, w);
    if (!hit) break;
    left -= hit.t;
    if (hit.axis === 0) d.x = -d.x; else if (hit.axis === 1) d.y = -d.y; else d.z = -d.z;
    if (Math.random() < 0.6) glow.emit(end.x, end.y, end.z, rr(-2, 2), rr(0, 2.5), rr(-2, 2), rr(0.15, 0.3), 0.08, 0.02, hit.water ? C.spray : C.beamCore, 1, 6, 1, 1);
    if (hit.water && Math.random() < 0.2) ripple(end.x, end.z, 0.7);
    o = end.addScaledVector(d, 0.06);
  }
  combat.recoil = Math.max(combat.recoil, 0.15 + Math.random() * 0.1);
  rig.trauma = Math.max(rig.trauma, 0.12);
}
const _bp = new THREE.Vector3();
function beamDamage(a, b, dmg, w) {
  const ab = _rd.subVectors(b, a), L2 = ab.lengthSq() || 1;
  for (const f of foes) {
    if (!foeAlive(f)) continue;
    for (let k = 0; k < f.n; k++) {
      const s = f.segs[k];
      const t = clamp(_rv.subVectors(s, a).dot(ab) / L2, 0, 1);
      _bp.copy(a).addScaledVector(ab, t);
      const r = segRad(f, k) + 0.3;
      if (_bp.distanceToSquared(s) > r * r) continue;
      damageFoe(f, dmg, ab.x / Math.sqrt(L2), ab.z / Math.sqrt(L2), { kb: 0.4, quiet: true, at: s, w });
      if (Math.random() < 0.3) glow.emit(s.x, s.y, s.z, rr(-2, 2), rr(0, 2), rr(-2, 2), rr(0.15, 0.3), 0.08, 0.02, C.beamCore, 1, 4, 1, 1);
      break;
    }
  }
}
