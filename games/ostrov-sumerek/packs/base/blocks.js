/* Base blocks. Numeric ids follow registration order (grass = 1 …), so the base island's
   voxel data stays stable. Tiles name entries of the tile atlas (packs/<pack>/art/*.py @tile). */
defineBlock('grass', { name: 'Трава', tiles: { top: 'grass', side: 'grass_side', bottom: 'dirt' }, sideCovered: 'dirt', mm: '#3f8a3f', step: 'soft', dust: '#7a5236' });
defineBlock('dirt', { name: 'Земля', tiles: 'dirt', mm: '#8c5e38', step: 'soft', dust: '#7a5236' });
defineBlock('stone', { name: 'Камень', tiles: 'stone', mm: '#7c8292', step: 'stone' });
defineBlock('plank', { name: 'Доски', tiles: 'wood', mm: '#b07f48', step: 'wood' });
defineBlock('sand', { name: 'Песок', tiles: 'sand', mm: '#d8bc7c', step: 'soft', dust: '#d9bf86' });
defineBlock('leaves', { name: 'Листва', tiles: 'leaves', mm: '#24613a', leafy: true, tint: [0.86, 0.22], step: 'soft' });
defineBlock('brick', { name: 'Кирпич', tiles: 'brick', mm: '#b04a3a', step: 'stone' });
defineBlock('bark', { name: 'Ствол', tiles: { top: 'log_top', side: 'bark', bottom: 'log_top' }, mm: '#6a4a30', trunk: true, step: 'wood' });
