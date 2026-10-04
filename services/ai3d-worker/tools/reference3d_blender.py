from __future__ import annotations

import argparse
import json
import math
import os
import sys
import traceback
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

TRACKED_DATABLOCKS = (
    "objects", "collections", "meshes", "armatures", "actions", "materials",
    "images", "cameras", "lights", "node_groups", "textures",
)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="World Server REFERENCE3D Blender finalizer")
    parser.add_argument("--out", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--cleanup", action="store_true")
    parser.add_argument("--ensure-uv", action="store_true")
    parser.add_argument("--decimate-ratio", type=float, default=1.0)
    parser.add_argument("--expect-animations", action="store_true")
    parser.add_argument("--require-manifold", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--reimport-cap-mb", type=int, default=250)
    return parser.parse_args(argv)


def preflight_runtime_dependencies():
    missing = []
    try:
        import numpy  # noqa: F401 - required by Blender's glTF add-on on distro builds
    except ImportError:
        missing.append("numpy")
    if missing:
        names = ", ".join(missing)
        raise RuntimeError(
            "REFERENCE3D Blender runtime dependency missing: " + names
            + ". Install python3-numpy or provide it in Blender's Python environment."
        )


def selected_meshes():
    objects = [obj for obj in bpy.context.selected_objects if obj.type == "MESH" and not obj.hide_get()]
    if not objects:
        raise RuntimeError("REFERENCE3D requires explicitly selected visible mesh objects")
    return objects


def capture_context():
    active = bpy.context.view_layer.objects.active
    return {
        "selected": [obj.name for obj in bpy.context.selected_objects],
        "active": active.name if active else None,
        "mode": active.mode if active else "OBJECT",
    }


def restore_context(state):
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except RuntimeError:
            pass
    for obj in bpy.context.view_layer.objects:
        obj.select_set(False)
    for name in state["selected"]:
        obj = bpy.data.objects.get(name)
        if obj and obj.name in bpy.context.view_layer.objects:
            obj.select_set(True)
    active = bpy.data.objects.get(state["active"]) if state["active"] else None
    if active and active.name in bpy.context.view_layer.objects:
        bpy.context.view_layer.objects.active = active


def push_undo_checkpoint():
    if bpy.app.background:
        return {"status": "process-isolated", "reason": "headless-source-not-saved"}
    try:
        bpy.ops.ed.undo_push(message="REFERENCE3D before finalize")
        return {"status": "pushed", "message": "REFERENCE3D before finalize"}
    except RuntimeError as exc:
        return {"status": "unavailable", "reason": str(exc)[:160]}


def is_deform_sensitive(obj):
    has_armature = any(mod.type == "ARMATURE" for mod in obj.modifiers)
    return bool(obj.data.shape_keys) or has_armature


def non_manifold_edges(objects):
    count = 0
    for obj in objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        count += sum(1 for edge in bm.edges if not edge.is_manifold)
        bm.free()
    return count


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
        "nonManifoldEdges": non_manifold_edges(objects),
    }


def world_bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    if not points:
        return None
    values = [
        min(p.x for p in points), min(p.y for p in points), min(p.z for p in points),
        max(p.x for p in points), max(p.y for p in points), max(p.z for p in points),
    ]
    return values if all(math.isfinite(v) for v in values) else None


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
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for scene_obj in bpy.context.view_layer.objects:
        scene_obj.select_set(False)
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


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


def ensure_uv(obj):
    if len(obj.data.uv_layers):
        return {"object": obj.name, "status": "preserved", "layers": len(obj.data.uv_layers)}
    activate_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    return {"object": obj.name, "status": "generated", "layers": len(obj.data.uv_layers)}


def export_glb(objects, output):
    if output.exists():
        raise RuntimeError("Output already exists; use --overwrite to replace it")
    for obj in bpy.context.view_layer.objects:
        obj.select_set(False)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    if "use_active_scene" not in props:
        raise RuntimeError("Blender glTF exporter lacks required use_active_scene isolation")
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", use_selection=True, use_active_scene=True,
        export_apply=True, export_texcoords=True, export_normals=True,
        export_materials="EXPORT", export_cameras=False, export_lights=False,
    )


def datablock_snapshot():
    return {
        name: {item.as_pointer() for item in getattr(bpy.data, name)}
        for name in TRACKED_DATABLOCKS
    }


def created_datablocks(before):
    return {
        name: [item for item in getattr(bpy.data, name) if item.as_pointer() not in before[name]]
        for name in TRACKED_DATABLOCKS
    }


