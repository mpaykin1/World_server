# Candidate-only UV repair + atlas transform. Never overwrites the input asset.
# blender -b --python autofix_uv_and_atlas.py -- --input scene.glb --output scene_uv_candidate.glb --plan texture-uv-rebind-plan.json --mapping material_set_mapping.json
from __future__ import annotations
import argparse, json, math, sys
from pathlib import Path
import bpy


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--input', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--plan', required=True)
    p.add_argument('--mapping', required=True)
    p.add_argument('--margin', type=float, default=0.02)
    p.add_argument('--force-repack', action='store_true')
    return p.parse_args(argv)


def uv_health(obj):
    if obj.type != 'MESH' or not obj.data.polygons:
        return {'hasUv': False, 'outOfBounds': 0, 'nonFinite': 0, 'loops': 0, 'needsRepair': False}
    if not obj.data.uv_layers:
        return {'hasUv': False, 'outOfBounds': 0, 'nonFinite': 0, 'loops': len(obj.data.loops), 'needsRepair': True}
    layer = obj.data.uv_layers.active.data
    oob = 0; bad = 0
    for loop in layer:
        u, v = float(loop.uv.x), float(loop.uv.y)
        if not math.isfinite(u) or not math.isfinite(v): bad += 1
        if u < -0.001 or u > 1.001 or v < -0.001 or v > 1.001: oob += 1
    loops = len(layer)
    return {'hasUv': True, 'outOfBounds': oob, 'nonFinite': bad, 'loops': loops, 'needsRepair': bad > 0 or (loops and oob / loops > 0.25)}


def smart_unwrap(obj, margin):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name='UVMap')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=max(0.001, min(float(margin), 0.2)))
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)


def main():
    a = parse_args(); src = Path(a.input).resolve(); dst = Path(a.output).resolve()
    if src == dst: raise RuntimeError('Refusing to overwrite source asset')
    if not src.is_file(): raise RuntimeError(f'Input missing: {src}')
    plan = json.loads(Path(a.plan).read_text(encoding='utf-8'))
    mapping = json.loads(Path(a.mapping).read_text(encoding='utf-8'))
    transforms = {}
    for e in plan.get('entries', []): transforms.setdefault(str(e.get('setKey')), e.get('uvTransform'))
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(src))
    health_before = {}; repaired = []
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH': continue
        h = uv_health(obj); health_before[obj.name] = h
        if a.force_repack or h['needsRepair']:
            smart_unwrap(obj, a.margin); repaired.append(obj.name)
    changed_loops = 0; changed_objects = 0
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH' or not obj.data.uv_layers: continue
        layer = obj.data.uv_layers.active.data; touched = False
        for poly in obj.data.polygons:
            if poly.material_index >= len(obj.data.materials): continue
            mat = obj.data.materials[poly.material_index]
            if not mat: continue
            set_key = mapping.get(mat.name); tr = transforms.get(str(set_key))
            if not tr: continue
            su, sv = tr['scale']; ou, ov = tr['offset']
            for li in poly.loop_indices:
                uv = layer[li].uv; uv.x = uv.x * su + ou; uv.y = uv.y * sv + ov
                changed_loops += 1; touched = True
        if touched: changed_objects += 1
    if changed_loops == 0: raise RuntimeError('No UV loops changed; material mapping does not match plan')
    dst.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(dst), export_format='GLB')
    report = {
        'ok': True, 'source': str(src), 'output': str(dst), 'repairedObjects': repaired,
        'healthBefore': health_before, 'changedObjects': changed_objects, 'changedUvLoops': changed_loops,
        'sourceOverwritten': False, 'renderBackVerified': False,
        'promotionRule': 'Do not replace production asset until visual + runtime gates pass.'
    }
    dst.with_suffix('.uv-autofix-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')

if __name__ == '__main__': main()
