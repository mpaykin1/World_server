#!/usr/bin/env python3
"""Verify Browser mouse -> native FireKey -> ammo -> FireShot causality with VNO/A2."""

import json
import re
import sys

STATE_RE = re.compile(
    r"\[kk-weapon\] state current=(\d+) next=(\d+) ammo0=(\d+) fire=(\d+) shots=(\d+)"
)
SHOT_RE = re.compile(r"\[kk-weapon\] shot=(\d+) weapon=(\d+) ammo=(\d+)")


def states(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    values = [tuple(map(int, m.groups())) for m in STATE_RE.finditer(text)]
    if not values:
        raise SystemExit(f"no native weapon-state telemetry in {path}")
    return values


def shots(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    return [tuple(map(int, m.groups())) for m in SHOT_RE.finditer(text)]


def evaluate(a_values, n_values, b_values, a2_values, fired_shots):
    a, n, b, a2 = a_values[-1], n_values[-1], b_values[-1], a2_values[-1]
    # current,next,ammo0,fire,shots
    selected = all(x[0] == 1 and x[1] == 1 for x in (a, n, b, a2))
    negative = n[2] == a[2] and n[4] == 0
    fired = b[2] == a[2] - 1 and b[4] >= 1
    shot_boundary = any(weapon == 1 and ammo == b[2] for _, weapon, ammo in fired_shots)
    restored = a2[2] == a[2] and a2[4] == 0
    return {
        "baselineAmmo0": a[2],
        "negativeControlAmmo0": n[2],
        "firedAmmo0": b[2],
        "restoredAmmo0": a2[2],
        "weaponSelected": selected,
        "irrelevantKeyNoEffect": negative,
        "ammoDecrementExact": fired,
        "nativeFireShotObserved": shot_boundary,
        "restorationExact": restored,
        "firedShotSamples": len(fired_shots),
        "pass": selected and negative and fired and shot_boundary and restored,
    }


def self_test():
    good = evaluate(
        [(1, 1, 100, 0, 0)],
        [(1, 1, 100, 0, 0)],
        [(1, 1, 99, 0, 1)],
        [(1, 1, 100, 0, 0)],
        [(1, 1, 99)],
    )
    if not good["pass"]:
        raise SystemExit(f"valid weapon proof rejected: {good}")
    false_negative = evaluate(
        [(1, 1, 100, 0, 0)],
        [(1, 1, 99, 0, 1)],
        [(1, 1, 99, 0, 1)],
        [(1, 1, 100, 0, 0)],
        [(1, 1, 99)],
    )
    if false_negative["pass"]:
        raise SystemExit("negative-control weapon false positive accepted")
    no_shot = evaluate(
        [(1, 1, 100, 0, 0)],
        [(1, 1, 100, 0, 0)],
        [(1, 1, 99, 0, 1)],
        [(1, 1, 100, 0, 0)],
        [],
    )
    if no_shot["pass"]:
        raise SystemExit("ammo-only false positive accepted without FireShot")
    print("weapon verifier self-test: PASS")


def main(argv):
    if len(argv) == 2 and argv[1] == "--self-test":
        self_test()
        return
    if len(argv) != 6:
        raise SystemExit("usage: verify-weapon-browser-proof.py A.log N.log B.log A2.log out.json")
    phase_states = [states(p) for p in argv[1:5]]
    fired = shots(argv[3])
    result = evaluate(*phase_states, fired)
    result.update({
        "boundary": "Browser mouse down -> SDL sKEY_MOUSEL -> Player.FireKey -> Ammo[CurrentWeapon/2]-- -> KKriegerGame::FireShot",
        "baselineSamples": len(phase_states[0]),
        "negativeControlSamples": len(phase_states[1]),
        "firedSamples": len(phase_states[2]),
        "restoredSamples": len(phase_states[3]),
    })
    open(argv[5], "w", encoding="utf-8").write(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    if not result["pass"]:
        raise SystemExit("weapon causality proof failed: selection, VNO, ammo, FireShot, or A2 restoration gate failed")


if __name__ == "__main__":
    main(sys.argv)
