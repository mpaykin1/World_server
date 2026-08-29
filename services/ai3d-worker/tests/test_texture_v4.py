import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from ai3d.texture_optimizer import TextureOptimizer
from ai3d.texture_runtime_v4 import (
    GoldenTextureLibrary,
    build_camera_heatmap_feedback,
    build_engine_adapter_manifest,
    read_telemetry_jsonl,
    retune_runtime_plan,
    solve_runtime_vram_budget,
    verify_compressed_container,
)
from ai3d.renderback_compare import compare_renderbacks


class TextureV4Tests(unittest.TestCase):
    def test_golden_library_promotes_and_reuses_verified_asset(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            image = root / 'stone.png'
            Image.new('RGB', (16, 16), (100, 110, 120)).save(image)
            lib = GoldenTextureLibrary(root / 'golden')
            result = lib.promote(image, role='albedo', material='stone', quality_tier='ultra', source_name='stone.png', quality_score=94, gate_passed=True)
            self.assertTrue(Path(result['blob']).is_file())
            best = lib.best(role='albedo', material='stone', quality_tier='ultra', minimum_score=90)
            self.assertEqual(best['sha256'], result['sha256'])
            self.assertEqual(lib.stats()['verifiedAssets'], 1)

    def test_golden_library_does_not_return_failed_asset(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            image = root / 'bad.png'
            Image.new('RGB', (8, 8), (1, 2, 3)).save(image)
            lib = GoldenTextureLibrary(root / 'golden')
            lib.promote(image, role='albedo', material='stone', quality_tier='ultra', source_name='bad.png', quality_score=10, gate_passed=False)
            self.assertIsNone(lib.best(role='albedo', material='stone', quality_tier='ultra'))

    def test_camera_heatmap_prioritizes_close_large_surface(self):
        events = [
            {'setKey': 'hero_wall', 'distance': 2, 'screenCoverage': 0.7, 'seconds': 5},
            {'setKey': 'far_roof', 'distance': 80, 'screenCoverage': 0.03, 'seconds': 2},
        ]
        feedback = build_camera_heatmap_feedback(events)
        self.assertEqual(feedback['feedback'][0]['setKey'], 'hero_wall')
        self.assertEqual(feedback['feedback'][0]['priority'], 'critical')
        self.assertGreater(feedback['feedback'][0]['normalizedAttention'], feedback['feedback'][1]['normalizedAttention'])

    def test_runtime_retune_only_marks_candidate_changes(self):
        plan = {'profiles': {'web_mobile': {'textures': [
            {'setKey': 'hero', 'residentMipFloor': 2}, {'setKey': 'background', 'residentMipFloor': 1}
        ]}}, 'dynamicRuntimeVerified': False}
        feedback = {'feedback': [
            {'setKey': 'hero', 'priority': 'critical', 'normalizedAttention': 1.0},
            {'setKey': 'background', 'priority': 'low', 'normalizedAttention': 0.02},
        ]}
        tuned = retune_runtime_plan(plan, feedback)
        textures = tuned['profiles']['web_mobile']['textures']
        self.assertEqual(textures[0]['feedbackResidentMipFloor'], 1)
        self.assertEqual(textures[1]['feedbackResidentMipFloor'], 2)
        self.assertFalse(tuned['dynamicRuntimeVerified'])

    def test_engine_adapter_manifest_is_truthful(self):
        manifest = build_engine_adapter_manifest(
            {'profiles': {'web_desktop': {}, 'roblox': {}}},
            {'pages': ['a.png']},
            {'arrays': [{'role': 'albedo'}]},
        )
        self.assertTrue(manifest['candidateOnly'])
        self.assertFalse(manifest['web']['verifiedInTargetRuntime'])
        self.assertFalse(manifest['roblox']['verifiedInTargetRuntime'])
        self.assertIn('blender', manifest['blenderUvRebind']['adapter'])

    def test_compression_magic_ktx2(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'x.ktx2'
            path.write_bytes(b'\xabKTX 20\xbb\r\n\x1a\n' + b'12345678')
            result = verify_compressed_container(path, 'ktx2')
            self.assertTrue(result['signatureVerified'])
            self.assertFalse(result['engineImportVerified'])

    def test_compression_magic_dds(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'x.dds'
            path.write_bytes(b'DDS ' + b'0' * 20)
            self.assertTrue(verify_compressed_container(path, 'dds')['signatureVerified'])

    def test_compression_magic_astc(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'x.astc'
            path.write_bytes(bytes.fromhex('13 ab a1 5c') + b'0' * 20)
            self.assertTrue(verify_compressed_container(path, 'astc')['signatureVerified'])

    def test_telemetry_jsonl_ignores_bad_lines(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'events.jsonl'
            path.write_text('{"setKey":"wall","distance":2}\nnot-json\n{"setKey":"roof","distance":8}\n', encoding='utf-8')
            events = read_telemetry_jsonl(path)
            self.assertEqual(len(events), 2)

    def test_optimizer_emits_v4_manifests_and_library_report(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            src = root / 'stone_albedo.png'
            Image.new('RGB', (32, 32), (80, 100, 120)).save(src)
            result = TextureOptimizer().run({'input_path': str(src), 'params': {
                'targetMin': 32,
                '_originalFilename': src.name,
                'material': 'stone',
                'cameraTelemetry': [{'setKey': 'stone', 'distance': 3, 'screenCoverage': 0.5, 'seconds': 2}],
            }}, lambda *_: None)
            names = {item['name'] for item in result['files']}
            required = {
                'texture-camera-feedback-plan.json', 'texture-runtime-retuned-plan.json',
                'texture-engine-adapter-manifest.json', 'texture-golden-library-report.json',
                'texture-compression-execution-report.json',
            }
            self.assertTrue(required.issubset(names))
            report = json.loads((root / 'texture-quality-report.json').read_text(encoding='utf-8'))
            self.assertEqual(report['schemaVersion'], 10)
            self.assertEqual(report['system']['version'], '10.0.0')
            self.assertEqual(report['cameraTelemetryEventsConsumed'], 1)
            self.assertGreaterEqual(report['goldenLibraryVerifiedAssets'], 1)

    def test_v4_adapter_files_are_packaged(self):
        package = Path(__file__).resolve().parents[1]
        base = package / 'tools' / 'texture_runtime_adapters'
        self.assertTrue((base / 'web' / 'texture_runtime_adapter.js').is_file())
        self.assertTrue((base / 'godot' / 'TextureRuntimeAdapter.gd').is_file())
        self.assertTrue((base / 'roblox' / 'TextureRuntimeAdapter.luau').is_file())
        self.assertTrue((base / 'blender' / 'apply_texture_uv_rebind.py').is_file())

    def test_failed_compression_signature_is_not_verified(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'fake.dds'
            path.write_bytes(b'NOTDDS123456')
            self.assertFalse(verify_compressed_container(path, 'dds')['signatureVerified'])

    def test_runtime_metric_collectors_are_packaged(self):
        worker = Path(__file__).resolve().parents[1]
        base = worker / 'tools' / 'texture_runtime_collectors'
        self.assertTrue((base / 'web' / 'texture_metrics_collector.js').is_file())
        self.assertTrue((base / 'godot' / 'TextureMetricsCollector.gd').is_file())
        self.assertTrue((base / 'roblox' / 'TextureMetricsCollector.luau').is_file())

    def test_remote_golden_sync_tool_is_packaged(self):
        worker = Path(__file__).resolve().parents[1]
        self.assertTrue((worker / 'tools' / 'sync_golden_texture_library.py').is_file())

    def test_heatmap_without_events_makes_no_runtime_changes(self):
        plan = {'profiles': {'web_desktop': {'textures': [{'setKey': 'wall', 'residentMipFloor': 1}]}}, 'dynamicRuntimeVerified': False}
        feedback = build_camera_heatmap_feedback([], plan)
        tuned = retune_runtime_plan(plan, feedback)
        self.assertEqual(tuned['cameraFeedbackChanges'], 0)
        self.assertFalse(tuned['cameraFeedbackAppliedAsCandidate'])

    def test_vram_budget_solver_reduces_low_priority_first(self):
        plan = {'profiles': {'web_mobile': {
            'textureVramBudgetBytes': 300,
            'textures': [
                {'setKey':'hero','role':'albedo','residentMipFloor':0,'residentMaxDimension':1024,'estimatedResidentVramBytes':400},
                {'setKey':'bg','role':'ao','residentMipFloor':0,'residentMaxDimension':1024,'estimatedResidentVramBytes':400},
            ]
        }}, 'dynamicRuntimeVerified': False}
        feedback = {'feedback':[
            {'setKey':'hero','priority':'critical','normalizedAttention':1.0},
            {'setKey':'bg','priority':'low','normalizedAttention':0.01},
        ]}
        solved = solve_runtime_vram_budget(plan, feedback)
        profile = solved['profiles']['web_mobile']
        self.assertEqual(profile['budgetSolver']['gate'], 'PASS')
        hero = profile['textures'][0]
        bg = profile['textures'][1]
        self.assertGreaterEqual(bg['budgetSolvedResidentMipFloor'], hero['budgetSolvedResidentMipFloor'])
        self.assertLessEqual(profile['budgetSolver']['afterBytes'], 300)

    def test_renderback_comparator_identical_is_zero(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); a=root/'a.png'; b=root/'b.png'
            Image.new('RGB',(32,32),(10,20,30)).save(a); b.write_bytes(a.read_bytes())
            result=compare_renderbacks(a,b)
            self.assertTrue(result['identical'])
            self.assertEqual(result['visualDelta'], 0.0)

    def test_renderback_comparator_detects_change(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); a=root/'a.png'; b=root/'b.png'
            Image.new('RGB',(32,32),(10,20,30)).save(a); Image.new('RGB',(32,32),(200,210,220)).save(b)
            result=compare_renderbacks(a,b)
            self.assertFalse(result['identical'])
            self.assertGreater(result['visualDelta'], 0.1)

    def test_renderback_tool_is_packaged(self):
        worker = Path(__file__).resolve().parents[1]
        self.assertTrue((worker / 'tools' / 'compare_texture_renderbacks.py').is_file())


if __name__ == '__main__':
    unittest.main()
