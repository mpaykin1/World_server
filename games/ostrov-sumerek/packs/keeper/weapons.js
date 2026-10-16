/* The boomerang: one in the hand at a time (mag 1). It curves out, turns back, phases through walls
   on the way home and is caught by itself; while it flies the hand is empty (hideHeld). */
defineWeapon('boomerang', {
  name: 'Бумеранг', kind: 'ranged', rar: 'rare', fire: 'proj', proj: 'boomerang', ric: 'boomerang',
  dmg: 15, cd: 0.3, speed: 16, life: 4, size: 0.85, r: 0.34, pierce: 99, rehit: 0.35, kb: 3, mag: 1, regen: 6,
  stat: 'Урон 15 · туда и обратно', desc: 'Летит дугой, режет всех на пути и сам возвращается в руку.',
  held: 1.0, loot: { tier: 5 }, flash: false, recoil: 0.3,
  hideHeld: (w) => (combat.ammo[w.id] ?? 1) <= 0,
  meter() {
    const a = combat.ammo.boomerang ?? 1;
    return { fill: a > 0 ? 1 : 0.5 + 0.25 * Math.sin(G.time * 9), text: a > 0 ? 'в руке' : 'в полёте' };
  },
  sfx: [['sweep', 0.25, 600, 2400, 1.6, 0.06], ['tone', 260, 0.12, 'triangle', 0.03, 180]],
});
