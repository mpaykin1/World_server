/* Moonmoth: instanced shader body with broad, lagging ribbon wings; no extra renderer. */
defineBody('moonmoth_wings', {
  init(f, x, y, z) {
    f.segs.push(new THREE.Vector3(x, y, z));
    f.rads.push(f.def.rad);
    f.wingPhase = f.seed * 2.7;
    f.wingAngle = f.seed * 0.23;
    f.wingLight = toColor([0.38, 0.55, 0.9, 0.72]);
    f.warningLight = toColor([0.92, 0.16, 0.3, 0.9]);
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
    putSegment(f, h.x, h.y, h.z, f.def.rad * 1.12, Math.max(0, f.alpha), f.seed);
  },
  drawFx(f) {
    const h = f.segs[0], phase = f.t * 8 + f.wingPhase;
    const span = 0.9 + 0.14 * Math.sin(phase);
    const lift = 0.12 + 0.22 * Math.sin(phase);
    const a = f.wingAngle, lx = Math.cos(a), lz = Math.sin(a);
    const fx = lz, fz = -lx, col = f.wingLight;
    const alpha = Math.max(0, f.alpha) * 0.54;
    for (let k = 0; k < 2; k++) {
      const side = k ? -1 : 1, tip = f.wingTips[k];
      const root = f.wingRoots[k], mid = f.wingMids[k];
      root.set(h.x - fx * 0.16, h.y - 0.08, h.z - fz * 0.16);
      mid.set(h.x + lx * span * side * 0.56 + fx * 0.25,
        h.y + lift * 0.7, h.z + lz * span * side * 0.56 + fz * 0.25);
      tip.set(h.x + lx * span * side - fx * 0.12, h.y + lift,
        h.z + lz * span * side - fz * 0.12);
      ribbons.seg(root, tip, 0.42, 0.13, col, alpha * 0.72, col, alpha * 0.34);
      ribbons.seg(mid, tip, 0.3, 0.06, col, alpha * 0.58, col, alpha * 0.28);
    }
    glow.spark(h.x, h.y, h.z, f.def.rad * 0.24, col, alpha * 0.002, 0);
    if (f.attackMode === 'windup' || f.attackMode === 'dive') {
      const y = Math.max(terrainTop(f.aimX, f.aimZ), SEA) + 0.07;
      const pulse = 0.5 + 0.5 * Math.sin(f.t * 22);
      ring3(f.aimX, y, f.aimZ, 0.72 + pulse * 0.18, 0.08,
        f.warningLight, (f.attackMode === 'windup' ? 0.45 : 0.22) + pulse * 0.28, 20);
    }
  },
});

