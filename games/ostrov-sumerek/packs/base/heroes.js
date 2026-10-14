/* Playable characters. art = an @hero sprite sheet (packs/<pack>/art); stats are multipliers
   (hp in half-hearts); start = starting weapons; lantern = a glowing pixel the hero carries. */
defineCharacter('wanderer', {
  name: 'Странник',
  desc: 'Пришёл с моря с пустыми руками. Ни в чём не лучший — и ни в чём не хуже.',
  perk: 'без слабостей',
  art: 'wanderer',
  stats: { hp: 6 },
  start: ['fists'],
});
