/* Melee arsenal: fists + 10 blades, hammers and chains.
   Fields (see docs/CONTENT.md → Оружие): name, kind 'melee' | 'ranged', rar common|rare|epic|legend,
   held (size in the hand, world units per 32 px cell), loot { near | tier }, stat / desc (UI text).
   melee: anim (defineAnim id), dmg, cd, dur, reach, arc°, kb, combo, fin { mul, kb, over, dash }, slow,
          trail colour, crit / critMul, burn { dps, t }, leech, stun, aoe { r, mul }, chop, hitstop, flame
   ranged: fire (defineFire id), proj (defineProjectile id), dmg (or [min, max] with charge), cd, speed,
          grav, life, size, r, ric (defineRicochet id), bounce, pierce, mag, reload, regen, spread, pellets,
          casing, tracer, color, flash, kick, sfx (synth steps or (charge) => steps) */
defineWeapon('fists', { name: 'Кулаки', kind: 'melee', rar: 'common', anim: 'punch', dmg: 6, cd: 0.24, dur: 0.24, reach: 1.3, arc: 90, kb: 2.5, combo: 3, fin: { mul: 1.8, kb: 8 }, slow: 0.75, trail: col3(1, 0.9, 0.8, 1.1), stat: 'Урон 6 · апперкот ×1.8', desc: 'Джеб, джеб и апперкот, который отбрасывает.',
  held: 0.9, starter: true });
defineWeapon('stick', { name: 'Палка', kind: 'melee', rar: 'common', anim: 'jab', dmg: 9, cd: 0.3, dur: 0.28, reach: 1.85, arc: 60, kb: 3.5, slow: 0.7, trail: col3(1, 0.8, 0.55, 1.1), stat: 'Урон 9 · длинный тычок', desc: 'Быстрый тычок на длину палки. Лучше, чем ничего.',
  held: 1.45, loot: { near: true } });
defineWeapon('dagger', { name: 'Кинжал', kind: 'melee', rar: 'common', anim: 'stab', dmg: 7, cd: 0.14, dur: 0.16, reach: 1.4, arc: 60, kb: 1.2, combo: 3, crit: 0.35, critMul: 2.6, slow: 0.9, trail: col3(0.8, 0.9, 1, 1.3), stat: 'Урон 7 · крит 35% ×2.6', desc: 'Очень быстрые уколы, треть из них — критические.',
  held: 1.15, loot: { tier: 1 } });
defineWeapon('sword', { name: 'Меч', kind: 'melee', rar: 'rare', anim: 'slash', dmg: 16, cd: 0.34, dur: 0.32, reach: 2.0, arc: 140, kb: 4.5, combo: 3, fin: { mul: 1.6, kb: 9, over: true }, slow: 0.6, trail: col3(0.7, 0.85, 1, 1.5), stat: 'Урон 16 · комбо из трёх', desc: 'Направо, налево и сверху вниз — третий удар сильнее.',
  held: 1.45, loot: { tier: 4 } });
defineWeapon('katana', { name: 'Катана', kind: 'melee', rar: 'epic', anim: 'slash', dmg: 13, cd: 0.26, dur: 0.26, reach: 2.1, arc: 150, kb: 3, combo: 3, fin: { mul: 2, kb: 6, dash: true }, slow: 0.75, trail: col3(0.35, 1, 1, 1.7), stat: 'Урон 13 · рывок ×2', desc: 'Широкие быстрые дуги, третий удар — рывок сквозь врагов.',
  held: 1.5, loot: { tier: 9 } });
defineWeapon('axe', { name: 'Топор', kind: 'melee', rar: 'rare', anim: 'chop', dmg: 30, cd: 0.72, dur: 0.62, reach: 1.9, arc: 100, kb: 8, chop: true, hitstop: 0.07, slow: 0.4, trail: col3(1, 1, 1, 1.2), stat: 'Урон 30 · рубит деревья', desc: 'Тяжёлый рубящий удар. Валит дерево с одного замаха.',
  held: 1.4, loot: { tier: 7 } });
defineWeapon('hammer', { name: 'Боевой молот', kind: 'melee', rar: 'epic', anim: 'slam', dmg: 38, cd: 1.05, dur: 0.82, reach: 1.8, arc: 120, kb: 10, aoe: { r: 3.6, mul: 0.6 }, stun: 1.3, hitstop: 0.1, slow: 0.3, trail: col3(1, 0.8, 0.45, 1.3), stat: 'Урон 38 · волна оглушает', desc: 'Удар о землю: ударная волна оглушает всех вокруг.',
  held: 1.5, loot: { tier: 13 } });
defineWeapon('spear', { name: 'Копьё', kind: 'melee', rar: 'rare', anim: 'thrust', dmg: 20, cd: 0.46, dur: 0.38, reach: 3.3, arc: 28, kb: 5, slow: 0.55, trail: col3(1, 0.95, 0.85, 1.3), stat: 'Урон 20 · пронзает линию', desc: 'Длинный выпад пронзает всех, кто стоит на линии.',
  held: 1.8, loot: { tier: 5 } });
defineWeapon('scythe', { name: 'Коса жнеца', kind: 'melee', rar: 'legend', anim: 'spin', dmg: 18, cd: 0.7, dur: 0.5, reach: 2.5, arc: 360, kb: 4.5, leech: 30, slow: 0.6, trail: col3(0.7, 0.3, 1, 1.9), stat: 'Урон 18 · вампиризм', desc: 'Круговой взмах. Каждые 30 урона возвращают полсердца.',
  held: 1.6, loot: { tier: 17 } });
defineWeapon('flamesword', { name: 'Пламень', kind: 'melee', rar: 'legend', anim: 'slash', dmg: 14, cd: 0.34, dur: 0.32, reach: 2.0, arc: 140, kb: 4, combo: 2, burn: { dps: 7, t: 3 }, flame: true, glow: 0.7, slow: 0.6, trail: col3(1, 0.45, 0.1, 2.2), stat: 'Урон 14 · горение 7/с', desc: 'Поджигает: враг горит ещё три секунды.',
  held: 1.45, loot: { tier: 15 }, sparkle: { at: 'tip', col: 'fire', rate: 0.5, rise: true } });
defineWeapon('flail', { name: 'Цеп', kind: 'melee', rar: 'epic', anim: 'flail', hold: true, dmg: 14, tick: 0.2, reach: 2.4, kb: 6, slow: 0.55, trail: col3(0.85, 0.85, 1, 1.1), stat: 'Урон 14 · держи атаку', desc: 'Держи атаку — шипастый шар крутится вокруг на цепи.',
  held: 1.3, loot: { tier: 11 } });
