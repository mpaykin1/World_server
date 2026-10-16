/* Projectile kinds: how a shot looks (draw → sprite batch, tracer → ribbons), trails (particles)
   and bursts on impact. Flags: alwaysRicochet (mirror bounces at any angle), passOrbs (keeps flying
   after breaking a warden orb), splash (ripple strength in water), noWater (ignores the sea). */
defineProjectile('pebble', {
  draw(p, li) { sprites.add(p.pos.x, p.pos.y, p.pos.z, 0.5, 0.5, p.age * 9, PUV.pebble, 0, 0, 1, 1, li, li, li, 0); },
  impact(p) { const q = p.pos; for (let k = 0; k < 4; k++) dust.emit(q.x, q.y, q.z, rr(-1.5, 1.5), rr(0.5, 2), rr(-1.5, 1.5), rr(0.3, 0.5), 0.07, 0.05, C.smokeLight, 0.9, 10, 0.5, 1); },
});
defineProjectile('arrow', {
  draw(p, li) { sprites.add(p.pos.x, p.pos.y, p.pos.z, 0.95, 0.95, screenAngleOf(p.stuck > 0 ? p.stuckDir : p.vel), PUV.arrow, 0.4, 0, 1, 1, li, li, li, 0); },
  trail(p) { if (p.charge > 0.85) glow.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.25, 0.08, 0.02, C.white, 0.6, 0, 0, 1); return 0.05; },
});
defineProjectile('bolt', {
  stickDust: 'spray', stickGlow: 'ice',
  draw(p, li) { sprites.add(p.pos.x, p.pos.y, p.pos.z, 0.95, 0.95, screenAngleOf(p.stuck > 0 ? p.stuckDir : p.vel), PUV.bolt, 0.4, 0, 1, 1, li, li, li, 0.5); },
  trail(p) { glow.emit(p.pos.x, p.pos.y, p.pos.z, rr(-0.3, 0.3), rr(-0.3, 0.3), rr(-0.3, 0.3), rr(0.2, 0.4), 0.09, 0.02, C.ice, 0.8, 0, 2, 2); return 0.025; },
});
defineProjectile('saw', {
  alwaysRicochet: true, passOrbs: true, loudRicochet: true,
  draw(p, li) { sprites.add(p.pos.x, p.pos.y, p.pos.z, 0.9, 0.9, -p.age * 22, PUV.saw, 0, 0, 1, 1, li, li, li, 0.15); },
  trail(p) { glow.emit(p.pos.x, p.pos.y, p.pos.z, rr(-1, 1), rr(0, 1.5), rr(-1, 1), rr(0.1, 0.25), 0.06, 0.02, C.spark, 0.9, 6, 1, 1); return 0.05; },
});
defineProjectile('bomb', {
  splash: 1.6,
  draw(p, li) { sprites.add(p.pos.x, p.pos.y, p.pos.z, 0.7, 0.7, -p.age * 5 * Math.sign(p.vel.x || 1), PUV.bomb, 0, 0, 1, 1, li, li, li, p.life < 0.5 && Math.floor(p.life * 16) % 2 ? 1.2 : 0); },
  trail(p) {
    const q = p.pos;
    glow.emit(q.x, q.y + 0.3, q.z, rr(-0.3, 0.3), rr(0.5, 1.2), rr(-0.3, 0.3), rr(0.15, 0.3), 0.08, 0.02, C.spark, 1, 3, 1, 1);
    dust.emit(q.x, q.y + 0.2, q.z, 0, 0.5, 0, 0.6, 0.12, 0.3, C.smokeLight, 0.35, -0.2, 1, 0);
    return 0.03;
  },
});
function bulletImpact(p) {
  const q = p.pos;
  for (let k = 0; k < 4; k++) glow.emit(q.x, q.y, q.z, rr(-2, 2), rr(0.5, 2.5), rr(-2, 2), rr(0.12, 0.28), 0.07, 0.02, C.spark, 1, 8, 1, 1);
  dust.emit(q.x, q.y, q.z, 0, 0.4, 0, 0.4, 0.1, 0.3, C.smokeLight, 0.5, 0, 2, 0);
}
function bulletTracer(p) {
  if (!p.tracer && p.kind === 'bullet') { glow.spark(p.pos.x, p.pos.y, p.pos.z, 0.12, p.col, 0.8, 1); return; }
  // a hot streak a few frames long, brightest at the head, plus a small glint so even pellets read
  _ja.copy(p.pos).addScaledVector(p.vel, -0.04);
  ribbons.seg(_ja, p.pos, 0.01, p.size * 1.3, p.col, 0, p.col, 1);
  glow.spark(p.pos.x, p.pos.y, p.pos.z, p.kind === 'pellet' ? 0.16 : 0.22, p.col, 0.7, 0);
}
defineProjectile('bullet', { impact: bulletImpact, tracer: bulletTracer });
defineProjectile('pellet', { impact: bulletImpact, tracer: bulletTracer });
// the warden's orbs (team 1): they hurt the hero, can be shot down or parried
defineProjectile('orb', {
  noWater: true,
  draw(p) { glow.spark(p.pos.x, p.pos.y, p.pos.z, 0.34, C.orbCore, 1, 0); glow.spark(p.pos.x, p.pos.y, p.pos.z, 1.1, C.orbHalo, 0.45, 0); },
  trail(p) { glow.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, rr(0.3, 0.5), 0.3, 0.05, C.orbHalo, 0.6, 0, 0, 0); return 0.04; },
  impact: (p) => orbBurst(p.pos),
  expire: (p) => orbBurst(p.pos),
});
