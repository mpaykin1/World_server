/* «Ледяной фьорд»: snow over frozen soil, slippery ice shores, pines, a frost-brick lighthouse.
   Night brings the aurora (palette lever 'aurora'); the everyday weather is light snow. */
defineBiome('frost', {
  name: 'Ледяной фьорд',
  short: 'снег, лёд, сияние',
  desc: 'Снежные холмы, скользкий лёд у берега, ели и северное сияние над маяком.',
  lede: 'Собери монеты на ледяном фьорде, переживи метель и одолей Ледяного стража.',
  blocks: {
    top: 'snow', soil: 'frozen_dirt', deep: 'stone', beach: 'ice', path: 'packed_snow', plaza: 'frost_brick',
    wall: 'frost_brick', pier: 'plank', post: 'bark', rock: 'stone', tower: 'frost_brick', towerCap: 'frost_brick', towerTop: 'ice', door: 'plank',
  },
  terrain: { height: 9.4, base: 0.4, hills: 0.95 },
  flora: [{ type: 'pine', count: 24, tries: 1400, spacing: 4 }],
  rocks: 7, ruins: 2, piers: 2, shrines: 3,
  leafColors: ['#e3ebf7', '#c0cde6', '#2a6658'],       // what drifts down from the crowns: snow, mostly
  guardian: 'frost_warden',
  foes: { imp: 0 },                                     // frost imps take the imps' place
  weather: { kind: 'snow', density: 0.5, wind: [0.7, 0.25] },
  ambience: { wind: 1.8, waves: 0.6, gust: 0.35 },
  palette: {
    dusk: {
      skyTop: '#2a3f7a', skyHor: '#f0c2c9', fog: '#b9c3dd', fogD: 0.017, keyCol: '#ffd9c4', keyI: 2.4,
      hemiSky: '#e2eaff', hemiGnd: '#4a5272', hemiI: 1.7, deep: '#173a63', shallow: '#5ab7c9', foam: '#ffffff', wSky: '#d3dbf2',
      mist: 0.22, mistCol: '#e6ecf9', motes: 0.4, gain: [0.98, 1.0, 1.05], lift: [0.02, 0.02, 0.05],
    },
    twi: {
      skyTop: '#16224f', skyHor: '#9a83c4', fog: '#6f74a3', keyCol: '#c8b0ff', hemiSky: '#a9b4e8', hemiGnd: '#272a44',
      deep: '#11284f', shallow: '#2e7a9a', wSky: '#8d86c2', mistCol: '#a7a6d6', aurora: 0.35, auroraA: '#4dffb0', auroraB: '#8a6bff',
    },
    night: {
      skyTop: '#030a1c', skyHor: '#15305a', fog: '#132240', keyCol: '#a9c4ff', hemiSky: '#5b74b8', deep: '#08162e', shallow: '#18507a',
      wSky: '#2a4a7a', mistCol: '#5d77b0', aurora: 1, auroraA: '#3dffa8', auroraB: '#7a6bff', flies: 0.3,
    },
    dawn: { skyHor: '#ffe0c8', fog: '#e2d6dc', keyCol: '#fff0d8', aurora: 0 },
  },
});
