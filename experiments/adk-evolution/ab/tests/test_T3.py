"""Acceptance test T3: wounded foes flee once (see tasks/T3.json)."""
import sys
from lib import Game, Report

html = sys.argv[1]
r = Report("T3")

PROBE = """([kind, hp, secs]) => { try { const I = window.__isle; I.killFoes(); I.G.state = 'play'; I.player.invuln = 99;
    const f = I.foeNear(kind, 5, 0); if (!f) return null;
    if (kind === 'warden') { f.state = 'chase'; f.timer = 0; }
    f.hp = hp;
    const px = I.player.pos.x, pz = I.player.pos.z;
    const log = []; const d0 = Math.hypot(f.segs[0].x - px, f.segs[0].z - pz);
    const steps = Math.round(secs * 30);
    for (let i = 1; i <= steps; i++) { I.G.state = 'play'; I.sim(1 / 30, 0, 0, false, false); if (i % 15 === 0) log.push(f.state); }
    const d1 = Math.hypot(f.segs[0].x - px, f.segs[0].z - pz);
    return { log, gain: d1 - d0, alive: f.state !== 'dissolve' && f.hp > 0 }; } catch (e) { return null; } }"""

def run(kind, hp, secs):
    with Game(html) as g:
        g.start_play(0)
        out = g.ev(PROBE, [kind, hp, secs])
        return out, g.errors

# unhurt shade must not flee
out, errs = run("shade", 60, 2)
r.check("shade above 25% hp does not flee", out is not None and "flee" not in out["log"], str(out))
r.check("no page errors", not errs, "; ".join(errs[:2]))

# shade at <=25% flees quickly, for >=3 s, and moves away
out, _ = run("shade", 15, 3.5)
fl = out["log"] if out else []
r.check("shade at 15/70 hp is fleeing within 0.5 s", out is not None and len(fl) >= 1 and fl[0] == "flee", str(out))
r.check("shade keeps fleeing for at least 3 s", out is not None and len(fl) >= 6 and all(s == "flee" for s in fl[:6]), str(out))
r.check("fleeing shade gains distance (>= 3 units in 3.5 s)", out is not None and out["gain"] >= 3.0, str(out))

# imp flees too (threshold is relative to max hp: 6 of 24)
out, _ = run("imp", 5, 1)
r.check("imp at 5/24 hp flees", out is not None and out["log"] and out["log"][0] == "flee", str(out))
out, _ = run("imp", 8, 1)
r.check("imp at 8/24 hp (above 25%) does not flee", out is not None and "flee" not in out["log"], str(out))

# once only: after the flee ends the foe does not flee again
out, _ = run("shade", 15, 9)
fl = out["log"] if out else []
r.check("flee happens only once per foe", out is not None and "flee" in fl and fl[-1] != "flee" and fl[-3:].count("flee") == 0, str(out))

# bosses never flee
out, _ = run("warden", 100, 3)
r.check("the warden boss never flees", out is not None and "flee" not in out["log"], str(out))

r.finish()
