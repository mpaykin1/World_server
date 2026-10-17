"""Acceptance test T1: new fast, fragile foe type 'wraith' (see tasks/T1.json)."""
import sys
from lib import Game, Report

html = sys.argv[1]
r = Report("T1")

# 1. existing enemies untouched, game loads without errors
with Game(html) as g:
    g.start_play(0)
    imp = g.ev("() => { const f = window.__isle.foeNear('imp', 6, 0); return { hp: f.def.hp, chase: f.def.chase, dmg: f.def.dmg }; }")
    shade = g.ev("() => { const f = window.__isle.foeNear('shade', -6, 0); return { hp: f.def.hp, chase: f.def.chase, dmg: f.def.dmg }; }")
    r.check("imp stats unchanged (hp 24, chase 3.3, dmg 1)", imp == {"hp": 24, "chase": 3.3, "dmg": 1}, str(imp))
    r.check("shade stats unchanged (hp 70, chase 3.0, dmg 1)", shade == {"hp": 70, "chase": 3.0, "dmg": 1}, str(shade))
    r.check("no page errors on load", not g.errors, "; ".join(g.errors[:2]))

# 2. wraith definition
with Game(html) as g:
    g.start_play(0)
    d = g.ev("""() => { try { const f = window.__isle.foeNear('wraith', 5, 0); if (!f) return { err: 'null' };
                return { type: f.type, hp: f.def.hp, chase: f.def.chase, chaseR: f.def.chaseR, dmg: f.def.dmg, soul: f.def.soul, seg: f.def.seg }; }
                catch (e) { return { err: String(e) }; } }""")
    ok = "err" not in d and d["type"] == "wraith"
    r.check("foeNear('wraith') works", ok, str(d))
    if ok:
        r.check("wraith fragile: hp <= 30", d["hp"] <= 30, f"hp={d['hp']}")
        r.check("wraith fast: chase >= 4.6", d["chase"] >= 4.6, f"chase={d['chase']}")
        r.check("wraith notices player: chaseR >= 7", d["chaseR"] >= 7, f"chaseR={d['chaseR']}")
        r.check("wraith contact damage is 1", d["dmg"] == 1, f"dmg={d['dmg']}")
        r.check("wraith can drop souls: soul > 0", d["soul"] > 0, f"soul={d['soul']}")

# 3. gating: no wraith below 3 coins
with Game(html) as g:
    g.start_play(2)
    res = g.sim_track(120)
    r.check("no wraith spawns with 2 coins collected (120 s)", res["total"].get("wraith", 0) == 0, str(res))

# 4. gating: wraiths appear at 3 coins, never more than 2 alive
with Game(html) as g:
    g.start_play(3)
    res = g.sim_track(150)
    r.check("wraith spawns with 3 coins collected (150 s)", res["total"].get("wraith", 0) >= 1, str(res))
    r.check("at most 2 wraiths alive at once", res["maxAlive"].get("wraith", 0) <= 2, str(res))
    r.check("no page errors while simulating", not g.errors, "; ".join(g.errors[:2]))

# 5. behaviour: wraith closes distance faster than an imp
def closing(g, kind):
    return g.ev("""(kind) => { try { const I = window.__isle; I.killFoes(); I.G.state = 'play'; I.player.invuln = 99;
        const f = I.foeNear(kind, 12, 0); if (!f) return null;
        f.state = 'chase'; f.timer = 0;
        const px = I.player.pos.x, pz = I.player.pos.z;
        const d0 = Math.hypot(f.segs[0].x - px, f.segs[0].z - pz);
        for (let i = 0; i < 60; i++) { I.G.state = 'play'; I.sim(1 / 30, 0, 0, false, false); }
        const d1 = Math.hypot(f.segs[0].x - px, f.segs[0].z - pz);
        return d0 - d1; } catch (e) { return null; } }""", kind)

with Game(html) as g:
    g.start_play(0)
    c_imp = closing(g, "imp")
with Game(html) as g:
    g.start_play(0)
    c_wr = closing(g, "wraith")
ok = c_imp is not None and c_wr is not None and c_wr > c_imp * 1.15
r.check("wraith closes distance >=15% faster than imp in 2 s from 12 units", ok, f"imp={c_imp}, wraith={c_wr}")

# 6. kills are counted
with Game(html) as g:
    g.start_play(0)
    k = g.ev("""() => { try { const I = window.__isle; I.killFoes(); const f = I.foeNear('wraith', 4, 0); if (!f) return null;
        const k0 = I.G.kills; const h = f.segs[0]; I.boom(h.x, h.y, h.z);
        for (let i = 0; i < 30; i++) { I.G.state = 'play'; I.sim(1 / 30, 0, 0, false, false); }
        return { dk: I.G.kills - k0, alive: f.state !== 'dissolve' && f.hp > 0 }; } catch (e) { return null; } }""")
    r.check("explosion kills a wraith and counts the kill", bool(k) and k["dk"] == 1 and not k["alive"], str(k))

r.finish()
