/* Frost foes: recoloured kin of the base imp and warden — same bodies and brains, new look and numbers.
   (Copying a definition and overriding fields is the quickest way to make a variant.) */
const IMP = REG.enemies.get('imp'), WARDEN = REG.enemies.get('warden');
defineEnemy('frost_imp', Object.assign({}, IMP, {
  name: 'Ледяной бесёнок', hp: 30, chase: 3.6,
  look: { core: '#040812', rim: [0.12, 0.34, 0.6], aura: [0.45, 0.85, 1.0], eye: [0.7, 1, 1, 4], eyeGlow: [0.2, 0.6, 1, 1.3], death: [0.6, 0.9, 1, 2.6] },
  spawn: Object.assign({}, IMP.spawn, { biomes: ['frost'] }),
}));
defineEnemy('frost_warden', Object.assign({}, WARDEN, {
  name: 'Ледяной страж', hp: 760,
  downText: 'Ледяной страж повержен — зажги маяк!',
  look: { core: '#050913', rim: [0.16, 0.36, 0.66], aura: [0.5, 0.85, 1.0], spikes: 0.1, auraGain: 0.55, eye: [0.75, 1, 1, 4], eyeGlow: [0.25, 0.6, 1, 1.4], death: [0.6, 0.9, 1, 2.6] },
  spawn: {
    from: 'guardian',
    onSpawn(f) {
      const h = f.segs[0];
      G.bossCam = 2.6;
      SFX.roar();
      rig.trauma = Math.min(1, rig.trauma + 0.6);
      toast('Ледяной страж пробудился!', 3600, true, 3);
      for (let k = 0; k < 46; k++) dust.emit(h.x + rr(-1.5, 1.5), world.tower.base + 0.2, h.z + rr(-1.5, 1.5), rr(-2, 2), rr(1, 4), rr(-2, 2), rr(1, 2), 0.5, 1.4, C.spray, 0.8, -0.2, 1, 0);
    },
  },
}));
