#!/usr/bin/env python3
"""
Screenshots of content in the running game — the visual check for anything added to a pack.

usage: python3 tools/shots.py OUTDIR TARGET [TARGET ...]
targets:
  title                      title screen
  play                       start a run, walk a little (HUD, first loot)
  weapons                    every weapon swung / fired at a dummy foe, one frame each + sheet
  weapon:<id>                one weapon, 12-frame strip of a full attack
  enemy:<id>                 the foe beside the hero (idle, hit, close-up) + strip of its motion
  biome:<id>                 a new island of that biome: title fly-over, dusk, twilight, night
  character:<id>             the hero sheet: in-world walking, idle and jump
  relic:<id>                 the relic on its pedestal, then picked up (HUD)
  npc:<id>                   the NPC and its speech bubble
  event:<id>                 the world event forced on, two moments
  mobile                     portrait phone layout (touch buttons)
  boss                       the warden fight beats
Writes PNGs into OUTDIR and a contact sheet per target (OUTDIR/<target>_sheet.png).
"""
import asyncio
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.harness import Game  # noqa: E402

# a flat open patch for staged shots; the camera looks across it from the side
SETUP = """(opts) => {
  const I = window.__isle, W = I.world, P = I.player;
  let best = null, bs = -1;
  for (const [x, z] of W.landCells) {
    const s = W.stand[x + z * 64];
    if (s < 5 || s > 12) continue;
    let ok = true;
    for (let b = -4; b <= 4 && ok; b++) for (let a = -4; a <= 4; a++) {
      const X = x + a, Z = z + b;
      if (X < 0 || Z < 0 || X > 63 || Z > 63) { ok = false; break; }
      const i = X + Z * 64;
      if (W.stand[i] !== s || W.kind[i] === 5) { ok = false; break; }
    }
    if (!ok) continue;
    const d = Math.hypot(x - W.tower.x, z - W.tower.z);
    const sc = 100 - Math.abs(d - 12);
    if (sc > bs) { bs = sc; best = [x, z]; }
  }
  if (!best) best = [Math.floor(W.spawn.x), Math.floor(W.spawn.z)];
  I.teleport(best[0] + 0.5, best[1] + 0.5);
  P.pos.y = W.stand[best[0] + best[1] * 64];
  const yaw = opts.yaw ?? 0.6, dist = opts.dist ?? 8.5;
  I.rig.yawT = I.rig.yaw = yaw; I.rig.pitchT = I.rig.pitch = opts.pitch ?? 0.55; I.rig.distT = I.rig.dist = dist;
  I.rig.pos.set(P.pos.x + Math.sin(yaw) * dist * 0.8, P.pos.y + 5, P.pos.z + Math.cos(yaw) * dist * 0.8);
  I.rig.look.set(P.pos.x, P.pos.y + 1, P.pos.z);
  I.setTod(opts.tod ?? 0.42);
  I.G.spawnT = 1e9;
  if (opts.arsenal) { I.giveAll(); for (const L of I.loot) L.alive = false; }
  return best;
}"""

FOE = """([type, dist, hp]) => {
  const I = window.__isle, P = I.player, y = I.rig.yaw;
  I.killFoes();
  for (const f of I.foes) f.alpha = 0;
  const cx = Math.cos(y), cz = -Math.sin(y);
  const f = I.foeNear(type, cx * dist, cz * dist, true);
  if (!f) return null;
  if (hp) f.hp = f.maxHp = hp;
  I.aimAt(P.pos.x + cx * dist, P.pos.z + cz * dist);
  P.vel.set(0, 0, 0);
  return [f.segs[0].x, f.segs[0].z];
}"""

WEAPON_TIMING = {"fists": 3, "stick": 3, "dagger": 2, "sword": 4, "katana": 3, "axe": 8, "hammer": 11, "spear": 4, "scythe": 5,
                 "flamesword": 4, "flail": 14, "sling": 3, "bow": 16, "xbow": 3, "pistol": 2, "shotgun": 2, "smg": 8, "saw": 6,
                 "bomb": 12, "tesla": 1, "laser": 8}
WEAPON_HOLD = {"bow": 15, "flail": 99, "smg": 99, "laser": 99}


