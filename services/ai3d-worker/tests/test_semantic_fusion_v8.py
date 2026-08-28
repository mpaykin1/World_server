import unittest
from ai3d.semantic_fusion_v8 import fusion_confidence, build_multiview_projection_config

class TestSemanticFusionV8(unittest.TestCase):
    def test_confidence_requires_observed_views(self):
        self.assertEqual(fusion_confidence([1.0],1,2),0.0)
        self.assertGreater(fusion_confidence([1,1,0.8],3,2),0.6)
    def test_config_falls_back_without_files(self):
        out=build_multiview_projection_config({'views':[]},{'minVerifiedViews':4})
        self.assertFalse(out['enabled'])
