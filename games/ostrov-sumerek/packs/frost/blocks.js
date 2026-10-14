/* Frost blocks. Tiles may come from any pack (the atlas is shared): bark / log_top / stone are base tiles.
   slip: 0..1 — how much the boots slide (engine/40_hero.js groundGrip). */
defineBlock('snow', { name: 'Снег', tiles: { top: 'snow', side: 'snow_side', bottom: 'frozen_dirt' }, sideCovered: 'frozen_dirt', mm: '#dfe7f5', step: 'snow', dust: '#e3ebf7' });
defineBlock('frozen_dirt', { name: 'Мёрзлая земля', tiles: 'frozen_dirt', mm: '#5e4646', step: 'soft', dust: '#7a5c55' });
defineBlock('ice', { name: 'Лёд', tiles: 'ice', mm: '#8fc4e8', step: 'ice', slip: 0.85, tint: [0.98, 0.04] });
defineBlock('packed_snow', { name: 'Утоптанный снег', tiles: 'packed_snow', mm: '#b3bfdc', step: 'snow', dust: '#c0cde6' });
defineBlock('frost_brick', { name: 'Ледяной кирпич', tiles: 'frost_brick', mm: '#8e9ab4', step: 'stone' });
defineBlock('pine_needles', { name: 'Хвоя', tiles: 'pine_needles', mm: '#1f4d4a', leafy: true, tint: [0.86, 0.22], step: 'soft' });
