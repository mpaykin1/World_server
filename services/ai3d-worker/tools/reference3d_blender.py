from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

import bmesh
import bpy


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="World Server REFERENCE3D Blender finalizer")
    parser.add_argument("--out", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--cleanup", action="store_true")
    parser.add_argument("--ensure-uv", action="store_true")
    parser.add_argument("--decimate-ratio", type=float, default=1.0)
    parser.add_argument("--expect-animations", action="store_true")
    return parser.parse_args(argv)


def selected_meshes():
    objects = [obj for obj in bpy.context.selected_objects if obj.type == "MESH" and not obj.hide_get()]
    if not objects:
        raise RuntimeError("REFERENCE3D requires explicitly selected visible mesh objects")
    return objects


def is_deform_sensitive(obj):
    has_armature = any(mod.type == "ARMATURE" for mod in obj.modifiers)
    return bool(obj.data.shape_keys) or has_armature


def mesh_summary(objects):
    material_names = set()
    uv_layers = 0
    faces = 0
    for obj in objects:
        faces += len(obj.data.polygons)
        uv_layers += len(obj.data.uv_layers)
        for slot in obj.material_slots:
            if slot.material:
                material_names.add(slot.material.name)
    return {
        "objectCount": len(objects),
        "meshCount": len(objects),
        "faceCount": faces,
        "materialCount": len(material_names),
        "uvLayerCount": uv_layers,
    }


def world_bounds(objects):
    points = []
    for obj in objects:
        points.extend(obj.matrix_world @ mathutils_vector(corner) for corner in obj.bound_box)
    if not points:
        return None
    values = [
        min(p.x for p in points), min(p.y for p in points), min(p.z for p in points),
        max(p.x for p in points), max(p.y for p in points), max(p.z for p in points),
    ]
    return values if all(math.isfinite(v) for v in values) else None


def mathutils_vector(values):
    from mathutils import Vector
    return Vector(values)


def cleanup_object(obj, threshold=0.0001):
    if is_deform_sensitive(obj):
        return {"object": obj.name, "status": "skipped-deform-sensitive"}
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=threshold)
    if bm.faces:
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.validate(clean_customdata=False)
    obj.data.update()
    return {"object": obj.name, "status": "cleaned", "mergedVertices": before - len(obj.data.vertices)}


def activate_only(obj):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    for scene_obj in bpy.context.view_layer.objects:
        scene_obj.select_set(False)
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def ensure_uv(obj):
    if len(obj.data.uv_layers):
        return {"object": obj.name, "status": "preserved", "layers": len(obj.data.uv_layers)}
    activate_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    return {"object": obj.name, "status": "generated", "layers": len(obj.data.uv_layers)}


def optimize_topology(obj, ratio):
    ratio = max(0.05, min(1.0, float(ratio)))
    if ratio >= 0.999:
        return {"object": obj.name, "status": "preserved", "ratio": 1.0}
    if is_deform_sensitive(obj):
        return {"object": obj.name, "status": "skipped-deform-sensitive", "ratio": ratio}
    activate_only(obj)
    modifier = obj.modifiers.new(name="REFERENCE3D_Decimate", type="DECIMATE")
    modifier.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return {"object": obj.name, "status": "optimized", "ratio": ratio}


def export_glb(objects, output):
    for obj in bpy.context.view_layer.objects:
        obj.select_set(False)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    kwargs = {
        "filepath": str(output),
        "export_format": "GLB",
        "use_selection": True,
        "export_apply": True,
        "export_texcoords": True,
        "export_normals": True,
        "export_materials": "EXPORT",
        "export_cameras": False,
        "export_lights": False,
    }
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    if "use_active_scene" in props:
        kwargs["use_active_scene"] = True
    bpy.ops.export_scene.gltf(**kwargs)


def find_layer_collection(layer, collection):
    if layer.collection == collection:
        return layer
    for child in layer.children:
        match = find_layer_collection(child, collection)
        if match:
            return match
    return None


def reimport_verify(output, expected, expect_animations):
    before_objects = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    temp = bpy.data.collections.new("REFERENCE3D_VERIFY_TEMP")
    bpy.context.scene.collection.children.link(temp)
    layer = find_layer_collection(bpy.context.view_layer.layer_collection, temp)
    if layer:
        bpy.context.view_layer.active_layer_collection = layer
    bpy.ops.import_scene.gltf(filepath=str(output))
    created = [obj for obj in bpy.data.objects if obj not in before_objects]
    imported = [obj for obj in created if obj.type == "MESH"]
    imported_actions = [action for action in bpy.data.actions if action not in before_actions]
    summary = mesh_summary(imported) if imported else {"meshCount": 0, "materialCount": 0, "uvLayerCount": 0}
    bounds = world_bounds(imported)
    checks = {
        "fileNonEmpty": output.exists() and output.stat().st_size > 0,
        "finiteWorldBounds": bounds is not None,
        "meshCountStable": summary["meshCount"] == expected["meshCount"],
        "materialPresence": summary["materialCount"] > 0,
        "uvPresence": summary["uvLayerCount"] > 0,
        "animationClipsPreserved": (not expect_animations) or len(imported_actions) > 0,
    }
    cleanup_imported(created, imported_actions, temp)
    return {"checks": checks, "bounds": bounds, "summary": summary, "importedActions": len(imported_actions)}


def cleanup_imported(objects, actions, collection):
    for obj in objects:
        if obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)
    for action in actions:
        if action.name in bpy.data.actions:
            bpy.data.actions.remove(action)
    if collection and collection.name in bpy.data.collections:
        bpy.data.collections.remove(collection)


def write_report(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    args = parse_args()
    output = Path(os.path.abspath(args.out))
    report_path = Path(os.path.abspath(args.report))
    output.parent.mkdir(parents=True, exist_ok=True)
    objects = selected_meshes()
    before = mesh_summary(objects)
    before["bounds"] = world_bounds(objects)
    operations = {"cleanup": [], "uv": [], "topology": []}
    if args.cleanup:
        operations["cleanup"] = [cleanup_object(obj) for obj in objects]
    if args.ensure_uv:
        operations["uv"] = [ensure_uv(obj) for obj in objects]
    operations["topology"] = [optimize_topology(obj, args.decimate_ratio) for obj in objects]
    after = mesh_summary(objects)
    after["bounds"] = world_bounds(objects)
    export_glb(objects, output)
    verification = reimport_verify(output, after, args.expect_animations)
    report = {
        "schemaVersion": "1.0.0",
        "tool": "REFERENCE3D_BLENDER_FINALIZER",
        "activeScene": bpy.context.scene.name,
        "selectionScoped": True,
        "before": before,
        "after": after,
        "operations": operations,
        "export": {"path": output.name, "bytes": output.stat().st_size if output.exists() else 0},
        "verification": verification,
        "userVerdict": "UNSET",
    }
    write_report(report_path, report)
    failed = [name for name, passed in verification["checks"].items() if not passed]
    if failed:
        raise RuntimeError("REFERENCE3D verification failed: " + ", ".join(failed))
    print("REFERENCE3D_BLENDER_OK", output, report_path)


if __name__ == "__main__":
    main()
