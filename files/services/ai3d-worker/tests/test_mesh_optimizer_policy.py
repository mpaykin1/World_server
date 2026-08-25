from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from ai3d.mesh_optimizer import compare_enhancement_sets, normalize_policy, verify_mesh_upload


class MeshOptimizerPolicyTests(unittest.TestCase):
    def test_policy_normalizes_lods_and_targets(self):
        p = normalize_policy({"lodRatios": [0.7, 0.9, 0.1, 0.05], "targets": ["godot", "bad", "web"]})
        self.assertEqual(p["targets"], ["godot", "web"])
        self.assertGreaterEqual(p["lodRatios"][0], p["lodRatios"][1])
        self.assertGreaterEqual(p["lodRatios"][1], p["lodRatios"][2])
        self.assertGreaterEqual(p["lodRatios"][2], p["lodRatios"][3])
        self.assertTrue(p["aaaEnhancement"]["enabled"])

    def test_v8_policy_defaults_enable_evidence_guards(self):
        p = normalize_policy({})
        self.assertTrue(p["semanticFusionV8"]["enabled"])
        self.assertGreaterEqual(p["semanticFusionV8"]["views"], 4)
        self.assertTrue(p["deviceCalibrationV8"]["enabled"])
        self.assertGreaterEqual(p["deviceCalibrationV8"]["minRuns"], 10)
        self.assertTrue(p["productionReadinessV8"]["requireRuntimeEvidence"])

    def test_rejects_fake_glb(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "bad.glb"
            p.write_bytes(b"not-a-glb" * 20)
            with self.assertRaises(ValueError):
                verify_mesh_upload(p)

    def test_accepts_basic_gltf_json(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "model.gltf"
            p.write_text(json.dumps({"asset": {"version": "2.0"}, "scenes": [], "extras": {"pad": "x" * 100}}), encoding="utf-8")
            result = verify_mesh_upload(p)
            self.assertEqual(result["extension"], ".gltf")

    def test_aaa_gate_preserves_silhouette_and_detail(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            base = root / "base"
            enhanced = root / "enhanced"
            base.mkdir(); enhanced.mkdir()
            for folder, extra_lines in ((base, False), (enhanced, True)):
                image = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
                draw = ImageDraw.Draw(image)
                draw.rectangle((24, 24, 104, 104), fill=(120, 110, 100, 255))
                if extra_lines:
                    for x in range(30, 100, 8):
                        draw.line((x, 28, x, 100), fill=(135, 124, 112, 255), width=1)
                image.save(folder / "front.png")
            gate = compare_enhancement_sets(base, enhanced, {
                "preserveSilhouetteIoU": 0.995,
                "minDetailEnergyRatio": 0.96,
                "maxDetailEnergyRatio": 3.0,
            })
            self.assertTrue(gate["passed"])
            self.assertGreaterEqual(gate["minSilhouetteIoU"], 0.995)


if __name__ == "__main__":
    unittest.main()
