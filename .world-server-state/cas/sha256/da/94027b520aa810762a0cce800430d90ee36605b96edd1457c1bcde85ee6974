import unittest
from ai3d.semantic_mesh_v9 import intrinsic_importance_from_topology, fuse_mesh_semantic_scores_v9, build_mesh_native_policy_v9, run_mesh_native_semantic, mesh_native_projection_config

class SemanticMeshV9Tests(unittest.TestCase):
    def test_boundary_and_sharp_edges_are_protected(self):
        out=intrinsic_importance_from_topology(4,[(0,1),(1,2),(2,3)],{(1,2)},{0,3},{2})
        self.assertGreaterEqual(out[0],.5);self.assertGreaterEqual(out[1],.5);self.assertGreaterEqual(out[2],.7)
    def test_fusion_uses_intrinsic_when_multiview_misses(self):
        r=fuse_mesh_semantic_scores_v9([0,0],[.9,.1],None,{'multiViewWeight':.3,'intrinsicWeight':.7,'protectThreshold':.5})
        self.assertIn(0,r['protected']);self.assertNotIn(1,r['protected'])
    def test_suspicious_full_coverage_is_rejected(self):
        r=fuse_mesh_semantic_scores_v9([1]*10,[1]*10,None,{'protectThreshold':.2,'maxCoverage':.8})
        self.assertEqual(r['status'],'REJECTED_COVERAGE')
    def test_intrinsic_fallback_emits_ranges_without_ml(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as td:
            r=run_mesh_native_semantic({'featuresCreated':True,'objects':[{'object':'Face','vertexCount':5,'protectedIndices':[0,1,4]}]},Path(td),{})
            self.assertTrue(r['enabled']);self.assertTrue(r['status'].startswith('READY'));self.assertEqual(r['objects'][0]['protectedRanges'],[[0,1],[4,4]])
            cfg=mesh_native_projection_config(r);self.assertTrue(cfg['enabled']);self.assertTrue(Path(cfg['resultPath']).is_file())
    def test_ml_status_does_not_disable_intrinsic_when_model_missing(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as td:
            r=run_mesh_native_semantic({'featuresCreated':True,'objects':[{'object':'Weapon','vertexCount':3,'protectedIndices':[1]}]},Path(td),{'modelPath':'missing-model.onnx'})
            self.assertTrue(r['enabled']);self.assertEqual(r['backend'],'mesh_intrinsic');self.assertEqual(r['protectedVertices'],1)
    def test_policy_is_safe_by_default(self):
        p=build_mesh_native_policy_v9({})
        self.assertTrue(p['enabled']);self.assertEqual(p['groupName'],'AI3D_SEMANTIC_PROTECTED')
if __name__=='__main__':unittest.main()
