/* World events: one at a time, chosen every 20 s from the allowed ones (biomes / when / chance).
   Intensity k eases 0 → 1 → 0; palette, weather, ambience and spawnMul are blended in by k.
     palette   target values for any palette lever (engine/25_palette.js), mixed at k × paletteMix (0.85)
     weather   { kind, density, wind: [x, z] }       ambience { waves, wind, drone, rain, gust }
     spawnMul  number or { foeId: mul }               onStart / onTick(dt, k) / onEnd */
defineEvent('storm', {
  name: 'Гроза',
  toast: 'Над островом собирается гроза',
  biomes: ['dusk'],
  chance: 0.3, duration: [40, 60], cooldown: 70,
  when: (c) => c.play > 30,
  weather: { kind: 'rain', density: 1, wind: [1.8, 0.8] },
  palette: {
    skyTop: '#10162c', skyHor: '#3b4466', fog: '#2a3049', fogD: 0.03, keyCol: '#9fb2e0', keyI: 0.8, sunVis: 0.25, stars: 0,
    hemiSky: '#7484b8', hemiGnd: '#1a1626', hemiI: 0.9, deep: '#0c1a30', shallow: '#1f4a66', foam: '#b0c0e2', wSky: '#36405f',
    bloom: 0.8, exposure: 0.98, motes: 0, flies: 0.1, mist: 0.34, mistCol: '#4f5b7c', grain: 0.07, vig: 0.5,
    gain: [0.94, 0.98, 1.06], lift: [0.01, 0.02, 0.06],
  },
  ambience: { rain: 1, gust: 1, wind: 1.5, waves: 1.5 },
  spawnMul: 1.25,
  onTick(dt, k) {
    if (k > 0.55 && Math.random() < dt * 0.15 * k) skyBolt(player.pos.x + rr(-16, 16), player.pos.z + rr(-16, 16));
  },
});

defineEvent('sea_fog', {
  name: 'Морок',
  toast: 'С моря наползает морок — тени смелеют',
  warn: true,
  biomes: ['dusk'],
  chance: 0.25, duration: [30, 45], cooldown: 80,
  when: (c) => c.prog > 0.3,
  weather: { kind: 'sea_mist', density: 0.8, wind: [0.9, 0.3] },
  palette: { fogD: 0.05, fog: '#7d6f98', skyHor: '#a483a4', mist: 0.55, mistCol: '#b0a2cf', motes: 0.2, vig: 0.52, grain: 0.06, sunVis: 0.4 },
  ambience: { drone: 1.7, waves: 0.7, wind: 0.6 },
  spawnMul: { shade: 2 },
});

{
  // starfall: meteors streak over the island; now and then one lands nearby and leaves two healing souls
  const meteors = [];
  const fwd = new THREE.Vector3();
  const launch = () => {
    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const side = rr(-1, 1), dist = rr(26, 38), dir = Math.random() < 0.5 ? 1 : -1;
    meteors.push({
      p: new THREE.Vector3(camera.position.x + fwd.x * dist - fwd.z * side * 22, rr(20, 30), camera.position.z + fwd.z * dist + fwd.x * side * 22),
      v: new THREE.Vector3(-fwd.z * dir * rr(14, 22), -rr(6, 10), fwd.x * dir * rr(14, 22)), life: rr(0.7, 1.1),
    });
    playSound('meteor', { vol: 0.6 });
  };
  const fallingStar = () => {
    const a = rr(0, TAU), r = rr(3, 7);
    const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
    const gy = Math.max(groundBelow(x, H - 1, z), SEA);
    for (let k = 0; k < 18; k++) { const t = k / 18; glow.emit(x + (1 - t) * 6, gy + (1 - t) * 14, z + (1 - t) * 3, 0, 0, 0, 0.15 + t * 0.35, 0.4, 0.05, C.goldHot, 1, 0, 0, 0); }
    for (let k = 0; k < 30; k++) glow.emit(x, gy + 0.2, z, rr(-3, 3), rr(1, 5), rr(-3, 3), rr(0.4, 0.9), 0.14, 0.02, C.gold, 1, 6, 1, 1);
    flashLight(new THREE.Vector3(x, gy + 1.5, z), 0xffd890, 14);
    dropSoul(new THREE.Vector3(x, gy + 0.6, z), 2);
    playSound('wish');
  };
  defineEvent('starfall', {
    name: 'Звездопад',
    toast: 'Звездопад! Загадай желание',
    biomes: ['dusk'],
    chance: 0.35, duration: [25, 35], cooldown: 60,
    when: (c) => c.night,
    weather: { kind: 'stardust', density: 0.6, wind: [0.2, 0.1] },
    palette: { stars: 1, skyTop: '#081033', skyHor: '#3a3a78', coinGlow: 2.6, beam: 0.5, halo: 0.7, bloom: 1.0, motes: 0.6 },
    ambience: { wind: 0.6, drone: 0.7 },
    onTick(dt, k) {
      if (Math.random() < dt * 1.4 * k) launch();
      if (Math.random() < dt * 0.05 * k) fallingStar();
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.life -= dt;
        for (let j = 0; j < 3; j++) {
          const s = j / 3;
          glow.emit(m.p.x + m.v.x * dt * s, m.p.y + m.v.y * dt * s, m.p.z + m.v.z * dt * s, 0, 0, 0, rr(0.25, 0.45), 0.36 * Math.min(1, m.life * 2), 0.02, C.goldHot, 1, 0, 0, 0);
        }
        m.p.addScaledVector(m.v, dt);
        if (m.life <= 0) meteors.splice(i, 1);
      }
    },
    onEnd() { meteors.length = 0; },
  });
}
