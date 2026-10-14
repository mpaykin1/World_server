/* What a projectile does when it meets a wall. hit(p, comp, speed) → true = the projectile dies.
   comp is the axis that was blocked ('x' | 'y' | 'z'); p.pk is the projectile kind definition. */
defineRicochet('none', (p) => impact(p));
defineRicochet('mirror', (p, comp, sp) => {         // bounces off at grazing angles (or always, for saws)
  const v = p.vel, grazing = Math.abs(v[comp]) / sp < 0.8;
  if (p.bounce > 0 && (p.pk.alwaysRicochet || grazing)) { v[comp] *= -1; p.bounce--; ricochetFx(p, comp); return false; }
  return impact(p);
});
defineRicochet('scatter', (p, comp) => {             // pellets fly off in random directions
  const v = p.vel;
  if (p.bounce > 0) { v[comp] *= -0.8; v.applyAxisAngle(UPV, rr(-0.8, 0.8)); p.bounce--; ricochetFx(p, comp, 0.4); return false; }
  return impact(p);
});
defineRicochet('damped', (p, comp, sp) => {          // pebbles lose energy with each bounce
  const v = p.vel;
  if (p.bounce > 0 && sp > 3) {
    v[comp] *= -p.rest;
    for (const o of ['x', 'y', 'z']) if (o !== comp) v[o] *= 0.8;
    p.bounce--; SFX.tick();
    dust.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0.6, 0, 0.35, 0.12, 0.3, C.smokeLight, 0.5, 0, 2, 0);
    return false;
  }
  return impact(p);
});
defineRicochet('roll', {                             // bombs bounce, settle and roll with friction
  friction: 2.4,
  hit(p, comp, sp) {
    const v = p.vel;
    if (comp === 'y' && v.y < 0) {
      if (Math.abs(v.y) > 3) SFX.tock();
      v.y = Math.abs(v.y) < 2.2 ? 0 : -v.y * 0.42;
      v.x *= 0.85; v.z *= 0.85; p.grounded = true;
    } else { v[comp] *= -0.5; if (sp > 3) SFX.tock(); }
    return false;
  },
});
defineRicochet('stick', (p) => {                     // arrows and bolts bite into the wall
  const v = p.vel;
  p.stuck = 5; p.stuckDir = v.clone(); v.set(0, 0, 0); p.grav = 0;
  SFX.thunk();
  for (let k = 0; k < 4; k++) dust.emit(p.pos.x, p.pos.y, p.pos.z, rr(-1, 1), rr(0.5, 2), rr(-1, 1), rr(0.3, 0.5), 0.07, 0.04, p.pk.stickDust ? C[p.pk.stickDust] : C.chip, 0.9, 10, 0.5, 1);
  if (p.pk.stickGlow) for (let k = 0; k < 6; k++) glow.emit(p.pos.x, p.pos.y, p.pos.z, rr(-1.5, 1.5), rr(0, 2), rr(-1.5, 1.5), rr(0.3, 0.6), 0.09, 0.02, C[p.pk.stickGlow], 1, 6, 1, 2);
  return false;
});
