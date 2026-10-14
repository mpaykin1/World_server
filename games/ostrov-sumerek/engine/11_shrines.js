/* -----------------------------------------------------------------------------
   3b · Relic shrines: far from the beach, away from coins and weapons, spread over the island.
        rnd is the generator's independent stream (gctx.rng('relics')), so adding shrines never
        reshuffles the coins or the loot of an island.
----------------------------------------------------------------------------- */
function placeShrines(rnd, cand, busy, o) {
  const { sx, sz, tx, tz, stand, ci, count } = o;
  const spots = [];
  const pool = cand.filter(([x, z]) => Math.hypot(x - sx, z - sz) > 9 && Math.hypot(x - tx, z - tz) > 5
    && !busy.some((b) => Math.hypot(b.cx - x, b.cz - z) < 2.5));
  for (let n = 0; n < count && pool.length; n++) {
    let best = null, bestD = -1;
    for (let k = 0; k < 40; k++) {
      const c = pool[Math.floor(rnd() * pool.length)];
      let d = Math.hypot(c[0] - sx, c[1] - sz) * 0.5;
      for (const s of spots) d = Math.min(d, Math.hypot(s.cx - c[0], s.cz - c[1]));
      if (d > bestD) { bestD = d; best = c; }
    }
    pool.splice(pool.indexOf(best), 1);
    spots.push({ cx: best[0], cz: best[1], x: best[0] + 0.5, y: stand[ci(best[0], best[1])], z: best[1] + 0.5 });
  }
  return spots;
}
