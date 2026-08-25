from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from PIL import Image

from ai3d.quality_extensions import stitch_impostor_atlas, static_performance_gate, enhance_texture_file


class QualityExtensionsTests(unittest.TestCase):
    def test_impostor_atlas(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            src = root / "views"
            src.mkdir()
            for i in range(5):
                Image.new("RGBA", (64, 64), (i * 30, 20, 40, 255)).save(src / f"v{i}.png")
            result = stitch_impostor_atlas(src, root / "atlas.png", 128)
            self.assertEqual(result["status"], "CREATED")
            self.assertTrue((root / "atlas.png").is_file())

    def test_performance_gate(self):
        manifest = {
            "sourceStats": {"triangles": 10000, "materials": 4},
            "lodStats": [
                {"triangles": 7000, "materials": 4},
                {"triangles": 4000, "materials": 4},
                {"triangles": 2000, "materials": 4},
                {"triangles": 700, "materials": 4},
            ],
            "collisionStats": {"triangles": 500},
        }
        self.assertTrue(static_performance_gate(manifest, {})["passed"])

    def test_normal_resize_keeps_rgb(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            src = root / "normal.png"
            Image.new("RGB", (32, 32), (128, 128, 255)).save(src)
            result = enhance_texture_file(src, root / "normal2.png", "normal", 64)
            self.assertTrue((root / result["output"]).is_file())
            self.assertEqual(result["role"], "normal")
