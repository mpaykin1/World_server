import json
import tempfile
import unittest
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

from ai3d.texture_optimizer import TextureOptimizer, _material_set_key, _role_from_name, _target_size
from ai3d.texture_advanced import (
    build_material_instance_plan, build_runtime_plan, build_texture_array_plan, build_tile_seam_candidate,
    build_uv_rebind_plan, build_virtual_texture_page_plan, estimate_uncompressed_vram_bytes,
)


class TextureOptimizerTests(unittest.TestCase):
    def make_rgb(self, path: Path, width=128, height=96, base=(70, 100, 120)):
        arr = np.zeros((height, width, 3), dtype=np.uint8)
        arr[..., 0] = np.linspace(base[0], min(base[0] + 150, 255), width, dtype=np.uint8)[None, :]
        arr[..., 1] = base[1]
        arr[..., 2] = base[2]
        Image.fromarray(arr, 'RGB').save(path)

    def test_role_and_set_detection(self):
        self.assertEqual(_role_from_name('castle_wall_normal.png'), 'normal')
        self.assertEqual(_role_from_name('castle_wall_roughness.png'), 'roughness')
        self.assertEqual(_material_set_key('castle_wall_normal.png'), 'castle_wall')

    def test_albedo_builds_web_pbr_report_and_bindings(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            src = root / 'old_stone_albedo.png'
            self.make_rgb(src)
            result = TextureOptimizer().run(
                {'input_path': str(src), 'params': {'targetMin': 256, '_originalFilename': src.name, 'material': 'stone'}},
                lambda *_: None,
            )
            report = json.loads((root / 'texture-quality-report.json').read_text('utf-8'))
            self.assertEqual(report['schemaVersion'], 10)
            self.assertEqual(report['texturesProcessed'], 1)
            self.assertGreaterEqual(report['afterReadinessPercent'], report['beforeReadinessPercent'])
            names = {item['name'] for item in result['files']}
            self.assertIn('TEX_000_WEB.webp', names)
            self.assertIn('TEX_000_ORM_INFERRED.png', names)
            self.assertIn('texture-engine-bindings.json', names)

    def test_normal_output_stays_normalized(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            arr = np.zeros((64, 64, 3), dtype=np.uint8)
            arr[..., 0] = 128
            arr[..., 1] = 128
            arr[..., 2] = 255
            src = root / 'wall_normal.png'
            Image.fromarray(arr, 'RGB').save(src)
            TextureOptimizer().run({'input_path': str(src), 'params': {'targetMin': 256, '_originalFilename': src.name}}, lambda *_: None)
            report = json.loads((root / 'texture-quality-report.json').read_text('utf-8'))
            self.assertLessEqual(report['textures'][0]['output']['normalInvalidRatio'], 0.01)
            self.assertTrue(report['textures'][0]['regressionGate']['passed'])

    def test_exact_duplicates_are_reused(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            a = root / 'stone_albedo.png'
            b = root / 'stone_copy_albedo.png'
            self.make_rgb(a)
            b.write_bytes(a.read_bytes())
            pack = root / 'pack.zip'
            with zipfile.ZipFile(pack, 'w') as zf:
                zf.write(a, a.name)
                zf.write(b, b.name)
            TextureOptimizer().run({'input_path': str(pack), 'params': {'targetMin': 256, '_originalFilename': pack.name}}, lambda *_: None)
            report = json.loads((root / 'texture-quality-report.json').read_text('utf-8'))
            self.assertEqual(report['texturesProcessed'], 2)
            self.assertEqual(report['uniqueTextureContents'], 1)
            self.assertEqual(report['exactDedupHits'], 1)

    def test_cache_hits_on_second_run(self):
        with tempfile.TemporaryDirectory() as td:
            runtime = Path(td) / 'runtime'
            jobs = runtime / 'jobs'
            first = jobs / 'a'
            second = jobs / 'b'
            first.mkdir(parents=True)
            second.mkdir(parents=True)
            src1 = first / 'input.png'
            src2 = second / 'input.png'
            self.make_rgb(src1)
            src2.write_bytes(src1.read_bytes())
            params = {'targetMin': 256, '_originalFilename': 'stone_albedo.png', 'useCache': True}
            TextureOptimizer().run({'input_path': str(src1), 'params': params}, lambda *_: None)
            TextureOptimizer().run({'input_path': str(src2), 'params': params}, lambda *_: None)
            report = json.loads((second / 'texture-quality-report.json').read_text('utf-8'))
            self.assertGreaterEqual(report['cacheHits'], 1)

    def test_source_orm_is_packed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            files = []
            for name, value in [('wall_ao.png', 230), ('wall_roughness.png', 160), ('wall_metallic.png', 20)]:
                path = root / name
                Image.new('L', (64, 64), value).save(path)
                files.append(path)
            pack = root / 'pbr.zip'
            with zipfile.ZipFile(pack, 'w') as zf:
                for path in files:
                    zf.write(path, path.name)
            TextureOptimizer().run({'input_path': str(pack), 'params': {'targetMin': 64, '_originalFilename': pack.name}}, lambda *_: None)
            report = json.loads((root / 'texture-quality-report.json').read_text('utf-8'))
            self.assertEqual(report['sourceOrmPacks'], 1)
            self.assertTrue(any(root.glob('ORM_SOURCE_wall.png')))

    def test_atlas_candidate_is_created_for_multiple_albedos(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            paths = []
            for index in range(3):
                path = root / f'wall{index}_albedo.png'
                self.make_rgb(path, 64, 64, (50 + index * 20, 80, 100))
                paths.append(path)
            pack = root / 'atlas.zip'
            with zipfile.ZipFile(pack, 'w') as zf:
                for path in paths:
                    zf.write(path, path.name)
            TextureOptimizer().run({'input_path': str(pack), 'params': {'targetMin': 64, '_originalFilename': pack.name, 'buildAtlasCandidate': True}}, lambda *_: None)
            manifest = json.loads((root / 'texture-atlas-manifest.json').read_text('utf-8'))
            self.assertTrue(manifest['candidateOnly'])
            self.assertGreaterEqual(len(manifest['pages']), 1)
            self.assertGreaterEqual(len(manifest['entries']), 3)

    def test_mips_can_be_emitted_on_demand(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            src = root / 'floor_albedo.png'
            self.make_rgb(src, 128, 128)
            TextureOptimizer().run({'input_path': str(src), 'params': {'targetMin': 128, '_originalFilename': src.name, 'emitMipFiles': True}}, lambda *_: None)
            report = json.loads((root / 'texture-quality-report.json').read_text('utf-8'))
            self.assertGreater(report['textures'][0]['mipFilesEmitted'], 0)
            self.assertTrue(any(root.glob('TEX_000_MIP_*.png')))

    def test_inferred_wetness_only_affects_inferred_pbr(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            src = root / 'stone_albedo.png'
            self.make_rgb(src)
            TextureOptimizer().run({'input_path': str(src), 'params': {'targetMin': 128, '_originalFilename': src.name, 'material': 'stone', 'wetness': 0.08}}, lambda *_: None)
            report = json.loads((root / 'texture-quality-report.json').read_text('utf-8'))
            self.assertEqual(report['textures'][0]['wetnessAppliedToInferredRoughness'], 0.08)
            self.assertEqual(report['textures'][0]['pbrTruth'], 'INFERRED_FROM_COLOR')


    def test_near_duplicates_are_reported_but_not_auto_collapsed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            a = root / 'a_albedo.png'
            b = root / 'b_albedo.png'
            self.make_rgb(a, 96, 96, (50, 90, 120))
            arr = np.asarray(Image.open(a).convert('RGB')).copy()
            arr[20:24, 20:24, 0] = np.clip(arr[20:24, 20:24, 0] + 2, 0, 255)
            Image.fromarray(arr, 'RGB').save(b)
            pack = root / 'near.zip'
            with zipfile.ZipFile(pack, 'w') as zf:
                zf.write(a, a.name)
                zf.write(b, b.name)
            TextureOptimizer().run({'input_path': str(pack), 'params': {'targetMin': 96, '_originalFilename': pack.name}}, lambda *_: None)
            report = json.loads((root / 'texture-quality-report.json').read_text('utf-8'))
            self.assertGreaterEqual(report['nearDuplicatePairs'], 1)
            self.assertFalse(report['nearDuplicates'][0]['autoDeduplicated'])

    def test_pbr_set_health_is_reported(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            albedo = root / 'wall_albedo.png'
            normal = root / 'wall_normal.png'
            rough = root / 'wall_roughness.png'
            self.make_rgb(albedo, 64, 64)
            Image.new('RGB', (64, 64), (128, 128, 255)).save(normal)
            Image.new('L', (64, 64), 180).save(rough)
            pack = root / 'health.zip'
            with zipfile.ZipFile(pack, 'w') as zf:
                for path in (albedo, normal, rough):
                    zf.write(path, path.name)
            TextureOptimizer().run({'input_path': str(pack), 'params': {'targetMin': 64, '_originalFilename': pack.name}}, lambda *_: None)
            report = json.loads((root / 'texture-quality-report.json').read_text('utf-8'))
            health = next(item for item in report['pbrSetHealth'] if item['setKey'] == 'wall')
            self.assertEqual(health['sourcePbrCompletenessPercent'], 75)
            self.assertIn('ao', health['missingCoreRoles'])

    def test_alpha_coverage_is_preserved_by_color_resize(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            arr = np.zeros((64, 64, 4), dtype=np.uint8)
            arr[..., :3] = (220, 120, 40)
            arr[16:48, 16:48, 3] = 255
            src = root / 'leaf_albedo.png'
            Image.fromarray(arr, 'RGBA').save(src)
            TextureOptimizer().run({'input_path': str(src), 'params': {'targetMin': 256, '_originalFilename': src.name}}, lambda *_: None)
            report = json.loads((root / 'texture-quality-report.json').read_text('utf-8'))
            delta = report['textures'][0]['regressionGate']['metrics']['alphaCoverageDelta']
            self.assertLessEqual(delta, 0.01)
            self.assertTrue(report['system']['premultipliedAlphaResize'])


    def test_target_size_preserves_aspect_ratio_under_cap(self):
        width, height, scale = _target_size(3000, 2000, 4096, 4096)
        self.assertEqual(max(width, height), 4096)
        self.assertAlmostEqual(width / height, 1.5, places=2)
        self.assertEqual(scale, 2)


    def test_golden_material_memory_is_persisted(self):
        with tempfile.TemporaryDirectory() as td:
            runtime = Path(td) / 'runtime'
            job = runtime / 'jobs' / 'memoryjob'
            job.mkdir(parents=True)
            src = job / 'input.png'
            self.make_rgb(src, 96, 96)
            TextureOptimizer().run({'input_path': str(src), 'params': {'targetMin': 96, '_originalFilename': 'stone_albedo.png', 'material': 'stone'}}, lambda *_: None)
            memory_path = runtime / 'texture-cache' / 'quality-memory.json'
            self.assertTrue(memory_path.is_file())
            memory = json.loads(memory_path.read_text('utf-8'))
            self.assertIn('albedo:stone:ultra', memory['profiles'])
            self.assertGreaterEqual(memory['profiles']['albedo:stone:ultra']['runs'], 1)

    def test_v3_outputs_runtime_uv_compression_and_array_manifests(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            paths = []
            for index in range(2):
                path = root / f'wall{index}_albedo.png'
                self.make_rgb(path, 64, 64, (60 + index * 20, 90, 110))
                paths.append(path)
            pack = root / 'v3.zip'
            with zipfile.ZipFile(pack, 'w') as zf:
                for path in paths:
                    zf.write(path, path.name)
            result = TextureOptimizer().run({'input_path': str(pack), 'params': {'targetMin': 64, '_originalFilename': pack.name}}, lambda *_: None)
            names = {item['name'] for item in result['files']}
            for name in ('texture-runtime-plan.json', 'texture-uv-rebind-plan.json', 'texture-compression-matrix.json', 'texture-array-plan.json', 'texture-advanced-report.json'):
                self.assertIn(name, names)
            report = json.loads((root / 'texture-quality-report.json').read_text('utf-8'))
            self.assertEqual(report['system']['version'], '10.0.0')
            self.assertTrue(report['atlasGutterExtrusion'])

    def test_atlas_uses_extruded_gutters_and_uv_transform(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            paths = []
            for index, base in enumerate(((250, 10, 10), (10, 250, 10))):
                path = root / f'tile{index}_albedo.png'
                Image.new('RGB', (32, 32), base).save(path)
                paths.append(path)
            pack = root / 'atlas_v3.zip'
            with zipfile.ZipFile(pack, 'w') as zf:
                for path in paths:
                    zf.write(path, path.name)
            TextureOptimizer().run({'input_path': str(pack), 'params': {'targetMin': 32, '_originalFilename': pack.name, 'atlasPadding': 8}}, lambda *_: None)
            manifest = json.loads((root / 'texture-atlas-manifest.json').read_text('utf-8'))
            self.assertEqual(manifest['schemaVersion'], 2)
            self.assertTrue(manifest['gutterExtrusion'])
            self.assertTrue(all(entry['gutterExtruded'] for entry in manifest['entries']))
            uv = json.loads((root / 'texture-uv-rebind-plan.json').read_text('utf-8'))
            self.assertGreaterEqual(len(uv['entries']), 2)
            self.assertIn('scale', uv['entries'][0]['uvTransform'])

    def test_runtime_plan_has_static_budget_and_texel_density(self):
        rows = [{
            'source': 'wall.png', 'setKey': 'wall', 'role': 'albedo',
            'output': {'width': 4096, 'height': 4096},
        }]
        plan = build_runtime_plan(rows, {'platformProfiles': ['web_mobile'], 'worldUnitsPerTexture': {'wall': 4.0}})
        profile = plan['profiles']['web_mobile']
        self.assertIn(profile['staticBudgetGate'], {'PASS', 'WARN_OVER_BUDGET'})
        self.assertEqual(profile['textures'][0]['texelDensity']['actualTexelsPerUnit'], 1024.0)
        self.assertGreaterEqual(profile['textures'][0]['residentMipFloor'], 1)

    def test_vram_estimator_includes_mip_chain(self):
        base = 1024 * 1024 * 4
        estimated = estimate_uncompressed_vram_bytes(1024, 1024, 'albedo')
        self.assertGreater(estimated, base)
        self.assertLess(estimated, int(base * 1.5))

    def test_tile_seam_repair_is_candidate_only_and_improves_edges(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            arr = np.zeros((64, 64, 3), dtype=np.uint8)
            arr[:, :32] = (0, 0, 0)
            arr[:, 32:] = (255, 255, 255)
            src = root / 'tile.png'
            dst = root / 'tile_repaired.png'
            Image.fromarray(arr, 'RGB').save(src)
            result = build_tile_seam_candidate(src, dst, 'albedo', 8)
            self.assertTrue(result['nonDestructive'])
            self.assertGreaterEqual(result['afterSeamScore'], result['beforeSeamScore'])
            if result['candidateGenerated']:
                self.assertTrue(dst.is_file())

    def test_detail_and_macro_assets_are_generated_for_albedo(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            src = root / 'stone_albedo.png'
            self.make_rgb(src, 128, 128)
            TextureOptimizer().run({'input_path': str(src), 'params': {'targetMin': 128, '_originalFilename': src.name, 'synthesizeDetailLayers': True}}, lambda *_: None)
            self.assertTrue(any(root.glob('DETAIL_NORMAL_INFERRED_*.png')))
            self.assertTrue(any(root.glob('MACRO_VARIATION_INFERRED_*.png')))
            advanced = json.loads((root / 'texture-advanced-report.json').read_text('utf-8'))
            self.assertGreaterEqual(len(advanced['detailMacroAssets']), 2)

    def test_texture_array_plan_groups_equal_sized_roles(self):
        rows = [
            {'source': 'a.png', 'role': 'albedo', 'output': {'width': 512, 'height': 512}},
            {'source': 'b.png', 'role': 'albedo', 'output': {'width': 512, 'height': 512}},
            {'source': 'n.png', 'role': 'normal', 'output': {'width': 512, 'height': 512}},
        ]
        plan = build_texture_array_plan(rows)
        self.assertEqual(len(plan['arrays']), 1)
        self.assertEqual(plan['arrays'][0]['layers'], 2)

    def test_uv_rebind_plan_marks_mesh_rewrite_unapplied(self):
        manifest = {
            'pageInfo': {'0': {'width': 256, 'height': 256}},
            'entries': [{'source': 'a.png', 'setKey': 'a', 'role': 'albedo', 'page': 0, 'x': 64, 'y': 32, 'width': 64, 'height': 128}],
        }
        plan = build_uv_rebind_plan(manifest)
        self.assertFalse(plan['meshRewriteApplied'])
        self.assertEqual(plan['entries'][0]['uvTransform']['scale'], [0.25, 0.5])
        self.assertEqual(plan['entries'][0]['uvTransform']['offset'], [0.25, 0.125])

    def test_virtual_texture_page_plan_covers_mips(self):
        plan = build_virtual_texture_page_plan(4096, 2048, 128, 4)
        self.assertGreater(plan['totalPages'], 1)
        self.assertEqual(plan['levels'][0]['pagesX'], 32)
        self.assertEqual(plan['levels'][0]['pagesY'], 16)
        self.assertEqual(plan['levels'][-1]['pages'], 1)

    def test_material_instance_plan_detects_duplicate_sets(self):
        rows = [
            {'source': 'a1.png', 'sourceSha256': 'x', 'setKey': 'a', 'role': 'albedo'},
            {'source': 'a2.png', 'sourceSha256': 'n', 'setKey': 'a', 'role': 'normal'},
            {'source': 'b1.png', 'sourceSha256': 'x', 'setKey': 'b', 'role': 'albedo'},
            {'source': 'b2.png', 'sourceSha256': 'n', 'setKey': 'b', 'role': 'normal'},
        ]
        plan = build_material_instance_plan(rows)
        self.assertEqual(plan['estimatedMaterialInstancesSaved'], 1)
        self.assertEqual(plan['duplicateMaterialGroups'][0]['canonicalSet'], 'a')

    def test_coherent_atlas_uses_same_uv_slot_across_pbr_roles(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            files = []
            for set_name, base in [('walla', (80, 100, 120)), ('wallb', (120, 80, 70))]:
                albedo = root / f'{set_name}_albedo.png'
                normal = root / f'{set_name}_normal.png'
                self.make_rgb(albedo, 64, 64, base)
                Image.new('RGB', (64, 64), (128, 128, 255)).save(normal)
                files.extend([albedo, normal])
            pack = root / 'coherent.zip'
            with zipfile.ZipFile(pack, 'w') as zf:
                for path in files:
                    zf.write(path, path.name)
            TextureOptimizer().run({'input_path': str(pack), 'params': {'targetMin': 64, '_originalFilename': pack.name}}, lambda *_: None)
            manifest = json.loads((root / 'texture-atlas-manifest.json').read_text('utf-8'))
            self.assertTrue(manifest['coherentLayoutAcrossRoles'])
            for set_name in ('walla', 'wallb'):
                entries = [e for e in manifest['entries'] if e['setKey'] == set_name and e['role'] in {'albedo', 'normal'}]
                self.assertEqual(len(entries), 2)
                slots = {(e['page'], e['x'], e['y'], e['width'], e['height']) for e in entries}
                self.assertEqual(len(slots), 1)


if __name__ == '__main__':
    unittest.main()
