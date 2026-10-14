/* =============================================================================
   33 · Held weapon, trails, beams, bolts, rings — per-frame visuals
============================================================================= */
const HAND = new THREE.Vector3();
const HOLD_SHIFT = 0.45, _hv = new THREE.Vector3();
function handWorld(out = HAND) {
  hero.updateMatrixWorld();
  out.set(0.1 * player.facing, 0.56, 0.1).applyMatrix4(hero.matrixWorld);
  return out.addScaledVector(_hv.subVectors(camera.position, out).normalize(), HOLD_SHIFT);
}
function spritePoint(px, py, out, cell = held.cell) {
  let lx = (px + 0.5) / cell - 0.5, ly = 0.5 - (py + 0.5) / cell;
  if (held.fx < 0) lx = -lx;
  if (held.fy < 0) ly = -ly;
  const ux = (lx - held.px) * held.size, uy = (ly - held.py) * held.size;
  const cs = Math.cos(held.rot), sn = Math.sin(held.rot);
  const rx = ux * cs - uy * sn, ry = ux * sn + uy * cs;
  const cr = U.camRight.value, cu = U.camUp.value;
  return out.set(held.x + cr.x * rx + cu.x * ry, held.y + cr.y * rx + cu.y * ry, held.z + cr.z * rx + cu.z * ry);
}
function muzzleWorld(out) {
  const w = curWeapon(), m = w.meta.muzzle || w.meta.tip;
  spritePoint(m[0], m[1], out, 32);
  return out.addScaledVector(_hv.subVectors(out, camera.position).normalize(), HOLD_SHIFT);
}
const lightTint = () => { const k = lerp(1, 0.6, G.tod * (1 - G.dawn)); return k; };
function renderHeld() {
  const w = curWeapon();
  if (G.state === 'title' || G.state === 'loading') { combat.trail.length = 0; return; }
  // the hand pose is always tracked (shots spawn from it); drawing is skipped while the hero blinks
  const draw = hero.visible;
  if (!draw) combat.trail.length = 0;
  const face = player.facing;
  const hand = handWorld();
  const li = lightTint();
  const cr = U.camRight.value, cu = U.camUp.value;
  let uv = w.uv, meta = w.meta, cell = 32, size = w.hs;
  let theta, push = 0, rot, fx = 1, fy = 1;
  if (w.A && w.A.render && w.A.render(w, hand, draw, li)) return;     // custom held renderers (flail …)
  const atk = combat.atk;
  const aimScr = atk ? screenAngleOf(atk.dir) : aim.screen;
  const eng = engaged();
  if (w.kind === 'melee') {
    const base = atk || eng ? aimScr : (face > 0 ? 0 : Math.PI);
    let ang;
    if (atk) { ang = atk.pose.ang; push = atk.pose.push; }
    else ang = 62 + Math.sin(G.time * 2.2) * 4 + Math.sin(player.walk * 6.3) * 4;
    const sgn = Math.cos(base) >= 0 ? 1 : -1;
    const target = base + sgn * ang * Math.PI / 180;
    held.ang += angDiff(held.ang, target) * (atk ? 1 : damp(14, 1 / 60));
    theta = held.ang;
    fx = sgn; rot = theta - (sgn > 0 ? Math.PI / 4 : 3 * Math.PI / 4);
    if (w.meta.base === 0) { rot = theta; fx = 1; fy = Math.cos(theta) >= 0 ? 1 : -1; }
    tmpA.set(Math.cos(base) * push, Math.sin(base) * push, 0);
  } else {
    let t = eng ? aimScr : (face > 0 ? -0.15 : Math.PI + 0.15);
    const sg = Math.cos(t) >= 0 ? 1 : -1;
    t += combat.recoil * 0.2 * sg;
    if (combat.reload > 0) {
      const k = 1 - combat.reload / combat.reloadDur;
      t += (w.spinReload ? k * TAU * 2 : -Math.sin(k * Math.PI) * 0.9) * sg;
    }
    if (combat.over) t += Math.sin(G.time * 30) * 0.05 - 0.4 * sg;
    held.ang += angDiff(held.ang, t) * (eng ? 1 : damp(12, 1 / 60));
    theta = held.ang;
    push = -combat.recoil * 0.12;
    rot = theta; fx = 1; fy = Math.cos(theta) >= 0 ? 1 : -1;
    tmpA.set(Math.cos(theta) * push, Math.sin(theta) * push, 0);
    if (w.chargeUV && combat.charging && combat.charge > 0.12) { meta = w.chargeMeta; uv = w.chargeUV; }
  }
  const ax = hand.x + cr.x * tmpA.x + cu.x * tmpA.y, ay = hand.y + cr.y * tmpA.x + cu.y * tmpA.y, az = hand.z + cr.z * tmpA.x + cu.z * tmpA.y;
  let px = (meta.grip[0] + 0.5) / cell - 0.5, py = 0.5 - (meta.grip[1] + 0.5) / cell;
  if (fx < 0) px = -px;
  if (fy < 0) py = -py;
  Object.assign(held, { x: ax, y: ay, z: az, rot, fx, fy, px, py, size, cell });
  if (!draw) return;
  if (w.hideHeld && w.hideHeld(w)) return;           // e.g. a boomerang in flight: the hand is empty
  const glowAmt = (w.glow || 0) * (0.85 + 0.15 * Math.sin(G.time * 9)) + (combat.charging ? combat.charge * 0.5 : 0) + (combat.over ? 0.6 : 0);
  sprites.add(ax, ay, az, size, size, rot, uv, px, py, fx, fy, li, li, li, glowAmt);
  const tw = w.A && w.A.trailWindow;
  if (atk && w.trail && w.A.trail !== 'none' && (atk.pose.active || (tw && atk.t > tw[0] && atk.t < tw[1]))) {
    const tip = w.meta.tip, gp = w.meta.grip;
    trailSample(tmpD.set(ax, ay, az), spritePoint(tip[0], tip[1], tmpB), spritePoint(lerp(gp[0], tip[0], 0.3), lerp(gp[1], tip[1], 0.3), tmpC));
  }
  if (w.heat && combat.over) {                       // an overheated weapon smokes
    const m = muzzleWorld(tmpB);
    if (Math.random() < 0.4) dust.emit(m.x, m.y, m.z, rr(-0.3, 0.3), rr(0.6, 1.4), rr(-0.3, 0.3), rr(0.6, 1), 0.12, 0.4, C.smokeLight, 0.5, -0.4, 1, 0);
  }
  // weapon.sparkle: { at: 'tip' | 'muzzle', col, rate, rise } — idle particles that make a weapon feel alive
  const sp = w.sparkle;
  if (sp && Math.random() < sp.rate) {
    const pt = sp.at === 'muzzle' ? (w.meta.muzzle || w.meta.tip) : w.meta.tip;
    const q = spritePoint(pt[0], pt[1], tmpB), c = toColor(sp.col, C.spark);
    if (sp.rise) glow.emit(q.x, q.y, q.z, rr(-0.2, 0.2), rr(0.6, 1.4), rr(-0.2, 0.2), rr(0.3, 0.5), 0.12, 0.02, c, 1, -1, 1, 0);
    else glow.emit(q.x + rr(-0.2, 0.2), q.y + rr(-0.2, 0.2), q.z + rr(-0.2, 0.2), 0, 0, 0, 0.12, 0.08, 0.02, c, 1, 0, 0, 1);
  }
  if (w.heldFx) w.heldFx(w, draw);
}
// the flail: a short grip in the hand, a sagging chain of links and the spiked ball on its spring
function renderFlailHeld(w, hand, draw, li) {
  if (!combat.flail.on || !FLAIL_GRIP) return false;
  tmpA.subVectors(combat.flail.ball, hand);
  const theta = screenAngleOf(tmpA), size = 0.8, rot = theta - Math.PI / 4;
  held.cell = 16; held.size = size; held.fx = 1; held.fy = 1;
  held.px = (FLAIL_GRIP.grip[0] + 0.5) / 16 - 0.5; held.py = 0.5 - (FLAIL_GRIP.grip[1] + 0.5) / 16;
  held.x = hand.x; held.y = hand.y; held.z = hand.z; held.rot = rot;
  if (!draw) return true;
  sprites.add(hand.x, hand.y, hand.z, size, size, rot, FLAIL_GRIP.uv, held.px, held.py, 1, 1, li, li, li, 0);
  const top = spritePoint(FLAIL_GRIP.top[0], FLAIL_GRIP.top[1], tmpB, 16);
  const ball = combat.flail.ball;
  for (let k = 1; k <= 7; k++) {
    const t = k / 8;
    const sag = Math.sin(t * Math.PI) * 0.12;
    sprites.add(lerp(top.x, ball.x, t), lerp(top.y, ball.y, t) - sag, lerp(top.z, ball.z, t), 0.19, 0.19, 0, LINK_UV, 0, 0, 1, 1, li, li, li, 0);
  }
  sprites.add(ball.x, ball.y, ball.z, 0.8, 0.8, G.time * 9, PUV.ball, 0, 0, 1, 1, li, li, li, 0.1);
  if (combat.flail.spin > 0.35) trailSample(hand, ball, tmpC.copy(ball).lerp(hand, 0.25));
  return true;
}
const TRAIL_LIFE = 0.13;
function trailSample(h, tip, base) {
  const cr = U.camRight.value, cu = U.camUp.value;
  const tu = (tip.x - h.x) * cr.x + (tip.y - h.y) * cr.y + (tip.z - h.z) * cr.z, tv = (tip.x - h.x) * cu.x + (tip.y - h.y) * cu.y + (tip.z - h.z) * cu.z;
  const bu = (base.x - h.x) * cr.x + (base.y - h.y) * cr.y + (base.z - h.z) * cr.z, bv = (base.x - h.x) * cu.x + (base.y - h.y) * cu.y + (base.z - h.z) * cu.z;
  combat.trail.push({ h: h.clone(), at: Math.atan2(tv, tu), rt: Math.hypot(tu, tv), ab: Math.atan2(bv, bu), rb: Math.hypot(bu, bv), t: G.time });
  if (combat.trail.length > 40) combat.trail.shift();
}
const _t0 = new THREE.Vector3(), _t1 = new THREE.Vector3(), _b0 = new THREE.Vector3(), _b1 = new THREE.Vector3(), _th = new THREE.Vector3();
function trailPoint(s0, s1, u, tipOut, baseOut) {
  const cr = U.camRight.value, cu = U.camUp.value;
  _th.copy(s0.h).lerp(s1.h, u);
  const at = s0.at + angDiff(s0.at, s1.at) * u, rt = lerp(s0.rt, s1.rt, u);
  const ab = s0.ab + angDiff(s0.ab, s1.ab) * u, rb = lerp(s0.rb, s1.rb, u);
  const ct = Math.cos(at) * rt, st = Math.sin(at) * rt, cb = Math.cos(ab) * rb, sb = Math.sin(ab) * rb;
  tipOut.set(_th.x + cr.x * ct + cu.x * st, _th.y + cr.y * ct + cu.y * st, _th.z + cr.z * ct + cu.z * st);
  baseOut.set(_th.x + cr.x * cb + cu.x * sb, _th.y + cr.y * cb + cu.y * sb, _th.z + cr.z * cb + cu.z * sb);
}
function renderTrail(w) {
  const tr = combat.trail;
  while (tr.length && G.time - tr[0].t > TRAIL_LIFE) tr.shift();
  if (tr.length < 2) return;
  const col = w.trail || C.white;
  const fade = (t) => { const k = 1 - (G.time - t) / TRAIL_LIFE; return k > 0 ? k * k : 0; };
  const linear = w.A && w.A.trail === 'streak';
  if (linear) {
    // straight strikes leave a speed streak along the weapon instead of a swept arc
    const s0 = tr[0], s1 = tr[tr.length - 1];
    trailPoint(s0, s0, 0, _t0, _b0); trailPoint(s1, s1, 0, _t1, _b1);
    ribbons.seg(_b0, _t1, 0.02, 0.2, col, 0, col, 0.55 * fade(s1.t));
    return;
  }
  for (let i = 0; i < tr.length - 1; i++) {
    const s0 = tr[i], s1 = tr[i + 1];
    const sub = clamp(Math.ceil(Math.abs(angDiff(s0.at, s1.at)) / 0.1), 1, 10);
    trailPoint(s0, s1, 0, _t0, _b0);
    for (let k = 1; k <= sub; k++) {
      const u = k / sub;
      trailPoint(s0, s1, u, _t1, _b1);
      const a0 = fade(lerp(s0.t, s1.t, (k - 1) / sub)) * 0.6, a1 = fade(lerp(s0.t, s1.t, u)) * 0.6;
      ribbons.quadA(_b0, _t0, _t1, _b1, col, a0 * 0.08, a0, a1, a1 * 0.08);
      _t0.copy(_t1); _b0.copy(_b1);
    }
  }
}
function ring3(x, y, z, r, wdt, col, a, n = 28) {
  for (let i = 0; i < n; i++) {
    const a0 = i / n * TAU, a1 = (i + 1) / n * TAU;
    _q0.set(x + Math.cos(a0) * (r - wdt / 2), y, z + Math.sin(a0) * (r - wdt / 2));
    _q1.set(x + Math.cos(a0) * (r + wdt / 2), y, z + Math.sin(a0) * (r + wdt / 2));
    _q2.set(x + Math.cos(a1) * (r + wdt / 2), y, z + Math.sin(a1) * (r + wdt / 2));
    _q3.set(x + Math.cos(a1) * (r - wdt / 2), y, z + Math.sin(a1) * (r - wdt / 2));
    ribbons.quad(_q0, _q1, _q2, _q3, col, a, col, a, true);
  }
}
const _ja = new THREE.Vector3(), _jb = new THREE.Vector3(), _jp = new THREE.Vector3();
function jagged(a, b, alpha, amp) {
  const n = 7;
  _jp.subVectors(b, a);
  const L = _jp.length() || 1;
  const px = -_jp.z / L, pz = _jp.x / L;
  _ja.copy(a);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    _jb.copy(a).addScaledVector(_jp, t);
    if (i < n) { const o = rr(-1, 1) * amp * Math.sin(t * Math.PI); _jb.x += px * o; _jb.z += pz * o; _jb.y += rr(-1, 1) * amp * 0.6; }
    ribbons.seg(_ja, _jb, 0.42, 0.42, C.zapGlow, 0.35 * alpha);
    ribbons.seg(_ja, _jb, 0.09, 0.09, C.zapCore, alpha);
    _ja.copy(_jb);
  }
}
function renderFx(dt) {
  const w = curWeapon();
  renderTrail(w);
  for (const wv of combat.waves) {
    const k = wv.t / wv.dur;
    ring3(wv.x, wv.y, wv.z, wv.r * easeOut(k), 0.5 * (1 - k) + 0.1, wv.col, 1 - k);
  }
  for (const f of foes) if (f.brain.drawFx && foeAlive(f)) f.brain.drawFx(f);     // brain-specific marks
  for (const f of foes) if (f.body.drawFx && f.alpha > 0.01) f.body.drawFx(f);    // body ribbons (tentacles, fins …)
  for (const b of combat.bolts) {
    const a = b.life / b.full;
    for (let i = 0; i < b.pts.length - 1; i++) jagged(b.pts[i], b.pts[i + 1], a, 0.45);
  }
  for (const [a, b] of combat.beam.segs) {
    const fl = 0.85 + 0.15 * Math.sin(G.time * 60);
    ribbons.seg(a, b, 0.42 * fl, 0.42 * fl, C.beamGlow, 0.45);
    ribbons.seg(a, b, 0.1, 0.1, C.beamCore, 1);
  }
  for (const p of projs) if (!p.dead && p.pk.tracer) p.pk.tracer(p);      // ribbon-drawn shots (tracers)
  // aim: ground reticle under the cursor for ranged weapons, lock-on ring around the auto target
  if (G.state === 'play') {
    if (w.ranged && !aim.auto) {
      const gy = Math.max(groundBelow(aim.point.x, aim.point.y + 0.5, aim.point.z), SEA) + 0.06;
      ring3(aim.point.x, gy, aim.point.z, 0.36, 0.06, C.reticle, 0.7, 20);
    }
    if (aim.target && foeAlive(aim.target) && (aim.auto || w.ranged)) {
      const h = aim.target.segs[0], r = aim.target.def.rad + 0.25, cr = U.camRight.value, cu = U.camUp.value;
      for (let i = 0; i < 4; i++) {
        const a0 = i * Math.PI / 2 + G.time * 2, a1 = a0 + 0.8;
        _ja.set(h.x + (cr.x * Math.cos(a0) + cu.x * Math.sin(a0)) * r, h.y + (cr.y * Math.cos(a0) + cu.y * Math.sin(a0)) * r, h.z + (cr.z * Math.cos(a0) + cu.z * Math.sin(a0)) * r);
        _jb.set(h.x + (cr.x * Math.cos(a1) + cu.x * Math.sin(a1)) * r, h.y + (cr.y * Math.cos(a1) + cu.y * Math.sin(a1)) * r, h.z + (cr.z * Math.cos(a1) + cu.z * Math.sin(a1)) * r);
        ribbons.seg(_ja, _jb, 0.06, 0.06, C.lock, 0.8);
      }
    }
  }
  for (const L of loot) {
    if (!L.alive) continue;
    const ww = WEAPONS[L.id], rc = RAR[ww.rar].col;
    ring3(L.x, L.gy + 0.05, L.z, 0.55 + 0.05 * Math.sin(G.time * 3 + L.phase), 0.08, rc, 0.55, 18);
    if (ww.rar !== 'common') {
      _ja.set(L.x, L.gy, L.z); _jb.set(L.x, L.gy + 5.5, L.z);
      ribbons.seg(_ja, _jb, 0.3, 0.05, rc, 0.22 + 0.25 * G.tod, rc, 0);
    }
  }
}
function updateFx(dt) {
  for (let i = combat.waves.length - 1; i >= 0; i--) {
    const wv = combat.waves[i];
    wv.t += dt;
    if (wv.hurt && !wv.hit && G.state === 'play' && player.respawn <= 0) {
      const r = wv.r * easeOut(wv.t / wv.dur), d = Math.hypot(player.pos.x - wv.x, player.pos.z - wv.z);
      if (Math.abs(d - r) < 0.55 && player.pos.y - wv.y < 0.55) { wv.hit = true; hurt(1, wv.x, wv.z); }
    }
    if (wv.t >= wv.dur) combat.waves.splice(i, 1);
  }
  for (let i = combat.bolts.length - 1; i >= 0; i--) { const b = combat.bolts[i]; b.life -= dt; if (b.life <= 0) combat.bolts.splice(i, 1); }
  for (const L of flashLights) L.intensity *= Math.exp(-16 * dt);
}
function renderProjectiles() {
  const li = lightTint();
  for (const p of projs) if (!p.dead && p.pk.draw) p.pk.draw(p, li);
}
function renderLoot() {
  const li = lightTint();
  for (const L of loot) {
    if (!L.alive) continue;
    const w = WEAPONS[L.id];
    const bob = Math.sin(G.time * 2 + L.phase) * 0.12, sway = Math.sin(G.time * 1.3 + L.phase) * 0.16;
    sprites.add(L.x, L.y + bob, L.z, 1.55, 1.55, sway, w.uv, 0, 0, 1, 1, li, li, li, 0.2 + 0.15 * Math.sin(G.time * 3 + L.phase));
    glow.spark(L.x, L.y + bob, L.z, 2.2, RAR[w.rar].col, 0.16 + 0.1 * G.tod, 0);
  }
}
