/* -----------------------------------------------------------------------------
   19 · Camera: heavy cinematic rig (lerped target/position, inertial orbit,
        occlusion pull-in, breathing drift, trauma shake)
----------------------------------------------------------------------------- */
function updateCamera(dt) {
  const t = G.time;
  if (G.state === 'play') {
    const qe = (keys.has('KeyC') ? 1 : 0) - (keys.has('KeyZ') ? 1 : 0);
    rig.yawT += qe * 1.8 * dt - pad.cx * 2.6 * dt;
    rig.pitchT = clamp(rig.pitchT + pad.cy * 1.4 * dt, 0.3, 1.15);
    if (G.idle > 7) { const c = nearestGoal(); if (c) rig.yawT += angDiff(rig.yawT, Math.atan2(player.pos.x - c.x, player.pos.z - c.z)) * damp(0.25, dt); }
  }
  if (!drag.active && touch.camId === null) {
    rig.yawT += rig.spin * dt; rig.spin *= Math.exp(-3.2 * dt);
    rig.pitchT = clamp(rig.pitchT + rig.pspin * dt, 0.3, 1.15); rig.pspin *= Math.exp(-3.2 * dt);
  }
  rig.yaw += angDiff(rig.yaw, rig.yawT) * damp(9, dt);
  rig.pitch += (rig.pitchT - rig.pitch) * damp(9, dt);
  rig.dist += (rig.distT - rig.dist) * damp(6, dt);
  let kPos, kLook;
  const b = world.beacon;
  if (G.state === 'title' || G.state === 'loading') {
    const a = t * 0.045 + G.sunAz + 1.0;
    tmpA.set(b.x, b.y - 4.5 + Math.sin(t * 0.21) * 0.6, b.z);
    tmpB.set(b.x + Math.cos(a) * 34, b.y + 5 + Math.sin(t * 0.13) * 2.5, b.z + Math.sin(a) * 34);
    kPos = 1.4; kLook = 1.6;
  } else if (G.state === 'victory') {
    const a = rig.vicA + G.endT * 0.1;
    tmpA.set(b.x, b.y - 3.5, b.z);
    tmpB.set(b.x + Math.sin(a) * 22, b.y + 1.5 + Math.sin(G.endT * 0.3) * 0.6, b.z + Math.cos(a) * 22);
    kPos = 0.9; kLook = 1.2;
  } else {
    const v = player.vel;
    tmpA.set(player.vis.x + v.x * 0.22, player.vis.y + 0.95, player.vis.z + v.z * 0.22);
    if (G.bossCam > 0 && G.warden) { G.bossCam -= dt; tmpA.lerp(G.warden.segs[0], 0.42 * smooth(0, 0.6, G.bossCam)); }
    const dirAt = (p) => tmpD.set(Math.sin(rig.yaw) * Math.cos(p), Math.sin(p), Math.cos(rig.yaw) * Math.cos(p));
    let lift = 0;
    if (rayFree(tmpA, dirAt(rig.pitch), rig.dist) < rig.dist * 0.85) {
      for (const add of [0.2, 0.4, 0.6]) {
        if (rayFree(tmpA, dirAt(Math.min(1.4, rig.pitch + add)), rig.dist) >= rig.dist * 0.9) { lift = add; break; }
      }
    }
    rig.lift += (lift - rig.lift) * damp(lift > rig.lift ? 5 : 1.2, dt);
    rig.pitchEff = Math.min(1.4, rig.pitch + rig.lift);
    dirAt(rig.pitchEff);
    const free = rayFree(tmpA, tmpD, rig.dist);
    rig.eff += (free - rig.eff) * damp(free < rig.eff ? 12 : 2.5, dt);
    const d = rig.eff + (G.state === 'dead' ? G.endT * 1.6 : 0);
    tmpB.copy(tmpA).addScaledVector(tmpD, d);
    kPos = 5.5; kLook = 8;
  }
  rig.blend = Math.min(1, rig.blend + dt * 0.4);
  const e = rig.blend * rig.blend * (3 - 2 * rig.blend);
  rig.pos.lerp(tmpB, damp(lerp(0.9, kPos, e), dt));
  rig.look.lerp(tmpA, damp(lerp(1.1, kLook, e), dt));
  if (G.danger > 0.55 && G.state === 'play') rig.trauma = Math.max(rig.trauma, (G.danger - 0.55) * 0.4);
  rig.trauma = Math.max(0, rig.trauma - dt * 1.5);
  const sh = (REDUCED ? 0.25 : 1) * rig.trauma * rig.trauma;
  const dx = Math.sin(t * 0.53) * 0.06 + (Math.sin(t * 37.1) + Math.sin(t * 23.3)) * 0.12 * sh;
  const dy = Math.sin(t * 0.71) * 0.05 + (Math.sin(t * 41.7) + Math.sin(t * 29.9)) * 0.1 * sh;
  camera.position.set(rig.pos.x + dx, rig.pos.y + dy, rig.pos.z);
  camera.lookAt(rig.look);
  camera.rotateZ(Math.sin(t * 0.37) * 0.004 + Math.sin(t * 31.0) * 0.012 * sh);
  camera.updateMatrixWorld();
  const m = camera.matrixWorld.elements;
  U.camRight.value.set(m[0], m[1], m[2]);
  U.camUp.value.set(m[4], m[5], m[6]);
  U.right.value.set(m[0], 0, m[2]).normalize();
  sky.position.copy(camera.position);
  const cutting = G.state === 'play' || G.state === 'paused' || G.state === 'dead';
  cutU.uCutOn.value += ((cutting ? 1 : 0) - cutU.uCutOn.value) * damp(4, dt);
  cutU.uCutA.value.set(player.vis.x, player.vis.y + 1.0, player.vis.z);
  cutU.uCutB.value.copy(camera.position);
}
