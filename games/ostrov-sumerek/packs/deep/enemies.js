/* Lantern jellies rise from the sea as the light fails. look.tent is the tentacle colour (linear, ×k for bloom);
   style 1 turns the shared foe shader into a jelly bell. Two colourings of one creature. */
defineEnemy('lantern_jelly', {
  name: 'Медуза-фонарик', body: 'jelly', brain: 'drifter',
  seg: 1, rad: 0.55, hover: 0.85, hp: 36, dmg: 1, wander: 1.3, chase: 2.4, chaseR: 6.5,
  soul: 0.35, danger: 0.6, tentacles: 6, tentLen: 8, tentSeg: 0.19, riseY: () => SEA + 0.9,
  look: { core: [0.02, 0.07, 0.15], rim: [0.25, 0.85, 1.0], aura: [0.3, 0.9, 1.0], style: 1, pixels: 16, auraGain: 0.8, tent: [0.35, 0.95, 1.0, 1.6], death: [0.5, 1, 1, 2.6] },
  spawn: { from: 'sea', priority: 3, every: 5, dist: [9, 20], max: (c) => (c.tod < 0.3 ? 0 : c.night ? Math.min(3, 1 + Math.floor(c.collected / 8)) : 1) },
});
defineEnemy('rose_jelly', {
  name: 'Медуза-огонёк', body: 'jelly', brain: 'drifter',
  seg: 1, rad: 0.45, hover: 0.75, hp: 28, dmg: 1, wander: 1.5, chase: 2.8, chaseR: 7,
  soul: 0.3, danger: 0.6, tentacles: 5, tentLen: 7, tentSeg: 0.18, riseY: () => SEA + 0.8,
  look: { core: [0.12, 0.02, 0.08], rim: [1.0, 0.35, 0.7], aura: [1.0, 0.3, 0.75], style: 1, pixels: 16, auraGain: 0.8, tent: [1.0, 0.45, 0.8, 1.6], death: [1, 0.5, 0.85, 2.6] },
  spawn: { from: 'sea', priority: 4, every: 6, dist: [9, 20], biomes: ['dusk'], max: (c) => (c.night ? 2 : 0) },
});
