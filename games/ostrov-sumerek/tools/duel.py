#!/usr/bin/env python3
"""Boss duels: a strafing, dodging bot fights the guardian with one weapon at a time
(real damage, real orbs, real shockwaves). Balance check for new weapons and bosses.
usage: python3 tools/duel.py [weapon,weapon,...|all] [--seed N] [--biome ID]"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.harness import Game  # noqa: E402

DUEL = r"""
async (wid) => {
  const I = window.__isle, w = I.world, P = I.player, G = I.G, W = 64;
  const WD = I.WEAPONS[wid];
  I.killFoes();
  for (const f of I.foes) f.alpha = 0;
  I.sim(1 / 60, 0, 0, false, true);
  I.projs.length = 0;
  // stand in front of the tower door, the warden rises beside the ring
  const r = w.ring;
  I.teleport(r.x + (r.x - w.beacon.x) * 0.2, r.z + (r.z - w.beacon.z) * 0.2);
  P.hp = 6; P.invuln = 0; P.respawn = 0;
  G.all = true; G.wardenSpawned = false; G.wardenDown = false; G.warden = null; G.wardenT = 0.01; G.spawnT = 1e9;
  I.equip(wid);
  I.combat.ammo[wid] = WD.mag || 0; I.combat.reload = 0; I.combat.heat = 0; I.combat.over = false;
  const dt = 1 / 60;
  let t = 0, dirSign = 1, flip = 0, minD = 99, hpLost = 0, lastHp = P.hp, drowned = 0;
  const reachR = WD.kind === 'melee' ? Math.max(1.2, (WD.reach || 2) * 0.75) : 3.6;
  I.attack(true);
  while (t < 120) {
    const f = G.warden;
    if (G.wardenDown) break;
    if (G.state !== 'play') break;
    let dx = 0, dz = 0;
    if (f && f.state !== 'rise') {
      const h = f.segs[0];
      let rx = P.pos.x - h.x, rz = P.pos.z - h.z; const d = Math.hypot(rx, rz) || 1; rx /= d; rz /= d;
      minD = Math.min(minD, d);
      const tx = -rz * dirSign, tz = rx * dirSign;
      const want = reachR + f.def.rad * (WD.kind === 'melee' ? 0.6 : 1);
      dx = tx * 0.9 + rx * (want - d) * 0.9; dz = tz * 0.9 + rz * (want - d) * 0.9;
      // keep out of the sea: if the next step lands on a water cell, turn around
      const nx = Math.floor(P.pos.x + dx * 0.8), nz = Math.floor(P.pos.z + dz * 0.8);
      const s = (nx >= 0 && nz >= 0 && nx < W && nz < W) ? w.stand[nx + nz * W] : 0;
      flip -= dt;
      if ((s < 4 || s === 99) && flip <= 0) { dirSign = -dirSign; flip = 1.2; }
      // a decent player: step out of the marked landing spot, jump the shockwave ring
      if ((f.mode === 'windup' && f.locked) || f.mode === 'dive') {
        const qx = P.pos.x - f.diveTo.x, qz = P.pos.z - f.diveTo.z, qd = Math.hypot(qx, qz) || 1;
        if (qd < 2.6) { dx = qx / qd; dz = qz / qd; }
      }
      const L = Math.hypot(dx, dz); if (L > 1) { dx /= L; dz /= L; }
      I.aim.cursorT = 0;
    }
    let jump = false;
    for (const wv of I.combat.waves) if (wv.hurt && !wv.hit) {
      const r = wv.r * (1 - Math.pow(1 - wv.t / wv.dur, 3)), d = Math.hypot(P.pos.x - wv.x, P.pos.z - wv.z);
      if (d > r && d - r < 1.6 && d < wv.r + 0.6) jump = true;
    }
    // the bow fires on release
    if (wid === 'bow') I.attack((t % 1.0) < 0.8);
    I.sim(dt, dx, dz, jump, true);
    if (P.hp < lastHp) { hpLost += lastHp - P.hp; } lastHp = P.hp;
    if (P.respawn > 0) drowned++;
    t += dt;
  }
  I.attack(false);
  const f = G.warden;
  return { wid, t: +t.toFixed(1), won: G.wardenDown, hpLeft: P.hp, hpLost, state: G.state, wardenHp: f ? Math.round(f.hp) : 0, minD: +minD.toFixed(2), drowned: drowned > 0 };
}
"""


async def main():
    args = sys.argv[1:]
    seed, biome = 1337, None
    if "--seed" in args:
        i = args.index("--seed"); seed = int(args[i + 1]); del args[i:i + 2]
    if "--biome" in args:
        i = args.index("--biome"); biome = args[i + 1]; del args[i:i + 2]
    async with Game(viewport=(480, 270)) as g:
        await g.title()
        if seed != 1337 or biome:
            await g.js(f"window.__isle.rebuild({seed}, {repr(biome) if biome else 'undefined'})")
        await g.js("window.__isle.startGame(); window.__isle.giveAll()")
        order = await g.js("window.__isle.ARSENAL_ORDER")
        weapons = order if not args or args[0] == "all" else args[0].split(",")
        for wid in weapons:
            if wid == "fists" and len(weapons) > 1:
                pass
            res = await g.js(DUEL, wid)
            print(res)
            if await g.js("window.__isle.G.state") != "play":
                await g.js("(() => { const I = window.__isle; I.G.state = 'play'; I.G.timeScale = 1; I.G.desat = 0; document.getElementById('scrEnd').hidden = true; })()")
        probs = g.problems()
    if probs:
        print("PROBLEMS:", probs[:8])


asyncio.run(main())
