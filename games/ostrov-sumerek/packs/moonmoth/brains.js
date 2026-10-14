/* Moonmoth: orbit -> committed dive -> retreat; contact is tested in the real foe loop. */
defineBrain('moonmoth_orbit', {
  init(f) {
    f.orbitDir = (f.seed % 2) < 1 ? -1 : 1;
    f.attackMode = 'orbit';
    f.attackT = 1.3;
  },
  think(f, dt, s) {
    const head = f.segs[0], def = f.def;
    if (f.state === 'wander') {
      f.timer -= dt;
      if (f.timer <= 0) {
        const a = f.t * 0.55 + f.seed;
        f.target.set(head.x + Math.cos(a) * 4, 0, head.z + Math.sin(a) * 4);
        f.timer = 2.5;
      }
      if (s.canChase && s.dist < s.chaseR) {
        f.state = 'chase'; f.attackMode = 'orbit'; f.attackT = 1.3;
      }
    }
    if (f.state === 'chase') {
      if (!s.canChase || s.dist > s.chaseR + 5) {
        f.state = 'wander'; f.timer = 0;
      } else {
        f.attackT -= dt;
        if (f.attackT <= 0) {
          if (f.attackMode === 'orbit') {
            f.attackMode = 'dive'; f.attackT = 3.0;
          } else {
            f.attackMode = 'orbit'; f.attackT = 0.9;
          }
        }
        if (f.attackMode === 'dive') {
          f.target.set(s.px, 0, s.pz);
        } else {
          const a = f.t * 1.6 * f.orbitDir + f.seed;
          f.target.set(s.px + 1.75 * Math.cos(a), 0, s.pz + 1.75 * Math.sin(a));
        }
      }
    }
    if (f.state === 'flee') {
      f.timer -= dt;
      f.target.set(head.x - s.dxp * 3, 0, head.z - s.dzp * 3);
      if (f.timer <= 0) {
        f.state = 'chase'; f.attackMode = 'orbit'; f.attackT = 1.1;
      }
    }
    const dive = f.state === 'chase' && f.attackMode === 'dive';
    f.speed = dive ? def.chase * 1.8 : f.state === 'chase' ? def.chase :
      f.state === 'flee' ? def.chase * 1.15 : def.wander;
    f.turn = dive ? 5.2 : 1.9;
    f.ty = dive ? s.py :
      Math.max(terrainTop(head.x, head.z), SEA) + def.hover + 0.22 * Math.sin(f.t * 2.1 + f.seed);
    f.yk = dive ? 7 : 2.2;
    f.arrive = 0.04;
    f.harmful = true;
  },
  onHurtHero(f) { f.state = 'flee'; f.timer = 1.8; f.attackMode = 'retreat'; },
  onDamaged(f) {
    if (f.hp > 0) { f.state = 'chase'; f.attackMode = 'dive'; f.attackT = 3; }
  },
});
