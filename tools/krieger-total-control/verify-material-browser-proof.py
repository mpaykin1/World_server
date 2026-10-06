#!/usr/bin/env python3
"""Verify causal native Material mutation in real Browser/WebGL framebuffer."""

import json
import sys
from PIL import Image, ImageChops, ImageStat


def load(path):
    return Image.open(path).convert("RGB")


def diff(a, b):
    d = ImageChops.difference(a, b)
    stat = ImageStat.Stat(d)
    mean = sum(stat.mean) / 3.0
    data = list(d.getdata())
    changed = sum(1 for px in data if max(px) >= 5) / len(data)
    return {"meanAbs": mean, "changedRatio5": changed}


def evaluate(a, aa, n, b, a2, reachable_report, negative_report):
    aa_d = diff(a, aa)
    n_d = diff(a, n)
    b_d = diff(a, b)
    a2_d = diff(a, a2)
    noise = max(aa_d["meanAbs"], n_d["meanAbs"], 0.01)
    signal_to_noise = b_d["meanAbs"] / noise
    negative_ok = n_d["meanAbs"] <= max(1.5, aa_d["meanAbs"] * 6.0)
    signal_ok = (
        b_d["meanAbs"] >= max(2.0, noise * 4.0)
        and b_d["changedRatio5"] >= max(0.01, n_d["changedRatio5"] * 4.0)
    )
    restoration_ok = a2_d["meanAbs"] <= max(1.5, n_d["meanAbs"] * 1.5, aa_d["meanAbs"] * 6.0)
    reports_ok = (
        reachable_report.get("pass") is True
        and reachable_report.get("targetReachable") is True
        and negative_report.get("pass") is True
        and negative_report.get("targetReachable") is False
        and reachable_report.get("sourceSha256") != reachable_report.get("mutatedSha256")
        and negative_report.get("sourceSha256") != negative_report.get("mutatedSha256")
    )
    return {
        "aaNoise": aa_d,
        "unreachableNegativeControl": n_d,
        "reachableMaterialMutation": b_d,
        "restoration": a2_d,
        "signalToNoise": signal_to_noise,
        "negativeControlNoClaimedEffect": negative_ok,
        "reachableMaterialEffectObserved": signal_ok,
        "restorationWithinNoise": restoration_ok,
        "mutationReportsValid": reports_ok,
        "pass": negative_ok and signal_ok and restoration_ok and reports_ok,
    }


def self_test():
    from PIL import Image
    a = Image.new("RGB", (20, 20), (100, 100, 100))
    aa = Image.new("RGB", (20, 20), (100, 100, 100))
    n = Image.new("RGB", (20, 20), (101, 100, 100))
    b = Image.new("RGB", (20, 20), (20, 20, 20))
    a2 = Image.new("RGB", (20, 20), (100, 100, 100))
    rr = {"pass": True, "targetReachable": True, "sourceSha256": "a", "mutatedSha256": "b"}
    nr = {"pass": True, "targetReachable": False, "sourceSha256": "a", "mutatedSha256": "c"}
    good = evaluate(a, aa, n, b, a2, rr, nr)
    if not good["pass"]:
        raise SystemExit(f"valid material proof rejected: {good}")
    bad = evaluate(a, aa, b, b, a2, rr, nr)
    if bad["pass"]:
        raise SystemExit("wrong-node negative control false positive accepted")
    print("material verifier self-test: PASS")


def main(argv):
    if len(argv) == 2 and argv[1] == "--self-test":
        self_test()
        return
    if len(argv) != 9:
        raise SystemExit("usage: verify-material-browser-proof.py A.png AA.png N.png B.png A2.png reachable.json negative.json out.json")
    a, aa, n, b, a2 = map(load, argv[1:6])
    if len({im.size for im in (a, aa, n, b, a2)}) != 1:
        raise SystemExit("material proof screenshot size drift")
    rr = json.load(open(argv[6], encoding="utf-8"))
    nr = json.load(open(argv[7], encoding="utf-8"))
    out = evaluate(a, aa, n, b, a2, rr, nr)
    out["boundary"] = "native KX Material ambient color -> material pass -> Browser/WebGL framebuffer"
    open(argv[8], "w", encoding="utf-8").write(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))
    if not out["pass"]:
        raise SystemExit("material causality proof failed: VNO, signal/noise, or restoration gate failed")


if __name__ == "__main__":
    main(sys.argv)
