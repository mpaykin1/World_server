#!/usr/bin/env python3
"""Verify Browser W control -> native player movement with VNO/A2."""

import json
import math
import re
import sys

WHERE_RE = re.compile(
    r"\[kk\] where pos=\(([-+0-9.eE]+) ([-+0-9.eE]+) ([-+0-9.eE]+)\) dir=([-+0-9.eE]+) look=([-+0-9.eE]+)"
)


def samples(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    values = [tuple(map(float, m.groups())) for m in WHERE_RE.finditer(text)]
    if not values:
        raise SystemExit(f"no native movement telemetry in {path}")
    return values


def distance(a, b):
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))


def evaluate(a_values, n_values, b_values, a2_values):
    a, n, b, a2 = a_values[-1], n_values[-1], b_values[-1], a2_values[-1]
    negative = distance(a, n)
    signal = distance(a, b)
    restored = distance(a, a2)
    noise = max(negative, restored, 1e-4)
    negative_ok = negative <= 0.08
    signal_ok = signal >= 0.25 and signal >= noise * 5.0
    restored_ok = restored <= 0.08
    return {
        "baselinePosition": list(a[:3]),
        "negativePosition": list(n[:3]),
        "movedPosition": list(b[:3]),
        "restoredPosition": list(a2[:3]),
        "negativePositionDelta": negative,
        "forwardPositionDelta": signal,
        "restorationPositionDelta": restored,
        "signalToNoise": signal / noise,
        "irrelevantKeyNoMovement": negative_ok,
        "forwardMovementObserved": signal_ok,
        "restorationExactEnough": restored_ok,
        "pass": negative_ok and signal_ok and restored_ok,
    }


def self_test():
    a = [(0, 0, 0, 0, 0)]
    n = [(0.01, 0, 0, 0, 0)]
    b = [(1.0, 0, 0, 0, 0)]
    a2 = [(0, 0, 0, 0, 0)]
    good = evaluate(a, n, b, a2)
    if not good["pass"]:
        raise SystemExit(f"valid control proof rejected: {good}")
    bad = evaluate(a, b, b, a2)
    if bad["pass"]:
        raise SystemExit("movement VNO false positive accepted")
    print("control verifier self-test: PASS")


def main(argv):
    if len(argv) == 2 and argv[1] == "--self-test":
        self_test()
        return
    if len(argv) != 6:
        raise SystemExit("usage: verify-control-browser-proof.py A.log N.log B.log A2.log out.json")
    phases = [samples(path) for path in argv[1:5]]
    result = evaluate(*phases)
    result.update({
        "boundary": "Browser W key down/up -> KKriegerGame::OnKey -> AccelForw -> MoveCollider -> PlayerPos",
        "baselineSamples": len(phases[0]),
        "negativeControlSamples": len(phases[1]),
        "movedSamples": len(phases[2]),
        "restoredSamples": len(phases[3]),
    })
    open(argv[5], "w", encoding="utf-8").write(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    if not result["pass"]:
        raise SystemExit("control causality proof failed: VNO, movement signal, or A2 restoration gate failed")


if __name__ == "__main__":
    main(sys.argv)
