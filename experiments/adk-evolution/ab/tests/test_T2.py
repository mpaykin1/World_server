"""Acceptance test T2: new heavy foe type 'brute' with knockback resistance (see tasks/T2.json)."""
import sys
from lib import Game, Report

html = sys.argv[1]
r = Report("T2")

with Game(html) as g:
    g.start_play(0)
    imp = g.ev("() => { const f = window.__isle.foeNear('imp', 6, 0); return { hp: f.def.hp, chase: f.def.chase, dmg: f.def.dmg }; }")
    shade = g.ev("() => { const f = window.__isle.foeNear('shade', -6, 0); return { hp: f.def.hp, chase: f.def.chase, dmg: f.def.dmg }; }")
    r.check("imp stats unchanged (hp 24, chase 3.3, dmg 1)", imp == {"hp": 24, "chase": 3.3, "dmg": 1}, str(imp))
    r.check("shade stats unchanged (hp 70, chase 3.0, dmg 1)", shade == {"hp": 70, "chase": 3.0, "dmg": 1}, str(shade))
    r.check("no page errors on load", not g.errors, "; ".join(g.errors[:2]))

with Game(html) as g:
    g.start_play(0)
    d = g.ev("""() => { try { const f = window.__isle.foeNear('brute', 5, 0); if (!f) return { err: 'null' };
                return { type: f.type, hp: f.def.hp, chase: f.def.chase, chaseR: f.def.chaseR, dmg: f.def.dmg, soul: f.def.soul }; }
                catch (e) { return { err: String(e) }; } }""")
    ok = "err" not in d and d["type"] == "brute"
    r.check("foeNear('brute') works", ok, str(d))
    if ok:
        r.check("brute is tough: hp >= 160", d["hp"] >= 160, f"hp={d['hp']}")
        r.check("brute is slow: chase <= 2.4", d["chase"] <= 2.4, f"chase={d['chase']}")
        r.check("brute notices player: chaseR >= 7", d["chaseR"] >= 7, f"chaseR={d['chaseR']}")
        r.check("brute hits hard: dmg == 2", d["dmg"] == 2, f"dmg={d['dmg']}")
        r.check("brute can drop souls: soul > 0", d["soul"] > 0, f"soul={d['soul']}")

with Game(html) as g:
    g.start_play(5)
    res = g.sim_track(150)
    r.check("no brute spawns with 5 coins collected (150 s)", res["total"].get("brute", 0) == 0, str(res))

with Game(html) as g:
    g.start_play(6)
    res = g.sim_track(150)
    r.check("brute spawns with 6 coins collected (150 s)", res["total"].get("brute", 0) >= 1, str(res))
    r.check("at most 1 brute alive at once", res["maxAlive"].get("brute", 0) <= 1, str(res))
    r.check("no page errors while simulating", not g.errors, "; ".join(g.errors[:2]))

# knockback: bomb blast at the same offset; knockback relative to the nominal value
KB_JS = """(kind) => { try { const I = window.__isle; I.killFoes(); I.G.state = 'play'; I.player.invuln = 99;
    const f = I.foeNear(kind, 20, 0, true); if (!f) return null;
    const h = f.segs[0]; const R = I.WEAPONS.bomb.aoe, kbW = I.WEAPONS.bomb.kb;
    const d = 1.2; const bx = h.x - d, by = h.y, bz = h.z;
    const dist = Math.hypot(h.x - bx, h.y - by, h.z - bz);
    const fall = 1 - Math.min(Math.max(dist / (R + f.def.rad), 0), 1) * 0.6;
    f.kb.set(0, 0, 0); const hp0 = f.hp;
    I.boom(bx, by, bz);
    const kb = Math.hypot(f.kb.x, f.kb.z);
    return { ratio: kb / (kbW * fall), alive: f.state !== 'dissolve' && f.hp > 0, lost: hp0 - f.hp }; } catch (e) { return null; } }"""
with Game(html) as g:
    g.start_play(0)
    sh = g.ev(KB_JS, "shade")
    br = g.ev(KB_JS, "brute")
ok = sh is not None and 0.95 <= sh["ratio"] <= 1.05
r.check("shade knockback unchanged (ratio ~1)", ok, str(sh))
ok = br is not None and 0.05 < br["ratio"] <= 0.4
r.check("brute knockback reduced to <= 40% (and not zero)", ok, str(br))
r.check("brute survives one bomb", br is not None and br["alive"] and br["lost"] > 0, str(br))

with Game(html) as g:
    g.start_play(0)
    k = g.ev("""() => { try { const I = window.__isle; I.killFoes(); const f = I.foeNear('brute', 4, 0); if (!f) return null;
        f.hp = 10; const k0 = I.G.kills; const h = f.segs[0]; I.boom(h.x, h.y, h.z);
        for (let i = 0; i < 30; i++) { I.G.state = 'play'; I.sim(1 / 30, 0, 0, false, false); }
        return { dk: I.G.kills - k0, alive: f.state !== 'dissolve' && f.hp > 0 }; } catch (e) { return null; } }""")
    r.check("wounded brute dies to a blast and counts the kill", bool(k) and k["dk"] == 1 and not k["alive"], str(k))

r.finish()
