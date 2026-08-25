# Run with: blender -b --python apply_texture_uv_rebind.py -- --input scene.glb --output scene_atlas_candidate.glb --plan texture-uv-rebind-plan.json --mapping material_set_mapping.json
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
import bpy


def args_after_double_dash():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--input', required=True); p.add_argument('--output', required=True); p.add_argument('--plan', required=True); p.add_argument('--mapping', required=True)
    return p.parse_args(argv)


def main():
    a = args_after_double_dash()
    src, dst = Path(a.input).resolve(), Path(a.output).resolve()
    if src == dst:
        raise RuntimeError('Refusing to overwrite source asset')
    plan = json.loads(Path(a.plan).read_text(encoding='utf-8'))
    mapping = json.loads(Path(a.mapping).read_text(encoding='utf-8'))
    transforms = {}
    for e in plan.get('entries', []):
        transforms.setdefault(e['setKey'], e['uvTransform'])
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(src))
    changed_loops = 0; changed_objects = 0
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH' or not obj.data.uv_layers:
            continue
        uv_layer = obj.data.uv_layers.active.data
        touched = False
        for poly in obj.data.polygons:
            if poly.material_index >= len(obj.data.materials):
                continue
            mat = obj.data.materials[poly.material_index]
            if not mat:
                continue
            set_key = mapping.get(mat.name)
            transform = transforms.get(set_key)
            if not transform:
                continue
            su, sv = transform['scale']; ou, ov = transform['offset']
            for li in poly.loop_indices:
                uv = uv_layer[li].uv
                uv.x = uv.x * su + ou
                uv.y = uv.y * sv + ov
                changed_loops += 1
                touched = True
        if touched: changed_objects += 1
    if changed_loops == 0:
        raise RuntimeError('No UV loops changed; material mapping does not match imported asset')
    dst.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(dst), export_format='GLB')
    report = dst.with_suffix('.uv-rebind-report.json')
    report.write_text(json.dumps({'ok': True, 'source': str(src), 'output': str(dst), 'changedObjects': changed_objects, 'changedUvLoops': changed_loops, 'runtimeRenderBackVerified': False}, indent=2), encoding='utf-8')

if __name__ == '__main__': main()
