from __future__ import annotations
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image

from ai3d.texture_optimizer import TextureOptimizer
from ai3d.texture_runtime_v5 import (
    StreamingPolicyStore,
    build_gpu_capability_plan,
    build_predictive_prefetch_plan,
    build_renderback_automation_manifest,
    build_uv_autofix_job,
    build_virtual_texture_residency_manifest,
    choose_gpu_texture_format,
    promote_streaming_policy_if_verified,
)


class TextureV5Tests(unittest.TestCase):
    def sample_plan(self):
        return {'profiles': {'web_desktop': {'textures': [
            {'setKey': 'hero', 'role': 'albedo', 'residentMipFloor': 2, 'budgetSolvedResidentMipFloor': 2,
             'streamingPriority': 'high', 'virtualTexturePagePlan': {'mips': [{'level': 0, 'pagesX': 4, 'pagesY': 4}, {'level': 1, 'pagesX': 2, 'pagesY': 2}, {'level': 2, 'pagesX': 1, 'pagesY': 1}]}},
            {'setKey': 'bg', 'role': 'normal', 'residentMipFloor': 1, 'streamingPriority': 'medium'},
        ]}}}

    def test_predictive_prefetch_detects_approaching_material(self):
        events = [
            {'setKey':'hero','timestamp':1,'distance':20,'screenCoverage':0.05,'cameraPosition':[0,0,0],'cameraForward':[0,0,-1],'materialPosition':[0,0,-20]},
            {'setKey':'hero','timestamp':2,'distance':8,'screenCoverage':0.35,'cameraPosition':[0,0,-10],'cameraForward':[0,0,-1],'materialPosition':[0,0,-20]},
        ]
        result = build_predictive_prefetch_plan(events, self.sample_plan())
        self.assertEqual(result['prefetchCount'], 1)
        self.assertEqual(result['entries'][0]['prefetchMipFloor'], 1)
        self.assertFalse(result['runtimeVerified'])

    def test_gpu_format_prefers_bc5_for_desktop_normal(self):
        result = choose_gpu_texture_format('web_desktop', 'normal', {'bc': True})
        self.assertEqual(result['selectedFormat'], 'BC5')
        self.assertFalse(result['runtimeVerified'])

    def test_gpu_format_roblox_does_not_claim_custom_compression(self):
        result = choose_gpu_texture_format('roblox', 'albedo')
        self.assertEqual(result['selectedFormat'], 'ENGINE_MANAGED_SOURCE')

    def test_gpu_capability_plan_requires_probe_when_not_supplied(self):
        plan = build_gpu_capability_plan(self.sample_plan(), {})
        self.assertTrue(plan['profiles']['web_desktop']['runtimeProbeRequired'])
        self.assertFalse(plan['allTargetDevicesVerified'])

    def test_vt_manifest_respects_resident_floor(self):
        manifest = build_virtual_texture_residency_manifest(self.sample_plan())
        rows = manifest['profiles']['web_desktop']['pageRows']
        self.assertEqual([r['mip'] for r in rows], [2])

    def test_streaming_policy_store_learns_with_bounded_update(self):
        with tempfile.TemporaryDirectory() as td:
            store = StreamingPolicyStore(Path(td))
            feedback = {'feedback':[{'setKey':'hero','recommendedMipBias':0,'normalizedAttention':1.0}]}
            store.learn(feedback,['web_desktop'],accepted=False)
            first = store.export()['policies'][0]['mipBias']
            store.learn({'feedback':[{'setKey':'hero','recommendedMipBias':8,'normalizedAttention':0.0}]},['web_desktop'],accepted=True)
            second = store.export()['policies'][0]['mipBias']
            self.assertLessEqual(abs(second-first), 1.0)

    def test_uv_autofix_job_is_candidate_only(self):
        uv = {'entries':[{'setKey':'stone'}]}; atlas={'pages':['a.png']}
        job = build_uv_autofix_job(uv, atlas)
        self.assertTrue(job['candidateOnly'])
        self.assertTrue(job['policy']['preserveOriginalMesh'])
        self.assertFalse(job['runtimeVerified'])

    def test_renderback_manifest_is_truthful_for_roblox(self):
        manifest = build_renderback_automation_manifest({})
        self.assertFalse(manifest['roblox']['verified'])
        self.assertIn('external', manifest['roblox']['automaticWhen'])


    def test_policy_promotion_requires_full_runtime_gate(self):
        with tempfile.TemporaryDirectory() as td:
            store = StreamingPolicyStore(Path(td))
            feedback = {'feedback':[{'setKey':'hero','recommendedMipBias':0,'normalizedAttention':1.0}]}
            result = promote_streaming_policy_if_verified(store, feedback, ['web_desktop'], {'passed':False,'checks':{'fps':True,'visualDelta':False}})
            self.assertFalse(result['promoted']); self.assertEqual(result['rowsUpdated'],0)

    def test_policy_promotion_accepts_verified_runtime_gate(self):
        with tempfile.TemporaryDirectory() as td:
            store = StreamingPolicyStore(Path(td))
            feedback = {'feedback':[{'setKey':'hero','recommendedMipBias':0,'normalizedAttention':1.0}]}
            result = promote_streaming_policy_if_verified(store, feedback, ['web_desktop'], {'passed':True,'checks':{'fps':True,'p95FrameMs':True,'textureVramMB':True,'visualDelta':True}})
            self.assertTrue(result['promoted']); self.assertEqual(result['rowsUpdated'],1)

    def test_v5_adapter_files_are_packaged(self):
        worker = Path(__file__).resolve().parents[1]
        base = worker / 'tools' / 'texture_runtime_adapters'
        required = [
            base/'blender'/'autofix_uv_and_atlas.py', base/'web'/'gpu_capability_probe.js', base/'web'/'virtual_texture_pager.js',
            base/'godot'/'GpuCapabilityProbe.gd', base/'godot'/'VirtualTexturePager.gd', base/'roblox'/'GpuCapabilityProbe.luau',
            base/'roblox'/'MipAssetStreamer.luau', worker/'tools'/'capture_texture_renderback.py', worker/'tools'/'train_texture_streaming_policy.py', worker/'tools'/'promote_texture_streaming_policy.py'
        ]
        self.assertTrue(all(p.is_file() for p in required))

    def test_optimizer_emits_v5_plans(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); src=root/'stone_albedo.png'; Image.new('RGB',(32,32),(80,90,100)).save(src)
            result=TextureOptimizer().run({'input_path':str(src),'params':{'targetMin':32,'_originalFilename':src.name,'cameraTelemetry':[
                {'setKey':'stone','timestamp':1,'distance':10,'screenCoverage':0.1}, {'setKey':'stone','timestamp':2,'distance':3,'screenCoverage':0.5}
            ]}}, lambda *_:None)
            names={x['name'] for x in result['files']}
            required={'texture-v5-system-plan.json','texture-predictive-prefetch-plan.json','texture-gpu-capability-plan.json','texture-vt-residency-manifest.json','texture-uv-autofix-job.json','texture-renderback-automation-manifest.json','texture-streaming-policy-report.json'}
            self.assertTrue(required.issubset(names))
            report=json.loads((root/'texture-quality-report.json').read_text())
            self.assertEqual(report['schemaVersion'],10); self.assertEqual(report['system']['version'],'10.0.0')
            self.assertIn('predictiveTexturePrefetch',report['system'])


if __name__=='__main__': unittest.main()
