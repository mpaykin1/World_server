from __future__ import annotations
import tempfile, unittest
from pathlib import Path
from ai3d.production_v7 import DeviceHistoryV7, engine_native_gpu_timing_gate, production_readiness_gate_v7, refine_pvs_from_runtime, validate_roblox_upload_result

class V7Tests(unittest.TestCase):
    def test_gpu_timing_requires_real_flag(self):
        r=engine_native_gpu_timing_gate([{'target':'godot','executedInTarget':True,'gpuTimingVerified':False,'gpuP95FrameMs':10,'gpuTimingSamples':100,'gpuTimingSource':'fake'}],{'requiredTargets':['godot']})
        self.assertEqual(r['status'],'UNVERIFIED')
    def test_gpu_timing_verified(self):
        r=engine_native_gpu_timing_gate([{'target':'web','executedInTarget':True,'gpuTimingVerified':True,'gpuP95FrameMs':8,'gpuTimingSamples':120,'gpuTimingSource':'EXT_disjoint_timer_query_webgl2'}],{'requiredTargets':['web']})
        self.assertTrue(r['passed'])
    def test_pvs_learning_only_adds(self):
        r=refine_pvs_from_runtime({'sets':{'a':['a','b']}},[{'room':'a','visibleRooms':['c']},{'room':'a','visibleRooms':['c']},{'room':'a','visibleRooms':['c']}],3)
        self.assertIn('b',r['sets']['a']);self.assertIn('c',r['sets']['a']);self.assertEqual(r['removalsApplied'],0)
    def test_readiness_requires_gpu(self):
        r=production_readiness_gate_v7({'fidelity':True},{'status':'VERIFIED'},{'status':'UNVERIFIED'},True,True)
        self.assertEqual(r['status'],'CANDIDATE_NATIVE_GPU_TIMING_UNVERIFIED')
    def test_history(self):
        with tempfile.TemporaryDirectory() as td:
            h=DeviceHistoryV7(Path(td)/'h.sqlite')
            self.assertEqual(h.record([{'target':'web','executedInTarget':True,'deviceKey':'x','avgFps':60,'p95FrameMs':17,'gpuP95FrameMs':12,'passed':True}]),1)
            self.assertEqual(h.summary()['groups'][0]['runs'],1)
    def test_roblox_ids(self):
        r=validate_roblox_upload_result({'assetIds':{'model':'123456','bad':'abc'}})
        self.assertTrue(r['passed']);self.assertEqual(r['assetIds'],{'model':'123456'})

if __name__=='__main__':unittest.main()
