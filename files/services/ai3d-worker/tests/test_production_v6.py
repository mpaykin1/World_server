from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from ai3d.production_v6 import aggregate_runtime_benchmarks_v6, bake_pvs, production_readiness_gate, temporal_anti_shimmer_gate


class ProductionV6Tests(unittest.TestCase):
    def _write(self, path: Path, value: int):
        arr = np.full((32, 32, 4), value, dtype=np.uint8)
        arr[..., 3] = 255
        Image.fromarray(arr, "RGBA").save(path)

    def test_temporal_gate_passes_stable_sequence(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); h = root / "h"; o = root / "o"; h.mkdir(); o.mkdir()
            for i, value in enumerate([80, 82, 84, 86]):
                self._write(h / f"frame_{i:03d}.png", value)
                self._write(o / f"frame_{i:03d}.png", value + 1)
            self.assertTrue(temporal_anti_shimmer_gate(h, o, {"maxInstabilityRatio": 1.5, "maxAbsoluteDelta": 0.04})["passed"])

    def test_temporal_gate_rejects_flicker(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); h = root / "h"; o = root / "o"; h.mkdir(); o.mkdir()
            for i, value in enumerate([80, 82, 84, 86]):
                self._write(h / f"frame_{i:03d}.png", value)
                self._write(o / f"frame_{i:03d}.png", 20 if i % 2 else 230)
            self.assertFalse(temporal_anti_shimmer_gate(h, o, {})["passed"])

    def test_pvs_uses_graph_hops(self):
        graph = {"rooms": [{"id": "a"}, {"id": "b"}, {"id": "c"}], "edges": [{"rooms": ["a", "b"]}, {"rooms": ["b", "c"]}]}
        pvs = bake_pvs(graph, 1)
        self.assertEqual(pvs["sets"]["a"], ["a", "b"])
        self.assertEqual(pvs["sets"]["b"], ["a", "b", "c"])

    def test_runtime_requires_real_execution(self):
        report = aggregate_runtime_benchmarks_v6([{"target": "godot", "executedInTarget": False, "avgFps": 999, "p95FrameMs": 1}], {"requiredTargets": ["godot"]})
        self.assertEqual(report["status"], "UNVERIFIED")

    def test_readiness_requires_runtime(self):
        gates = {key: True for key in ["fidelity", "aaa", "animation", "atlas", "pbrFamily", "performance", "lodTransition", "temporal"]}
        self.assertEqual(production_readiness_gate(gates, None, True)["status"], "CANDIDATE_RUNTIME_UNVERIFIED")
        self.assertEqual(production_readiness_gate(gates, {"status": "VERIFIED"}, True)["status"], "VERIFIED")


if __name__ == "__main__":
    unittest.main()