def find_layer_collection(layer, collection):
    if layer.collection == collection:
        return layer
    for child in layer.children:
        match = find_layer_collection(child, collection)
        if match:
            return match
    return None


def remove_created(created):
    for name in TRACKED_DATABLOCKS:
        store = getattr(bpy.data, name)
        for item in list(created.get(name, [])):
            try:
                store.remove(item, do_unlink=True)
            except (ReferenceError, RuntimeError, TypeError):
                try:
                    store.remove(item)
                except (ReferenceError, RuntimeError):
                    pass


def reimport_verify(output, expected, args):
    cap_bytes = max(1, args.reimport_cap_mb) * 1024 * 1024
    if output.stat().st_size > cap_bytes:
        return {"checks": {"reimportUnderCap": False}, "issues": ["reimport-size-cap-exceeded"]}
    before = datablock_snapshot()
    temp = bpy.data.collections.new("REFERENCE3D_VERIFY_TEMP")
    bpy.context.scene.collection.children.link(temp)
    layer = find_layer_collection(bpy.context.view_layer.layer_collection, temp)
    if layer:
        bpy.context.view_layer.active_layer_collection = layer
    bpy.ops.import_scene.gltf(filepath=str(output))
    created = created_datablocks(before)
    imported = [obj for obj in created["objects"] if obj.type == "MESH"]
    summary = mesh_summary(imported) if imported else {
        "meshCount": 0, "materialCount": 0, "uvLayerCount": 0, "nonManifoldEdges": 0
    }
    bounds = world_bounds(imported)
    checks = verification_checks(output, expected, summary, bounds, created, args)
    remove_created(created)
    return {"checks": checks, "bounds": bounds, "summary": summary, "importedActions": len(created["actions"]), "issues": []}


def verification_checks(output, expected, summary, bounds, created, args):
    return {
        "fileNonEmpty": output.exists() and output.stat().st_size > 0,
        "reimportUnderCap": output.stat().st_size <= max(1, args.reimport_cap_mb) * 1024 * 1024,
        "finiteWorldBounds": bounds is not None,
        "meshCountStable": summary["meshCount"] == expected["meshCount"],
        "materialPresence": summary["materialCount"] > 0,
        "uvPresence": summary["uvLayerCount"] > 0,
        "nonManifoldEdgesReported": isinstance(summary["nonManifoldEdges"], int),
        "manifoldIfRequired": (not args.require_manifold) or summary["nonManifoldEdges"] == 0,
        "animationClipsPreserved": (not args.expect_animations) or len(created["actions"]) > 0,
    }


def write_report(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def run(args):
    output = Path(os.path.abspath(args.out))
    report_path = Path(os.path.abspath(args.report))
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists() and args.overwrite:
        output.unlink()
    objects = selected_meshes()
    target_names = [obj.name for obj in objects]
    checkpoint = push_undo_checkpoint()
    before = {**mesh_summary(objects), "bounds": world_bounds(objects)}
    operations = {"cleanup": [], "topology": [], "uv": []}
    if args.cleanup:
        operations["cleanup"] = [cleanup_object(obj) for obj in objects]
    operations["topology"] = [optimize_topology(obj, args.decimate_ratio) for obj in objects]
    if args.ensure_uv:
        operations["uv"] = [ensure_uv(obj) for obj in objects]
    after = {**mesh_summary(objects), "bounds": world_bounds(objects)}
    export_glb(objects, output)
    verification = reimport_verify(output, after, args)
    return output, report_path, target_names, checkpoint, before, after, operations, verification


def main():
    args = parse_args()
    preflight_runtime_dependencies()
    context = capture_context()
    try:
        output, report_path, targets, checkpoint, before, after, operations, verification = run(args)
        report = {
            "schemaVersion": "1.1.0",
            "tool": "REFERENCE3D_BLENDER_FINALIZER",
            "activeScene": bpy.context.scene.name,
            "targets": targets,
            "selectionScoped": True,
            "checkpoint": checkpoint,
            "before": before,
            "after": after,
            "operations": operations,
            "export": {"name": output.name, "bytes": output.stat().st_size if output.exists() else 0},
            "verification": verification,
            "userVerdict": "UNSET",
        }
        write_report(report_path, report)
        failed = [name for name, passed in verification["checks"].items() if not passed]
        if failed:
            raise RuntimeError("REFERENCE3D verification failed: " + ", ".join(failed))
        print("REFERENCE3D_BLENDER_OK", output.name, report_path.name)
    finally:
        restore_context(context)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(2)
