/* Pines: a bare trunk under tiers of needles — a wide tier (diamond of radius 2), a narrow one, again,
   then the spire. opt: trunk / crown block ids. */
defineFlora('pine', {
  name: 'Ель',
  footprint: 1, minHeight: 5, choppable: true,
  grow(ctx, x, z, h, opt) {
    const { rand, inb } = ctx;
    const trunk = ctx.block(opt.trunk || 'bark'), crown = ctx.block(opt.crown || 'pine_needles');
    const th = rand() < 0.5 ? 2 : 3;
    const tiers = rand() < 0.45 ? [2, 1, 2, 1, 1, 0, 0] : [2, 1, 1, 0, 0];    // radius per level above the trunk
    for (let y = h; y < h + th + tiers.length - 2; y++) ctx.set(x, y, z, trunk);
    ctx.soilUnder(x, z);
    const leaf = (X, Y, Z) => { if (inb(X, Z) && Y < H && ctx.get(X, Y, Z) === 0) ctx.set(X, Y, Z, crown); };
    tiers.forEach((r, i) => {
      for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) if (Math.abs(a) + Math.abs(b) <= r) leaf(x + a, h + th + i, z + b);
    });
    return { th, crownY: h + th };
  },
});
