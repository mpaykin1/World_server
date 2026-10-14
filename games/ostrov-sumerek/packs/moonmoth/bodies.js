/* Moonmoth: a soft GPU-lit body and two trailing wing ribbons; no textures or new renderer. */
defineBody('moonmoth_wings', {
  init(f, x, y, z) {
    f.segs.push(new THREE.Vector3(x, y, z));
    f.rads.push(f.def.rad);
    f.wingPhase = f.seed * 2.7;
    f.wingLight = toColor([0.6, 0.7, 1.0, 1.9]);
    f.wingTips = [new THREE.Vector3(), new THREE.Vector3()];
  },
  step(f, dt) { steerFoe(f, dt); },
  touch(f, px, py, pz) {
    const h = f.segs[0];
    return Math.hypot(px - h.x, py - h.y, pz - h.z) < f.def.rad + 0.35 ? 0 : -1;
  },
  render(f) {
    const h = f.segs[0];
    putSegment(f, h.x, h.y, h.z, f.def.rad, Math.max(0, f.alpha), f.seed);
  },
  drawFx(f) {
    const h = f.segs[0], phase = f.t * 8 + f.wingPhase;
    const flap = 0.48 + 0.28 * Math.sin(phase);
    const a = Math.atan2(f.vel.z, f.vel.x) + Math.PI / 2;
    const col = f.wingLight, alpha = Math.max(0, f.alpha) * 0.75;
    for (let k = 0; k < 2; k++) {
      const sign = k ? -1 : 1, tip = f.wingTips[k];
      tip.set(h.x + Math.cos(a) * flap * sign, h.y + 0.14 + 0.2 * Math.sin(phase),
        h.z + Math.sin(a) * flap * sign);
      ribbons.seg(h, tip, 0.18, 0.025, col, alpha, col, alpha * 0.42);
    }
    glow.spark(h.x, h.y, h.z, f.def.rad * 2, col, alpha * 0.2, 0);
  },
});
