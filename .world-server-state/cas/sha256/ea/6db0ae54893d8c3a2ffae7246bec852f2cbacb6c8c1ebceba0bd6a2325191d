from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from ai3d.texture_runtime_v8 import (
    DistributedTextureQueue,
    analyze_memory_residency_soak,
    analyze_uv_health,
    build_content_aware_sr_plan,
    build_incremental_atlas_defrag_plan,
    build_per_tile_compression_plan,
    build_signed_cdn_manifest,
    build_specular_normal_aa_plan,
    build_unified_quality_governor,
    build_v8_system_plan,
    classify_regression_root_cause,
    verify_signed_cdn_manifest,
)


def rows():
    gate = {'passed': True}
    return [
        {'setKey': 'hero_face', 'role': 'albedo', 'input': {'width': 512, 'height': 512}, 'regressionGate': gate},
        {'setKey': 'hero_face', 'role': 'normal', 'input': {'width': 512, 'height': 512}, 'regressionGate': gate},
        {'setKey': 'hero_face', 'role': 'roughness', 'input': {'width': 512, 'height': 512}, 'regressionGate': gate},
        {'setKey': 'wall', 'role': 'albedo', 'input': {'width': 2048, 'height': 2048}, 'regressionGate': gate},
    ]


def saliency():
    return {'entries': [
        {'setKey': 'hero_face', 'saliencyScore': .99, 'priority': 'critical'},
        {'setKey': 'wall', 'saliencyScore': .35, 'priority': 'low'},
    ]}


def runtime_plan():
    page = {'pageSize': 128, 'mips': [{'level': 0, 'pagesX': 4, 'pagesY': 4}]}
    return {'profiles': {'web_desktop': {'textures': [
        {'setKey': 'hero_face', 'role': 'albedo', 'virtualTexturePagePlan': page},
        {'setKey': 'hero_face', 'role': 'normal', 'virtualTexturePagePlan': page},
        {'setKey': 'wall', 'role': 'albedo', 'virtualTexturePagePlan': page},
    ]}}}


