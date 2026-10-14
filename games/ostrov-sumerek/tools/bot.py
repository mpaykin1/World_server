#!/usr/bin/env python3
"""Playthrough bot: BFS over the voxel grid, steers the real physics through __isle.sim.
Checks that every coin, weapon and relic shrine on the island can be reached, the guardian can be
dispatched (debug kill) and the beacon ring triggers victory.
usage: python3 tools/bot.py [--biome ID] SEED [SEED ...]"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.harness import Game  # noqa: E402

BOT = r"""
async (seed) => {
  const I = window.__isle;
  const W = 64, D = 64;
  const w = I.world;
  const ci = (x, z) => x + z * W;
  const ok = (x, z) => { if (x < 0 || z < 0 || x >= W || z >= D) return false; const s = w.stand[ci(x, z)]; if (s === 99 || s < 3 || s >= 24) return false; return w.vox[w.at(x, s, z)] === 0 && w.vox[w.at(x, s + 1, z)] === 0; };
  function path(sx, sz, tx, tz) {
    const prev = new Int32Array(W * D).fill(-2); const q = [ci(sx, sz)]; prev[ci(sx, sz)] = -1;
    for (let qi = 0; qi < q.length; qi++) { const i = q[qi], x = i % W, z = (i / W) | 0; if (x === tx && z === tz) break;
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) { const X = x + dx, Z = z + dz; if (!ok(X, Z)) continue; const j = ci(X, Z); if (prev[j] !== -2) continue;
        const top = Math.max(w.stand[i], w.stand[j]);
        const clr = (xx, zz) => w.vox[w.at(xx, top, zz)] === 0 && w.vox[w.at(xx, top + 1, zz)] === 0;
        if (w.stand[j] - w.stand[i] <= 2 && clr(X, Z) && clr(x, z)) { prev[j] = i; q.push(j); } } }
    if (prev[ci(tx, tz)] === -2) return null;
    const out = []; for (let i = ci(tx, tz); i !== -1; i = prev[i]) out.push(i); return out.reverse();
  }
  I.player.invuln = 1e9;
  const log = [];
  let lastC = 0, jumpClock = 0;
  let t = 0, stuck = 0, lastP = I.player.pos.clone(), target = null, route = null, k = 1, replan = 0;
  const dt = 1 / 60;
  while (t < 900) {
    const p = I.player.pos;
    if (I.G.state === 'victory') { log.push(`victory at ${t.toFixed(1)}s`); break; }
    if (I.G.warden && !I.G.wardenDown) { I.killWarden(); log.push(`warden down at ${t.toFixed(0)}s`); }
    if (I.G.collected !== lastC) { lastC = I.G.collected; if (lastC % 5 === 0) log.push(`${lastC} coins at ${t.toFixed(0)}s`); }
    if (!target || (!target.ring && !target.c.alive) || replan <= 0) {
      let best = null, bd = 1e9;
      // coins and weapons, nearest first; the warden is dispatched by the debug hook; then the ring
      for (const c of I.coins) if (c.alive) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = { c, x: c.x, z: c.z }; } }
      for (const L of I.loot) if (L.alive) { const d = Math.hypot(L.x - p.x, L.z - p.z); if (d < bd) { bd = d; best = { c: L, x: L.x, z: L.z }; } }
      for (const R of I.relics) if (R.alive) { const d = Math.hypot(R.x - p.x, R.z - p.z); if (d < bd) { bd = d; best = { c: R, x: R.x, z: R.z }; } }
      if (!best) best = { ring: true, x: w.ring.x, z: w.ring.z };
      target = best;
      route = path(Math.floor(p.x), Math.floor(p.z), Math.floor(target.x), Math.floor(target.z));
      k = 1; replan = 3;
      if (!route) { log.push(`no route to ${target.x.toFixed(1)},${target.z.toFixed(1)} from ${p.x.toFixed(1)},${p.z.toFixed(1)}`); target.c && (target.c.alive = false); continue; }
    }
    let wx = target.x, wz = target.z, jump = false;
    if (k < route.length) {
      const i = route[k]; wx = (i % W) + 0.5; wz = ((i / W) | 0) + 0.5;
      if (Math.hypot(wx - p.x, wz - p.z) < 0.35) k++;
      if (w.stand[i] - p.y >= 1.5) jump = true;
    }
    let dx = wx - p.x, dz = wz - p.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    if (L < 0.05) { dx = 0; dz = 0; }
    if (stuck > 0.4) jump = true;
    // press jump for 0.25 s, then release so the next attempt is a fresh press
    jumpClock = jump ? jumpClock + dt : 0;
    I.sim(dt, dx, dz, jump && (jumpClock % 0.9) < 0.45);
    t += dt; replan -= dt;
    const moved = Math.hypot(p.x - lastP.x, p.z - lastP.z); lastP.copy(p);
    stuck = moved < 0.01 ? stuck + dt : 0;
    if (stuck > 3 && log.length < 12) { log.push(`stuck at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} -> ${wx},${wz}`); target = null; stuck = 0; replan = 0; }
  }
  return { log, t: +t.toFixed(1), collected: I.G.collected, total: I.G.total, weapons: I.combat.arsenal.length, relics: I.held.length + '/' + I.relics.length,
    foes: I.foes.length, kills: I.G.kills, state: I.G.state };
}
"""


async def main():
    args = sys.argv[1:]
    biome = None
    if "--biome" in args:
        i = args.index("--biome"); biome = args[i + 1]; del args[i:i + 2]
    seeds = [int(a) for a in args] or [1337]
    ok = True
    async with Game(viewport=(480, 270)) as g:
        await g.title()
        for seed in seeds:
            await g.js(f"window.__isle.rebuild({seed}, {repr(biome) if biome else 'undefined'})")
            await g.js("window.__isle.startGame()")
            res = await g.js(BOT, seed)
            held, spots = (int(v) for v in res["relics"].split("/"))
            good = res["state"] == "victory" and res["collected"] == res["total"] and held == spots
            ok &= good
            print(seed, "OK " if good else "FAIL", res)
            await g.js("(() => { const I = window.__isle; I.G.state = 'title'; document.getElementById('scrEnd').hidden = true; })()")
        probs = g.problems()
    if probs:
        print("PROBLEMS:", probs[:8])
    sys.exit(0 if ok and not probs else 1)


asyncio.run(main())
