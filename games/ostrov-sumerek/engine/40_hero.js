/* -----------------------------------------------------------------------------
   15 · Hero: input → velocity (inertial), voxel physics, auto-step, animation
----------------------------------------------------------------------------- */
const player = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), vis: new THREE.Vector3(), safe: new THREE.Vector3(),
  onGround: false, coyote: 0, jumpBuf: 0, jumpHeld: false, jumpCut: false,
  facing: 1, walk: 0, frame: 4, step: 0, sq: 0, sqV: 0, lean: 0, hp: HP_MAX, maxHp: HP_MAX, invuln: 0,
  safeT: 0, inWater: false, respawn: 0, splashT: 0,
  look: new THREE.Vector3(0, 0, -1),      // last walking direction (horizontal, unit): auto-aim prefers foes in front
};
const rig = {
  yaw: 0, pitch: 0.62, dist: 11, yawT: 0, pitchT: 0.62, distT: 11, spin: 0, pspin: 0, eff: 11,
  pos: new THREE.Vector3(30, 22, 70), look: new THREE.Vector3(32, 8, 32), trauma: 0, blend: 1, vicA: 0, lift: 0, pitchEff: 0.62,
};
function tryStep(nx, nz) {
  if (!player.onGround) return false;
  const p = player.pos;
  const top = Math.floor(p.y + 0.001) + 1, lift = top - p.y;
  if (lift <= 0.001 || lift > 1.05) return false;
  if (hits(p.x, top, p.z) || hits(nx, top, nz)) return false;
  player.step -= lift;                          // the sprite glides up instead of popping
  p.y = top; p.x = nx; p.z = nz;
  return true;
}
function physicsStep(h) {
  const p = player.pos, v = player.vel;
  let landed = 0;
  if (v.x) { const nx = p.x + v.x * h; if (!hits(nx, p.y, p.z)) p.x = nx; else if (!tryStep(nx, p.z)) v.x = 0; }
  if (v.z) { const nz = p.z + v.z * h; if (!hits(p.x, p.y, nz)) p.z = nz; else if (!tryStep(p.x, nz)) v.z = 0; }
  v.y = Math.max(-28, v.y - PL.grav * (v.y < 0 ? 1.3 : 1) * h);
  const ny = p.y + v.y * h;
  if (!hits(p.x, ny, p.z)) { p.y = ny; player.onGround = false; }
  else if (v.y < 0) {
    const top = Math.floor(ny) + 1;
    if (!hits(p.x, top, p.z)) p.y = top;
    if (!player.onGround) landed = -v.y;
    player.onGround = true; v.y = 0;
  } else { p.y = Math.floor(ny + PL.height) - PL.height - 1e-3; v.y = 0; }
  return landed;
}
function surfaceUnder() {
  const p = player.pos;
  return blockAt(Math.floor(p.x), Math.floor(p.y - 0.5), Math.floor(p.z));
}
function footstep() {
  const p = player.pos, b = surfaceUnder();
  SFX.step(player.inWater ? 'water' : (BLK[b] && BLK[b].step) || 'soft');
  if (player.inWater) {
    ripple(p.x, p.z, 0.8);
    for (let k = 0; k < 4; k++) dust.emit(p.x + rr(-0.2, 0.2), SEA + 0.05, p.z + rr(-0.2, 0.2), rr(-1, 1), rr(1.5, 3), rr(-1, 1), rr(0.35, 0.6), 0.08, 0.05, C.spray, 0.85, 14, 0.5, 1);
  } else if (BLK[b] && BLK[b].dustCol) {
    const col = BLK[b].dustCol;
    for (let k = 0; k < 2; k++) dust.emit(p.x + rr(-0.15, 0.15), p.y + 0.05, p.z + rr(-0.15, 0.15), rr(-0.5, 0.5), rr(0.3, 0.8), rr(-0.5, 0.5), rr(0.4, 0.7), 0.12, 0.3, col, 0.55, 0.5, 2, 0);
  }
}
function onLand(v) {
  if (v < 5) return;
  player.sqV = -Math.min(9, v * 0.55);
  SFX.land(v);
  const p = player.pos;
  if (player.inWater) { ripple(p.x, p.z, 1.2); SFX.step('water'); return; }
  const sb = BLK[surfaceUnder()];
  const col = (sb && sb.dustCol) || C.dirt;
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; dust.emit(p.x + Math.cos(a) * 0.25, p.y + 0.05, p.z + Math.sin(a) * 0.25, Math.cos(a) * 1.6, rr(0.2, 0.6), Math.sin(a) * 1.6, rr(0.4, 0.6), 0.14, 0.35, col, 0.6, 0.4, 3, 0); }
}
function drown() {
  const p = player.pos;
  player.respawn = 0.95; player.vel.set(0, 0, 0);
  SFX.splash(); ripple(p.x, p.z, 1.6); ripple(p.x + 0.3, p.z - 0.2, 1);
  for (let k = 0; k < 28; k++) dust.emit(p.x + rr(-0.3, 0.3), SEA + 0.1, p.z + rr(-0.3, 0.3), rr(-2, 2), rr(3, 6.5), rr(-2, 2), rr(0.5, 0.9), 0.1, 0.06, C.spray, 0.9, 16, 0.4, 1);
  if (!G.warnedWater) { G.warnedWater = true; toast('Глубоко! Держись берега и причалов', 3000, true); }
}
function respawnAtSafe() {
  player.pos.copy(player.safe); player.vel.set(0, 0, 0); player.step = 0; player.invuln = 0;
  hurt(1);
}
function updatePlayer(dt) {
  const p = player.pos, v = player.vel;
  player.invuln = Math.max(0, player.invuln - dt);
  if (player.respawn > 0) {
    player.respawn -= dt;
    if (player.respawn <= 0 && G.state === 'play') respawnAtSafe();
    return;
  }
  let ix = 0, iz = 0;
  if (G.state === 'play') {
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
    ix += touch.vx + pad.mx; iz += -touch.vy - pad.my;
  }
  const m = Math.hypot(ix, iz);
  if (m > 1) { ix /= m; iz /= m; }
  G.idle = m > 0.1 ? 0 : G.idle + dt;
  const sy = Math.sin(rig.yaw), cy = Math.cos(rig.yaw);
  let dx = cy * ix - sy * iz, dz = -sy * ix - cy * iz;            // camera-relative
  if (simDir) { dx = simDir[0]; dz = simDir[1]; G.idle = 0; }
  const dm = Math.hypot(dx, dz);
  if (dm > 0.2) player.look.set(dx / dm, 0, dz / dm);
  // weapons weigh on the legs: heavy swings, a drawn bow or a firing beam slow the walk
  const w = curWeapon();
  let mul = 1;
  if (combat.atk) mul = w.slow ?? 0.6;
  else if (combat.charging) mul = 0.5;
  else if (combat.beam.on) mul = 0.6;
  else if (combat.flail.on) mul = lerp(1, w.slow, combat.flail.spin);
  const speed = PL.speed * STATS.speed * (player.inWater ? 0.62 * STATS.swim : 1) * mul;
  const f = damp(player.onGround ? PL.accG * groundGrip() : PL.accA, dt);      // ice (block.slip) lets the hero slide
  v.x += (dx * speed - v.x) * f;
  v.z += (dz * speed - v.z) * f;
  if (combat.dash > 0) { v.x = combat.dashDir.x * 15; v.z = combat.dashDir.z * 15; }
  player.jumpBuf = Math.max(0, player.jumpBuf - dt);
  player.coyote = player.onGround ? 0.11 : Math.max(0, player.coyote - dt);
  if (player.jumpBuf > 0 && player.coyote > 0) {
    v.y = PL.jumpV * STATS.jump;
    player.jumpBuf = 0; player.coyote = 0; player.onGround = false; player.jumpCut = false;
    player.sqV = 7; SFX.jump();
    if (player.inWater) ripple(p.x, p.z, 1);
  }
  if (!player.jumpHeld && v.y > 2 && !player.jumpCut) { v.y *= 0.55; player.jumpCut = true; }
  const steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
  const was = player.onGround;
  let landV = 0;
  for (let s = 0; s < steps; s++) landV = Math.max(landV, physicsStep(h));
  if (player.onGround && !was) onLand(landV);
  player.inWater = p.y < SEA - 0.05;
  if (player.onGround && !player.inWater) { player.safeT += dt; if (player.safeT > 0.3) { player.safe.copy(p); player.safeT = 0; } }
  if (p.y < SEA - 1.25 && G.state === 'play') { drown(); return; }
  if (player.inWater && Math.hypot(v.x, v.z) > 1) { player.splashT -= dt; if (player.splashT <= 0) { player.splashT = 0.28; ripple(p.x, p.z, 0.6); } }
  // animation: frames by distance walked, facing from screen-space motion
  const hs = Math.hypot(v.x, v.z);
  const sxv = v.x * cy - v.z * sy;
  if (sxv > 0.35) player.facing = 1; else if (sxv < -0.35) player.facing = -1;
  if (G.state === 'play' && engaged()) {          // in a fight the hero faces the aim, not the walk
    const ca = Math.cos(combat.atk ? screenAngleOf(combat.atk.dir) : aim.screen);
    if (ca > 0.12) player.facing = 1; else if (ca < -0.12) player.facing = -1;
  }
  let frame;
  if (!player.onGround) frame = 5;
  else if (hs > 0.45) { player.walk += hs * dt; frame = Math.floor(player.walk / 0.5) % 4; }
  else frame = 4;
  if (frame !== player.frame) {
    if (player.onGround && hs > 0.45 && (frame === 0 || frame === 2)) footstep();
    player.frame = frame;
  }
  // lean into the swing, rock back from the recoil (overlapping motion on top of the walk lean)
  let leanT = clamp(-sxv * 0.03, -0.12, 0.12);
  if (combat.atk) leanT -= Math.cos(screenAngleOf(combat.atk.dir)) * 0.16 * Math.sin(combat.atk.t * Math.PI);
  if (combat.recoil > 0) leanT += Math.cos(aim.screen) * 0.06 * combat.recoil;
  player.lean += (leanT - player.lean) * damp(combat.atk ? 14 : 8, dt);
}
function updateHeroMesh(dt) {
  player.sqV += (-player.sq * 170 - player.sqV * 13) * dt;
  player.sq = clamp(player.sq + player.sqV * dt, -0.35, 0.35);
  player.step *= Math.exp(-14 * dt);
  player.vis.set(player.pos.x, player.pos.y + player.step, player.pos.z);
  setHeroFrame(player.frame, player.facing);
  hero.position.copy(player.vis);
  hero.rotation.y = Math.atan2(camera.position.x - hero.position.x, camera.position.z - hero.position.z);
  hero.rotation.x = -rig.pitchEff * 0.45;
  hero.rotation.z = player.lean;
  const breathe = player.frame === 4 ? Math.sin(G.time * 2.2) * 0.018 : 0;
  hero.scale.set(1 - player.sq * 0.5, 1 + player.sq + breathe, 1);
  const blinkOff = player.invuln > 0 && Math.floor(G.time * 18) % 2 === 0;
  hero.visible = player.respawn <= 0 && !blinkOff && G.state !== 'loading';
  heroMat.emissiveIntensity = 0.1 + G.tod * 0.16 + G.hurt * 0.9;
  const gy = groundBelow(player.pos.x, player.pos.y + 0.2, player.pos.z);
  const above = player.pos.y - gy;
  heroShadow.visible = hero.visible;
  heroShadow.position.set(player.vis.x, gy + 0.02, player.vis.z);
  const sc = clamp(1 - above * 0.16, 0.45, 1) * 0.95;
  heroShadow.scale.set(sc, 1, sc * 0.8);
  shadowU.uA.value = 0.5 * clamp(1 - above * 0.2, 0.25, 1);
}
function hurt(n, fx, fz) {
  if (player.invuln > 0 || G.state !== 'play') return false;
  player.hp = Math.max(0, player.hp - n); G.hits++;
  player.invuln = 1.5; G.hurt = 1; rig.trauma = Math.min(1, rig.trauma + 0.75);
  G.hitstop = Math.max(G.hitstop, 0.06);
  FX.uFlashColor.value.setRGB(1, 0.45, 0.85);
  if (fx !== undefined) {
    const dx = player.pos.x - fx, dz = player.pos.z - fz, L = Math.hypot(dx, dz) || 1;
    player.vel.x = dx / L * 7; player.vel.z = dz / L * 7; player.vel.y = 6.5; player.onGround = false;
  }
  SFX.hurt();
  emit('hurt', n);
  const p = player.pos;
  for (let k = 0; k < 16; k++) glow.emit(p.x, p.y + 0.8, p.z, rr(-3, 3), rr(0, 4), rr(-3, 3), rr(0.3, 0.6), 0.14, 0.02, C.violet, 1, 4, 2, 1);
  updateHearts(true);
  if (player.hp <= 0) die();
  return true;
}
// how well the boots hold: 1 on ordinary ground, less on blocks with slip (0..1)
function groundGrip() {
  const b = blockAt(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.05), Math.floor(player.pos.z));
  const sl = b ? BLK[b].slip || 0 : 0;
  return 1 - sl * 0.88;
}
