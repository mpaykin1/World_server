/* -----------------------------------------------------------------------------
   3 · Island generator (deterministic per seed)
----------------------------------------------------------------------------- */
function generateWorld(seed, biomeId = 'dusk') {
  const biome = REG.biomes.get(biomeId) || REG.biomes.get('dusk');
  const rand = mulberry32(seed);
  const fbm = makeNoise(rand);
  const R = (a, b) => a + (b - a) * rand();
  const RI = (a, b) => Math.floor(a + (b - a + 1) * rand());
  const vox = new Uint8Array(W * H * D);
  const at = (x, y, z) => x + W * (z + D * y);
  const ci = (x, z) => x + z * W;
  const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < D;
  const hgt = new Int16Array(W * D), stand = new Int16Array(W * D), kind = new Uint8Array(W * D);
  // kind: 0 free · 1 path · 2 plaza · 5 structure · 6 pier
  const cx = W / 2, cz = D / 2;
  // block roles of this biome (top, soil, deep, beach, path, plaza, wall, pier, post, rock, tower, towerCap, towerTop, door)
  const ROLE_DEFAULT = { top: 'grass', soil: 'dirt', deep: 'stone', beach: 'sand', path: 'dirt', plaza: 'stone', wall: 'brick', pier: 'plank',
    post: 'bark', rock: 'stone', tower: 'brick', towerCap: 'brick', towerTop: 'stone', door: 'plank' };
  const role = {};
  for (const r in ROLE_DEFAULT) role[r] = blockNum((biome.blocks && biome.blocks[r]) || ROLE_DEFAULT[r]);
  const TER = Object.assign({ height: 8.4, base: 0.42, hills: 0.8 }, biome.terrain);

  // 1. heightfield: noisy radial island
  const ox = R(0, 300), oz = R(0, 300);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const nx = (x + 0.5 - cx) / (W * 0.5), nz = (z + 0.5 - cz) / (D * 0.5);
    const d = Math.hypot(nx, nz) + (fbm(x * 0.07 + ox, z * 0.07 + oz, 3) - 0.5) * 0.5;
    const mask = 1 - smooth(0.3, 0.86, d);
    const hills = smooth(0.25, 0.75, fbm(x * 0.055 + oz, z * 0.055 + ox, 4));
    hgt[ci(x, z)] = Math.max(1, Math.round(1 + mask * (TER.base + TER.hills * hills) * TER.height));
  }

  // 2. beacon hill: the highest ground near the centre becomes a paved plaza
  let tx = cx | 0, tz = cz | 0, bestS = -1e9;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const r = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    if (r > 8) continue;
    const s = hgt[ci(x, z)] - r * 0.1;
    if (s > bestS) { bestS = s; tx = x; tz = z; }
  }
  const HP = clamp(hgt[ci(tx, tz)], 8, 10);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const r = Math.hypot(x - tx, z - tz), i = ci(x, z);
    if (r < 3.4) { hgt[i] = HP; kind[i] = 2; }
    else { const hill = HP - 1 - Math.floor((r - 3.4) / 1.4); if (hill > hgt[i]) hgt[i] = hill; }
  }
  // 3. relax: no natural step is taller than one block, so the whole island is walkable
  for (let it = 0; it < 60; it++) {
    let changed = false;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const i = ci(x, z);
      const m = Math.min(x > 0 ? hgt[i - 1] : 1, x < W - 1 ? hgt[i + 1] : 1, z > 0 ? hgt[i - W] : 1, z < D - 1 ? hgt[i + W] : 1);
      if (hgt[i] > m + 1) { hgt[i] = m + 1; changed = true; }
    }
    if (!changed) break;
  }

  // 4. spawn: a beach that looks inland toward the beacon
  let sx = -1, sz = -1, bestSp = 1e9;
  for (let z = 3; z < D - 3; z++) for (let x = 3; x < W - 3; x++) {
    if (hgt[ci(x, z)] !== 4) continue;
    const r = Math.hypot(x - tx, z - tz);
    if (r < 12 || r > 27) continue;
    let ok = true;
    for (let k = 1; k <= 5 && ok; k++) {
      const px = Math.round(x + (tx - x) * k / 9), pz = Math.round(z + (tz - z) * k / 9);
      if (hgt[ci(px, pz)] < 4) ok = false;
    }
    if (!ok) continue;
    const s = Math.abs(r - 18) + rand() * 5;
    if (s < bestSp) { bestSp = s; sx = x; sz = z; }
  }
  if (sx < 0) {
    for (let r = 14; r > 3 && sx < 0; r -= 1) for (let a = 0; a < TAU && sx < 0; a += 0.15) {
      const x = Math.round(tx + Math.cos(a) * r), z = Math.round(tz + Math.sin(a) * r);
      if (inb(x, z) && hgt[ci(x, z)] >= 4 && kind[ci(x, z)] === 0) { sx = x; sz = z; }
    }
  }
  if (sx < 0) { sx = clamp(tx + 5, 0, W - 1); sz = tz; }

  // 5. dirt path from the spawn up to the plaza (quadratic bezier, ~2 cells wide)
  const carvePath = (ax, az, bx, bz, bend) => {
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const qx = (ax + bx) / 2 - (bz - az) / len * bend, qz = (az + bz) / 2 + (bx - ax) / len * bend;
    for (let t = 0; t <= 1; t += 0.3 / len) {
      const u = 1 - t;
      const x = u * u * ax + 2 * u * t * qx + t * t * bx, z = u * u * az + 2 * u * t * qz + t * t * bz;
      for (const o of [-0.55, 0.55]) for (const p of [-0.55, 0.55]) {
        const X = Math.floor(x + o), Z = Math.floor(z + p);
        if (inb(X, Z) && hgt[ci(X, Z)] >= 5 && kind[ci(X, Z)] === 0) kind[ci(X, Z)] = 1;
      }
    }
  };
  carvePath(sx + 0.5, sz + 0.5, tx + 0.5, tz + 0.5, R(-6, 6));
  const ddx = sx - tx, ddz = sz - tz;
  const door = Math.abs(ddx) > Math.abs(ddz) ? [Math.sign(ddx), 0] : [0, Math.sign(ddz) || 1];

  // 6. islets joined to the coast by plank piers (axis-aligned)
  const piers = [];
  const NPIERS = biome.piers ?? 2;
  for (let attempt = 0; attempt < 90 && piers.length < NPIERS; attempt++) {
    const [dx, dz] = DIRS4[RI(0, 3)];
    const off = RI(-9, 9);
    let x = Math.floor(cx) + (dz !== 0 ? off : 0), z = Math.floor(cz) + (dx !== 0 ? off : 0);
    let lx = -1, lz = -1;
    for (let s = 0; s < 34; s++) {
      x += dx; z += dz;
      if (!inb(x, z)) break;
      const h = hgt[ci(x, z)];
      if (h === 4) { lx = x; lz = z; } else if (h <= 2 && lx >= 0) break;
    }
    if (lx < 0) continue;
    const len = RI(5, 7);
    const ix = lx + dx * (len + 3), iz = lz + dz * (len + 3);
    if (ix < 4 || iz < 4 || ix > W - 5 || iz > D - 5) continue;
    let clear = true;
    for (let a = -3; a <= 3 && clear; a++) for (let b = -3; b <= 3; b++) {
      if (hgt[ci(ix + a, iz + b)] > 2) { clear = false; break; }
    }
    for (let k = 2; k < len && clear; k++) if (hgt[ci(lx + dx * k, lz + dz * k)] > 3) clear = false;
    if (!clear || piers.some(p => Math.hypot(p.ix - ix, p.iz - iz) < 11)) continue;
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
      const r = Math.hypot(a, b), i = ci(ix + a, iz + b);
      const h = r < 1.2 ? 5 : r < 2.3 ? 4 : r < 3.2 ? 3 : 0;
      if (h > hgt[i]) hgt[i] = h;
    }
    piers.push({ lx, lz, dx, dz, ix, iz, len });
  }

  // 7. paint terrain into voxels
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = ci(x, z), h = hgt[i];
    for (let y = 0; y < h; y++) {
      let b;
      if (h <= 4) b = y >= h - 3 ? role.beach : role.deep;
      else if (y === h - 1) b = kind[i] === 2 ? role.plaza : kind[i] === 1 ? role.path : role.top;
      else b = y >= h - 3 ? role.soil : role.deep;
      vox[at(x, y, z)] = b;
    }
    stand[i] = h;
  }
  for (const p of piers) {
    for (let k = 1; k < 20; k++) {
      const X = p.lx + p.dx * k, Z = p.lz + p.dz * k;
      if (!inb(X, Z)) break;
      const i = ci(X, Z);
      if (hgt[i] >= 4) break;
      vox[at(X, 4, Z)] = role.pier;
      if (k % 2 === 1) for (let y = hgt[i]; y < 4; y++) vox[at(X, y, Z)] = role.post;
      stand[i] = 5; kind[i] = 6;
    }
  }

  // a context handed to flora growers, biome.terrain/decorate callbacks and on('world') hooks
  let rec = null;
  const gctx = {
    seed, biome, rand, R, RI, vox, hgt, stand, kind, at, ci, inb, role, W, D, H, SEA, BLOCKED,
    get: (x, y, z) => (inb(x, z) && y >= 0 && y < H ? vox[at(x, y, z)] : 0),
    set: (x, y, z, b) => { if (!inb(x, z) || y < 0 || y >= H) return; const k = at(x, y, z); vox[k] = b; if (rec) rec.push(k, b); },
    block: (id) => blockNum(id),
    soilUnder: (x, z) => { const y = hgt[ci(x, z)] - 1; if (vox[at(x, y, z)] === role.top) vox[at(x, y, z)] = role.soil; },
    // independent random stream for pack hooks, so adding decorations never reshuffles coins
    rng: (tag) => { let h = seed >>> 0; for (const ch of String(tag)) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0; return mulberry32(h); },
    spawn: null, tower: null, flora: null, structures: [],
  };
  if (biome.onTerrain) biome.onTerrain(gctx);
  emit('world', gctx, 'terrain');

  // 8. the lighthouse
  for (let y = HP; y < HP + 8; y++) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) vox[at(tx + a, y, tz + b)] = role.tower;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) vox[at(tx + a, HP + 8, tz + b)] = role.towerCap;
  vox[at(tx, HP + 8, tz)] = role.towerTop;
  vox[at(tx + door[0], HP, tz + door[1])] = role.door;
  vox[at(tx + door[0], HP + 1, tz + door[1])] = role.door;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { stand[ci(tx + a, tz + b)] = BLOCKED; kind[ci(tx + a, tz + b)] = 5; }

  const free = (x, z, minH = 5) => inb(x, z) && kind[ci(x, z)] === 0 && hgt[ci(x, z)] >= minH;
  const underGrassToDirt = gctx.soilUnder;
  gctx.free = free;
  gctx.spawn = { x: sx, z: sz }; gctx.tower = { x: tx, z: tz, base: HP, door };

  // 9. ruins: broken L-shaped brick walls
  const ruins = [];
  const NRUINS = biome.ruins ?? 2;
  for (let tries = 0; tries < 260 && ruins.length < NRUINS; tries++) {
    const x0 = RI(6, W - 7), z0 = RI(6, D - 7);
    if (Math.hypot(x0 - tx, z0 - tz) < 8 || Math.hypot(x0 - sx, z0 - sz) < 7) continue;
    const la = RI(3, 5), lb = RI(3, 4), dxr = rand() < 0.5 ? 1 : -1, dzr = rand() < 0.5 ? 1 : -1;
    const cells = [];
    for (let k = 0; k < la; k++) cells.push([x0 + k * dxr, z0]);
    for (let k = 1; k < lb; k++) cells.push([x0, z0 + k * dzr]);
    const h0 = hgt[ci(x0, z0)];
    if (!cells.every(([x, z]) => free(x, z) && Math.abs(hgt[ci(x, z)] - h0) <= 1)) continue;
    if (!free(x0 + dxr, z0 + dzr)) continue;
    cells.forEach(([x, z], k) => {
      const i = ci(x, z);
      const wh = k === 0 ? 3 : rand() < 0.2 ? 0 : RI(1, 3);
      if (!wh) return;
      for (let y = hgt[i]; y < hgt[i] + wh; y++) vox[at(x, y, z)] = role.wall;
      underGrassToDirt(x, z);
      kind[i] = 5; stand[i] = hgt[i] + wh;
    });
    ruins.push({ x: x0 + dxr, z: z0 + dzr });
  }

  // 10. stone outcrops (one cell exactly +2: a jump spot)
  const rocks = [];
  const NROCKS = biome.rocks ?? 6;
  for (let tries = 0; tries < 400 && rocks.length < NROCKS; tries++) {
    const x0 = RI(4, W - 6), z0 = RI(4, D - 6), w = RI(2, 3), d = RI(2, 3);
    const cells = [];
    for (let b = 0; b < d; b++) for (let a = 0; a < w; a++) cells.push([x0 + a, z0 + b]);
    if (!cells.every(([x, z]) => free(x, z, 4))) continue;
    if (Math.hypot(x0 - sx, z0 - sz) < 6 || Math.hypot(x0 - tx, z0 - tz) < 6) continue;
    if (rocks.some(r => Math.hypot(r.x - x0, r.z - z0) < 7)) continue;
    const base = Math.max(...cells.map(([x, z]) => hgt[ci(x, z)]));
    if (cells.some(([x, z]) => base - hgt[ci(x, z)] > 1)) continue;
    cells.forEach(([x, z], k) => {
      const i = ci(x, z), hh = k === 0 ? 2 : RI(1, 3);
      for (let y = hgt[i]; y < base + hh; y++) vox[at(x, y, z)] = role.rock;
      underGrassToDirt(x, z);
      stand[i] = base + hh; kind[i] = 5;
    });
    rocks.push({ x: x0, z: z0 });
  }

  // 11. flora: every entry of biome.flora runs its grower (trees, pines, mushrooms …)
  const trees = [];
  gctx.flora = trees;
  for (const fl of biome.flora || []) {
    const F = REG.flora.get(fl.type);
    if (!F) { regError(`biome '${biome.id}': unknown flora '${fl.type}'`); continue; }
    const fp = F.footprint ?? 2, minH = fl.minHeight ?? F.minHeight ?? 5, spacing = fl.spacing ?? 4.3, count = fl.count ?? 10;
    const placed0 = trees.length;
    for (let tries = 0; tries < (fl.tries ?? 1200) && trees.length - placed0 < count; tries++) {
      const x = RI(3, W - 4), z = RI(3, D - 4), i = ci(x, z), h = hgt[i];
      if (h < minH || kind[i] !== 0) continue;
      if (Math.hypot(x - sx, z - sz) < 4.5 || Math.hypot(x - tx, z - tz) < 5.5) continue;
      if (trees.some(t => Math.hypot(t.x - x, t.z - z) < spacing)) continue;
      let ok = true;
      for (let b = -fp; b <= fp && ok; b++) for (let a = -fp; a <= fp; a++) {
        if (!inb(x + a, z + b)) { ok = false; break; }
        const j = ci(x + a, z + b);
        if (Math.abs(hgt[j] - h) > 1 || kind[j] === 1 || kind[j] === 2 || kind[j] === 5 || kind[j] === 6) { ok = false; break; }
      }
      if (!ok) continue;
      rec = [];
      const res = F.grow(gctx, x, z, h, fl) || {};
      const cells = rec; rec = null;
      if (F.blocking !== false) { stand[i] = BLOCKED; kind[i] = 5; }
      trees.push({ x, z, h, th: res.th ?? 3, crownY: res.crownY ?? h + 2, type: fl.type, choppable: F.choppable !== false, cells });
    }
  }
  if (biome.decorate) biome.decorate(gctx);
  emit('world', gctx, 'decor');

  // 12. reachability from the spawn: walk ≤1 block up, jump ≤2, drop any
  const okCell = (x, z) => {
    const s = stand[ci(x, z)];
    if (s === BLOCKED || s < 3 || s >= H - 2) return false;
    return vox[at(x, s, z)] === 0 && vox[at(x, s + 1, z)] === 0;
  };
  const clear2 = (x, z, y) => y >= 0 && y < H - 1 && vox[at(x, y, z)] === 0 && vox[at(x, y + 1, z)] === 0;
  const reach = new Uint8Array(W * D);
  const queue = [ci(sx, sz)]; reach[ci(sx, sz)] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi], x = i % W, z = (i / W) | 0;
    for (const [dx, dz] of DIRS4) {
      const X = x + dx, Z = z + dz;
      if (!inb(X, Z)) continue;
      const j = ci(X, Z);
      if (reach[j] || !okCell(X, Z)) continue;
      const dh = stand[j] - stand[i], top = Math.max(stand[i], stand[j]);
      // the body passes at the higher of the two levels: both columns need two free blocks there
      if (dh <= 2 && clear2(X, Z, top) && clear2(x, z, top)) { reach[j] = dh <= 1 ? 1 : 2; queue.push(j); }
    }
  }

  // 13. coins: special spots first, then an even spread (farthest-point sampling)
  const coins = [];
  const canCoin = (x, z) => {
    if (!inb(x, z)) return false;
    const i = ci(x, z), s = stand[i];
    return reach[i] > 0 && s >= 4 && s < H - 3 && kind[i] !== 2 && vox[at(x, s + 2, z)] === 0
      && Math.hypot(x - sx, z - sz) > 4.5 && !coins.some(c => c.cx === x && c.cz === z);
  };
  const addCoin = (x, z) => coins.push({ cx: x, cz: z, x: x + 0.5, y: stand[ci(x, z)], z: z + 0.5 });
  for (const p of piers) if (canCoin(p.ix, p.iz)) addCoin(p.ix, p.iz);
  for (const r of rocks) if (canCoin(r.x, r.z) && coins.length < 6) addCoin(r.x, r.z);
  for (const r of ruins) if (canCoin(r.x, r.z)) addCoin(r.x, r.z);
  const cand = [];
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (canCoin(x, z) && reach[ci(x, z)] === 1) cand.push([x, z]);
  const spread = (list, others, extra) => {
    let best = null, bestD = -1;
    for (let k = 0; k < 48 && list.length; k++) {
      const c = list[Math.floor(rand() * list.length)];
      let dmin = Math.hypot(c[0] - sx, c[1] - sz) * 0.7;
      for (const o of others) dmin = Math.min(dmin, Math.hypot(o.cx - c[0], o.cz - c[1]));
      if (extra) for (const o of extra) dmin = Math.min(dmin, Math.hypot(o.cx - c[0], o.cz - c[1]) * 1.6);
      if (dmin > bestD) { bestD = dmin; best = c; }
    }
    return bestD >= 2 ? best : null;
  };
  while (coins.length < 20 && cand.length) {
    const c = spread(cand, coins);
    if (!c) break;
    addCoin(c[0], c[1]);
  }
  const hearts = [];
  for (let n = 0; n < 3; n++) {
    const c = spread(cand.filter(([x, z]) => !coins.some(o => o.cx === x && o.cz === z)), hearts, coins);
    if (c) hearts.push({ cx: c[0], cz: c[1], x: c[0] + 0.5, y: stand[ci(c[0], c[1])], z: c[1] + 0.5 });
  }

  // 13b. weapons: two simple ones a few steps from the beach (on the way inland),
  //      the other eighteen spread over the island — the farther from the spawn, the stronger
  const taken = (x, z) => coins.some(o => o.cx === x && o.cz === z) || hearts.some(o => o.cx === x && o.cz === z);
  const lootAt = (x, z, near) => ({ cx: x, cz: z, x: x + 0.5, y: stand[ci(x, z)], z: z + 0.5, near });
  const loot = [];
  const nearCand = [];
  const toTower = Math.hypot(tx - sx, tz - sz) || 1;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = ci(x, z), s = stand[i], d = Math.hypot(x - sx, z - sz);
    if (reach[i] !== 1 || s < 4 || s >= H - 3 || kind[i] === 2 || d < 2.8 || d > 8 || taken(x, z)) continue;
    if (vox[at(x, s, z)] || vox[at(x, s + 1, z)] || vox[at(x, s + 2, z)]) continue;
    nearCand.push([x, z]);
  }
  const LC = lootCounts(biome.id);
  for (let n = 0; n < LC.near && nearCand.length; n++) {
    let best = null, bestS = -1e9;
    for (const c of nearCand) {
      const inland = ((c[0] - sx) * (tx - sx) + (c[1] - sz) * (tz - sz)) / toTower;
      let s = inland - Math.abs(Math.hypot(c[0] - sx, c[1] - sz) - 4.5) * 0.6 + rand() * 0.8;
      for (const o of loot) if (Math.hypot(o.cx - c[0], o.cz - c[1]) < 3) s -= 50;
      if (s > bestS) { bestS = s; best = c; }
    }
    loot.push(lootAt(best[0], best[1], true));
  }
  const lootCand = cand.filter(([x, z]) => !taken(x, z));
  const far = [];
  for (let n = 0; n < LC.far && lootCand.length; n++) {
    let c = spread(lootCand, loot.concat(far), coins);
    if (!c) c = lootCand[Math.floor(rand() * lootCand.length)];
    lootCand.splice(lootCand.indexOf(c), 1);
    far.push(lootAt(c[0], c[1], false));
  }
  far.sort((a, b) => Math.hypot(a.cx - sx, a.cz - sz) - Math.hypot(b.cx - sx, b.cz - sz));
  loot.push(...far);

  // 13c. relic shrines (biome.shrines, default 3) — engine/11_shrines.js; their own random stream
  const relicSpots = placeShrines(gctx.rng('relics'), cand, coins.concat(hearts, loot), { sx, sz, tx, tz, stand, ci, count: biome.shrines ?? 3 });

  // 14. where shades rise: deep water hugging the coast
  const seaSpots = [];
  for (let z = 2; z < D - 2; z++) for (let x = 2; x < W - 2; x++) {
    if (hgt[ci(x, z)] > 2 || kind[ci(x, z)] === 6) continue;
    let land = false;
    for (let b = -3; b <= 3 && !land; b++) for (let a = -3; a <= 3; a++) if (inb(x + a, z + b) && hgt[ci(x + a, z + b)] >= 4) { land = true; break; }
    if (land) seaSpots.push([x, z]);
  }
  const landCells = [];
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (reach[ci(x, z)] && stand[ci(x, z)] >= 4) landCells.push([x, z]);
  // last look for packs: everything is placed (hooks may read, or nudge, coins / loot / shrines)
  Object.assign(gctx, { reach, coins, hearts, loot, relicSpots, ruins, rocks, piers, seaSpots, landCells });
  emit('world', gctx, 'done');

  return {
    seed, biome: biome.id, vox, hgt, stand, kind, reach, at, ci, piers, trees, rocks, ruins, seaSpots, landCells, coins, hearts, loot,
    relicSpots, structures: gctx.structures, gctx,
    tower: { x: tx, z: tz, base: HP, door },
    beacon: new THREE.Vector3(tx + 0.5, HP + 9, tz + 0.5),
    ring: new THREE.Vector3(tx + 0.5 + door[0] * 2.55, HP, tz + 0.5 + door[1] * 2.55),
    spawn: new THREE.Vector3(sx + 0.5, hgt[ci(sx, sz)], sz + 0.5),
  };
}
