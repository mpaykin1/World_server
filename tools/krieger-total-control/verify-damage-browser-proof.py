#!/usr/bin/env python3
"""Verify browser input -> native player damage -> restored runtime state."""

import json
import re
import sys


LIFE_RE = re.compile(r"\[kk\] player .* life=(-?\d+)")


def samples(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    values = [int(value) for value in LIFE_RE.findall(text)]
    if not values:
        raise SystemExit(f"no native player-life telemetry in {path}")
    return values


def evaluate(baseline, negative, damaged, restored):
    a = baseline[-1]
    n = negative[-1]
    b = damaged[-1]
    a2 = restored[-1]
    return {
        "baselineLife": a,
        "negativeControlLife": n,
        "damagedLife": b,
        "restoredLife": a2,
        "irrelevantKeyNoEffect": n == a,
        "damageObserved": b < a,
        "damageAmount": a - b,
        "restorationExact": a2 == a,
        "pass": n == a and b < a and a2 == a,
    }


def self_test():
    valid = evaluate([100, 100], [100, 100], [100, 90], [100, 100])
    if not valid["pass"] or valid["damageAmount"] != 10:
        raise SystemExit(f"valid damage sequence rejected: {valid}")
    false_positive = evaluate([100], [90], [90], [100])
    if false_positive["pass"]:
        raise SystemExit("irrelevant-key damage false positive accepted")
    print("damage verifier self-test: PASS")


def main(argv):
    if len(argv) == 2 and argv[1] == "--self-test":
        self_test()
        return
    if len(argv) != 6:
        raise SystemExit("usage: verify-damage-browser-proof.py A.log N.log B.log A2.log out.json")
    result = evaluate(*(samples(path) for path in argv[1:5]))
    result.update({
        "boundary": "Browser key K -> KKriegerGame::OnKey -> KKriegerPlayer::Hit -> Player.Life",
        "baselineSamples": len(samples(argv[1])),
        "negativeControlSamples": len(samples(argv[2])),
        "damagedSamples": len(samples(argv[3])),
        "restoredSamples": len(samples(argv[4])),
    })
    open(argv[5], "w", encoding="utf-8").write(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    if not result["pass"]:
        raise SystemExit("damage causality proof failed: negative control, damage, or restoration gate failed")


if __name__ == "__main__":
    main(sys.argv)
