from __future__ import annotations

import argparse
import json
import os
import sys

import bpy


def args_after_dash():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--params", required=True)
    return parser.parse_args(argv)


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def main():
    args = args_after_dash()
    params = json.load(open(args.params, "r", encoding="utf-8"))
    obj = bpy.data.objects.get("Cube.001")
    if obj is None:
        raise RuntimeError("Cube.001 not found in procedural_building.blend")
    mod = obj.modifiers.get("GeometryNodes")
    if mod is None or mod.node_group is None:
        raise RuntimeError("GeometryNodes modifier not found on Cube.001")

    values = {
        "floor": int(clamp(int(params.get("floor", 8)), 1, 50)),
        "length": int(clamp(int(params.get("length", 8)), 1, 40)),
        "width": int(clamp(int(params.get("width", 4)), 1, 40)),
        "AC UNIT": float(clamp(float(params.get("acUnit", 0.72)), 0, 1)),
        "Roof Probability": float(clamp(float(params.get("roofProbability", 0.51)), 0, 1)),
        "Clothline Probability": float(clamp(float(params.get("clothlineProbability", 0.70)), 0, 1)),
        "Lights": float(clamp(float(params.get("lights", 0.55)), 0, 1)),
        "window type": float(clamp(float(params.get("windowType", 0.75)), 0, 1)),
        "window open amount": float(clamp(float(params.get("windowOpenAmount", 0.0)), 0, 1)),
        "curtain close": float(clamp(float(params.get("curtainClose", 0.0)), 0, 1)),
        "closed/open store": float(clamp(float(params.get("closedOpenStore", 0.60)), 0, 1)),
        "roof on store": float(clamp(float(params.get("roofOnStore", 0.59)), 0, 1)),
        "object on ground": float(clamp(float(params.get("objectOnGround", 1.0)), 0, 1)),
        "store sign": float(clamp(float(params.get("storeSign", 0.75)), 0, 1)),
        "object on roof": float(clamp(float(params.get("objectOnRoof", 0.84)), 0, 1)),
        "randomise": int(params.get("randomise", 0)),
        "deform": 1,
        "low poly": int(bool(params.get("lowPoly", 0))),
    }

    sockets = {item.name: item.identifier for item in mod.node_group.interface.items_tree if item.item_type == "SOCKET" and item.in_out == "INPUT"}
    for name, value in values.items():
        identifier = sockets.get(name)
        if identifier:
            try:
                mod[identifier] = value
            except Exception as exc:
                print("AI3D_BUILDING_PARAM_WARNING", name, exc)

    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
    generated = bpy.data.objects.new("AI3D_GeneratedBuilding", mesh)
    generated.matrix_world = obj.matrix_world.copy()
    bpy.context.scene.collection.objects.link(generated)

    for scene_obj in bpy.context.scene.objects:
        scene_obj.select_set(False)
        scene_obj.hide_render = scene_obj != generated
    generated.hide_render = False
    generated.select_set(True)
    bpy.context.view_layer.objects.active = generated

    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    print("AI3D_BUILDING_OK", out, len(mesh.vertices), len(mesh.polygons))


if __name__ == "__main__":
    main()
