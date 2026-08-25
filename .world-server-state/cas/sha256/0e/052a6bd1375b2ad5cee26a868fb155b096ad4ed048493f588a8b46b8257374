"""Blender helper for Texture Quality V7.
Run inside Blender:
  blender scene.blend --background --python scan_texel_density.py -- --out texel-density.json
The script measures triangle world area vs active UV area per material and never edits the source scene.
"""
from __future__ import annotations
import argparse, json, math, sys
from pathlib import Path


def _args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--out', required=True)
    return p.parse_args(argv)


def triangle_area(a, b, c):
    return ((b - a).cross(c - a)).length * 0.5


def uv_triangle_area(a, b, c):
    return abs((b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x)) * 0.5


def main():
    import bpy
    args = _args()
    by_material = {}
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        eval_obj = obj.evaluated_get(depsgraph)
        mesh = eval_obj.to_mesh()
        try:
            uv = mesh.uv_layers.active.data if mesh.uv_layers.active else None
            if uv is None:
                continue
            mesh.calc_loop_triangles()
            for tri in mesh.loop_triangles:
                if tri.material_index >= len(obj.material_slots):
                    continue
                mat = obj.material_slots[tri.material_index].material
                key = mat.name if mat else f'material_{tri.material_index}'
                p = [obj.matrix_world @ mesh.vertices[i].co for i in tri.vertices]
                u = [uv[i].uv for i in tri.loops]
                row = by_material.setdefault(key, {'setKey': key, 'worldArea': 0.0, 'uvArea': 0.0, 'textureWidth': 1, 'textureHeight': 1})
                row['worldArea'] += triangle_area(*p)
                row['uvArea'] += uv_triangle_area(*u)
        finally:
            eval_obj.to_mesh_clear()
    Path(args.out).write_text(json.dumps({'schemaVersion': 1, 'samples': list(by_material.values())}, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
