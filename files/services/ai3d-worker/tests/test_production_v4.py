from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from ai3d.production_v4 import build_occlusion_cells, screen_space_lod_plan, write_engine_binding_pack, write_runtime_benchmark_pack

class ProductionV4Tests(unittest.TestCase):
    def test_screen_space_monotonic(self):
        plan = screen_space_lod_plan(2.0)
        values = list(plan["desktop"].values())
        self.assertEqual(values, sorted(values))
        self.assertGreater(plan["impostor"]["desktopFrom"], values[-1])

    def test_larger_asset_switches_farther(self):
        self.assertGreater(screen_space_lod_plan(4.0)["desktop"]["LOD1"], screen_space_lod_plan(1.0)["desktop"]["LOD1"] * 3.9)

    def test_occlusion_cells(self):
        grid = build_occlusion_cells([{ "name":"A", "center":[0,0,0], "radius":1 }, { "name":"B", "center":[1,0,0], "radius":1 }, { "name":"C", "center":[20,0,0], "radius":1 }], 10, 5)
        self.assertEqual(grid["cellCount"], 2)

    def test_binding_and_benchmark_files(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            plan = screen_space_lod_plan(1.0)
            paths = write_engine_binding_pack(root, [], {"status":"SKIPPED"}, plan, {"status":"CREATED","cells":[]}) + write_runtime_benchmark_pack(root, plan)
            self.assertTrue(all(path.is_file() for path in paths))
            self.assertIn("desktop", json.loads((root / "runtime-benchmark-spec.json").read_text())["targets"])

if __name__ == "__main__":
    unittest.main()
