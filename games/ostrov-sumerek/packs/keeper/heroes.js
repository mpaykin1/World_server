/* «Смотритель»: a little slower, sees farther — the lantern at his belt lights the way
   (lantern: the glowing pixel { x, y } in the 16×24 frame) — and he starts with the boomerang. */
defineCharacter('keeper', {
  name: 'Смотритель',
  desc: 'Младший смотритель маяка. Фонарь на поясе освещает путь, бумеранг всегда возвращается в руку.',
  perk: 'фонарь и бумеранг',
  art: 'keeper',
  stats: { hp: 6, speed: 0.95, ranged: 1.1, wisp: 1.25 },
  start: ['boomerang', 'fists'],
  lantern: { x: 11, y: 19, col: 'goldHot', halo: 'wispHalo' },
});
