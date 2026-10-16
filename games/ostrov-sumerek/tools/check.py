#!/usr/bin/env python3
"""
One command to know the game still works after a change.

usage: python3 tools/check.py [--no-build] [--bot] [--update-baseline] [--biome ID ...]

  1. build      art + bundle + node --check                       (skipped with --no-build)
  2. registry   no definition errors (warnings are printed)
  3. smoke      for every biome × every character, in the real frame loop: force every event of the
                biome, take every relic, meet every NPC, spawn every foe kind next to the hero, swing /
                fire every weapon, collect all coins and down the guardian — then list console problems
  4. worlds     world hashes for 5 seeds of every biome against tools/baseline/worlds.json
                (a changed island is reported, not failed: content changes move things on purpose;
                 --update-baseline records the current state)
  5. rise       every foe hit while it surfaces (real damageFoe -> brain.onDamaged) still fades in fully
  6. bot        with --bot: a full playthrough per biome (every coin, weapon and shrine reachable)
Exit code 1 on build errors, registry errors, console problems or a failed playthrough.
"""
import asyncio
import json
import os
import subprocess
import sys

# Windows PowerShell can use CP1251, which cannot encode the × symbol in smoke logs.
# Keep the console code page but escape unsupported characters instead of aborting QA.
if os.name == 'nt' and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(errors='backslashreplace')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.harness import Game  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, "tools", "baseline", "worlds.json")

SMOKE = r"""
async ([biome, hero]) => {
  const I = window.__isle, out = { biome, hero, steps: [] };
  const fr = (n) => new Promise((res) => { let k = 0; const f = () => { if (++k >= n) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const step = (s) => out.steps.push(s);
  I.rebuild(1337, biome); I.character(hero); I.startGame(); await fr(10);
  I.player.invuln = 1e9;
  for (const ev of I.REG.events.values()) {
    if (ev.biomes && !ev.biomes.includes(biome)) continue;
    I.forceEvent(ev.id); await fr(25); step('event ' + ev.id + ' k=' + I.event.k);
  }
  I.endEvent(); await fr(5);
  for (const id of I.REG.relics.keys()) I.giveRelic(id);
  step('relics ' + I.held.length);
  for (const n of I.npcs) { I.npcNear(n.def.id, 1.5, 0.5); await fr(20); step('npc ' + n.def.id); }
  for (const [id, d] of I.REG.enemies) {
    if (d.boss) continue;
    const f = I.foeNear(id, 3, 2);
    await fr(6); step('foe ' + id + (f ? '' : ' (no slot)'));
  }
  I.giveAll();
  for (const id of I.ARSENAL_ORDER) {
    I.equip(id); await fr(3);
    I.attack(true); await fr(5); I.attack(false); await fr(3);
  }
  step('weapons ' + I.ARSENAL_ORDER.length);
  I.killFoes(); await fr(10);
  I.collectAll(); await fr(50);
  I.killWarden(); await fr(20);
  out.state = I.G.state; out.guardian = I.G.wardenDown;
  return out;
}
"""

WORLD = r"""
(biome) => {
  const I = window.__isle, out = {};
  const h = (arr) => { let x = 2166136261 >>> 0; for (let i = 0; i < arr.length; i++) { x ^= arr[i]; x = Math.imul(x, 16777619) >>> 0; } return x.toString(16); };
  for (const seed of [1337, 7, 21, 99, 4242]) {
    I.rebuild(seed, biome);
    const w = I.world;
    out[seed] = {
      vox: h(w.vox), stand: h(new Uint8Array(w.stand.buffer)),
      coins: w.coins.map((c) => c.cx + ',' + c.cz).join(' '), hearts: w.hearts.map((c) => c.cx + ',' + c.cz).join(' '),
      loot: w.loot.map((c) => c.cx + ',' + c.cz).join(' '), shrines: (w.relicSpots || []).map((c) => c.cx + ',' + c.cz).join(' '),
    };
  }
  return out;
}
"""

