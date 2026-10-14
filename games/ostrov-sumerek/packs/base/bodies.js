/* Foe bodies: how a body is built (init), moved toward the brain's intent (step), kept together
   while dissolving (follow), tested against the hero (touch → segment index or -1), smoked (trail)
   and drawn (render → putSegment / drawEyes; extra pieces may use ribbons or sprites).
   The brain writes f.target, f.speed, f.turn, f.ty, f.yk, f.arrive each frame. */
function serpentFollow(f, dt) {
  const def = f.def;
  for (let k = 1; k < f.n; k++) {
    const a = f.segs[k - 1], b = f.segs[k];
    const ddx = b.x - a.x, ddy = b.y - a.y, ddz = b.z - a.z;
    const L = Math.hypot(ddx, ddy, ddz) || 1e-4;
    if (L > def.spacing) { const q = def.spacing / L; b.set(a.x + ddx * q, a.y + ddy * q, a.z + ddz * q); }
    b.y += Math.sin(f.t * 2.0 - k * 0.5 + f.seed) * 0.15 * dt;
  }
}
// the head steers with inertia toward the target (engine helper steerFoe in engine/68_foes.js)
const steerHead = steerFoe;
// segmented smoke serpent: segments follow on a rope, a travelling wave ripples through the body
defineBody('serpent', {
  init(f, x, y, z) {
    for (let k = 0; k < f.n; k++) {
      f.segs.push(new THREE.Vector3(x, y - k * 0.25, z));
      f.rads.push(f.def.rad * (1 - 0.58 * k / Math.max(1, f.n - 1)));
    }
  },
  step(f, dt) { steerHead(f, dt); serpentFollow(f, dt); },
  follow: serpentFollow,
  touch(f, px, py, pz) {
    for (let k = 0; k < Math.min(3, f.n); k++) {
      const sg = f.segs[k];
      if (Math.hypot(px - sg.x, (py - sg.y) * 0.8, pz - sg.z) < f.rads[k] + 0.32) return k;
    }
    return -1;
  },
  trail(f, dt) {
    f.trail -= dt;
    if (f.trail > 0 || f.alpha <= 0.2) return;
    f.trail = f.def.trailEvery ?? 0.07;
    const tl = f.segs[f.n - 1], s = f.rads[f.n - 1];
    dust.emit(tl.x + rr(-0.1, 0.1), tl.y, tl.z + rr(-0.1, 0.1), rr(-0.2, 0.2), rr(0.1, 0.5), rr(-0.2, 0.2), rr(0.8, 1.4), s * 1.6, s * 4, C.smoke, 0.45 * f.alpha, -0.2, 1.2, 0);
  },
  render(f) {
    for (let k = 0; k < f.n; k++) {
      const sg = f.segs[k];
      let dx, dz;
      if (k > 0) { dx = f.segs[k - 1].x - sg.x; dz = f.segs[k - 1].z - sg.z; } else { dx = f.vel.x; dz = f.vel.z; }
      const L = Math.hypot(dx, dz) || 1;
      const wave = Math.sin(f.t * 5.2 - k * 0.75 + f.seed) * 0.24 * (0.25 + k / f.n) * (f.def.rad / 0.52) * (f.stun > 0 ? 0.2 : 1);
      putSegment(f, sg.x - dz / L * wave, sg.y + Math.sin(f.t * 3.1 - k * 0.6 + f.seed) * 0.07, sg.z + dx / L * wave,
        f.rads[k] * (0.9 + 0.1 * Math.sin(f.t * 4 + k)), Math.max(0, f.alpha) * (1 - 0.3 * k / f.n), f.seed + k * 1.7);
    }
    drawEyes(f, f.segs[0], f.def.rad);
  },
});
