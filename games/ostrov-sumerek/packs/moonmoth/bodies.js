/* Moonmoth: instanced shader body with broad, lagging ribbon wings; no extra renderer. */
defineBody('moonmoth_wings', {
  init(f, x, y, z) {
    f.segs.push(new THREE.Vector3(x, y, z));
    f.rads.push(f.def.rad);
    f.wingPhase = f.seed * 2.7;
    f.wingAngle = f.seed * 0.23;
    f.wingLight = toColor([0.6, 0.7, 1.0, 1.9]);
    f.wingTips = [new THREE.Vector3(), new THREE.Vector3()];
    f.wingRoots = [new THREE.Vector3(), new THREE.Vector3()];
    f.wingMids = [new THREE.Vector3(), new THREE.Vector3()];
  },
  step(f, dt) {
    steerFoe(f, dt);
    if (Math.hypot(f.vel.x, f.vel.z) > 0.08) {
      const desired = Math.atan2(f.vel.z, f.vel.x) + Math.PI / 2;
      const delta = Math.atan2(Math.sin(desired - f.wingAngle), Math.cos(desired - f.wingAngle));
      f.wingAngle += delta * damp(5, dt);
    }
  },
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
    const span = 0.9 + 0.14 * Math.sin(phase);
    const lift = 0.12 + 0.22 * Math.sin(phase);
    const a = f.wingAngle, lx = Math.cos(a), lz = Math.sin(a);
    const fx = lz, fz = -lx, col = f.wingLight;
    const alpha = Math.max(0, f.alpha) * 0.8;
    for (let k = 0; k < 2; k++) {
      const side = k ? -1 : 1, tip = f.wingTips[k];
      const root = f.wingRoots[k], mid = f.wingMids[k];
      root.set(h.x - fx * 0.16, h.y - 0.08, h.z - fz * 0.16);
      mid.set(h.x + lx * span * side * 0.56 + fx * 0.25,
        h.y + lift * 0.7, h.z + lz * span * side * 0.56 + fz * 0.25);
      tip.set(h.x + lx * span * side - fx * 0.12, h.y + lift,
        h.z + lz * span * side - fz * 0.12);
      ribbons.seg(root, tip, 0.42, 0.13, col, alpha * 0.72, col, alpha * 0.38);
      ribbons.seg(mid, tip, 0.3, 0.06, col, alpha * 0.6, col, alpha * 0.32);
    }
    glow.spark(h.x, h.y, h.z, f.def.rad * 2, col, alpha * 0.18, 0);
  },
});