RISE = r"""
() => {
  const I = window.__isle, P = I.player, kinds = [], bad = [];
  I.startGame(); I.noEvents(true); I.setTod(0.8); P.invuln = 1e9;
  for (const [id, d] of I.REG.enemies) {
    if (d.boss) continue;
    I.killFoes(); for (const f of I.foes) f.alpha = 0; I.foes.length = 0; I.G.spawnT = 1e9;
    const f = I.foeNear(id, 3, 1);
    if (!f) { bad.push(id + ': no slot'); continue; }
    f.state = 'rise'; f.alpha = 0.25; f.t = 0;                        // caught mid-surfacing
    for (let i = 0; i < 10; i++) I.sim(1 / 60, 0, 0, false);
    I.hitFoe(f, 1);                                                    // real damageFoe -> brain.onDamaged
    for (let i = 0; i < 60 * 4; i++) { I.sim(1 / 60, 0, 0, false); I.G.spawnT = 1e9; }
    kinds.push(id);
    if (f.alpha < 0.99 || f.state === 'rise') bad.push(id + ': alpha ' + f.alpha.toFixed(2) + ', state ' + f.state);
  }
  I.killFoes(); I.noEvents(false);
  return { kinds, bad };
}
"""


async def main():
    args = sys.argv[1:]
    ok = True
    if "--no-build" not in args:
        r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build.py")], capture_output=True, text=True)
        print(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else "", r.stderr.strip())
        if r.returncode != 0:
            print("BUILD FAILED"); sys.exit(1)
    only = [args[i + 1] for i, a in enumerate(args) if a == "--biome"]
    async with Game(viewport=(960, 540)) as g:
        await g.title()
        reg = await g.js("window.__isle.registry()")
        print("packs:", ", ".join(reg["packs"]))
        print("content:", ", ".join(f"{k} {v}" for k, v in reg["counts"].items() if v))
        for w in reg["warnings"]:
            print("  warning:", w)
        for e in reg["errors"]:
            print("  ERROR:", e)
        ok &= not reg["errors"]
        biomes = only or reg["biomes"]
        heroes = await g.js("Object.keys(Object.fromEntries(window.__isle.REG.characters))")
        # worlds first (title state), then the smoke runs
        worlds = {}
        for b in biomes:
            worlds[b] = await g.js(WORLD, b)
        base = json.load(open(BASELINE)) if os.path.isfile(BASELINE) else {}
        for b in biomes:
            if b not in base:
                print(f"worlds {b}: no baseline yet")
                continue
            moved = [s for s in worlds[b] if base[b].get(s) != worlds[b][s]]
            print(f"worlds {b}: " + ("same as baseline" if not moved else f"CHANGED for seeds {', '.join(moved)} (expected after content changes)"))
        if "--update-baseline" in args or not base:
            os.makedirs(os.path.dirname(BASELINE), exist_ok=True)
            base.update(worlds)
            json.dump(base, open(BASELINE, "w"), indent=1, ensure_ascii=False)
            print("baseline written:", os.path.relpath(BASELINE, ROOT))
        n0 = len(g.problems())
        rise = await g.js(RISE)
        good = not rise["bad"] and not g.problems()[n0:]
        ok &= good
        print(f"rise: {'OK' if good else 'FAIL'} · {len(rise['kinds'])} foe kinds hit while surfacing")
        for p in rise["bad"] + g.problems()[n0:][:6]:
            print("   ", p[:240])
        for b in biomes:
            for hero in heroes:
                n0 = len(g.problems())
                await g.js("(() => { const I = window.__isle; I.G.state = 'title'; for (const id of ['scrEnd', 'scrPause']) document.getElementById(id).hidden = true; })()")
                res = await g.js(SMOKE, [b, hero])
                probs = g.problems()[n0:]
                good = not probs and res["guardian"]
                ok &= good
                print(f"smoke {b} × {hero}: {'OK' if good else 'FAIL'} · {len(res['steps'])} steps · state {res['state']}")
                for p in probs[:6]:
                    print("   ", p[:240])
    if "--bot" in args:
        for b in biomes:
            r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "bot.py"), "--biome", b, "1337"], capture_output=True, text=True)
            print(r.stdout.strip())
            ok &= r.returncode == 0
    moonmoth = os.path.join(ROOT, "tools", "check_moonmoth.py")
    if os.path.isfile(moonmoth):
        for cmd in (["node", os.path.join(ROOT, "tools", "test_moonmoth.cjs")],
                    [sys.executable, moonmoth]):
            r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
            print(r.stdout.strip(), r.stderr.strip())
            ok &= r.returncode == 0
    print("CHECK OK" if ok else "CHECK FAILED")
    sys.exit(0 if ok else 1)


asyncio.run(main())

