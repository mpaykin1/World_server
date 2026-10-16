/* The original island: warm dusk, grass hills, sand beaches, a brick lighthouse. */
defineBiome('dusk', {
  name: 'Сумеречный остров',
  short: 'тёплые сумерки',
  desc: 'Тёплые сумерки, травяные холмы, песчаные пляжи и кирпичный маяк.',
  blocks: {
    top: 'grass', soil: 'dirt', deep: 'stone', beach: 'sand', path: 'dirt', plaza: 'stone',
    wall: 'brick', pier: 'plank', post: 'bark', rock: 'stone', tower: 'brick', towerCap: 'brick', towerTop: 'stone', door: 'plank',
  },
  terrain: { height: 8.4, base: 0.42, hills: 0.8 },
  flora: [{ type: 'round_tree', count: 26, tries: 1200, spacing: 4.3, trunk: 'bark', crown: 'leaves' }],
  rocks: 6, ruins: 2, piers: 2,
  leafColors: ['#3a823d', '#5ea443', '#8fc64d'],
  palette: {},                 // per phase overrides: { dusk: {...}, twi: {...}, night: {...}, dawn: {...} }
  weather: null,               // { kind: 'snow' | 'rain' | 'ash' | 'spores', density, wind }
  ambience: { wind: 1, waves: 1 },
});
