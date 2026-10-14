/* Boomerang flight: the throw curls to the left, after a moment it turns home and homes on the hand,
   faster and faster; on the way back it passes through walls (through), and a catch refills the hand. */
const _home = new THREE.Vector3();
function catchBoomerang(p) {
  if (p.caught) return;
  p.caught = true; p.dead = true;
  if (p.w) { combat.ammo[p.w.id] = p.w.mag; combat.regen[p.w.id] = 0; }
  playSound('boom_catch');
  for (let k = 0; k < 10; k++) glow.emit(p.pos.x, p.pos.y, p.pos.z, rr(-1.5, 1.5), rr(0, 2), rr(-1.5, 1.5), rr(0.15, 0.3), 0.08, 0.02, C.spark, 1, 4, 1, 1);
}
defineProjectile('boomerang', {
  noWater: true,
  through: (p) => p.ret && (p.retT || 0) > 0.5,
  steer(p, h) {
    if (!p.ret) {
      p.vel.applyAxisAngle(UPV, 1.3 * h);                       // the curl of the throw
      if (p.age > 0.55) p.ret = true;
      return;
    }
    p.retT = (p.retT || 0) + h;
    _home.set(player.pos.x, player.pos.y + 0.9, player.pos.z).sub(p.pos);
    const d = _home.length(), sp = Math.min(24, 9 + p.retT * 14);
    if (d < 0.9) { catchBoomerang(p); return; }
    // far: a wide, inertial turn toward the hand; close: straight in (no orbiting around the hero)
    p.vel.lerp(_home.multiplyScalar(sp / d), d < 3 ? 1 : damp(5, h));
  },
  draw(p, li) { sprites.add(p.pos.x, p.pos.y, p.pos.z, 0.85, 0.85, -p.age * 21, PUV.boomerang, 0, 0, 1, 1, li, li, li, p.ret ? 0.25 : 0.1); },
  trail(p) {
    glow.emit(p.pos.x, p.pos.y, p.pos.z, rr(-0.3, 0.3), rr(-0.2, 0.3), rr(-0.3, 0.3), rr(0.15, 0.3), 0.07, 0.02, p.ret && p.retT > 0.5 ? C.zapGlow : C.spark, 0.7, 0, 2, 1);
    p.wh = (p.wh ?? 0) - 0.03;
    if (p.wh <= 0) { p.wh = 0.22; playSound('boom_whoosh', { vol: 0.5 }); }
    return 0.03;
  },
  expire: catchBoomerang,                                        // after its flight time it is back in the hand anyway
});
