/* Island inhabitants. art: an @hero sheet (frame 4 is shown); ghost: cold, see-through, dissolving feet.
   place: 'tower' | 'spawn' | 'ruin' | (world) => { x, z } · lines cycle while the hero is near;
   a line may be (ctx) => text | null — ctx: left, all, wardenDown, night, relics, shrines, event, weapons, kills, plural. */
defineNPC('keeper_ghost', {
  name: 'Призрак смотрителя', art: 'keeper_old', ghost: true, tint: '#8fefff', place: 'tower', radius: 3.8, voice: 'ghost_voice',
  lines: [
    'Сорок лет я держал здесь огонь. Теперь твой черёд, путник.',
    (c) => (c.left > 0 ? `Маяк спит. Принеси ему ещё ${c.left} ${c.plural(c.left, 'монету', 'монеты', 'монет')}.` : null),
    (c) => (c.all && !c.wardenDown ? 'Страж проснулся. Бей, когда он ныряет к земле, — тогда он открыт.' : null),
    (c) => (c.wardenDown ? 'Страж пал. Встань в круг у двери — и маяк вспомнит свет.' : null),
    (c) => (c.shrines > 0 ? 'Над алтарями с реликвиями стоит столб света. Его видно издалека.' : null),
    (c) => (c.event === 'storm' ? 'Гроза… В такие ночи молнии сами находят тени.' : null),
    'Тени боятся света. Держись огонька, когда стемнеет.',
  ],
});
defineNPC('fisher', {
  name: 'Рыбак', art: 'fisher', biomes: ['dusk'], radius: 3.2, voice: 'fisher_voice',
  // on the first pier, two planks out from the shore
  place: (w) => (w.piers.length ? { x: w.piers[0].lx + w.piers[0].dx * 2 + 0.5, z: w.piers[0].lz + w.piers[0].dz * 2 + 0.5 } : null),
  lines: [
    'Клюёт плохо. Тени всю рыбу распугали.',
    (c) => (c.night ? 'Ночью вода чернеет — оттуда они и лезут.' : 'Как стемнеет, держись подальше от воды.'),
    'Говорят, на островке за пирсом что-то блестит.',
    (c) => (c.weapons === 0 ? 'С голыми руками далеко не уйдёшь. Оружие лежит прямо у берега.' : null),
  ],
});
