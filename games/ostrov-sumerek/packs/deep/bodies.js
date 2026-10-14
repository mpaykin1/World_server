/* Jelly: one glowing bell (foe shader style 1) and tentacles drawn as additive ribbons.
   Each tentacle is a rope of beads: every bead follows the one above with a lag and a wave runs
   down the strand, so when the bell darts forward the tentacles trail behind and catch up later. */
function jellyRopes(f, dt) {
  const head = f.segs[0], def = f.def, seg = def.tentSeg ?? 0.2, pulse = f.pulse || 0;
  for (const t of f.tent) {
    const ch = t.chain;
    const a = t.a + Math.sin(f.t * 0.6 + t.a * 3) * 0.25;
    const rim = def.rad * (0.55 - 0.18 * pulse);                     // the rim draws in on each stroke
    ch[0].set(head.x + Math.cos(a) * rim, head.y - def.rad * 0.35, head.z + Math.sin(a) * rim);
    for (let k = 1; k < ch.length; k++) {
      const p = ch[k], q = ch[k - 1];
      p.y -= dt * 1.6;                                                 // they sink
      const w = Math.sin(f.t * 3.4 - k * 0.7 + t.ph) * 0.9 * dt;       // a wave travelling down the strand
      p.x += Math.cos(t.a + 1.57) * w; p.z += Math.sin(t.a + 1.57) * w;
      const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z, L = Math.hypot(dx, dy, dz) || 1e-4;
      if (L > seg) { const s = seg / L; p.set(q.x + dx * s, q.y + dy * s, q.z + dz * s); }
      const floor = Math.max(terrainTop(p.x, p.z), SEA - 1.2);        // rest on the ground, dip under the waves
      if (p.y < floor) p.y = floor;
    }
  }
}
defineBody('jelly', {
  init(f, x, y, z) {
    const def = f.def;
    f.segs.push(new THREE.Vector3(x, y, z));
    f.rads.push(def.rad);
    f.tent = [];
    const T = def.tentacles ?? 6, L = def.tentLen ?? 8;
    for (let i = 0; i < T; i++) {
      const a = (i / T) * TAU + Math.random() * 0.3, chain = [];
      for (let k = 0; k < L; k++) chain.push(new THREE.Vector3(x + Math.cos(a) * 0.2, y - 0.2 - k * 0.2, z + Math.sin(a) * 0.2));
      f.tent.push({ a, ph: Math.random() * TAU, chain });
    }
    def.tentC = def.tentC || toColor(def.look && def.look.tent, C.zapGlow);
  },
  step(f, dt) { steerFoe(f, dt); jellyRopes(f, dt); },
  follow: jellyRopes,
  touch(f, px, py, pz) {
    const h = f.segs[0];
    if (Math.hypot(px - h.x, (py - h.y) * 0.8, pz - h.z) < f.rads[0] + 0.3) return 0;
    for (const t of f.tent) {
      const tip = t.chain[t.chain.length - 2];
      if (Math.hypot(px - tip.x, py - 0.4 - tip.y, pz - tip.z) < 0.42) return 0;
    }
    return -1;
  },
  trail(f, dt) {                                                       // plankton motes shed by the tentacles
    f.trail -= dt;
    if (f.trail > 0 || f.alpha < 0.3) return;
    f.trail = 0.11;
    const t = f.tent[Math.floor(Math.random() * f.tent.length)], p = t.chain[t.chain.length - 1];
    glow.emit(p.x, p.y, p.z, rr(-0.2, 0.2), rr(0.1, 0.4), rr(-0.2, 0.2), rr(0.8, 1.4), 0.06, 0.02, f.def.tentC, 0.8 * f.alpha, -0.1, 1, 0);
  },
  render(f) {
    const h = f.segs[0], pulse = f.pulse || 0;
    const r = f.rads[0] * (1.06 - 0.16 * pulse);                     // squeezes on the stroke, swells on the glide
    putSegment(f, h.x, h.y, h.z, r, Math.max(0, f.alpha), f.seed);
  },
  drawFx(f) {
    const a = Math.max(0, f.alpha), col = f.def.tentC, h = f.segs[0];
    for (const t of f.tent) {
      const ch = t.chain, n = ch.length;
      for (let k = 0; k < n - 1; k++) {
        const u0 = k / (n - 1), u1 = (k + 1) / (n - 1);
        ribbons.seg(ch[k], ch[k + 1], 0.11 * (1 - u0 * 0.75), 0.11 * (1 - u1 * 0.75), col, 0.5 * a * (1 - u0), col, 0.5 * a * (1 - u1));
      }
    }
    glow.spark(h.x, h.y, h.z, f.def.rad * 2.8, col, (0.14 + 0.12 * (f.pulse || 0)) * a, 0);     // the bell lights the air
  },
});
