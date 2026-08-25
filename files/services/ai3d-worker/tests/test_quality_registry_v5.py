from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from ai3d.quality_registry_v5 import QualityRegistryV5, bucket_key


class QualityRegistryV5Tests(unittest.TestCase):
    def test_bucket(self):
        key = bucket_key({"extension": ".glb", "triangles": 50000, "materials": 3, "hasArmature": False, "hasShapeKeys": False})
        self.assertIn("small", key)
        self.assertIn("static", key)

    def test_record_and_suggest(self):
        with tempfile.TemporaryDirectory() as td:
            registry = QualityRegistryV5(Path(td) / "q.sqlite3")
            bucket = {"extension": ".glb", "triangles": 50000, "materials": 3, "hasArmature": False, "hasShapeKeys": False}
            registry.record(bucket, "high", "abc", {"lod0Ratio": 0.72}, {"accepted": True, "visualSimilarity": 0.97}, {"fidelity": True})
            suggestion = registry.suggest(bucket, "high")
            self.assertEqual(suggestion["status"], "SUGGESTION_AVAILABLE")
            self.assertAlmostEqual(suggestion["suggestedLod0Ratio"], 0.72)

    def test_rejected_not_recorded(self):
        with tempfile.TemporaryDirectory() as td:
            registry = QualityRegistryV5(Path(td) / "q.sqlite3")
            bucket = {"extension": ".glb", "triangles": 50000, "materials": 3, "hasArmature": False, "hasShapeKeys": False}
            registry.record(bucket, "high", "abc", {"lod0Ratio": 0.2}, {"accepted": False}, {"fidelity": False})
            self.assertEqual(registry.suggest(bucket, "high")["status"], "NO_MATCH")


if __name__ == "__main__":
    unittest.main()
