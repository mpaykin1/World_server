from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from ai3d.plugins.mesh_quality_optimizer import MeshQualityOptimizer


class MeshQualityBridgeV6Tests(unittest.TestCase):
    def test_prepare_delegates_to_canonical_pipeline(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            src = root / "model.glb"
            src.write_bytes(b"glTF" + b"x" * 128)
            report = root / "optimization-report.json"
            report.write_text("{}", encoding="utf-8")
            lod = root / "LOD1.glb"
            lod.write_bytes(b"glTF" + b"x" * 128)
            optimizer = MeshQualityOptimizer()
            optimizer.pipeline = Mock()
            optimizer.pipeline.run.return_value = {"status": "accepted"}
            got_report, lods = optimizer.prepare(src, root, {"qualityEnhance": True})
            self.assertEqual(got_report, report)
            self.assertIn(lod, lods)
            self.assertTrue(optimizer.pipeline.run.called)


if __name__ == "__main__":
    unittest.main()
