#!/usr/bin/env python3
"""Fail-closed A/B/A verifier for the real native normal stream and framebuffer."""

import collections
import json
import re
import sys

NORMAL_RE = re.compile(r"\[kk-normal\] mode=(\d+) vertices=(\d+) hash=(\d+)")


def normal_samples(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    samples = [tuple(map(int, match.groups())) for match in NORMAL_RE.finditer(text)]
    if not samples:
        raise SystemExit(f"no native normal-stream telemetry in {path}")
    return samples


def payload_counts(samples):
    return collections.Counter((vertices, hash_value) for _, vertices, hash_value in samples)


def vertex_counts(samples):
    return collections.Counter(vertices for _, vertices, _ in samples)


def phase_payload_checks(baseline, inverted, restored):
    baseline_payload = payload_counts(baseline)
    inverted_payload = payload_counts(inverted)
    restored_payload = payload_counts(restored)
    return {
        "sample_counts_aligned": len(baseline) == len(inverted) == len(restored),
        "vertex_counts_aligned": vertex_counts(baseline) == vertex_counts(inverted) == vertex_counts(restored),
        "hash_changed": baseline_payload != inverted_payload,
        "restoration_exact": baseline_payload == restored_payload,
    }


def self_test():
    baseline = [(0, 10, 111), (0, 20, 222)]
    mode_only = [(1, 10, 111), (1, 20, 222)]
    restored = [(0, 10, 111), (0, 20, 222)]
    mode_only_checks = phase_payload_checks(baseline, mode_only, restored)
    if mode_only_checks["hash_changed"]:
        raise SystemExit("self-test failed: mode-only transition counted as normal hash change")

    mutated = [(1, 10, 333), (1, 20, 444)]
    mutated_checks = phase_payload_checks(baseline, mutated, restored)
    if not all(mutated_checks.values()):
        raise SystemExit(f"self-test failed: valid payload mutation/restoration rejected: {mutated_checks}")
    print("normal verifier self-test: PASS")


def image_delta(left, right):
    from PIL import Image, ImageChops, ImageStat

    a = Image.open(left).convert("RGB")
    b = Image.open(right).convert("RGB")
    if a.size != b.size:
        raise SystemExit("normal proof screenshot size drift")
    diff = ImageChops.difference(a, b)
    return sum(ImageStat.Stat(diff).mean) / 3.0


def main(argv):
    if len(argv) == 2 and argv[1] == "--self-test":
        self_test()
        return
    if len(argv) != 9:
        raise SystemExit("usage: verify-normal-browser-proof.py A.log B.log A2.log B.png B2.png A2.png A2b.png out.json")
    baseline, inverted, restored = map(normal_samples, argv[1:4])
    baseline_modes = {sample[0] for sample in baseline}
    inverted_modes = {sample[0] for sample in inverted}
    restored_modes = {sample[0] for sample in restored}

    # Mode is a control label, not payload evidence. Compare only the observed
    # vertex-count/hash payload so mode=0 -> mode=1 cannot manufacture a
    # false-positive "hash changed" result by itself.
    payload_checks = phase_payload_checks(baseline, inverted, restored)
    sample_counts_aligned = payload_checks["sample_counts_aligned"]
    vertex_counts_aligned = payload_checks["vertex_counts_aligned"]
    hash_changed = payload_checks["hash_changed"]
    restoration_exact = payload_checks["restoration_exact"]
    inverted_noise = image_delta(argv[4], argv[5])
    restored_noise = image_delta(argv[6], argv[7])
    framebuffer_delta = image_delta(argv[4], argv[6])
    visible_effect = framebuffer_delta >= max(1.0, inverted_noise * 5.0, restored_noise * 5.0)
    passed = (
        baseline_modes == {0}
        and inverted_modes == {1}
        and restored_modes == {0}
        and sample_counts_aligned
        and vertex_counts_aligned
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
        "sampleCountsAligned": sample_counts_aligned,
        "vertexCountsAligned": vertex_counts_aligned,
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
        raise SystemExit("normal causality proof failed: phase alignment, native hash/framebuffer mutation, or A/B/A restoration gate failed")


if __name__ == "__main__":
    main(sys.argv)
