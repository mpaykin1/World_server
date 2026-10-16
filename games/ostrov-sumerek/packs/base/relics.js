/* Relics: passive artifacts resting on shrines (biome.shrines per island, chosen by the seed).
   stats: multipliers (speed, jump, swim, melee, ranged, wisp, magnet) or additions
   (maxHp in half-hearts, soul = extra chance a foe leaves a healing soul, regen = seconds per healed half-heart).
   icon: a 16×16 @icon in packs/<pack>/art · rar: common | rare | epic | legend · hooks: onPickup(), onTick(dt). */
defineRelic('gull_feather', { name: 'Перо чайки', desc: 'Прыгаешь на пятую часть выше.', icon: 'gull_feather', rar: 'rare', stats: { jump: 1.2 } });
defineRelic('tide_charm', { name: 'Оберег прилива', desc: 'В воде ты быстр, как рыба, а на суше чуть резвее.', icon: 'tide_charm', rar: 'common', stats: { swim: 1.8, speed: 1.05 } });
defineRelic('iron_grip', { name: 'Железная хватка', desc: 'Удары в ближнем бою на четверть сильнее.', icon: 'iron_grip', rar: 'rare', stats: { melee: 1.25 } });
defineRelic('hawk_eye', { name: 'Соколиный глаз', desc: 'Стрелковое оружие бьёт на четверть сильнее.', icon: 'hawk_eye', rar: 'rare', stats: { ranged: 1.25 } });
defineRelic('soul_jar', { name: 'Сосуд душ', desc: 'Поверженные враги чаще оставляют души — а души лечат.', icon: 'soul_jar', rar: 'epic', stats: { soul: 0.3 } });
defineRelic('magnet_coin', { name: 'Монета-магнит', desc: 'Монеты тянутся к тебе издалека.', icon: 'magnet_coin', rar: 'common', stats: { magnet: 2.2 } });
defineRelic('heart_seed', { name: 'Семя сердца', desc: 'Ещё одно сердце — и оно сразу полное.', icon: 'heart_seed', rar: 'epic', stats: { maxHp: 2 } });
defineRelic('lantern_shard', { name: 'Осколок маяка', desc: 'Огонёк светит ярче, а раны понемногу затягиваются.', icon: 'lantern_shard', rar: 'legend', stats: { wisp: 1.6, regen: 18 } });
defineRelic('storm_glass', {
  name: 'Штормовое стекло', desc: 'В грозу молнии сами находят твоих врагов.', icon: 'storm_glass', rar: 'legend',
  biomes: ['dusk'],                       // storms only gather over the dusk island
  onPickup() { this.cd = 1; },
  onTick(dt) {
    if (!EVT.cur || EVT.cur.id !== 'storm' || EVT.k < 0.4) return;
    this.cd -= dt;
    if (this.cd > 0) return;
    let best = null, bd = 13;
    for (const f of foes) {
      if (!foeAlive(f) || f.def.boss) continue;
      const h = f.segs[0], d = Math.hypot(h.x - player.pos.x, h.z - player.pos.z);
      if (d < bd) { bd = d; best = f; }
    }
    if (best) { this.cd = 3.2; skyBolt(best.segs[0].x, best.segs[0].z, { dmg: 90, r: 1.6 }); }
  },
});
