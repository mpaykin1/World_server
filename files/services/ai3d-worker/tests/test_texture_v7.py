from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from ai3d.texture_runtime_v7 import (
    analyze_mesh_texel_density,
    build_adaptive_anisotropy_plan,
    build_cdn_region_package_plan,
    build_gpu_frame_budget_plan,
    build_gpu_oom_recovery_plan,
    build_multi_world_resource_plan,
    build_thermal_battery_governor,
    build_trim_decal_plan,
    build_v7_system_plan,
    detect_residency_thrash,
    evaluate_canary_rollout,
)


def runtime_plan():
    page = {'mips': [{'level': 0, 'pagesX': 4, 'pagesY': 4}, {'level': 1, 'pagesX': 2, 'pagesY': 2}]}
    textures = [
        {'setKey': 'hero_face', 'role': 'albedo', 'residentMipFloor': 0, 'estimatedResidentVramBytes': 4_000_000, 'virtualTexturePagePlan': page},
        {'setKey': 'stone_wall', 'role': 'albedo', 'residentMipFloor': 1, 'estimatedResidentVramBytes': 2_000_000, 'virtualTexturePagePlan': page},
    ]
    return {'profiles': {'web_desktop': {'textures': textures}, 'godot_desktop': {'textures': textures}, 'roblox': {'textures': textures}}}


def saliency():
    return {'entries': [
        {'setKey': 'hero_face', 'saliencyScore': 0.99, 'priority': 'critical'},
        {'setKey': 'stone_wall', 'saliencyScore': 0.45, 'priority': 'low'},
    ]}


def rows():
    gate = {'passed': True}
    return [
        {'setKey': 'hero_face', 'role': 'albedo', 'material': 'skin', 'regressionGate': gate},
        {'setKey': 'stone_a', 'role': 'albedo', 'material': 'stone', 'regressionGate': gate},
        {'setKey': 'stone_b', 'role': 'albedo', 'material': 'stone', 'regressionGate': gate},
        {'setKey': 'stone_c', 'role': 'albedo', 'material': 'stone', 'regressionGate': gate},
    ]


def network_plan():
    return {'queue': [
        {'profile': 'web_desktop', 'setKey': 'hero_face', 'priorityScore': .99, 'targetMipFloor': 0},
        {'profile': 'web_desktop', 'setKey': 'stone_wall', 'priorityScore': .4, 'targetMipFloor': 1},
    ]}


