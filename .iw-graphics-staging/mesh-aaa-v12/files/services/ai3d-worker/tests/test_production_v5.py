from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from PIL import Image

from ai3d.production_v5 import aggregate_runtime_benchmarks, build_portal_room_graph, hardware_tier_policy, lod_transition_gate, optional_semantic_model_status, pbr_family_audit, texel_density_plan


class ProductionV5Tests(unittest.TestCase):
    def test_portal_graph_explicit(self):
        graph = build_portal_room_graph([
            {"name": "room_a", "center": [0, 0, 0], "radius": 4},
            {"name": "door_main", "center": [4, 0, 0], "radius": 1},
            {"name": "room_b", "center": [8, 0, 0], "radius": 4},
        ], 8)
        self.assertEqual(graph["status"], "CREATED")
        self.assertGreaterEqual(graph["roomCount"], 2)
        self.assertGreaterEqual(graph["edgeCount"], 1)

    def test_portal_graph_spatial_fallback(self):
        graph = build_portal_room_graph([
            {"name": "mesh_a", "center": [0, 0, 0], "radius": 1},
            {"name": "mesh_b", "center": [5, 0, 0], "radius": 1},
        ], 4)
        self.assertGreaterEqual(graph["roomCount"], 2)

    def test_hardware_low(self):
        self.assertEqual(hardware_tier_policy({"mobile": True})["tier"], "low")

    def test_hardware_ultra(self):
        self.assertEqual(hardware_tier_policy({"vramGB": 16})["tier"], "ultra")

    def test_benchmark_verified(self):
        result = aggregate_runtime_benchmarks([{"target": "godot", "executedInTarget": True, "avgFps": 90, "p95FrameMs": 15}])
        self.assertTrue(result["passed"])
        self.assertEqual(result["status"], "VERIFIED")

    def test_benchmark_unverified(self):
        result = aggregate_runtime_benchmarks([{"target": "web", "executedInTarget": False, "avgFps": 200, "p95FrameMs": 2}])
        self.assertFalse(result["passed"])
        self.assertEqual(result["status"], "UNVERIFIED")

    def test_family_audit_special_channels(self):
        audit = pbr_family_audit({"status": "CREATED", "families": [
            {"family": "metal", "status": "CREATED", "textures": {"albedo": "a", "roughness": "r", "normal": "n", "ao": "o", "metallic": "m"}, "uvAudit": {"p95OverP05": 2}},
            {"family": "transmissive", "status": "CREATED", "textures": {"albedo": "a", "roughness": "r", "normal": "n", "ao": "o", "alpha": "x", "transmission": "t"}, "uvAudit": {"p95OverP05": 3}},
        ]})
        self.assertTrue(audit["passed"])

    def test_family_audit_rejects_missing_channel(self):
        audit = pbr_family_audit({"status": "CREATED", "families": [{"family": "metal", "status": "CREATED", "textures": {"albedo": "a", "roughness": "r", "normal": "n", "ao": "o"}, "uvAudit": {"p95OverP05": 2}}]})
        self.assertFalse(audit["passed"])

    def test_lod_transition_gate(self):
        with tempfile.TemporaryDirectory() as td:
            a = Path(td) / "a"; b = Path(td) / "b"; a.mkdir(); b.mkdir()
            Image.new("RGBA", (16, 16), (100, 100, 100, 255)).save(a / "front.png")
            Image.new("RGBA", (16, 16), (101, 101, 101, 255)).save(b / "front.png")
            def compare(x, y): return {"silhouetteIoU": 1.0, "visualSimilarity": 0.99, "meanAbsoluteRgbError": 0.01}
            self.assertTrue(lod_transition_gate(a, b, compare)["passed"])

    def test_benchmark_failure(self):
        result = aggregate_runtime_benchmarks([{"target": "godot", "executedInTarget": True, "avgFps": 20, "p95FrameMs": 60}])
        self.assertFalse(result["passed"])
        self.assertEqual(result["status"], "FAILED")

    def test_required_target_missing_is_unverified(self):
        result = aggregate_runtime_benchmarks([], {"requiredTargets": ["godot"]})
        self.assertFalse(result["passed"])
        self.assertEqual(result["status"], "UNVERIFIED")

    def test_family_audit_emissive(self):
        audit = pbr_family_audit({"status": "CREATED", "families": [{"family": "emissive", "status": "CREATED", "textures": {"albedo": "a", "roughness": "r", "normal": "n", "ao": "o", "emission": "e", "emission_strength": "s"}, "uvAudit": {"p95OverP05": 2}}]})
        self.assertTrue(audit["passed"])

    def test_family_audit_rejects_uv_stretch(self):
        audit = pbr_family_audit({"status": "CREATED", "families": [{"family": "dielectric", "status": "CREATED", "textures": {"albedo": "a", "roughness": "r", "normal": "n", "ao": "o"}, "uvAudit": {"p95OverP05": 99}}]}, 35)
        self.assertFalse(audit["passed"])

    def test_semantic_fallback_is_honest(self):
        import os
        previous = os.environ.pop("AI3D_SEMANTIC_MODEL", None)
        try:
            status = optional_semantic_model_status()
            self.assertFalse(status["available"])
            self.assertIn("heuristic", status["backend"])
        finally:
            if previous is not None:
                os.environ["AI3D_SEMANTIC_MODEL"] = previous

    def test_texel_density_hero_is_higher(self):
        plan = texel_density_plan([
            {"name": "face_hero", "radius": 1.0, "surfaceArea": 4.0},
            {"name": "wall", "radius": 1.0, "surfaceArea": 4.0},
        ])
        hero = plan["objects"][0]
        normal = plan["objects"][1]
        self.assertGreaterEqual(hero["recommendedTextureSize"], normal["recommendedTextureSize"])

    def test_texel_density_no_bounds(self):
        self.assertEqual(texel_density_plan([])["status"], "SKIPPED_NO_BOUNDS")


if __name__ == "__main__":
    unittest.main()
