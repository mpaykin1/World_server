import time, unittest
from ai3d.production_v9 import (
    wilson_lower_bound, statistical_calibration_v9, longitudinal_fleet_gate_v9,
    shader_memory_telemetry_gate_v9, validate_device_farm_result_v9,
    validate_roblox_studio_bridge_v9, validate_roblox_studio_automation_v9, pvs_removal_candidates_v9,
    production_readiness_gate_v9,
)

class ProductionV9Tests(unittest.TestCase):
    def strong_rows(self,n=40,target='web',tier='low'):
        now=time.time();rows=[]
        for i in range(n):
            rows.append({'executedInTarget':True,'passed':True,'target':target,'hardwareTier':tier,'deviceId':f'd{i%3}','sessionId':f's{i%6}','buildId':'b1','timestampEpoch':now-(i%4)*86400,'avgFps':90,'p95FrameMs':12,'gpuP95FrameMs':9,'telemetrySource':'engine-native','drawCalls':500,'textureMemoryMB':256,'bufferMemoryMB':128})
        return rows
    def test_wilson_is_conservative(self):self.assertLess(wilson_lower_bound(9,10),.9)
    def test_calibration_needs_diverse_devices(self):
        rows=self.strong_rows();
        for r in rows:r['deviceId']='same'
        self.assertFalse(statistical_calibration_v9({'lodRatios':[.7,.5,.25,.1]},rows,{'minRuns':30,'minDevices':3,'minDays':3,'minWilsonPassRate':.7})['applied'])
    def test_calibration_can_preserve_more_with_strong_evidence(self):
        r=statistical_calibration_v9({'lodRatios':[.7,.5,.25,.1]},self.strong_rows(),{'minRuns':30,'minDevices':3,'minDays':3,'minWilsonPassRate':.7})
        self.assertTrue(r['applied']);self.assertGreater(r['policy']['lodRatios'][0],.7)
    def test_longitudinal_gate_rejects_single_device(self):
        rows=self.strong_rows(8)
        for r in rows:r['deviceId']='same'
        out=longitudinal_fleet_gate_v9(rows,{'requiredTargets':['web'],'requiredTiers':['low'],'minRunsPerCell':5,'minDevicesPerCell':2,'minSessionsPerCell':3,'minDaysPerCell':2,'minBuildsPerCell':1,'minWilsonPassRate':.5})
        self.assertFalse(out['passed'])
    def test_longitudinal_gate_passes_diverse_history(self):
        out=longitudinal_fleet_gate_v9(self.strong_rows(12),{'requiredTargets':['web'],'requiredTiers':['low'],'minRunsPerCell':5,'minDevicesPerCell':2,'minSessionsPerCell':3,'minDaysPerCell':2,'minBuildsPerCell':1,'minWilsonPassRate':.5})
        self.assertTrue(out['passed'])
    def test_shader_memory_never_accepts_estimated_source(self):
        rows=[{'target':'web','executedInTarget':True,'gpuP95FrameMs':10,'telemetrySource':'estimated'}]
        self.assertEqual(shader_memory_telemetry_gate_v9(rows,{'requiredTargets':['web']})['status'],'UNVERIFIED')
    def test_shader_memory_accepts_engine_measurement(self):
        rows=[{'target':'web','executedInTarget':True,'gpuP95FrameMs':10,'telemetrySource':'EXT_disjoint_timer_query_webgl2','gpuTimerDisjoint':False}]
        self.assertEqual(shader_memory_telemetry_gate_v9(rows,{'requiredTargets':['web']})['status'],'VERIFIED')
    def test_device_farm_needs_provider_ids_and_samples(self):
        bad=[{'executedInTarget':True,'target':'web','hardwareTier':'low','avgFps':60,'p95FrameMs':16}]
        self.assertFalse(validate_device_farm_result_v9(bad,{'minSamplesPerRun':120})['passed'])
        good=[{'providerExecutionId':'p1','deviceId':'d1','sessionId':'s1','executedInTarget':True,'target':'web','hardwareTier':'low','sampleCount':180,'avgFps':60,'p95FrameMs':16}]
        self.assertTrue(validate_device_farm_result_v9(good,{'minSamplesPerRun':120})['passed'])
    def test_roblox_studio_requires_rebind_evidence(self):
        data={'upload':{'assetIds':{'model':'12345'}},'executedInRobloxStudio':True,'placeId':123,'publishedPlaceId':123,'studioVersion':'1.0','verificationRunId':'r1','placeChecks':{'modelLoaded':True,'finiteBounds':True,'collisionPresent':True,'materialsBound':True,'surfaceAppearanceBound':True,'noMissingAssets':True,'assetIdsRebound':False,'surfaceAppearanceAssetIdsValid':True}}
        self.assertFalse(validate_roblox_studio_bridge_v9(data)['passed']);data['placeChecks']['assetIdsRebound']=True;self.assertTrue(validate_roblox_studio_bridge_v9(data)['passed'])
    def test_roblox_automation_requires_runner_marker(self):
        data={'upload':{'assetIds':{'model':'12345'}},'executedInRobloxStudio':True,'placeId':123,'publishedPlaceId':123,'studioVersion':'1.0','verificationRunId':'r1','placeChecks':{'modelLoaded':True,'finiteBounds':True,'collisionPresent':True,'materialsBound':True,'surfaceAppearanceBound':True,'noMissingAssets':True,'assetIdsRebound':True,'surfaceAppearanceAssetIdsValid':True},'automation':{'studioLaunched':True,'commandVerified':True,'resultCaptured':False,'marker':''}}
        self.assertFalse(validate_roblox_studio_automation_v9(data)['passed'])
        data['automation']={'studioLaunched':True,'commandVerified':True,'resultCaptured':True,'marker':'[AI3D_V9_ROBLOX_VERIFY]'}
        self.assertTrue(validate_roblox_studio_automation_v9(data)['passed'])
    def test_pvs_removal_never_auto_applies(self):
        samples=[{'room':'A','visibleRooms':['A'],'sessionId':f's{i%30}','cameraCell':f'c{i%12}'} for i in range(500)]
        r=pvs_removal_candidates_v9({'sets':{'A':['A','B']}},samples);self.assertEqual(r['autoRemovalsApplied'],0);self.assertTrue(r['candidates'])
    def test_stale_longitudinal_evidence_is_ignored(self):
        rows=self.strong_rows(12)
        old=time.time()-90*86400
        for r in rows:r['timestampEpoch']=old
        out=longitudinal_fleet_gate_v9(rows,{'requiredTargets':['web'],'requiredTiers':['low'],'minRunsPerCell':5,'minDevicesPerCell':2,'minSessionsPerCell':3,'minDaysPerCell':2,'minBuildsPerCell':1,'minWilsonPassRate':.5,'maxEvidenceAgeDays':30})
        self.assertFalse(out['passed']);self.assertEqual(out['staleRowsIgnored'],12)
    def test_stale_rows_cannot_calibrate_lod(self):
        rows=self.strong_rows(40)
        old=time.time()-90*86400
        for r in rows:r['timestampEpoch']=old
        out=statistical_calibration_v9({'lodRatios':[.7,.5,.25,.1]},rows,{'minRuns':30,'minDevices':3,'minDays':3,'minWilsonPassRate':.7,'maxEvidenceAgeDays':30})
        self.assertFalse(out['applied']);self.assertEqual(out['status'],'INSUFFICIENT_STATISTICAL_EVIDENCE')
    def test_readiness_separates_matrix_and_longitudinal(self):
        r=production_readiness_gate_v9({'fidelity':True},{'status':'VERIFIED'},{'status':'VERIFIED'},{'status':'INCOMPLETE'},{'status':'VERIFIED_LONGITUDINAL'},{'status':'VERIFIED'},{'status':'READY'},None,None,{'requireRuntimeEvidence':True,'requireNativeGpuTiming':True,'requireDeviceMatrix':True,'requireLongitudinalFleet':True,'requireShaderMemoryTelemetry':True})
        self.assertEqual(r['status'],'VERIFIED_TARGET_RUNTIME_FLEET_MATRIX_INCOMPLETE');self.assertFalse(r['passed']);self.assertTrue(r['targetVerified']);self.assertFalse(r['fleetVerified'])
if __name__=='__main__':unittest.main()
