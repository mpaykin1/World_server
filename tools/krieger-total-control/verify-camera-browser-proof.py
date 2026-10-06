#!/usr/bin/env python3
"""Verify Browser mouse movement -> native camera direction/look with VNO/A2."""

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
        raise SystemExit(f"no native camera telemetry in {path}")
    return values


def angle_delta(a, b):
    return math.hypot(a[3] - b[3], a[4] - b[4])


def evaluate(a_values, n_values, b_values, a2_values):
    a, n, b, a2 = a_values[-1], n_values[-1], b_values[-1], a2_values[-1]
    negative = angle_delta(a, n)
    signal = angle_delta(a, b)
    restored = angle_delta(a, a2)
    noise = max(negative, restored, 1e-6)
    return {
        "baselineDirLook": [a[3], a[4]],
        "negativeDirLook": [n[3], n[4]],
        "movedDirLook": [b[3], b[4]],
        "restoredDirLook": [a2[3], a2[4]],
        "negativeAngleDelta": negative,
        "mouseAngleDelta": signal,
        "restorationAngleDelta": restored,
        "signalToNoise": signal / noise,
        "irrelevantKeyNoCameraEffect": negative <= 0.002,
        "mouseCameraEffectObserved": signal >= 0.02 and signal >= noise * 10.0,
        "restorationExactEnough": restored <= 0.002,
        "pass": negative <= 0.002 and signal >= 0.02 and signal >= noise * 10.0 and restored <= 0.002,
    }


def self_test():
    a = [(0, 0, 0, 1.0, 0.1)]
    n = [(0, 0, 0, 1.0, 0.1)]
    b = [(0, 0, 0, 1.3, 0.2)]
    a2 = [(0, 0, 0, 1.0, 0.1)]
    good = evaluate(a, n, b, a2)
    if not good["pass"]:
        raise SystemExit(f"valid camera proof rejected: {good}")
    bad = evaluate(a, b, b, a2)
    if bad["pass"]:
        raise SystemExit("camera VNO false positive accepted")
    print("camera verifier self-test: PASS")


def main(argv):
    if len(argv) == 2 and argv[1] == "--self-test":
        self_test()
        return
    if len(argv) != 6:
        raise SystemExit("usage: verify-camera-browser-proof.py A.log N.log B.log A2.log out.json")
    phases = [samples(path) for path in argv[1:5]]
    result = evaluate(*phases)
    result.update({
        "boundary": "Browser CDP mouseMoved -> SDL input Analog[0/1] -> PlayerDir/PlayerLook -> native camera",
        "baselineSamples": len(phases[0]),
        "negativeControlSamples": len(phases[1]),
        "movedSamples": len(phases[2]),
        "restoredSamples": len(phases[3]),
    })
    open(argv[5], "w", encoding="utf-8").write(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    if not result["pass"]:
        raise SystemExit("camera causality proof failed: VNO, mouse signal, or A2 restoration gate failed")


if __name__ == "__main__":
    main(sys.argv)
