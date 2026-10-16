/* Foes of the base island. look: core / rim / aura colours ('#hex' or linear [r, g, b]),
   spikes (bristles), pixels (silhouette grid), auraGain, style (0 smoke · 1 jelly bell).
   spawn: { from: 'sea' | 'land', priority, every (s), dist [min, max], max(ctx) → wanted count,
            biomes?, onSpawn(f) }  — ctx = { play, collected, total, all, tod, night, biome, prog, kills }
   A guardian (biome.guardian, default 'warden') wakes when every coin is taken. */
defineEnemy('imp', {
  name: 'Бесёнок', body: 'serpent', brain: 'stalker',
  seg: 5, rad: 0.34, spacing: 0.27, hover: 0.95, hp: 24, dmg: 1, wander: 1.9, chase: 3.3, chaseR: 7,
  soul: 0.18, danger: 0.5, eye: 0.09, eyeGap: 0.1,
  look: { core: '#06030c', rim: [0.42, 0.06, 0.1], aura: [1.0, 0.24, 0.3] },
  spawn: { from: 'sea', priority: 2, every: 3, dist: [11, 22], max: (c) => (c.play < 9 ? 0 : Math.min(4, 1 + Math.floor(c.collected / 5))) },
});
defineEnemy('shade', {
  name: 'Тень', body: 'serpent', brain: 'stalker',
  seg: 9, rad: 0.52, spacing: 0.36, hover: 1.2, hp: 70, dmg: 1, wander: 1.8, chase: 3.0, chaseR: 8,
  soul: 0.4, danger: 1, eye: 0.12, eyeGap: 0.15,
  look: { core: '#06030c', rim: '#2b0f47', aura: '#8a2cff' },
  spawn: {
    from: 'sea', priority: 1, every: 4, dist: [14, 30],
    max: (c) => (c.collected < 2 ? 0 : Math.min(3, 1 + Math.floor((c.collected - 2) / 5)) + (c.all ? 1 : 0)),
    onSpawn() { if (!G.firstShade) { G.firstShade = true; toast('Тени просыпаются…', 3000, true); } },
  },
});
defineEnemy('warden', {
  name: 'Страж маяка', body: 'serpent', brain: 'warden', boss: true,
  seg: 16, rad: 1.15, spacing: 0.62, hover: 2.3, hp: 700, dmg: 2, wander: 1.5, chase: 2.6, chaseR: 15,
  soul: 1, danger: 1, eye: 0.24, eyeGap: 0.34, soulEvery: 110, dissolve: 0.35, trailEvery: 0.04,
  riseY: () => world.tower.base + 3,
  look: { core: '#06030c', rim: [0.36, 0.07, 0.52], aura: [0.8, 0.22, 1.0], spikes: 0.07, auraGain: 0.5 },
  downText: 'Страж повержен — зажги маяк!',
  spawn: {
    from: 'guardian',
    onSpawn(f) {
      const h = f.segs[0];
      G.bossCam = 2.6;
      SFX.roar();
      rig.trauma = Math.min(1, rig.trauma + 0.6);
      toast('Страж маяка пробудился!', 3600, true, 3);
      for (let k = 0; k < 40; k++) dust.emit(h.x + rr(-1.5, 1.5), world.tower.base + 0.2, h.z + rr(-1.5, 1.5), rr(-2, 2), rr(1, 4), rr(-2, 2), rr(1, 2), 0.6, 1.6, C.smoke, 0.7, -0.4, 1, 0);
    },
  },
});
