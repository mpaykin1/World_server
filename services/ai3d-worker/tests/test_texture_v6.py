from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from ai3d.texture_runtime_v6 import (
    CrossProjectMaterialLibrary,
    aggregate_benchmark_results,
    build_benchmark_farm_plan,
    build_cross_project_material_library_report,
    build_exploration_mission,
    build_network_delivery_plan,
    build_semantic_saliency_plan,
    build_shader_material_cooptimization,
    build_v6_system_plan,
    build_virtual_texture_backend_plan,
    detect_policy_drift,
    semantic_importance,
)


def runtime_plan():
    page = {'mips': [{'level': 0, 'pagesX': 4, 'pagesY': 4}, {'level': 1, 'pagesX': 2, 'pagesY': 2}]}
    textures = [
        {'setKey': 'hero_face', 'role': 'albedo', 'residentMipFloor': 0, 'virtualTexturePagePlan': page},
        {'setKey': 'stone_wall', 'role': 'albedo', 'residentMipFloor': 1, 'virtualTexturePagePlan': page},
    ]
    return {'profiles': {'web_desktop': {'textures': textures}, 'godot_desktop': {'textures': textures}, 'roblox': {'textures': textures}}}


def rows():
    gate = {'passed': True}
    return [
        {'setKey': 'hero_face', 'role': 'albedo', 'sourceSha256': 'a'*64, 'material': 'skin', 'outputReadinessPercent': 95, 'regressionGate': gate, 'output': {'hasAlpha': False}},
        {'setKey': 'hero_face', 'role': 'normal', 'sourceSha256': 'b'*64, 'material': 'skin', 'outputReadinessPercent': 94, 'regressionGate': gate, 'output': {}},
        {'setKey': 'stone_wall', 'role': 'albedo', 'sourceSha256': 'c'*64, 'material': 'stone', 'outputReadinessPercent': 91, 'regressionGate': gate, 'output': {}},
        {'setKey': 'stone_wall', 'role': 'normal', 'sourceSha256': 'd'*64, 'material': 'stone', 'outputReadinessPercent': 90, 'regressionGate': gate, 'output': {}},
    ]


