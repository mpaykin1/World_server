from __future__ import annotations

import unittest
from ai3d.semantic_protection import semantic_decision


class SemanticProtectionTests(unittest.TestCase):
    def test_face_is_critical(self):
        d = semantic_decision("Hero_Face", [], ["Head", "Jaw"], "skin", True, False)
        self.assertEqual(d.level, "critical")
        self.assertGreaterEqual(d.min_ratio, 0.95)

    def test_arch_is_high(self):
        d = semantic_decision("Cathedral_Arch_Trim")
        self.assertEqual(d.level, "high")

    def test_generic_static_can_reduce(self):
        d = semantic_decision("GroundChunk_031", ["ground"])
        self.assertEqual(d.level, "normal")
        self.assertEqual(d.min_ratio, 0.0)

    def test_rigged_generic_has_floor(self):
        d = semantic_decision("CreatureBody", [], ["Spine"], "generic", True, False)
        self.assertIn(d.level, {"rigged", "high", "critical"})
        self.assertGreaterEqual(d.min_ratio, 0.72)
