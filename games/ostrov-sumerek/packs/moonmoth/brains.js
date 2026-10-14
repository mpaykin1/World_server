/* Moonmoth: circles the player before closing in, then retreats briefly after a hit. */
defineBrain('moonmoth_orbit', {
  init(f) { f.orbitDir = (f.seed % 2) < 1 ? -1 : 1; },
  think(f, dt, s) {
    const head = f.segs[0], def = f.def;
    if (f.state === 'wander') {
      f.timer -= dt;
      if (f.timer <= 0) {
        const a = f.t * 0.55 + f.seed;
        f.target.set(head.x + Math.cos(a) * 4, 0, head.z + Math.sin(a) * 4);
        f.timer = 2.5;
      }
      if (s.canChase && s.dist < s.chaseR) f.state = 'chase';
    } else if (f.state === 'chase') {
      const a = f.t * 1.8 * f.orbitDir + f.seed;
      const radius = s.dist > 3.2 ? 1.1 : 2.1;
      f.target.set(s.px + radius * Math.cos(a), 0, s.pz + radius * Math.sin(a));
      if (!s.canChase || s.dist > s.chaseR + 5) { f.state = 'wander'; f.timer = 0; }
    } else if (f.state === 'flee') {
      f.timer -= dt;
      f.target.set(head.x - s.dxp * 2, 0, head.z - s.dzp * 2);
      if (f.timer <= 0) { f.state = 'wander'; f.timer = 0; }
    }
    f.speed = f.state === 'chase' ? def.chase : f.state === 'flee' ? def.chase * 1.15 : def.wander;
    f.turn = 1.7;
    f.ty = Math.max(terrainTop(head.x, head.z), SEA) + def.hover + 0.22 * Math.sin(f.t * 2.1 + f.seed);
    f.yk = 2.2;
    f.arrive = 0.04;
    f.harmful = true;
  },
  onHurtHero(f) { f.state = 'flee'; f.timer = 1.8; },
  onDamaged(f) { if (f.hp > 0) { f.state = 'chase'; f.timer = 0; } },
});
