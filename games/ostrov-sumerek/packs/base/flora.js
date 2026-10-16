/* Flora growers. grow(ctx, x, z, h, opt) writes voxels through ctx.set (so a felled tree can be
   removed exactly), may call ctx.rand (the island's RNG) and returns { th, crownY } —
   trunk height and the y where the crown starts (falling leaves drop from there). */
defineFlora('round_tree', {
  name: 'Лиственное дерево',
  footprint: 2, minHeight: 5, choppable: true,
  grow(ctx, x, z, h, opt) {
    const { rand, inb } = ctx;
    const trunk = ctx.block(opt.trunk || 'bark'), crown = ctx.block(opt.crown || 'leaves');
    const th = rand() < 0.35 ? 4 : 3;
    for (let y = h; y < h + th; y++) ctx.set(x, y, z, trunk);
    ctx.soilUnder(x, z);
    const cy = h + th;
    const leaf = (X, Y, Z) => { if (inb(X, Z) && Y < H && ctx.get(X, Y, Z) === 0) ctx.set(X, Y, Z, crown); };
    for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
      const corner = Math.abs(a) === 2 && Math.abs(b) === 2;
      if (!corner) { leaf(x + a, cy - 1, z + b); leaf(x + a, cy, z + b); } else if (rand() < 0.3) leaf(x + a, cy, z + b);
    }
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) if (Math.abs(a) + Math.abs(b) < 2 || rand() < 0.5) leaf(x + a, cy + 1, z + b);
    return { th, crownY: cy - 1 };
  },
});
