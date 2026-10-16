/* Frost events. The blizzard leans on the hero (the wind pushes), the aurora is a quiet gift. */
defineEvent('blizzard', {
  name: 'Метель',
  toast: 'Начинается метель — ветер сбивает с ног',
  warn: true,
  biomes: ['frost'],
  chance: 0.35, duration: [35, 50], cooldown: 70,
  when: (c) => c.play > 25,
  weather: { kind: 'snow', density: 1, wind: [4.5, 1.6] },
  palette: { fogD: 0.048, fog: '#c9d3ea', skyHor: '#d7def0', skyTop: '#7d8bb5', keyI: 1.2, sunVis: 0.2, mist: 0.45, mistCol: '#eef2fb', grain: 0.06, vig: 0.5, exposure: 1.04, stars: 0, aurora: 0 },
  ambience: { gust: 1.3, wind: 2.4, waves: 0.8 },
  spawnMul: 1.3,
  onTick(dt, k) {
    // the wind leans on the hero: barely felt on snow, a real slide on the ice shore
    const gust = 0.7 + 0.3 * Math.sin(G.time * 0.9) * Math.sin(G.time * 0.37 + 2.1);
    player.vel.x += 3.2 * k * gust * dt * 0.94; player.vel.z += 3.2 * k * gust * dt * 0.33;
  },
});
defineEvent('aurora', {
  name: 'Северное сияние',
  toast: 'Над фьордом разгорается сияние',
  biomes: ['frost'],
  chance: 0.3, duration: [30, 40], cooldown: 60,
  when: (c) => c.tod > 0.25 && c.tod < 0.7,
  weather: { kind: 'snow', density: 0.12, wind: [0.2, 0.1] },
  palette: { aurora: 1, stars: 0.8, skyTop: '#06102a', bloom: 0.9, coinGlow: 2.2, auroraA: '#3dffa8', auroraB: '#7a6bff' },
  paletteMix: 1,
  ambience: { wind: 0.5, drone: 0.6 },
});