class TextureV6Tests(unittest.TestCase):
    def test_01_face_saliency_is_critical(self):
        self.assertEqual(semantic_importance('hero_face', {'tags': ['face']})['priority'], 'critical')

    def test_02_background_is_below_face(self):
        face = semantic_importance('face', {'tags': ['face']})['saliencyScore']
        bg = semantic_importance('background', {'tags': ['background']})['saliencyScore']
        self.assertGreater(face, bg)

    def test_03_saliency_plan_has_all_sets(self):
        plan = build_semantic_saliency_plan(runtime_plan(), {'hero_face': {'tags': ['face']}})
        self.assertEqual({e['setKey'] for e in plan['entries']}, {'hero_face', 'stone_wall'})

    def test_04_exploration_targets_material_positions(self):
        plan = build_exploration_mission({'stone_wall': [0, 0, 0]}, max_waypoints=8)
        self.assertGreaterEqual(plan['waypointCount'], 4)
        self.assertEqual(plan['waypoints'][0]['targetSetKey'], 'stone_wall')

    def test_05_exploration_has_fallback_route(self):
        plan = build_exploration_mission({}, {'min': [-2, 1, -2], 'max': [2, 2, 2]}, 6)
        self.assertEqual(plan['waypointCount'], 6)

    def test_06_bad_network_reduces_concurrency(self):
        sal = build_semantic_saliency_plan(runtime_plan())
        plan = build_network_delivery_plan(runtime_plan(), sal, network={'bandwidthMbps': 2, 'rttMs': 250, 'packetLoss': 0.1})
        self.assertEqual(plan['maxConcurrentRequests'], 2)

    def test_07_fast_network_increases_concurrency(self):
        sal = build_semantic_saliency_plan(runtime_plan())
        plan = build_network_delivery_plan(runtime_plan(), sal, network={'bandwidthMbps': 100, 'rttMs': 20})
        self.assertEqual(plan['maxConcurrentRequests'], 8)

    def test_08_network_prioritizes_hero(self):
        sal = build_semantic_saliency_plan(runtime_plan(), {'hero_face': {'tags': ['face']}, 'stone_wall': {'tags': ['background']}})
        plan = build_network_delivery_plan(runtime_plan(), sal)
        first_web = next(x for x in plan['queue'] if x['profile'] == 'web_desktop')
        self.assertEqual(first_web['setKey'], 'hero_face')

    def test_09_webgpu_backend_never_claims_sparse(self):
        plan = build_virtual_texture_backend_plan(runtime_plan(), {'web_desktop': {'webgpu': True}})
        self.assertEqual(plan['profiles']['web_desktop']['backend'], 'webgpu-software-page-cache')
        self.assertFalse(plan['hardwareSparseResidencyClaimed'])

    def test_10_roblox_backend_is_asset_tier(self):
        plan = build_virtual_texture_backend_plan(runtime_plan())
        self.assertIn('asset-tier', plan['profiles']['roblox']['backend'])

    def test_11_shader_optimizer_groups_equal_features(self):
        plan = build_shader_material_cooptimization(rows())
        self.assertGreaterEqual(plan['estimatedPermutationsSaved'], 1)

    def test_12_material_library_fingerprint_is_stable(self):
        a = CrossProjectMaterialLibrary.fingerprint(rows()[:2])
        b = CrossProjectMaterialLibrary.fingerprint(list(reversed(rows()[:2])))
        self.assertEqual(a, b)

    def test_13_material_library_persists(self):
        with tempfile.TemporaryDirectory() as td:
            lib = CrossProjectMaterialLibrary(Path(td))
            lib.register('hero_face', rows()[:2], True, 94)
            self.assertEqual(len(CrossProjectMaterialLibrary(Path(td)).export()['materials']), 1)

    def test_14_failed_gate_is_not_auto_registered(self):
        bad = rows()[:1]
        bad[0] = {**bad[0], 'regressionGate': {'passed': False}}
        with tempfile.TemporaryDirectory() as td:
            report = build_cross_project_material_library_report(bad, Path(td), True)
            self.assertEqual(report['canonicalCount'], 0)

    def test_15_drift_detector_requests_rollback(self):
        report = detect_policy_drift({'fps': 60, 'p95FrameMs': 16, 'textureVramMB': 300}, {'fps': 52, 'p95FrameMs': 20, 'textureVramMB': 360, 'visualDelta': 0.01})
        self.assertTrue(report['driftDetected'])
        self.assertEqual(report['action'], 'ROLLBACK_CANDIDATE_POLICY')

    def test_16_stable_policy_keeps_candidate(self):
        report = detect_policy_drift({'fps': 60, 'p95FrameMs': 16, 'textureVramMB': 300}, {'fps': 60, 'p95FrameMs': 16, 'textureVramMB': 300, 'visualDelta': 0.01})
        self.assertFalse(report['driftDetected'])

    def test_17_benchmark_farm_has_jobs(self):
        plan = build_benchmark_farm_plan(repetitions=2)
        self.assertGreater(plan['jobCount'], 8)
        self.assertEqual(plan['jobs'][0]['repetitions'], 2)

    def test_18_benchmark_aggregation_selects_passed_best(self):
        report = aggregate_benchmark_results([
            {'deviceClass': 'd', 'format': 'A', 'passed': True, 'fps': 60, 'p95FrameMs': 16, 'visualDelta': .01, 'loadMs': 100},
            {'deviceClass': 'd', 'format': 'B', 'passed': True, 'fps': 45, 'p95FrameMs': 24, 'visualDelta': .01, 'loadMs': 100},
        ])
        self.assertEqual(report['recommendations'][0]['format'], 'A')

    def test_19_v6_system_plan_contains_all_subsystems(self):
        with tempfile.TemporaryDirectory() as td:
            plan = build_v6_system_plan(rows(), runtime_plan(), {}, {'entries': []}, {}, {'semanticMetadata': {'hero_face': {'tags': ['face']}}}, {}, Path(td))
            required = {'semanticSaliency','explorationMission','networkDelivery','virtualTextureBackend','shaderMaterialCooptimization','crossProjectMaterialLibrary','policyDrift','benchmarkFarm'}
            self.assertTrue(required.issubset(plan))

    def test_20_adapter_files_exist_in_package(self):
        root = Path(__file__).resolve().parents[1] / 'tools' / 'texture_runtime_adapters'
        required = [
            root / 'web' / 'exploration_bot.js', root / 'web' / 'webgpu_virtual_texture_cache.js',
            root / 'godot' / 'ExplorationBot.gd', root / 'godot' / 'RenderingDeviceVirtualTextureCache.gd',
            root / 'roblox' / 'ExplorationBot.luau',
        ]
        self.assertTrue(all(p.is_file() for p in required))


    def test_21_optimizer_emits_v6_manifests(self):
        from PIL import Image
        from ai3d.texture_optimizer import TextureOptimizer
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            image = root / 'hero_face_albedo.png'
            Image.new('RGB', (64, 64), (160, 120, 100)).save(image)
            TextureOptimizer().run({'input_path': str(image), 'params': {'targetMin': 64, 'semanticMetadata': {'hero_face': {'tags': ['face']}}}}, lambda *_: None)
            required = {
                'texture-v6-system-plan.json','texture-semantic-saliency-plan.json','texture-exploration-mission.json',
                'texture-network-delivery-plan.json','texture-virtual-texture-backend-plan.json','texture-shader-material-cooptimization.json',
                'texture-cross-project-material-library-report.json','texture-policy-drift-report.json','texture-benchmark-farm-plan.json'
            }
            self.assertTrue(required.issubset({p.name for p in root.iterdir()}))
            report = json.loads((root / 'texture-quality-report.json').read_text())
            self.assertEqual(report['schemaVersion'], 10)
            self.assertEqual(report['system']['version'], '10.0.0')

    def test_22_material_library_root_is_reported(self):
        from ai3d.texture_runtime_v6 import resolve_material_library_root
        with tempfile.TemporaryDirectory() as td:
            path, mode = resolve_material_library_root(Path(td))
            self.assertEqual(mode, 'job-local-fallback')
            self.assertTrue(str(path).endswith('.texture-material-library'))


if __name__ == '__main__':
    unittest.main()
