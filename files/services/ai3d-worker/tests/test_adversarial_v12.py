import unittest
from ai3d.adversarial_v12 import build_minimal_glb_v12,inspect_glb_bytes_v12

class TestAdversarialV12(unittest.TestCase):
    def test_valid_fixture(self):
        q=inspect_glb_bytes_v12(build_minimal_glb_v12());self.assertTrue(q['valid'],q)
    def test_all_faults_fail_closed(self):
        faults=['bad_magic','truncated_glb','length_mismatch','missing_bin_chunk','nan_vertex','index_oob','degenerate_mesh','invalid_material_numeric','invalid_rig_weights','animation_nan']
        for fault in faults:
            with self.subTest(fault=fault):
                q=inspect_glb_bytes_v12(build_minimal_glb_v12(bad=fault));self.assertFalse(q['valid'],q);self.assertIn(fault,q['failures'])