class TextureV8Tests(unittest.TestCase):
    def test_01_sr_never_routes_normal_to_color_ai(self):
        plan = build_content_aware_sr_plan(rows(), saliency(), {'realEsrgan': True})
        normal = next(x for x in plan['entries'] if x['role'] == 'normal')
        self.assertEqual(normal['route'], 'CHANNEL_SAFE_RESAMPLE')
        self.assertFalse(normal['aiRequested'])

    def test_02_sr_prioritizes_critical_low_res_color(self):
        plan = build_content_aware_sr_plan(rows(), saliency(), {'realEsrgan': True})
        hero = next(x for x in plan['entries'] if x['setKey'] == 'hero_face' and x['role'] == 'albedo')
        self.assertEqual(hero['route'], 'REAL_ESRGAN_CONSERVATIVE')

    def test_03_uv_health_detects_overlap_stretch_fold(self):
        plan = analyze_uv_health([{'setKey': 'wall', 'overlapRatio': .1, 'maxStretchRatio': 4, 'foldedFaces': 2}])
        self.assertEqual(set(plan['entries'][0]['problems']), {'OVERLAP', 'STRETCH', 'FOLD'})
        self.assertEqual(plan['entries'][0]['action'], 'CANDIDATE_UNWRAP_REPACK')

    def test_04_uv_health_never_auto_applies(self):
        plan = analyze_uv_health([{'setKey': 'wall', 'overlapRatio': .1}])
        self.assertFalse(plan['entries'][0]['autoApplied'])

    def test_05_specular_aa_requires_normal(self):
        plan = build_specular_normal_aa_plan(rows(), runtime_plan(), saliency())
        hero = next(x for x in plan['entries'] if x['setKey'] == 'hero_face')
        wall = next(x for x in plan['entries'] if x['setKey'] == 'wall')
        self.assertTrue(hero['enabled'])
        self.assertFalse(wall['enabled'])

    def test_06_tile_compression_uses_normal_format(self):
        plan = build_per_tile_compression_plan(runtime_plan(), saliency())
        normal = next(x for x in plan['entries'] if x['role'] == 'normal')
        self.assertEqual(normal['formatFamily'], 'BC5_OR_ASTC_RG')

    def test_07_tile_compression_gives_hero_higher_quality(self):
        plan = build_per_tile_compression_plan(runtime_plan(), saliency())
        hero = next(x for x in plan['entries'] if x['setKey'] == 'hero_face' and x['role'] == 'albedo')
        wall = next(x for x in plan['entries'] if x['setKey'] == 'wall')
        self.assertEqual(hero['quality'], 'ultra')
        self.assertEqual(wall['quality'], 'balanced')

    def test_08_atlas_defrag_only_moves_candidate_slots(self):
        atlas = {'pages': [{'id': 'p0', 'occupancy': .5, 'slots': [{'setKey': 'a'}, {'setKey': 'b'}, {'setKey': 'c'}]}]}
        plan = build_incremental_atlas_defrag_plan(atlas)
        self.assertGreater(plan['moveCount'], 0)
        self.assertFalse(plan['autoApplied'])

    def test_09_signed_manifest_verifies(self):
        files = [{'name': 'a.ktx2', 'sha256': 'a' * 64, 'bytes': 123}]
        manifest = build_signed_cdn_manifest(files, ['eu'], 'secret')
        self.assertTrue(verify_signed_cdn_manifest(manifest, 'secret'))
        self.assertFalse(manifest['promotionBlocked'])

    def test_10_unsigned_manifest_blocks_promotion(self):
        manifest = build_signed_cdn_manifest([{'name': 'a', 'sha256': 'b' * 64}], ['eu'])
        self.assertTrue(manifest['promotionBlocked'])
        self.assertIsNone(manifest['signature']['value'])

    def test_11_queue_leases_high_priority_first(self):
        with tempfile.TemporaryDirectory() as td:
            q = DistributedTextureQueue(Path(td) / 'q.sqlite3')
            q.enqueue('transcode', {'n': 1}, priority=1, job_id='low')
            q.enqueue('transcode', {'n': 2}, priority=99, job_id='high')
            job = q.lease('w1')
            self.assertEqual(job['id'], 'high')

    def test_12_queue_complete_requires_lease_owner(self):
        with tempfile.TemporaryDirectory() as td:
            q = DistributedTextureQueue(Path(td) / 'q.sqlite3')
            jid = q.enqueue('benchmark', {})
            q.lease('w1')
            self.assertFalse(q.complete(jid, 'other', {'ok': True}))
            self.assertTrue(q.complete(jid, 'w1', {'ok': True}))

    def test_13_unified_governor_degrades_background_first(self):
        plan = build_unified_quality_governor({'p95FrameMs': 28, 'gpuFrameMs': 25, 'vramUsageRatio': .95}, {'frameBudgetMs': 16.67}, saliency())
        self.assertNotEqual(plan['actions']['particles'], 'keep')
        self.assertIn('hero_face', plan['protectedCriticalSets'])

    def test_14_unified_governor_keeps_quality_under_budget(self):
        plan = build_unified_quality_governor({'p95FrameMs': 10, 'gpuFrameMs': 8, 'vramUsageRatio': .4}, {'frameBudgetMs': 16.67}, saliency())
        self.assertEqual(plan['actions']['textures'], 'keep')

    def test_15_soak_passes_stable_long_run(self):
        samples = [
            {'timestamp': 0, 'textureVramMB': 300, 'p95FrameMs': 16, 'residencyReloads': 0},
            {'timestamp': 900, 'textureVramMB': 305, 'p95FrameMs': 16.5, 'residencyReloads': 1},
        ]
        self.assertEqual(analyze_memory_residency_soak(samples, 600)['gate'], 'PASS')

    def test_16_soak_fails_memory_growth(self):
        samples = [
            {'timestamp': 0, 'textureVramMB': 300, 'p95FrameMs': 16},
            {'timestamp': 600, 'textureVramMB': 340, 'p95FrameMs': 16},
        ]
        self.assertEqual(analyze_memory_residency_soak(samples, 600)['gate'], 'FAIL')

    def test_17_root_cause_detects_uv_binding(self):
        out = classify_regression_root_cause({'visualDelta': 0}, {'visualDelta': .12}, {'uvMismatch': True})
        self.assertEqual(out['classification'], 'UV_BINDING')
        self.assertTrue(out['automaticRollbackRecommended'])

    def test_18_root_cause_detects_memory(self):
        out = classify_regression_root_cause({'textureVramMB': 200}, {'textureVramMB': 300}, {})
        self.assertEqual(out['classification'], 'GPU_MEMORY')

    def test_19_v8_system_contains_all_subsystems(self):
        plan = build_v8_system_plan(rows(), runtime_plan(), saliency(), {}, {'pages': []}, [], {'frameBudgetMs': 16.67}, {})
        required = {
            'contentAwareSuperResolution', 'uvHealthRepair', 'specularNormalAntialiasing',
            'perTileAdaptiveCompression', 'incrementalAtlasDefrag', 'signedContentAddressedCdn',
            'distributedWorkQueue', 'unifiedQualityGovernor', 'memoryResidencySoak', 'regressionRootCause',
        }
        self.assertTrue(required.issubset(plan))

    def test_20_optimizer_emits_v8_manifests(self):
        from PIL import Image
        from ai3d.texture_optimizer import TextureOptimizer
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            image = root / 'hero_face_albedo.png'
            Image.new('RGB', (64, 64), (160, 120, 100)).save(image)
            TextureOptimizer().run({'input_path': str(image), 'params': {'targetMin': 64, 'semanticMetadata': {'hero_face': {'tags': ['face']}}}}, lambda *_: None)
            required = {
                'texture-v8-system-plan.json', 'texture-content-aware-sr-plan.json',
                'texture-uv-health-repair-plan.json', 'texture-specular-normal-aa-plan.json',
                'texture-per-tile-compression-plan.json', 'texture-atlas-defrag-plan.json',
                'texture-signed-cdn-manifest.json', 'texture-distributed-queue-plan.json',
                'texture-unified-quality-governor.json', 'texture-memory-residency-soak-report.json',
                'texture-regression-root-cause.json',
            }
            self.assertTrue(required.issubset({p.name for p in root.iterdir()}))
            report = json.loads((root / 'texture-quality-report.json').read_text())
            self.assertEqual(report['schemaVersion'], 10)
            self.assertEqual(report['system']['version'], '10.0.0')

    def test_21_v8_tools_are_packaged(self):
        root = Path(__file__).resolve().parents[1] / 'tools'
        required = [
            root / 'distributed_texture_queue.py',
            root / 'analyze_texture_soak.py',
            root / 'classify_texture_regression.py',
            root / 'verify_signed_texture_manifest.py',
        ]
        self.assertTrue(all(p.is_file() for p in required))

    def test_22_uv_repair_adapter_is_packaged(self):
        root = Path(__file__).resolve().parents[1] / 'tools' / 'texture_runtime_adapters' / 'blender'
        self.assertTrue((root / 'repair_uv_health.py').is_file())

    def test_23_cross_subsystem_governor_adapters_are_packaged(self):
        root = Path(__file__).resolve().parents[1] / 'tools' / 'texture_runtime_adapters'
        required = [root / 'web' / 'specular_normal_aa.js', root / 'godot' / 'UnifiedQualityGovernor.gd', root / 'roblox' / 'UnifiedQualityGovernor.luau']
        self.assertTrue(all(p.is_file() for p in required))

    def test_24_optimizer_status_exposes_v8_capabilities(self):
        from ai3d.texture_optimizer import TextureOptimizer
        status = TextureOptimizer().status()
        self.assertTrue(status['signedContentAddressedCdnManifest'])
        self.assertTrue(status['memoryResidencySoakAnalysis'])
        self.assertTrue(status['regressionRootCauseClassifier'])


if __name__ == '__main__':
    unittest.main()
