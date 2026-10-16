/* Drifter: swims in strokes — the bell contracts (a burst of speed), then glides. Keeps to the coast,
   comes for the hero only when they are close to it, gives up quickly; stings on touch. */
defineBrain('drifter', {
  init(f) { f.phase = Math.random() * TAU; f.pulse = 0; },
  think(f, dt, s) {
    const def = f.def, head = f.segs[0];
    f.phase += dt * (f.state === 'chase' ? 3.6 : 2.3);
    const stroke = Math.max(0, Math.sin(f.phase));
    f.pulse = stroke * stroke;
    if (f.state === 'wander') {
      f.timer -= dt;
      if (f.timer <= 0 || Math.hypot(f.target.x - head.x, f.target.z - head.z) < 1.2) {
        const sp = world.seaSpots[Math.floor(Math.random() * world.seaSpots.length)];
        f.target.set(lerp(sp[0] + 0.5, s.px, 0.25), 0, lerp(sp[1] + 0.5, s.pz, 0.25));
        f.timer = rr(5, 9);
      }
      if (s.canChase && s.dist < s.chaseR && player.invuln < 0.2) f.state = 'chase';
    } else if (f.state === 'chase') {
      f.target.set(s.px, 0, s.pz);
      if (!s.canChase || s.dist > s.chaseR + 4) { f.state = 'wander'; f.timer = 0; }
    } else if (f.state === 'flee') {
      f.timer -= dt;
      f.target.set(head.x - s.dxp * 3, 0, head.z - s.dzp * 3);
      if (f.timer <= 0) { f.state = 'wander'; f.timer = 0; }
    }
    const base = f.state === 'chase' ? def.chase : f.state === 'flee' ? def.chase * 1.3 : def.wander;
    f.speed = base * (0.25 + 1.5 * f.pulse);                          // strokes, never a constant glide
    f.turn = 1.0;
    f.ty = Math.max(terrainTop(head.x, head.z), SEA) + def.hover + 0.35 * f.pulse + 0.15 * Math.sin(f.t * 0.8 + f.seed);
    f.yk = 1.4; f.arrive = 0.01; f.harmful = true;
  },
  onHurtHero(f) {
    f.state = 'flee'; f.timer = 2.4;
    for (let k = 0; k < 14; k++) glow.emit(player.pos.x, player.pos.y + 0.9, player.pos.z, rr(-2, 2), rr(0, 2.5), rr(-2, 2), rr(0.2, 0.4), 0.08, 0.02, f.def.tentC, 1, 4, 1, 1);
    playSound('jelly_sting');
  },
  onDamaged(f) { if (f.state !== 'flee' && f.hp > 0) { f.state = 'flee'; f.timer = 1.2; f.phase = Math.PI / 2; } },   // a startled stroke away
});