class TextureV7Tests(unittest.TestCase):
    def test_01_thrash_detects_reload_pingpong(self):
        events = [
            {'setKey': 'stone_wall', 'event': 'evict', 'timestamp': 1}, {'setKey': 'stone_wall', 'event': 'load', 'timestamp': 2},
            {'setKey': 'stone_wall', 'event': 'evict', 'timestamp': 3}, {'setKey': 'stone_wall', 'event': 'load', 'timestamp': 4},
            {'setKey': 'stone_wall', 'event': 'evict', 'timestamp': 5}, {'setKey': 'stone_wall', 'event': 'load', 'timestamp': 6},
        ]
        self.assertEqual(detect_residency_thrash(events)['thrashingSets'], ['stone_wall'])

    def test_02_no_thrash_without_events(self):
        self.assertEqual(detect_residency_thrash([])['thrashingSetCount'], 0)

    def test_03_thermal_critical_reduces_quality(self):
        plan = build_thermal_battery_governor({'thermalState': 'critical', 'batteryLevel': .1}, saliency())
        self.assertLess(plan['qualityScale'], .7)
        self.assertEqual(plan['action'], 'EMERGENCY_CONSERVE')

    def test_04_nominal_thermal_keeps_full_quality(self):
        plan = build_thermal_battery_governor({'thermalState': 'nominal', 'batteryLevel': .8, 'charging': True})
        self.assertEqual(plan['qualityScale'], 1.0)

    def test_05_frame_budget_pressure_reduces_texture_share(self):
        low = build_gpu_frame_budget_plan({'gpuFrameMs': 10}, {'pressure': 0})
        high = build_gpu_frame_budget_plan({'gpuFrameMs': 24, 'vramUsageRatio': .95}, {'pressure': .8})
        self.assertLess(high['budgetFractions']['textures'], low['budgetFractions']['textures'])

    def test_06_frame_budget_sums_to_one(self):
        plan = build_gpu_frame_budget_plan({'gpuFrameMs': 20})
        self.assertAlmostEqual(sum(plan['budgetFractions'].values()), 1.0, places=5)

    def test_07_texel_density_detects_low(self):
        plan = analyze_mesh_texel_density([{'setKey': 'wall', 'worldArea': 100, 'uvArea': .25, 'textureWidth': 512, 'textureHeight': 512}], 512)
        self.assertEqual(plan['entries'][0]['status'], 'TOO_LOW')

    def test_08_texel_density_ignores_invalid_samples(self):
        self.assertEqual(analyze_mesh_texel_density([{'setKey': 'x', 'worldArea': 0, 'uvArea': 0}])['sampleCount'], 0)

    def test_09_trim_sheet_finds_repeated_family(self):
        plan = build_trim_decal_plan(rows(), saliency(), 3)
        self.assertEqual(plan['candidateCount'], 1)
        self.assertEqual(plan['candidates'][0]['family'], 'stone')

    def test_10_trim_sheet_never_auto_applies(self):
        self.assertFalse(build_trim_decal_plan(rows(), saliency(), 3)['autoApplied'])

    def test_11_cdn_packages_by_region(self):
        plan = build_cdn_region_package_plan(network_plan(), runtime_plan(), ['eu', 'us'], 128)
        self.assertEqual(plan['regions'], ['eu', 'us'])
        self.assertGreaterEqual(plan['chunkCount'], 2)

    def test_12_canary_promotes_one_stage_only(self):
        base = {'fps': 60, 'p95FrameMs': 16, 'textureVramMB': 300}
        cand = {'fps': 60, 'p95FrameMs': 16, 'textureVramMB': 300, 'visualDelta': .01, 'samples': 150}
        plan = evaluate_canary_rollout(base, cand, 5)
        self.assertEqual(plan['action'], 'PROMOTE_ONE_STAGE')
        self.assertEqual(plan['nextPercent'], 10.0)

    def test_13_bad_canary_rolls_back(self):
        base = {'fps': 60, 'p95FrameMs': 16, 'textureVramMB': 300}
        cand = {'fps': 40, 'p95FrameMs': 30, 'textureVramMB': 400, 'visualDelta': .1, 'samples': 200}
        self.assertEqual(evaluate_canary_rollout(base, cand, 10)['action'], 'ROLLBACK_TO_BASELINE')

    def test_14_oom_protects_hero_more_than_background(self):
        plan = build_gpu_oom_recovery_plan(runtime_plan(), saliency(), {'oom': True})
        hero = next(e for e in plan['entries'] if e['profile'] == 'web_desktop' and e['setKey'] == 'hero_face')
        bg = next(e for e in plan['entries'] if e['profile'] == 'web_desktop' and e['setKey'] == 'stone_wall')
        self.assertLess(hero['emergencyMipBiasDelta'], bg['emergencyMipBiasDelta'])

    def test_15_oom_not_invented_without_signal(self):
        plan = build_gpu_oom_recovery_plan(runtime_plan(), saliency(), {})
        self.assertFalse(plan['oomObserved'])
        self.assertFalse(plan['engineMemorySignalVerified'])

    def test_16_multiworld_prefers_visible_world(self):
        plan = build_multi_world_resource_plan([{'worldId': 'a', 'visible': True}, {'worldId': 'b', 'visible': False}], 1000, 100)
        a = next(x for x in plan['worlds'] if x['worldId'] == 'a')
        b = next(x for x in plan['worlds'] if x['worldId'] == 'b')
        self.assertGreater(a['vramBudgetMB'], b['vramBudgetMB'])

    def test_17_anisotropy_respects_thermal_cap(self):
        plan = build_adaptive_anisotropy_plan(runtime_plan(), saliency(), {'anisotropyCap': 4}, {'web_desktop': {'maxAnisotropy': 16}})
        hero = next(x for x in plan['profiles']['web_desktop']['entries'] if x['setKey'] == 'hero_face')
        self.assertEqual(hero['anisotropy'], 4)

    def test_18_v7_system_plan_contains_all_subsystems(self):
        plan = build_v7_system_plan(rows(), runtime_plan(), saliency(), network_plan(), {'worlds': [{'worldId': 'w', 'visible': True}]}, {})
        required = {'residencyThrash','thermalBatteryGovernor','gpuFrameBudget','meshTexelDensity','trimDecal','cdnRegionPackaging','canaryRollout','gpuOomRecovery','multiWorldResourceAllocator','adaptiveAnisotropy'}
        self.assertTrue(required.issubset(plan))

    def test_19_adapter_files_exist(self):
        root = Path(__file__).resolve().parents[1] / 'tools' / 'texture_runtime_adapters'
        required = [
            root / 'web' / 'texture_residency_watchdog.js',
            root / 'godot' / 'TextureResidencyWatchdog.gd',
            root / 'roblox' / 'TextureQualityGovernor.luau',
            root / 'blender' / 'scan_texel_density.py',
        ]
        self.assertTrue(all(p.is_file() for p in required))

    def test_20_optimizer_emits_v7_manifests(self):
        from PIL import Image
        from ai3d.texture_optimizer import TextureOptimizer
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            image = root / 'hero_face_albedo.png'
            Image.new('RGB', (64, 64), (160, 120, 100)).save(image)
            TextureOptimizer().run({'input_path': str(image), 'params': {'targetMin': 64, 'semanticMetadata': {'hero_face': {'tags': ['face']}}}}, lambda *_: None)
            required = {
                'texture-v7-system-plan.json','texture-residency-thrash-report.json','texture-thermal-battery-governor.json',
                'texture-gpu-frame-budget-plan.json','texture-mesh-texel-density-report.json','texture-trim-decal-plan.json',
                'texture-cdn-region-package-plan.json','texture-canary-rollout-report.json','texture-gpu-oom-recovery-plan.json',
                'texture-multi-world-resource-plan.json','texture-adaptive-anisotropy-plan.json'
            }
            self.assertTrue(required.issubset({p.name for p in root.iterdir()}))
            report = json.loads((root / 'texture-quality-report.json').read_text())
            self.assertEqual(report['schemaVersion'], 10)
            self.assertEqual(report['system']['version'], '10.0.0')


if __name__ == '__main__':
    unittest.main()
