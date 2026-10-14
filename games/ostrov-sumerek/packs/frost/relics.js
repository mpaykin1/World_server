/* «Иней» — a frost-only relic that works through a hook: every blow from the hero chills the foe. */
defineRelic('rime_charm', { name: 'Иней', desc: 'Каждый твой удар примораживает врага.', icon: 'rime_charm', rar: 'epic', biomes: ['frost'] });
on('hit', (foe, dmg, o) => {
  if (!o.w || !heldRelics().some((r) => r.id === 'rime_charm')) return;
  foe.slow = Math.max(foe.slow, 1.4);
});