def sheet(paths, out, cols=4, cell=(400, 225), crop=None):
    ims = []
    for p in paths:
        if not os.path.isfile(p):
            continue
        im = Image.open(p).convert("RGB")
        if crop:
            im = im.crop(crop)
        ims.append(im.resize(cell))
    if not ims:
        return
    rows = (len(ims) + cols - 1) // cols
    s = Image.new("RGB", (cell[0] * cols, cell[1] * rows), (18, 13, 28))
    for i, im in enumerate(ims):
        s.paste(im, ((i % cols) * cell[0], (i // cols) * cell[1]))
    s.save(out)


async def start_run(g, tod=None):
    await g.js("window.__isle.startGame()")
    await g.frames(5)
    if tod is not None:
        await g.js(f"window.__isle.setTod({tod})")


async def t_title(g, out):
    await g.frames(25)
    p = os.path.join(out, "title.png"); await g.shot(p)
    return [p]


async def t_play(g, out):
    await start_run(g)
    await g.frames(40)
    paths = [os.path.join(out, "play_1.png")]
    await g.shot(paths[0])
    await g.page.keyboard.down("KeyW"); await g.frames(40); await g.page.keyboard.up("KeyW"); await g.frames(8)
    paths.append(os.path.join(out, "play_2.png")); await g.shot(paths[-1])
    return paths


async def t_weapons(g, out, only=None):
    await start_run(g)
    await g.js(SETUP, {"arsenal": True})
    await g.frames(30)
    order = only or await g.js("window.__isle.ARSENAL_ORDER")
    paths = []
    for wid in order:
        await g.js(f"window.__isle.equip('{wid}')")
        w = await g.js(f"(() => {{ const w = window.__isle.WEAPONS['{wid}']; return {{ kind: w.kind, reach: w.reach || 0 }}; }})()")
        dist = max(1.4, w["reach"] * 0.8 + 0.4) if w["kind"] == "melee" else 4.4
        await g.js(FOE, ["shade", dist, 100000])
        await g.frames(8)
        await g.js("window.__isle.player.invuln = 0; window.__isle.G.hitstop = 0; window.__isle.aim.cursorT = 0")
        await g.js("window.__isle.attack(true)")
        n, hold = WEAPON_TIMING.get(wid, 4), WEAPON_HOLD.get(wid, 1)
        if hold < n:
            await g.frames(hold); await g.js("window.__isle.attack(false)"); await g.frames(n - hold)
        else:
            await g.frames(n)
        p = os.path.join(out, f"weapon_{wid}.png")
        await g.shot(p)
        paths.append(p)
        await g.js("window.__isle.attack(false)")
        await g.frames(10)
    sheet(paths, os.path.join(out, "weapons_sheet.png"), cols=6, cell=(300, 216), crop=(340, 150, 940, 582))
    return paths


async def t_weapon(g, out, wid):
    await start_run(g)
    await g.js(SETUP, {"arsenal": True, "dist": 9})
    await g.frames(25)
    await g.js(f"window.__isle.equip('{wid}')")
    w = await g.js(f"(() => {{ const w = window.__isle.WEAPONS['{wid}']; return {{ kind: w.kind, reach: w.reach || 0, hold: !!(w.A && w.A.hold), charge: !!w.charge }}; }})()")
    dist = max(1.4, w["reach"] * 0.8 + 0.4) if w["kind"] == "melee" else 4.4
    await g.js(FOE, ["shade", dist, 100000])
    await g.frames(8)
    await g.js("window.__isle.aim.cursorT = 0; window.__isle.attack(true)")
    paths = []
    release = 14 if (w["charge"] or w["hold"]) else 3
    for i in range(16):
        if i == release:
            await g.js("window.__isle.attack(false)")
        await g.frames(1)
        p = os.path.join(out, f"weapon_{wid}_{i:02d}.png")
        await g.shot(p, clip=(390, 150, 500, 380))
        paths.append(p)
    await g.js("window.__isle.attack(false)")
    sheet(paths, os.path.join(out, f"weapon_{wid}_sheet.png"), cols=4, cell=(250, 190))
    return paths


async def t_enemy(g, out, fid):
    await start_run(g)
    await g.js(SETUP, {"arsenal": True, "tod": 0.6, "dist": 9.5})
    await g.frames(25)
    pos = await g.js(FOE, [fid, 3.6, 100000])
    if pos is None:
        print("enemy could not spawn:", fid)
        return []
    paths = []
    for i in range(4):
        await g.frames(6)
        p = os.path.join(out, f"enemy_{fid}_{i}.png"); await g.shot(p); paths.append(p)
    await g.js("window.__isle.equip('pistol'); window.__isle.aim.cursorT = 0; window.__isle.attack(true)")
    await g.frames(3)
    p = os.path.join(out, f"enemy_{fid}_hit.png"); await g.shot(p); paths.append(p)
    await g.js("window.__isle.attack(false)")
    # let it move (released from hold) for the motion strip
    await g.js("(() => { for (const f of window.__isle.foes) f.hold = false; window.__isle.player.invuln = 99; })()")
    for i in range(4):
        await g.frames(10)
        p = os.path.join(out, f"enemy_{fid}_move{i}.png"); await g.shot(p); paths.append(p)
    sheet(paths, os.path.join(out, f"enemy_{fid}_sheet.png"), cols=3, cell=(420, 236))
    return paths


async def t_biome(g, out, bid):
    await g.js(f"window.__isle.rebuild(4242, '{bid}')")
    await g.frames(40)
    paths = [os.path.join(out, f"biome_{bid}_title.png")]
    await g.shot(paths[0])
    await start_run(g, 0.05)
    await g.frames(50)
    for tod, name in ((0.05, "dusk"), (0.5, "twilight"), (0.95, "night")):
        await g.js(f"window.__isle.setTod({tod})")
        await g.frames(35)
        p = os.path.join(out, f"biome_{bid}_{name}.png"); await g.shot(p); paths.append(p)
    await g.js("(() => { const I = window.__isle; I.rig.distT = 20; I.rig.pitchT = 0.95; I.setTod(0.3); })()")
    await g.frames(45)
    p = os.path.join(out, f"biome_{bid}_wide.png"); await g.shot(p); paths.append(p)
    sheet(paths, os.path.join(out, f"biome_{bid}_sheet.png"), cols=3, cell=(480, 270))
    return paths


async def t_character(g, out, cid):
    await g.js(f"window.__isle.character('{cid}')")
    await start_run(g)
    await g.js(SETUP, {"dist": 6, "yaw": 0.9, "tod": 0.35})
    await g.frames(25)
    paths = []
    p = os.path.join(out, f"character_{cid}_idle.png"); await g.shot(p, clip=(440, 200, 400, 300)); paths.append(p)
    await g.page.keyboard.down("KeyD")
    for i in range(3):
        await g.frames(3)
        p = os.path.join(out, f"character_{cid}_walk{i}.png"); await g.shot(p, clip=(440, 200, 400, 300)); paths.append(p)
    await g.page.keyboard.up("KeyD")
    await g.page.keyboard.down("Space"); await g.frames(4)
    p = os.path.join(out, f"character_{cid}_jump.png"); await g.shot(p, clip=(440, 160, 400, 340)); paths.append(p)
    await g.page.keyboard.up("Space"); await g.frames(20)
    await g.js("window.__isle.setTod(0.95)"); await g.frames(30)
    p = os.path.join(out, f"character_{cid}_night.png"); await g.shot(p); paths.append(p)
    sheet(paths, os.path.join(out, f"character_{cid}_sheet.png"), cols=3, cell=(400, 300))
    return paths


async def t_relic(g, out, rid):
    await start_run(g)
    await g.js(SETUP, {"dist": 7, "tod": 0.5})
    pos = await g.js(f"window.__isle.relicNear('{rid}', 2.2, 0)")
    await g.frames(30)
    paths = [os.path.join(out, f"relic_{rid}_world.png")]
    await g.shot(paths[0])
    # walk onto the shrine: the real pickup (burst, flash, card, HUD icon)
    await g.js(f"(() => {{ const I = window.__isle, R = I.relics.find((r) => r.id === '{rid}' && r.alive); if (R) I.teleport(R.x, R.z); }})()")
    await g.frames(8)
    p = os.path.join(out, f"relic_{rid}_pickup.png"); await g.shot(p); paths.append(p)
    await g.frames(30)
    p = os.path.join(out, f"relic_{rid}_taken.png"); await g.shot(p); paths.append(p)
    sheet(paths, os.path.join(out, f"relic_{rid}_sheet.png"), cols=3, cell=(480, 270))
    return paths


async def t_npc(g, out, nid):
    await start_run(g)
    await g.js(SETUP, {"dist": 7, "tod": 0.55})
    await g.js(f"window.__isle.npcNear('{nid}', 1.8, -0.4)")
    paths = []
    for i in range(3):
        await g.frames(45)
        p = os.path.join(out, f"npc_{nid}_{i}.png"); await g.shot(p); paths.append(p)
    sheet(paths, os.path.join(out, f"npc_{nid}_sheet.png"), cols=3, cell=(480, 270))
    return paths


async def t_event(g, out, eid):
    biome = await g.js(f"(() => {{ const e = window.__isle.REG.events.get('{eid}'); return e && e.biomes ? e.biomes[0] : null; }})()")
    if biome:
        await g.js(f"window.__isle.rebuild(4242, '{biome}')")
    await start_run(g, 0.4)
    await g.frames(20)
    await g.js(f"window.__isle.forceEvent('{eid}')")
    paths = []
    for i, n in enumerate((40, 60)):
        await g.frames(n)
        p = os.path.join(out, f"event_{eid}_{i}.png"); await g.shot(p); paths.append(p)
    sheet(paths, os.path.join(out, f"event_{eid}_sheet.png"), cols=2, cell=(640, 360))
    return paths


async def t_boss(g, out):
    await start_run(g, 0.97)
    await g.js("""(() => { const I = window.__isle; I.giveAll(); I.equip('shotgun');
      const w = I.world, r = w.ring; I.teleport(r.x + (r.x - w.beacon.x) * 0.9, r.z + (r.z - w.beacon.z) * 0.9);
      I.player.hp = 999; I.G.spawnT = 1e9; I.rig.yawT = I.rig.yaw = Math.atan2(r.x - w.beacon.x, r.z - w.beacon.z); I.rig.distT = 12; })()""")
    await g.frames(30)
    await g.js("window.__isle.collectAll()")
    paths = []
    for i, n in enumerate((25, 40, 40)):
        await g.frames(n)
        p = os.path.join(out, f"boss_{i}.png"); await g.shot(p); paths.append(p)
    sheet(paths, os.path.join(out, "boss_sheet.png"), cols=3, cell=(480, 270))
    return paths


async def run_target(out, target):
    kind, _, arg = target.partition(":")
    mobile = kind == "mobile"
    async with Game(viewport=(390, 844) if mobile else (1280, 720), mobile=mobile) as g:
        await g.title()
        if kind == "title":
            paths = await t_title(g, out)
        elif kind == "play":
            paths = await t_play(g, out)
        elif kind == "weapons":
            paths = await t_weapons(g, out, arg.split(",") if arg else None)
        elif kind == "weapon":
            paths = await t_weapon(g, out, arg)
        elif kind == "enemy":
            paths = await t_enemy(g, out, arg)
        elif kind == "biome":
            paths = await t_biome(g, out, arg)
        elif kind == "character":
            paths = await t_character(g, out, arg)
        elif kind == "relic":
            paths = await t_relic(g, out, arg)
        elif kind == "npc":
            paths = await t_npc(g, out, arg)
        elif kind == "event":
            paths = await t_event(g, out, arg)
        elif kind == "boss":
            paths = await t_boss(g, out)
        elif kind == "mobile":
            await g.page.tap("#btnStart")
            await g.frames(50)
            paths = [os.path.join(out, "mobile.png")]
            await g.shot(paths[0])
        else:
            raise SystemExit(f"unknown target '{target}'")
        probs = g.problems()
    print(f"{target}: {len(paths)} shot(s)" + (f"  PROBLEMS: {probs[:5]}" if probs else ""))
    return probs


async def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    bad = []
    for t in sys.argv[2:]:
        bad += await run_target(out, t)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    asyncio.run(main())
