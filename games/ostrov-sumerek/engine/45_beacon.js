/* -----------------------------------------------------------------------------
   18 · Companion wisp, beacon flame, goal ring
----------------------------------------------------------------------------- */
const wisp = { pos: new THREE.Vector3(32, 10, 40), flash: 0, trail: 0 };
function nearestGoal() {
  if (G.all) return G.warden && foeAlive(G.warden) ? G.warden.segs[0] : world.ring;
  let best = null, bd = 1e9;
  for (const c of coins) if (c.alive) { const d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z); if (d < bd) { bd = d; best = c; } }
  return best;
}
function updateWisp(dt) {
  const t = G.time, a = t * 1.25;
  const anchor = G.state === 'title' || G.state === 'loading' ? world.spawn : player.vis;
  tmpA.set(anchor.x + Math.cos(a) * 0.95, anchor.y + 1.75 + Math.sin(t * 1.9) * 0.2, anchor.z + Math.sin(a) * 0.95);
  if (G.state === 'play' && G.idle > 5) {
    const c = nearestGoal();
    if (c) {
      const dx = c.x - player.pos.x, dz = c.z - player.pos.z, L = Math.hypot(dx, dz) || 1;
      const reach = Math.min(L, 4.5) * smooth(5, 8, G.idle) * 0.7;
      tmpA.x += dx / L * reach; tmpA.z += dz / L * reach;
    }
  }
  wisp.pos.lerp(tmpA, damp(3, dt));
  wisp.flash = Math.max(0, wisp.flash - dt * 1.8);
  const flick = 0.92 + 0.05 * Math.sin(t * 13.1) + 0.03 * Math.sin(t * 29.7);
  wispLight.position.copy(wisp.pos);
  wispLight.intensity = (pal.wisp * 9 * STATS.wisp + wisp.flash * 12) * flick;
  glow.spark(wisp.pos.x, wisp.pos.y, wisp.pos.z, 0.4, C.wispCore, 1, 0);
  glow.spark(wisp.pos.x, wisp.pos.y, wisp.pos.z, 1.5 + wisp.flash * 1.2, C.wispHalo, (0.22 + 0.2 * pal.wisp) * flick, 0);
  wisp.trail -= dt;
  if (wisp.trail <= 0) {
    wisp.trail = 0.045;
    glow.emit(wisp.pos.x + rr(-0.05, 0.05), wisp.pos.y, wisp.pos.z + rr(-0.05, 0.05), rr(-0.2, 0.2), rr(-0.1, 0.3), rr(-0.2, 0.2), rr(0.5, 0.9), 0.1, 0.02, C.wispHalo, 0.8, -0.3, 1.5, 1);
  }
}
const beacon = { level: 0.08, flare: 0, ember: 0, beam: 0 };
function updateBeacon(dt) {
  const goal = G.state === 'victory' ? 1.25 : 0.08 + 0.85 * (G.total ? G.collected / G.total : 0);
  beacon.level += (goal - beacon.level) * damp(1.5, dt);
  beacon.flare = Math.max(0, beacon.flare - dt * 0.45);
  const L = beacon.level + beacon.flare * 0.8;
  const t = G.time;
  flameU.uLevel.value = L;
  flameU.uSize.value.set(0.55 + L * 0.9, 0.75 + L * 1.7 + Math.sin(t * 7.3) * 0.05);
  const flick = 0.86 + 0.09 * Math.sin(t * 11.3) + 0.05 * Math.sin(t * 23.9);
  beaconLight.intensity = (3 + L * 36) * flick;
  beaconLight.distance = 22 + L * 32;
  const b = world.beacon;
  beacon.ember -= dt;
  while (beacon.ember <= 0) {
    beacon.ember += 1 / (4 + L * 34);
    glow.emit(b.x + rr(-0.25, 0.25), b.y + 0.3, b.z + rr(-0.25, 0.25), rr(-0.5, 0.5), rr(1.2, 3.2), rr(-0.5, 0.5), rr(0.8, 1.8), 0.1, 0.03, C.ember, 1, -0.4, 0.8, 1);
  }
  beacon.beam += ((G.state === 'victory' ? 1 : 0) - beacon.beam) * damp(0.8, dt);
  lbeamU.uI.value = beacon.beam * 1.0;
  lbeams.visible = beacon.beam > 0.01;
  lbeams.rotation.y += dt * 0.55;
  const open = G.all && G.wardenDown && G.state === 'play';
  ringU.uOn.value += ((open ? 1 : 0) - ringU.uOn.value) * damp(2, dt);
  if (open && Math.random() < dt * 14) {
    const a = Math.random() * TAU, r = world.ring;
    glow.emit(r.x + Math.cos(a) * 0.95, r.y + 0.1, r.z + Math.sin(a) * 0.95, 0, rr(0.8, 2), 0, rr(0.6, 1.2), 0.1, 0.02, C.gold, 1, -0.2, 0.5, 1);
  }
  if (open) {
    const r = world.ring;
    if (Math.hypot(player.pos.x - r.x, player.pos.z - r.z) < 1.25 && Math.abs(player.pos.y - r.y) < 1.5) win();
  }
}
