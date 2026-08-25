from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from ai3d.texture_runtime_v10 import (
    DeviceFarmExecutor, ManagedQueueBackend, MaterialProvenanceGraph, RoutePredictorV2,
    VerifiedObjectPublisher, analyze_optical_flow_temporal, analyze_shader_hitches,
    bisect_regression, build_reproducible_attestation, build_route_prefetch_v2,
    build_v10_system_plan, forecast_resource_risk, optimize_scene_quality,
    profile_frame_graph, verify_reproducible_attestation,
)


class TextureV10Tests(unittest.TestCase):
    def test_01_managed_queue_unknown_blocks(self):
        c=ManagedQueueBackend('file:///x').capability(); self.assertFalse(c['available'])

    def test_02_http_managed_queue_available(self):
        c=ManagedQueueBackend('https://queue.example').capability(); self.assertTrue(c['available']); self.assertTrue(c['supportsFencing'])

    def test_03_publisher_filesystem_hash_verifies(self):
        with tempfile.TemporaryDirectory() as td:
            p=VerifiedObjectPublisher(td); r=p.put_bytes(b'hello','bin'); self.assertTrue(r['ok']); self.assertTrue(r['verified'])

    def test_04_publisher_atomic_pointer(self):
        with tempfile.TemporaryDirectory() as td:
            p=VerifiedObjectPublisher(td); r=p.publish_pointer('candidate',{'objects':[]},'0123456789abcdef'); self.assertTrue(r['ok']); self.assertTrue(r['atomicSwitch'])

    def test_05_publisher_short_secret_blocks(self):
        with tempfile.TemporaryDirectory() as td:
            self.assertTrue(VerifiedObjectPublisher(td).publish_pointer('x',{},'short')['blocked'])

    def _frames(self, n=12, shift=0):
        out=[]
        for i in range(n):
            a=np.zeros((32,32),dtype=np.uint8); x=5+i%6+shift; a[10:18,max(0,x):min(32,x+8)]=200; out.append(a)
        return out

    def test_06_optical_flow_insufficient_blocks(self):
        r=analyze_optical_flow_temporal(self._frames(3),self._frames(3)); self.assertEqual(r['gate'],'INSUFFICIENT_FRAMES')

    def test_07_optical_flow_same_motion_passes(self):
        r=analyze_optical_flow_temporal(self._frames(),self._frames()); self.assertEqual(r['gate'],'PASS')

    def test_08_optical_flow_bad_candidate_fails(self):
        refs=self._frames(); c=[np.full((32,32),255,dtype=np.uint8) for _ in refs]
        r=analyze_optical_flow_temporal(refs,c,max_p95_compensated_delta=.05); self.assertEqual(r['gate'],'FAIL')

    def test_09_shader_insufficient_blocks(self):
        self.assertEqual(analyze_shader_hitches([{}])['gate'],'INSUFFICIENT_DATA')

    def test_10_shader_hitch_detected(self):
        e=[{'timestamp':i*2,'compileMs':20 if i>2 else 1,'frameSpikeMs':20 if i>2 else 0,'variant':'water'} for i in range(10)]
        r=analyze_shader_hitches(e); self.assertEqual(r['gate'],'FAIL'); self.assertEqual(r['hotVariants'][0]['variant'],'water')

    def test_11_shader_clean_passes(self):
        e=[{'timestamp':i*20,'compileMs':1,'frameSpikeMs':0,'variant':'a'} for i in range(10)]
        self.assertEqual(analyze_shader_hitches(e)['gate'],'PASS')

    def test_12_route_v2_second_order(self):
        with tempfile.TemporaryDirectory() as td:
            p=RoutePredictorV2(Path(td)/'r.db'); p.observe(['a','b','c','a','b','c','a','b','d']); r=p.predict('a','b'); self.assertEqual(r[0]['setKey'],'c')

    def test_13_route_v2_budget_clamps(self):
        with tempfile.TemporaryDirectory() as td:
            p=RoutePredictorV2(Path(td)/'r.db'); p.observe(['a','b','c','a','b','d','a','b','e']); r=build_route_prefetch_v2('a','b',p,{'bandwidthMbps':2},{'action':'KEEP'},{'pressure':.1},4); self.assertLessEqual(r['candidateCount'],1)

    def test_14_route_v2_thermal_clamps(self):
        with tempfile.TemporaryDirectory() as td:
            p=RoutePredictorV2(Path(td)/'r.db'); p.observe(['a','b','c','a','b','d']); r=build_route_prefetch_v2('a','b',p,{'bandwidthMbps':100},{'action':'CONSERVE'},{'pressure':.1},4); self.assertEqual(r['maxCandidates'],1)

    def test_15_provenance_graph_records_lineage(self):
        with tempfile.TemporaryDirectory() as td:
            g=MaterialProvenanceGraph(Path(td)/'p.db'); g.add_node('src','source',{'sha':'a'}); g.add_node('mat','material',{'sha':'b'}); g.link('src','mat','derived','world1','ev'); r=g.lineage('mat'); self.assertEqual(len(r['edges']),1)

    def test_16_device_farm_without_endpoint_blocks(self):
        self.assertTrue(DeviceFarmExecutor('').plan([{}])['promotionBlocked'])

    def test_17_device_farm_endpoint_unblocks_plan_only(self):
        r=DeviceFarmExecutor('https://farm.example').plan([{},{}]); self.assertFalse(r['promotionBlocked']); self.assertFalse(r['runtimeVerified'])

    def test_18_frame_graph_insufficient_blocks(self):
        self.assertEqual(profile_frame_graph([{}]*3)['gate'],'INSUFFICIENT_DATA')

    def test_19_frame_graph_shader_cause_ranked(self):
        e=[]
        for i in range(30):
            spike=i in (15,25); e.append({'frame':i,'frameMs':30 if spike else 10,'shaderCompileMs':20 if spike else .2,'textureFaults':0})
        r=profile_frame_graph(e); self.assertEqual(r['gate'],'PASS'); self.assertEqual(r['causes'][0]['metric'],'shaderCompileMs')

    def test_20_bisect_finds_first_bad(self):
        r=bisect_regression([{'id':'a','gate':'PASS'},{'id':'b','gate':'PASS'},{'id':'c','gate':'FAIL'},{'id':'d','gate':'FAIL'}]); self.assertEqual(r['firstBad'],'c')

    def test_21_bisect_no_regression(self):
        self.assertEqual(bisect_regression([{'id':'a','gate':'PASS'},{'id':'b','gate':'PASS'}])['status'],'NO_REGRESSION')

    def test_22_global_optimizer_respects_budgets(self):
        opts=[]
        for sub in ['textures','meshes']:
            opts += [{'subsystem':sub,'level':'low','quality':.4,'frameMs':2,'vramMB':50,'networkMB':5},{'subsystem':sub,'level':'high','quality':1,'frameMs':8,'vramMB':200,'networkMB':20}]
        r=optimize_scene_quality(opts,{'frameMs':10,'vramMB':300,'networkMB':30}); self.assertTrue(r['withinBudget']); self.assertLessEqual(r['totals']['frameMs'],10)

    def test_23_global_optimizer_can_pick_high_when_room(self):
        opts=[{'subsystem':'textures','level':'low','quality':.2,'frameMs':1,'vramMB':10,'networkMB':1},{'subsystem':'textures','level':'high','quality':1,'frameMs':2,'vramMB':20,'networkMB':2}]
        self.assertEqual(optimize_scene_quality(opts,{'frameMs':10,'vramMB':100,'networkMB':100})['selected']['textures'],'high')

    def _risk_samples(self, grow=False):
        return [{'timestamp':i*60,'vramMB':500+(100*i if grow else 0),'thermal':.4+(.1*i if grow else 0),'residencyReloadsPerMin':2+i*(4 if grow else 0)} for i in range(8)]

    def test_24_forecast_stable_passes(self):
        self.assertEqual(forecast_resource_risk(self._risk_samples(False),vram_limit_mb=2000)['gate'],'PASS')

    def test_25_forecast_rising_fails_before_threshold(self):
        r=forecast_resource_risk(self._risk_samples(True),vram_limit_mb=1800,thermal_limit=1.3,thrash_limit=60,horizon_minutes=8); self.assertEqual(r['gate'],'FAIL'); self.assertTrue(r['risks'])

    def test_26_attestation_requires_secret(self):
        r=build_reproducible_attestation([],{'python':'3'},'abc','short'); self.assertTrue(r['promotionBlocked'])

    def test_27_attestation_verifies(self):
        s='0123456789abcdef'; r=build_reproducible_attestation([{'path':'a','sha256':'1'*64}],{'python':'3'},'abc',s); self.assertTrue(verify_reproducible_attestation(r,s))

    def test_28_attestation_tamper_fails(self):
        s='0123456789abcdef'; r=build_reproducible_attestation([],{'python':'3'},'abc',s); r['payload']['codeSha']='bad'; self.assertFalse(verify_reproducible_attestation(r,s))

    def test_29_v10_plan_has_all_systems(self):
        p=build_v10_system_plan([],{}, {}, {})
        expected={'managedExternalQueue','verifiedRemoteCdnPublisher','opticalFlowTemporalComparator','shaderHitchTelemetry','routeModelPrefetchV2','crossProjectProvenanceGraph','remotePhysicalDeviceExecutors','frameGraphCausalProfiler','automaticRegressionBisect','globalSceneQualityOptimizer','longHorizonRiskForecast','signedReproducibleBuildAttestation'}
        self.assertTrue(expected.issubset(p.keys()))

    def test_30_v10_hard_rules(self):
        p=build_v10_system_plan([],{}, {}, {})
        self.assertTrue(p['hardRules']['remoteObjectMustBeHashVerifiedBeforePointerSwitch']); self.assertTrue(p['hardRules']['globalOptimizerMayNotViolateHardBudgets'])

    def test_31_optimizer_emits_v10_manifests(self):
        from ai3d.texture_optimizer import TextureOptimizer
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); image=root/'stone_albedo.png'; Image.new('RGB',(48,48),(90,100,110)).save(image)
            TextureOptimizer().run({'input_path':str(image),'params':{'targetMin':48}},lambda *_:None)
            names={x.name for x in root.iterdir()}
            required={'texture-v10-system-plan.json','texture-managed-external-queue.json','texture-verified-remote-cdn-publisher.json','texture-optical-flow-temporal-gate.json','texture-shader-hitch-telemetry.json','texture-route-prefetch-v2-plan.json','texture-material-provenance-graph-plan.json','texture-device-farm-executor-plan.json','texture-frame-graph-causal-profile.json','texture-regression-bisect-plan.json','texture-global-scene-quality-plan.json','texture-long-horizon-risk-forecast.json','texture-reproducible-build-attestation.json'}
            self.assertTrue(required.issubset(names))
            report=json.loads((root/'texture-quality-report.json').read_text()); self.assertEqual(report['schemaVersion'],10); self.assertEqual(report['system']['version'],'10.0.0')

    def test_32_optimizer_status_exposes_v10(self):
        from ai3d.texture_optimizer import TextureOptimizer
        s=TextureOptimizer().status()
        self.assertTrue(s['managedExternalQueueAdapters']); self.assertTrue(s['verifiedRemoteR2S3Publisher']); self.assertTrue(s['signedReproducibleBuildAttestations'])


if __name__=='__main__': unittest.main()
