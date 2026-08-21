from __future__ import annotations

import argparse
import json
import os
import sys

import bpy


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--params", required=True)
    return parser.parse_args(argv)


def main():
    args = parse_args()
    source = os.path.abspath(args.source)
    if source not in sys.path:
        sys.path.insert(0, source)
    import procgen_maps

    params = json.load(open(args.params, "r", encoding="utf-8"))
    procgen_maps.register()
    scene = bpy.context.scene
    cfg = scene.procgen_maps
    preset = str(params.get("preset", "METROPOLE")).upper()
    if preset not in {"METROPOLE", "KLEINSTADT", "DORF", "INDUSTRIAL"}:
        preset = "METROPOLE"
    cfg.preset = preset
    cfg.seed = int(params.get("seed", 42))

    terrain = bool(params.get("terrain", True))
    city = bool(params.get("city", True))
    dungeon = bool(params.get("dungeon", False))
    if not (terrain or city or dungeon):
        city = True

    if terrain:
        bpy.ops.procgen_maps.generate_terrain()
    if city:
        bpy.ops.procgen_maps.generate_city()
    if dungeon:
        bpy.ops.procgen_maps.generate_dungeon()

    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=True,
    )

    verts = faces = meshes = 0
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and obj.data:
            meshes += 1
            verts += len(obj.data.vertices)
            faces += len(obj.data.polygons)
    stats = {"preset": preset, "seed": cfg.seed, "terrain": terrain, "city": city, "dungeon": dungeon, "meshObjects": meshes, "vertices": verts, "faces": faces}
    with open(os.path.splitext(out)[0] + ".json", "w", encoding="utf-8") as handle:
        json.dump(stats, handle, ensure_ascii=False, indent=2)
    print("AI3D_PROCGEN_OK", out, json.dumps(stats))
    procgen_maps.unregister()


if __name__ == "__main__":
    main()
