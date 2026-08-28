import tempfile, unittest
from ai3d.production_v8 import calibrate_policy_from_device_history, device_matrix_coverage, refine_pvs_confidence_v8, validate_roblox_place_runtime, production_readiness_gate_v8, DeviceHistoryV8

class TestProductionV8(unittest.TestCase):
    def test_calibration_refuses_weak_history(self):
        base={'lodRatios':[.8,.5,.25,.1]}
        out=calibrate_policy_from_device_history(base,[{'runs':5,'passedRuns':5,'avgFps':100}],{})
        self.assertFalse(out['applied'])
        self.assertEqual(out['status'],'INSUFFICIENT_EVIDENCE')
    def test_calibration_uses_headroom_without_relaxing_gates(self):
        base={'lodRatios':[.8,.5,.25,.1],'qualityThresholds':{'silhouetteIoU':.99}}
        out=calibrate_policy_from_device_history(base,[{'runs':30,'passedRuns':29,'avgFps':90,'avgP95FrameMs':10}],{})
        self.assertGreater(out['policy']['lodRatios'][0],.8)
        self.assertEqual(out['policy']['qualityThresholds']['silhouetteIoU'],.99)
    def test_device_matrix_requires_each_cell(self):
        rows=[{'target':'web','hardwareTier':'low','executedInTarget':True,'passed':True} for _ in range(3)]
        out=device_matrix_coverage(rows,{'requiredTargets':['web'],'requiredTiers':['low','mid'],'minRunsPerCell':3})
        self.assertFalse(out['passed']); self.assertEqual(len(out['missing']),1)
    def test_pvs_requires_diverse_evidence(self):
        samples=[]
        for s in range(3):
            for c in range(3):
                samples.append({'room':'A','visibleRooms':['B'],'sessionId':f's{s}','cameraCell':f'c{c}'})
        out=refine_pvs_confidence_v8({'sets':{'A':['A']}},samples,{})
        self.assertIn('B',out['sets']['A']); self.assertEqual(out['removalsApplied'],0)
    def test_readiness_distinguishes_target_from_fleet(self):
        out=production_readiness_gate_v8({'fidelity':True},{'status':'VERIFIED'},{'status':'VERIFIED'},{'status':'INCOMPLETE'},{'status':'UNVERIFIED'},{'requireRuntimeEvidence':True,'requireNativeGpuTiming':True,'requireDeviceMatrixForFleetVerified':True})
        self.assertEqual(out['status'],'VERIFIED_TARGET_RUNTIME_FLEET_INCOMPLETE')
        self.assertTrue(out['passed']); self.assertFalse(out['fleetVerified'])
    def test_device_history_records_tier(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as td:
            h=DeviceHistoryV8(Path(td)/'d.sqlite3')
            h.record([{'target':'web','hardwareTier':'mid','deviceKey':'gpu','executedInTarget':True,'avgFps':70,'p95FrameMs':16,'passed':True}],'static_small')
            rows=h.rows()
            self.assertEqual(rows[0]['hardwareTier'],'mid')

    def test_roblox_place_requires_runtime(self):
        data={'assetIds':{'model':'12345'},'placeChecks':{'modelLoaded':True,'finiteBounds':True,'collisionPresent':True,'materialsBound':True,'surfaceAppearanceBound':True,'noMissingAssets':True}}
        self.assertFalse(validate_roblox_place_runtime(data)['passed'])
