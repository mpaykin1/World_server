/* Ranged firing modes. trigger(w, origin, dir, charge) fires once (cooldown and ammo are handled by
   the engine). continuous: true + update(dt, w) for weapons that act every frame while held (beam). */
defineFire('proj', {
  trigger(w, o, dir, charge) {
    const n = w.pellets || 1, spr = (w.spread || 0) * Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const yaw = n > 1 ? (i / (n - 1) - 0.5) * spr + rr(-0.05, 0.05) : rr(-0.5, 0.5) * spr;
      const d = tmpC.copy(dir).applyAxisAngle(UPV, yaw);
      d.y += rr(-0.5, 0.5) * spr * 0.25;
      spawnShot(w, o, d.normalize(), charge);
    }
  },
});
defineFire('chain', { trigger: (w, o, dir) => teslaChain(w, o, dir) });
defineFire('beam', { continuous: true, update: (dt, w) => updateBeam(dt, w) });
