#!/usr/bin/env python3
"""Fail-closed A/B/A verifier for the real native normal stream and framebuffer."""

import collections
import json
import re
import sys

from PIL import Image, ImageChops, ImageStat


NORMAL_RE = re.compile(r"\[kk-normal\] mode=(\d+) vertices=(\d+) hash=(\d+)")


def normal_samples(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    samples = [tuple(map(int, match.groups())) for match in NORMAL_RE.finditer(text)]
    if not samples:
        raise SystemExit(f"no native normal-stream telemetry in {path}")
    return samples


def image_delta(left, right):
    a = Image.open(left).convert("RGB")
    b = Image.open(right).convert("RGB")
    if a.size != b.size:
        raise SystemExit("normal proof screenshot size drift")
    diff = ImageChops.difference(a, b)
    return sum(ImageStat.Stat(diff).mean) / 3.0


def main(argv):
    if len(argv) != 9:
        raise SystemExit("usage: verify-normal-browser-proof.py A.log B.log A2.log B.png B2.png A2.png A2b.png out.json")
    baseline, inverted, restored = map(normal_samples, argv[1:4])
    baseline_counts = collections.Counter(baseline)
    inverted_counts = collections.Counter(inverted)
    restored_counts = collections.Counter(restored)
    baseline_modes = {sample[0] for sample in baseline}
    inverted_modes = {sample[0] for sample in inverted}
    restored_modes = {sample[0] for sample in restored}
    hash_changed = baseline_counts != inverted_counts
    restoration_exact = baseline_counts == restored_counts
    inverted_noise = image_delta(argv[4], argv[5])
    restored_noise = image_delta(argv[6], argv[7])
    framebuffer_delta = image_delta(argv[4], argv[6])
    visible_effect = framebuffer_delta >= max(1.0, inverted_noise * 5.0, restored_noise * 5.0)
    passed = (
        baseline_modes == {0}
        and inverted_modes == {1}
        and restored_modes == {0}
        and hash_changed
        and restoration_exact
        and visible_effect
    )
    output = {
        "pass": passed,
        "boundary": "GenMesh::NeedAllNormals -> EngMesh::FillVertexBuffer -> GPU normal stream -> Browser/WebGL framebuffer",
        "baselineSamples": len(baseline),
        "invertedSamples": len(inverted),
        "restoredSamples": len(restored),
        "nativeNormalHashChanged": hash_changed,
        "nativeNormalHashRestorationExact": restoration_exact,
        "invertedAaMeanAbsoluteChannelDelta": round(inverted_noise, 6),
        "restoredAaMeanAbsoluteChannelDelta": round(restored_noise, 6),
        "invertedVsRestoredMeanAbsoluteChannelDelta": round(framebuffer_delta, 6),
        "framebufferEffectExceedsAaNoise5x": visible_effect,
    }
    open(argv[8], "w", encoding="utf-8").write(json.dumps(output, indent=2) + "\n")
    print(json.dumps(output, indent=2))
    if not passed:
        raise SystemExit("normal causality proof failed: native hash/framebuffer mutation or A/B/A restoration gate failed")


if __name__ == "__main__":
    main(sys.argv)
