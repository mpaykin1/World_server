from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

import bpy
import bmesh
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
from PIL import Image
from ai3d.material_profiles import classify_object, deterministic_variation, profile_for
from ai3d.semantic_protection import semantic_decision


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--config", required=True)
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def _operator_kwargs(op, kwargs):
    try:
        props = {p.identifier for p in op.get_rna_type().properties}
        return {k: v for k, v in kwargs.items() if k in props}
    except Exception:
        return kwargs


def import_model(path: Path):
    ext = path.suffix.lower()
    if ext in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif ext == ".obj":
        if hasattr(bpy.ops.wm, "obj_import"):
            bpy.ops.wm.obj_import(filepath=str(path))
        else:
            bpy.ops.import_scene.obj(filepath=str(path))
    elif ext == ".ply":
        if hasattr(bpy.ops.wm, "ply_import"):
            bpy.ops.wm.ply_import(filepath=str(path))
        else:
            bpy.ops.import_mesh.ply(filepath=str(path))
    else:
        raise RuntimeError(f"Unsupported input format: {ext}")


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]



def object_bounds_rows():
    rows = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in mesh_objects():
        try:
            ev = obj.evaluated_get(depsgraph)
            points = [ev.matrix_world @ Vector(c) for c in ev.bound_box]
            mins = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
            maxs = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
            center = (mins + maxs) * 0.5
            radius = max((maxs - mins).length * 0.5, 0.0)
            surface_area = 0.0
            try:
                ev.data.calc_loop_triangles()
                for tri in ev.data.loop_triangles:
                    a = ev.matrix_world @ ev.data.vertices[tri.vertices[0]].co
                    b = ev.matrix_world @ ev.data.vertices[tri.vertices[1]].co
                    c = ev.matrix_world @ ev.data.vertices[tri.vertices[2]].co
                    surface_area += ((b - a).cross(c - a)).length * 0.5
            except Exception:
                surface_area = 0.0
            rows.append({"name": obj.name_full, "center": [center.x, center.y, center.z], "radius": radius, "surfaceArea": surface_area})
        except Exception:
            continue
    return rows


def geometry_salience_ratio(obj):
    if obj.type != "MESH" or not obj.data.edges:
        return 0.0
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.edges.ensure_lookup_table()
    important = 0
    total = max(len(bm.edges), 1)
    for edge in bm.edges:
        if edge.is_boundary or edge.seam:
            important += 1
            continue
        if len(edge.link_faces) == 2:
            try:
                if edge.calc_face_angle(0.0) >= math.radians(38.0):
                    important += 1
            except Exception:
                pass
    bm.free()
    return min(1.0, important / total)

def scene_stats():
    meshes = mesh_objects()
    triangles = 0
    vertices = 0
    material_ids = set()
    shape_key_meshes = 0
    draw_call_estimate = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        vertices += len(obj.data.vertices)
        draw_call_estimate += max(1, len([slot for slot in obj.material_slots if slot.material]))
        for slot in obj.material_slots:
            if slot.material:
                material_ids.add(slot.material.name_full)
        if obj.data.shape_keys and obj.data.shape_keys.key_blocks:
            shape_key_meshes += 1
    return {
        "meshObjects": len(meshes),
        "vertices": vertices,
        "triangles": triangles,
        "materials": len(material_ids),
        "images": len([x for x in bpy.data.images if x.source != "VIEWER"]),
        "armatures": len([x for x in bpy.context.scene.objects if x.type == "ARMATURE"]),
        "shapeKeyMeshes": shape_key_meshes,
        "drawCallEstimate": draw_call_estimate,
        "estimatedGeometryBytes": vertices * 32 + triangles * 12,
        "texturePixels": sum(int(img.size[0]) * int(img.size[1]) for img in bpy.data.images if img.source != "VIEWER" and img.size[0] > 0 and img.size[1] > 0),
        "objectBounds": object_bounds_rows(),
        "maxGeometrySalienceRatio": max([geometry_salience_ratio(obj) for obj in meshes], default=0.0),
    }


def _material_fingerprint(material):
    if not material:
        return None
    h = hashlib.sha256()
    h.update(str(bool(material.use_nodes)).encode())
    if material.use_nodes and material.node_tree:
        bsdf = _active_principled(material)
        if bsdf:
            for name in ("Base Color", "Roughness", "Metallic", "Alpha", "Transmission Weight", "Transmission", "Emission Color", "Emission Strength"):
                socket = _input(bsdf, name)
                if not socket:
                    continue
                h.update(name.encode())
                h.update(str(bool(socket.is_linked)).encode())
                if not socket.is_linked:
                    try:
                        value = socket.default_value
                        if hasattr(value, "__len__") and not isinstance(value, str):
                            h.update(repr(tuple(round(float(x), 6) for x in value)).encode())
                        else:
                            h.update(repr(round(float(value), 6)).encode())
                    except Exception:
                        h.update(repr(socket.default_value).encode())
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and getattr(node, "image", None):
                h.update(node.image.name_full.encode("utf-8", errors="ignore"))
                h.update(str(getattr(node, "interpolation", "")).encode())
    return h.hexdigest()


def deduplicate_identical_materials():
    canonical = {}
    replacements = []
    for obj in mesh_objects():
        for slot in obj.material_slots:
            material = slot.material
            key = _material_fingerprint(material)
            if not key:
                continue
            if key not in canonical:
                canonical[key] = material
            elif slot.material != canonical[key]:
                old = slot.material.name_full
                slot.material = canonical[key]
                replacements.append({"object": obj.name_full, "from": old, "to": canonical[key].name_full, "fingerprint": key})
    return {"uniqueMaterials": len(canonical), "replacements": len(replacements), "rows": replacements}


def _mesh_fingerprint(obj):
    if obj.type != "MESH":
        return None
    if any(m.type == "ARMATURE" for m in obj.modifiers):
        return None
    if obj.data.shape_keys and len(obj.data.shape_keys.key_blocks) > 1:
        return None
    h = hashlib.sha256()
    h.update(struct.pack("<II", len(obj.data.vertices), len(obj.data.polygons)))
    for vertex in obj.data.vertices:
        h.update(struct.pack("<3f", round(vertex.co.x, 6), round(vertex.co.y, 6), round(vertex.co.z, 6)))
    for poly in obj.data.polygons:
        h.update(struct.pack("<I", len(poly.vertices)))
        for index in poly.vertices:
            h.update(struct.pack("<I", int(index)))
    for name in _material_names(obj):
        h.update(name.encode("utf-8", errors="ignore"))
        h.update(b"\0")
    return h.hexdigest()


def deduplicate_identical_mesh_data():
    canonical = {}
    rows = []
    linked = 0
    for obj in mesh_objects():
        key = _mesh_fingerprint(obj)
        if not key:
            continue
        if key in canonical:
            source = canonical[key]
            if obj.data != source.data:
                obj.data = source.data
                linked += 1
            rows.append({"object": obj.name_full, "instanceOf": source.name_full, "fingerprint": key})
        else:
            canonical[key] = obj
    return {"linkedObjects": linked, "uniqueMeshes": len(canonical), "instances": rows}



def apply_semantic_projection(config):
    policy = dict(config.get("semanticProjection") or {})
    if not policy.get("enabled"):
        return {"status": "DISABLED", "protectedVertices": 0, "totalVertices": 0}

    raw_views = list(policy.get("views") or [])
    if not raw_views:
        raw_views = [{"maskPath": policy.get("maskPath"), "cameraPath": policy.get("cameraPath"), "weight": 1.0}]

    prepared = []
    for index, view in enumerate(raw_views):
        mask_path = Path(str(view.get("maskPath") or ""))
        camera_path = Path(str(view.get("cameraPath") or ""))
        if not mask_path.is_file() or not camera_path.is_file():
            continue
        try:
            camera_data = json.loads(camera_path.read_text(encoding="utf-8"))
            matrix_rows = camera_data.get("matrixWorld")
            if not matrix_rows or len(matrix_rows) != 4:
                continue
            mask = Image.open(mask_path).convert("L")
            cam_data = bpy.data.cameras.new(f"AI3D_SEMANTIC_PROJECTION_CAMERA_{index:02d}")
            cam = bpy.data.objects.new(f"AI3D_SEMANTIC_PROJECTION_CAMERA_{index:02d}", cam_data)
            bpy.context.scene.collection.objects.link(cam)
            cam.matrix_world = Matrix(matrix_rows)
            cam.data.lens = float(camera_data.get("lens", 55.0))
            cam.data.sensor_width = float(camera_data.get("sensorWidth", 36.0))
            cam.data.sensor_height = float(camera_data.get("sensorHeight", 32.0))
            prepared.append({"mask": mask, "pixels": mask.load(), "width": mask.size[0], "height": mask.size[1], "camera": cam, "weight": max(0.001, float(view.get("weight", 1.0)))})
        except Exception:
            continue

    min_views = int(policy.get("minObservedViews", 1))
    min_vote = float(policy.get("minVoteFraction", 0.34))
    ray_visibility = bool(policy.get("rayVisibility", False))
    fusion_mode = str(policy.get("fusionMode", "max_visible_vote"))
    if not prepared:
        return {"status": "MISSING_MASK_OR_CAMERA", "protectedVertices": 0, "totalVertices": 0, "viewCount": 0}

    depsgraph = bpy.context.evaluated_depsgraph_get()
    scene = bpy.context.scene
    protected = 0
    total = 0
    observed_total = 0
    for obj in mesh_objects():
        group = obj.vertex_groups.get("AI3D_SEMANTIC_PROTECTED") or obj.vertex_groups.new(name="AI3D_SEMANTIC_PROTECTED")
        indexes = []
        for vertex in obj.data.vertices:
            total += 1
            world = obj.matrix_world @ vertex.co
            observed = 0
            weighted_observed = 0.0
            weighted_votes = 0.0
            any_positive = False
            for view in prepared:
                cam = view["camera"]
                co = world_to_camera_view(scene, cam, world)
                if co.z <= 0 or co.x < 0 or co.x > 1 or co.y < 0 or co.y > 1:
                    continue
                if ray_visibility:
                    origin = cam.matrix_world.translation
                    direction = world - origin
                    distance = direction.length
                    if distance > 1e-6:
                        hit, location, _normal, _face, hit_obj, _matrix = scene.ray_cast(depsgraph, origin, direction.normalized(), distance=max(0.0, distance - 1e-4))
                        if hit and hit_obj is not None and hit_obj != obj:
                            continue
                observed += 1
                weight = view["weight"]
                weighted_observed += weight
                x = min(view["width"] - 1, max(0, int(co.x * (view["width"] - 1))))
                y = min(view["height"] - 1, max(0, int((1.0 - co.y) * (view["height"] - 1))))
                positive = view["pixels"][x, y] >= 128
                if positive:
                    weighted_votes += weight
                    any_positive = True
            if observed >= min_views:
                observed_total += 1
                fraction = weighted_votes / max(weighted_observed, 1e-9)
                protect = any_positive if fusion_mode == "max_visible_vote" else fraction >= min_vote
                if protect:
                    indexes.append(vertex.index)
        if indexes:
            group.add(indexes, 1.0, "REPLACE")
            protected += len(indexes)

    for view in prepared:
        cam = view["camera"]
        mask = view["mask"]
        try:
            mask.close()
        except Exception:
            pass
        if cam and cam.name in bpy.data.objects:
            cam_data = cam.data
            bpy.data.objects.remove(cam, do_unlink=True)
            try:
                bpy.data.cameras.remove(cam_data)
            except Exception:
                pass

    coverage = (protected / total) if total else 0.0
    min_cov = float(policy.get("minCoverage", 0.001))
    max_cov = float(policy.get("maxCoverage", 0.88))
    if coverage < min_cov or coverage > max_cov:
        for obj in mesh_objects():
            group = obj.vertex_groups.get("AI3D_SEMANTIC_PROTECTED")
            if group:
                obj.vertex_groups.remove(group)
        return {"status": "REJECTED_COVERAGE", "protectedVertices": protected, "totalVertices": total, "coverage": coverage, "viewCount": len(prepared), "observedVertices": observed_total}
    return {"status": "APPLIED_MULTI_VIEW" if len(prepared) > 1 else "APPLIED", "protectedVertices": protected, "totalVertices": total, "coverage": coverage, "viewCount": len(prepared), "observedVertices": observed_total, "fusionMode": fusion_mode}


def _decode_ranges_v9(ranges):
    out = []
    for pair in ranges or []:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            continue
        a, b = int(pair[0]), int(pair[1])
        if 0 <= a <= b:
            out.extend(range(a, b + 1))
    return out


def apply_mesh_native_semantic_v9(config):
    policy = dict(config.get("semanticMeshV9") or {})
    if not policy.get("enabled", True):
        return {"schemaVersion": 9, "status": "DISABLED", "protectedVertices": 0, "totalVertices": 0}
    sharp_angle = math.radians(float(policy.get("sharpAngleDegrees", 32.0)))
    min_weight = float(policy.get("minWeight", 0.55))
    protect_boundary = bool(policy.get("protectBoundary", True))
    protect_material = bool(policy.get("protectMaterialBoundaries", True))
    protect_thin = bool(policy.get("protectThinTopology", True))
    external = {}
    external_weights = {}
    external_backend = None
    # Prefer the pre-pass projection produced by semantic_mesh_v9.py. This keeps the
    # actual decimator wired to the exact evidence that was inspected by the worker.
    for object_name, row in (policy.get("protectedObjects") or {}).items():
        indices = [int(i) for i in (row.get("indices") or []) if str(i).lstrip("-").isdigit()]
        weights = [float(w) for w in (row.get("weights") or [])]
        external[str(object_name)] = set(indices)
        external_weights[str(object_name)] = {idx: (weights[pos] if pos < len(weights) else 1.0) for pos, idx in enumerate(indices)}
    if external:
        external_backend = str(policy.get("source") or "mesh_native_v9_prepass")
    result_path = Path(str(policy.get("resultPath") or ""))
    if result_path.is_file() and not external:
        try:
            native = json.loads(result_path.read_text(encoding="utf-8"))
            external_backend = native.get("backend")
            for row in native.get("objects") or []:
                name = str(row.get("object") or "")
                indices = list(row.get("protectedIndices") or _decode_ranges_v9(row.get("protectedRanges") or []))
                weights = list(row.get("protectedWeights") or [])
                external[name] = {int(i) for i in indices}
                external_weights[name] = {int(idx): (float(weights[pos]) if pos < len(weights) else 1.0) for pos, idx in enumerate(indices)}
        except Exception:
            external = {}
            external_weights = {}
    total = 0
    protected = 0
    external_protected = 0
    objects = []
    for obj in mesh_objects():
        mesh = obj.data
        if not mesh.vertices:
            continue
        group = obj.vertex_groups.get("AI3D_SEMANTIC_PROTECTED") or obj.vertex_groups.new(name="AI3D_SEMANTIC_PROTECTED")
        scores = [0.0] * len(mesh.vertices)
        degree = [0] * len(mesh.vertices)
        bm = bmesh.new(); bm.from_mesh(mesh); bm.verts.ensure_lookup_table(); bm.edges.ensure_lookup_table()
        for edge in bm.edges:
            a, b = edge.verts[0].index, edge.verts[1].index
            degree[a] += 1; degree[b] += 1
            edge_score = 0.0
            if protect_boundary and edge.is_boundary:
                edge_score = max(edge_score, 0.92)
            if edge.seam:
                edge_score = max(edge_score, 0.72)
            if len(edge.link_faces) == 2:
                try:
                    if edge.calc_face_angle(0.0) >= sharp_angle:
                        edge_score = max(edge_score, 0.86)
                except Exception:
                    pass
                if protect_material and edge.link_faces[0].material_index != edge.link_faces[1].material_index:
                    edge_score = max(edge_score, 0.84)
            if edge_score:
                scores[a] = max(scores[a], edge_score); scores[b] = max(scores[b], edge_score)
        bm.free()
        ext_name = obj.name_full if obj.name_full in external else obj.name
        ext = external.get(ext_name) or set()
        ext_weights = external_weights.get(ext_name) or {}
        selected = []
        ext_count = 0
        for i, score in enumerate(scores):
            if protect_thin and degree[i] <= 2:
                score = max(score, 0.66)
            if i in ext:
                score = max(score, float(ext_weights.get(i, 1.0)))
                ext_count += 1
            total += 1
            if score >= min_weight:
                try:
                    old = group.weight(i)
                except Exception:
                    old = 0.0
                group.add([i], max(old, score), "REPLACE")
                selected.append(i); protected += 1
        external_protected += ext_count
        objects.append({"object": obj.name_full, "vertices": len(mesh.vertices), "meshNativeProtected": len(selected), "externalProtected": ext_count})
    return {"schemaVersion": 9, "status": "APPLIED" if protected else "NO_STRUCTURAL_FEATURES", "protectedVertices": protected, "externalProtectedVertices": external_protected, "totalVertices": total, "coverage": protected / max(total, 1), "objects": objects, "group": "AI3D_SEMANTIC_PROTECTED", "externalBackend": external_backend, "combineMode": "UNION"}

def semantic_group_fraction(obj):
    group = obj.vertex_groups.get("AI3D_SEMANTIC_PROTECTED") if obj.type == "MESH" else None
    if not group or not obj.data.vertices:
        return 0.0
    count = 0
    for vertex in obj.data.vertices:
        try:
            if group.weight(vertex.index) >= 0.5:
                count += 1
        except Exception:
            pass
    return count / max(len(obj.data.vertices), 1)


def cleanup_mesh(obj, merge_distance: float):
    if obj.type != "MESH":
        return
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    if bm.verts and merge_distance > 0:
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=merge_distance)
    if bm.edges:
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=max(merge_distance, 1e-9))
    if bm.faces:
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def apply_decimate(obj, ratio: float, preserve_shape_keys: bool, preserve_animation: bool):
    if obj.type != "MESH" or ratio >= 0.999:
        return {"status": "skipped", "requestedRatio": ratio, "effectiveRatio": 1.0}
    if len(obj.data.polygons) < 64:
        return {"status": "small_mesh", "requestedRatio": ratio, "effectiveRatio": 1.0}

    has_shape_keys = bool(obj.data.shape_keys and len(obj.data.shape_keys.key_blocks) > 1)
    has_armature = any(m.type == "ARMATURE" for m in obj.modifiers)
    decision = semantic_decision(
        obj.name_full,
        _material_names(obj),
        [g.name for g in obj.vertex_groups],
        _object_surface_class(obj),
        has_armature,
        has_shape_keys,
    )
    if preserve_shape_keys and has_shape_keys:
        return {"status": "shape_keys_preserved", "requestedRatio": ratio, "effectiveRatio": 1.0, "semantic": decision.to_dict()}

    salience_ratio = geometry_salience_ratio(obj)
    semantic_fraction = semantic_group_fraction(obj)
    salience_floor = min(0.94, 0.58 + salience_ratio * 0.42) if salience_ratio >= 0.08 else 0.0
    effective_ratio = max(float(ratio), float(decision.min_ratio), salience_floor, 0.80 if semantic_fraction > 0.0 else 0.0)
    if has_armature and preserve_animation:
        effective_ratio = max(effective_ratio, 0.72)
    if effective_ratio >= 0.995:
        return {"status": "semantic_preserved", "requestedRatio": ratio, "effectiveRatio": effective_ratio, "geometrySalienceRatio": round(salience_ratio, 6), "semanticProjectedFraction": round(semantic_fraction, 6), "semantic": decision.to_dict()}

    mod = obj.modifiers.new(name="AUTO_LOD_DECIMATE", type="DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = effective_ratio
    mod.use_collapse_triangulate = True
    if semantic_fraction > 0.0:
        try:
            mod.vertex_group = "AI3D_SEMANTIC_PROTECTED"
            mod.invert_vertex_group = True
            mod.vertex_group_factor = 10.0
        except Exception:
            pass
    try:
        mod.delimit = {"NORMAL", "MATERIAL", "SEAM", "SHARP"}
    except Exception:
        pass
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception:
        try:
            obj.modifiers.remove(mod)
        except Exception:
            pass
        return {"status": "modifier_not_applied", "requestedRatio": ratio, "effectiveRatio": effective_ratio, "semantic": decision.to_dict()}
    return {"status": "applied", "requestedRatio": ratio, "effectiveRatio": effective_ratio, "geometrySalienceRatio": round(salience_ratio, 6), "semanticProjectedFraction": round(semantic_fraction, 6), "semantic": decision.to_dict()}


def _material_names(obj):
    return [slot.material.name_full for slot in obj.material_slots if slot.material]


def _object_surface_class(obj):
    return classify_object(obj.name_full, _material_names(obj))


def _active_principled(material):
    if not material or not material.use_nodes or not material.node_tree:
        return None
    for node in material.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            return node
    return None


def _input(node, name):
    try:
        return node.inputs.get(name)
    except Exception:
        return None


def material_inventory():
    rows = []
    seen = set()
    for obj in mesh_objects():
        surface_class = _object_surface_class(obj)
        for slot in obj.material_slots:
            mat = slot.material
            if not mat or mat.name_full in seen:
                continue
            seen.add(mat.name_full)
            bsdf = _active_principled(mat)
            channels = {"albedo": False, "roughness": False, "metallic": False, "normal": False}
            images = []
            if mat.use_nodes and mat.node_tree:
                for node in mat.node_tree.nodes:
                    if node.type == "TEX_IMAGE" and getattr(node, "image", None):
                        image = node.image
                        images.append({"name": image.name_full, "width": int(image.size[0]), "height": int(image.size[1])})
                if bsdf:
                    base = _input(bsdf, "Base Color")
                    rough = _input(bsdf, "Roughness")
                    metal = _input(bsdf, "Metallic")
                    normal = _input(bsdf, "Normal")
                    channels = {
                        "albedo": bool(base and base.is_linked),
                        "roughness": bool(rough and rough.is_linked),
                        "metallic": bool(metal and metal.is_linked),
                        "normal": bool(normal and normal.is_linked),
                    }
            rows.append({
                "material": mat.name_full,
                "surfaceClass": classify_object(mat.name_full, [surface_class]),
                "channels": channels,
                "images": images,
                "lowResImages": sum(1 for image in images if min(image["width"], image["height"]) < 1024),
            })
    return rows


def _linked_image_from_socket(socket):
    if not socket or not socket.is_linked:
        return None
    visited = set()
    stack = [link.from_node for link in socket.links]
    while stack:
        node = stack.pop()
        if node.as_pointer() in visited:
            continue
        visited.add(node.as_pointer())
        if node.type == "TEX_IMAGE" and getattr(node, "image", None):
            return node.image
        for input_socket in getattr(node, "inputs", []):
            if input_socket.is_linked:
                stack.extend(link.from_node for link in input_socket.links)
    return None


def image_role_inventory():
    roles = {}
    for material in bpy.data.materials:
        bsdf = _active_principled(material)
        if not bsdf:
            continue
        mapping = {
            "Base Color": "albedo",
            "Roughness": "roughness",
            "Metallic": "metallic",
            "Normal": "normal",
            "Emission Color": "emissive",
            "Emission": "emissive",
        }
        for input_name, role in mapping.items():
            image = _linked_image_from_socket(_input(bsdf, input_name))
            if image:
                roles.setdefault(image.name_full, set()).add(role)
    return {name: sorted(values) for name, values in roles.items()}


def extract_source_textures(output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)
    role_map = image_role_inventory()
    rows = []
    for index, image in enumerate(bpy.data.images):
        if image.source == "VIEWER" or image.size[0] <= 0 or image.size[1] <= 0:
            continue
        safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in image.name_full)[:80] or f"image_{index}"
        path = output_dir / f"{index:03d}_{safe}.png"
        status = "saved"
        try:
            image.save_render(str(path), scene=bpy.context.scene)
        except Exception:
            try:
                old = image.filepath_raw
                old_format = image.file_format
                image.filepath_raw = str(path)
                image.file_format = "PNG"
                image.save()
                image.filepath_raw = old
                image.file_format = old_format
            except Exception as exc:
                status = "failed:" + str(exc)
        roles = role_map.get(image.name_full) or ["generic"]
        rows.append({
            "image": image.name_full,
            "file": path.name if path.is_file() else None,
            "width": int(image.size[0]),
            "height": int(image.size[1]),
            "roles": roles,
            "status": status,
        })
    manifest = {"schemaVersion": 1, "textures": rows}
    (output_dir / "texture-source-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def _apply_micro_bevel(obj, profile):
    if obj.type != "MESH" or len(obj.data.polygons) < 16:
        return "skipped"
    if any(m.type == "ARMATURE" for m in obj.modifiers):
        return "skipped_armature"
    if obj.data.shape_keys and len(obj.data.shape_keys.key_blocks) > 1:
        return "skipped_shape_keys"
    bbox = [Vector(v) for v in obj.bound_box]
    diag = (bbox[6] - bbox[0]).length if len(bbox) >= 7 else 0.0
    if diag <= 0:
        return "skipped_bounds"
    bevel = obj.modifiers.new(name="AUTO_AAA_MICRO_BEVEL", type="BEVEL")
    bevel.width = min(diag * float(profile["bevel_scale"]), diag * 0.004, 0.02)
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(38.0)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        return "applied"
    except Exception:
        try:
            obj.modifiers.remove(bevel)
        except Exception:
            pass
        return "failed"


def _apply_safe_surface_irregularity(obj, profile, surface_class):
    if surface_class not in {"stone", "brick", "concrete", "ground", "roof"}:
        return "not_applicable"
    if obj.type != "MESH" or len(obj.data.polygons) < 128:
        return "insufficient_geometry"
    if any(m.type == "ARMATURE" for m in obj.modifiers):
        return "skipped_armature"
    if obj.data.shape_keys and len(obj.data.shape_keys.key_blocks) > 1:
        return "skipped_shape_keys"
    bbox = [Vector(v) for v in obj.bound_box]
    diag = (bbox[6] - bbox[0]).length if len(bbox) >= 7 else 0.0
    if diag <= 0:
        return "skipped_bounds"
    strength = min(diag * float(profile["displacement_hint"]), diag * 0.003)
    if strength <= 0:
        return "disabled"
    texture = bpy.data.textures.new(name=f"AAA_IRREGULARITY_{obj.name_full}", type="CLOUDS")
    texture.noise_scale = max(diag * 0.035, 0.002)
    texture.noise_depth = 2
    mod = obj.modifiers.new(name="AUTO_AAA_IRREGULARITY", type="DISPLACE")
    mod.texture = texture
    mod.strength = strength
    mod.mid_level = 0.5
    mod.texture_coords = "GLOBAL"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
        return "applied"
    except Exception:
        try:
            obj.modifiers.remove(mod)
        except Exception:
            pass
        return "failed"


def _apply_spatial_masks(obj, profile):
    if obj.type != "MESH" or not obj.data.vertices:
        return {"status": "skipped"}
    if any(m.type == "ARMATURE" for m in obj.modifiers):
        return {"status": "skipped_armature"}
    mesh = obj.data
    zs = [v.co.z for v in mesh.vertices]
    zmin = min(zs)
    zmax = max(zs)
    span = max(zmax - zmin, 1e-6)
    try:
        wet = mesh.color_attributes.get("AUTO_WETNESS") or mesh.color_attributes.new(name="AUTO_WETNESS", type="FLOAT_COLOR", domain="POINT")
        weather = mesh.color_attributes.get("AUTO_WEATHERING") or mesh.color_attributes.new(name="AUTO_WEATHERING", type="FLOAT_COLOR", domain="POINT")
    except Exception as exc:
        return {"status": "unsupported", "error": str(exc)}
    base_wet = float(profile.get("wetness", 0.0))
    base_weather = float(profile.get("weathering", 0.0))
    for vertex in mesh.vertices:
        low_factor = 1.0 - (vertex.co.z - zmin) / span
        variation = deterministic_variation(f"{obj.name_full}:{vertex.index}") * 0.5 + 0.5
        wetness = max(0.0, min(1.0, base_wet * (0.35 + 0.65 * low_factor) * (0.75 + 0.25 * variation)))
        weathering = max(0.0, min(1.0, base_weather * (0.6 + 0.4 * variation)))
        wet.data[vertex.index].color = (wetness, wetness, wetness, 1.0)
        weather.data[vertex.index].color = (weathering, weathering, weathering, 1.0)
    return {"status": "applied", "wetnessAttribute": "AUTO_WETNESS", "weatheringAttribute": "AUTO_WEATHERING"}


def _enhance_material(material, profile, seed_text):
    bsdf = _active_principled(material)
    if not bsdf:
        return {"material": material.name_full if material else "", "status": "no_principled"}
    variation = deterministic_variation(seed_text)
    changed = []

    rough = _input(bsdf, "Roughness")
    if rough and not rough.is_linked:
        current = float(rough.default_value)
        target = float(profile["roughness"])
        rough.default_value = max(0.02, min(1.0, current * 0.55 + target * 0.45 + variation * 0.025))
        changed.append("roughness")

    metallic = _input(bsdf, "Metallic")
    if metallic and not metallic.is_linked:
        current = float(metallic.default_value)
        target = float(profile["metallic"])
        metallic.default_value = max(0.0, min(1.0, current * 0.45 + target * 0.55))
        changed.append("metallic")

    base = _input(bsdf, "Base Color")
    if base and not base.is_linked:
        color = list(base.default_value)
        amount = float(profile["color_variation"]) * 0.32 * variation
        for index in range(3):
            color[index] = max(0.0, min(1.0, color[index] * (1.0 + amount)))
        base.default_value = color
        changed.append("base_color_variation")

    return {"material": material.name_full, "status": "enhanced", "changed": changed, "variationSeed": round(variation, 6)}


def apply_aaa_scene(cfg):
    aaa = cfg.get("aaaEnhancement") or {}
    if not aaa.get("enabled", True):
        return {"enabled": False, "objects": [], "materials": []}
    object_rows = []
    material_rows = []
    touched_materials = set()
    for obj in mesh_objects():
        surface_class = _object_surface_class(obj)
        profile = profile_for(surface_class)
        bevel_status = _apply_micro_bevel(obj, profile) if aaa.get("microBevel", True) else "disabled"
        irregularity = _apply_safe_surface_irregularity(obj, profile, surface_class)
        spatial_masks = _apply_spatial_masks(obj, profile)
        for poly in obj.data.polygons:
            poly.use_smooth = True
        object_rows.append({
            "object": obj.name_full,
            "surfaceClass": surface_class,
            "profile": profile,
            "microBevel": bevel_status,
            "surfaceIrregularity": irregularity,
            "spatialMasks": spatial_masks,
        })
        for slot in obj.material_slots:
            material = slot.material
            if not material or material.name_full in touched_materials:
                continue
            touched_materials.add(material.name_full)
            mat_class = classify_object(material.name_full, [surface_class])
            mat_profile = profile_for(mat_class)
            material_rows.append({
                **_enhance_material(material, mat_profile, material.name_full),
                "surfaceClass": mat_class,
                "profile": mat_profile,
            })
    return {"enabled": True, "objects": object_rows, "materials": material_rows}


def limit_textures(max_size: int):
    for image in bpy.data.images:
        if image.source == "VIEWER" or image.size[0] <= 0 or image.size[1] <= 0:
            continue
        w, h = int(image.size[0]), int(image.size[1])
        scale = min(1.0, float(max_size) / max(w, h))
        if scale < 0.999:
            nw = max(1, int(round(w * scale)))
            nh = max(1, int(round(h * scale)))
            try:
                image.scale(nw, nh)
            except Exception:
                pass


def export_glb(path: Path, web_compression: str = "none"):
    path.parent.mkdir(parents=True, exist_ok=True)
    kwargs = {
        "filepath": str(path),
        "export_format": "GLB",
        "export_yup": True,
        "export_apply": False,
        "export_animations": True,
        "export_skins": True,
        "export_morph": True,
        "export_materials": "EXPORT",
        "export_texcoords": True,
        "export_normals": True,
        "export_tangents": True,
        "export_optimize_animation_size": True,
    }
    if str(web_compression).lower() == "draco":
        kwargs.update({
            "export_draco_mesh_compression_enable": True,
            "export_draco_mesh_compression_level": 6,
            "export_draco_position_quantization": 14,
            "export_draco_normal_quantization": 10,
            "export_draco_texcoord_quantization": 12,
        })
    bpy.ops.export_scene.gltf(**_operator_kwargs(bpy.ops.export_scene.gltf, kwargs))


def bounds():
    points = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in mesh_objects():
        eval_obj = obj.evaluated_get(depsgraph)
        for corner in eval_obj.bound_box:
            points.append(eval_obj.matrix_world @ Vector(corner))
    if not points:
        return Vector((0, 0, 0)), 1.0
    mins = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maxs = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    center = (mins + maxs) * 0.5
    radius = max((maxs - mins).length * 0.5, 0.1)
    return center, radius


def look_at(obj, target):
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _remove_qa_render_objects():
    for obj in list(bpy.context.scene.objects):
        if obj.name.startswith("AUTO_QA_"):
            bpy.data.objects.remove(obj, do_unlink=True)


def setup_render(render_size: int, rig: dict):
    _remove_qa_render_objects()
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        pass
    scene.render.resolution_x = render_size
    scene.render.resolution_y = render_size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True

    world = scene.world or bpy.data.worlds.new("AUTO_QA_WORLD")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.025, 0.025, 0.03, 1.0)
        bg.inputs["Strength"].default_value = 0.35

    center = Vector(rig["center"])
    radius = float(rig["radius"])
    cam_data = bpy.data.cameras.new("AUTO_QA_CAMERA")
    cam = bpy.data.objects.new("AUTO_QA_CAMERA", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 55

    key_data = bpy.data.lights.new("AUTO_QA_KEY", type="AREA")
    key_data.energy = 1200
    key_data.shape = "DISK"
    key_data.size = max(radius * 1.5, 1.0)
    key = bpy.data.objects.new("AUTO_QA_KEY", key_data)
    scene.collection.objects.link(key)
    key.location = center + Vector((radius * 2.0, -radius * 1.5, radius * 2.5))
    look_at(key, center)

    fill_data = bpy.data.lights.new("AUTO_QA_FILL", type="AREA")
    fill_data.energy = 700
    fill_data.size = max(radius * 2.0, 1.0)
    fill = bpy.data.objects.new("AUTO_QA_FILL", fill_data)
    scene.collection.objects.link(fill)
    fill.location = center + Vector((-radius * 2.0, radius * 1.0, radius * 1.2))
    look_at(fill, center)

    return cam, center, radius


def canonical_render_rig():
    center, radius = bounds()
    return {"center": [center.x, center.y, center.z], "radius": float(radius)}


def render_views(output_dir: Path, render_size: int, rig: dict):
    output_dir.mkdir(parents=True, exist_ok=True)
    cam, center, radius = setup_render(render_size, rig)
    views = {
        "front": Vector((0.0, -1.0, 0.15)),
        "back": Vector((0.0, 1.0, 0.15)),
        "side": Vector((1.0, 0.0, 0.15)),
        "iso": Vector((1.0, -1.0, 0.75)),
    }
    distance = max(radius * 2.9, 1.5)
    for name, direction in views.items():
        direction.normalize()
        cam.location = center + direction * distance
        look_at(cam, center)
        bpy.context.scene.render.filepath = str(output_dir / f"{name}.png")
        bpy.ops.render.render(write_still=True)


def animation_sample_frames():
    animated = False
    for obj in bpy.context.scene.objects:
        data = getattr(obj, "animation_data", None)
        if data and (data.action or len(getattr(data, "nla_tracks", []))):
            animated = True
            break
    if not animated:
        return []
    start = int(bpy.context.scene.frame_start)
    end = int(bpy.context.scene.frame_end)
    if end <= start:
        return []
    middle = int(round((start + end) * 0.5))
    return sorted(set([start, middle, end]))


def render_animation_samples(output_dir: Path, render_size: int, rig: dict, frames):
    if not frames:
        return []
    output_dir.mkdir(parents=True, exist_ok=True)
    cam, center, radius = setup_render(render_size, rig)
    direction = Vector((1.0, -1.0, 0.65))
    direction.normalize()
    cam.location = center + direction * max(radius * 2.9, 1.5)
    look_at(cam, center)
    rows = []
    for frame in frames:
        bpy.context.scene.frame_set(int(frame))
        path = output_dir / f"frame_{int(frame):06d}.png"
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rows.append(path.name)
    return rows


def render_temporal_micro_motion(output_dir: Path, render_size: int, rig: dict, frames: int = 8):
    output_dir.mkdir(parents=True, exist_ok=True)
    cam, center, radius = setup_render(render_size, rig)
    distance = max(radius * 2.9, 1.5)
    rows = []
    count = max(4, min(int(frames), 16))
    for index in range(count):
        phase = -1.0 + (2.0 * index / max(count - 1, 1))
        yaw = math.radians(phase * 1.75)
        pitch = math.radians(8.0 + phase * 0.35)
        direction = Vector((math.sin(yaw), -math.cos(yaw), math.sin(pitch)))
        direction.normalize()
        cam.location = center + direction * distance * (1.0 + phase * 0.0025)
        look_at(cam, center)
        path = output_dir / f"frame_{index:03d}.png"
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rows.append(path.name)
    return rows


def render_impostor_views(output_dir: Path, render_size: int, rig: dict):
    output_dir.mkdir(parents=True, exist_ok=True)
    cam, center, radius = setup_render(render_size, rig)
    distance = max(radius * 3.0, 1.5)
    rows = []
    for index in range(8):
        angle = math.radians(index * 45.0)
        direction = Vector((math.cos(angle), math.sin(angle), 0.28))
        direction.normalize()
        cam.location = center + direction * distance
        look_at(cam, center)
        path = output_dir / f"azimuth_{index * 45:03d}.png"
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rows.append(path.name)
    return rows


def create_hlod_current_scene(output: Path):
    static = [
        obj for obj in mesh_objects()
        if not any(m.type == "ARMATURE" for m in obj.modifiers)
        and not (obj.data.shape_keys and len(obj.data.shape_keys.key_blocks) > 1)
    ]
    if not static:
        return {"status": "skipped", "reason": "no static meshes"}
    bpy.ops.object.select_all(action="DESELECT")
    for obj in static:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = static[0]
    if len(static) > 1:
        try:
            bpy.ops.object.join()
        except Exception as exc:
            return {"status": "failed", "reason": str(exc)}
    export_glb(output)
    return {"status": "created", "sourceStaticMeshes": len(static), "output": output.name}


def _base_object_name(name: str) -> str:
    value = name
    if len(value) > 4 and value[-4] == "." and value[-3:].isdigit():
        value = value[:-4]
    return value.lower().strip()


def _ensure_smart_bake_uv(obj):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="AUTO_BAKE_UV")
    else:
        existing = obj.data.uv_layers.get("AUTO_BAKE_UV")
        if not existing:
            existing = obj.data.uv_layers.new(name="AUTO_BAKE_UV")
        obj.data.uv_layers.active = existing
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")


def _set_bake_target_image(obj, image):
    touched = []
    if not obj.material_slots:
        mat = bpy.data.materials.new(name=f"AUTO_BAKE_MAT_{obj.name_full}")
        mat.use_nodes = True
        obj.data.materials.append(mat)
    for slot in obj.material_slots:
        mat = slot.material
        if not mat:
            continue
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        node = nodes.new("ShaderNodeTexImage")
        node.name = f"AUTO_BAKE_TARGET_{image.name}"
        node.label = "AUTO BAKE TARGET"
        node.image = image
        for n in nodes:
            n.select = False
        node.select = True
        nodes.active = node
        touched.append((mat, node))
    return touched


def _bake_image_for_pair(high_obj, low_obj, image, bake_type: str, selected_to_active: bool, cage: float):
    scene = bpy.context.scene
    try:
        scene.render.engine = "CYCLES"
    except Exception:
        pass
    try:
        scene.cycles.samples = 16
    except Exception:
        pass
    scene.render.bake.use_selected_to_active = bool(selected_to_active)
    scene.render.bake.cage_extrusion = float(cage)
    scene.render.bake.margin = 8
    bpy.ops.object.select_all(action="DESELECT")
    if selected_to_active:
        high_obj.select_set(True)
    low_obj.select_set(True)
    bpy.context.view_layer.objects.active = low_obj
    _set_bake_target_image(low_obj, image)
    kwargs = {"type": bake_type}
    if bake_type == "NORMAL":
        kwargs["normal_space"] = "TANGENT"
    bpy.ops.object.bake(**kwargs)


def bake_hq_to_lod0_details(source_path: Path, low_path: Path, output_dir: Path, cfg: dict):
    detail_cfg = cfg.get("detailBake") or {}
    if not detail_cfg.get("enabled", True):
        return {"status": "disabled", "objects": []}
    output_dir.mkdir(parents=True, exist_ok=True)
    clear_scene()
    import_model(source_path)
    high = list(mesh_objects())
    high_by_name = {_base_object_name(obj.name_full): obj for obj in high}
    before = set(bpy.context.scene.objects)
    import_model(low_path)
    low = [obj for obj in mesh_objects() if obj not in before]
    size = max(256, min(int(detail_cfg.get("size", 1024)), 2048))
    max_objects = max(1, min(int(detail_cfg.get("maxObjects", 8)), 32))
    rows = []
    for low_obj in sorted(low, key=lambda x: len(x.data.polygons), reverse=True)[:max_objects]:
        high_obj = high_by_name.get(_base_object_name(low_obj.name_full))
        if not high_obj:
            continue
        if any(m.type == "ARMATURE" for m in low_obj.modifiers):
            rows.append({"object": low_obj.name_full, "status": "skipped_armature"})
            continue
        try:
            _ensure_smart_bake_uv(low_obj)
            bbox = [Vector(v) for v in low_obj.bound_box]
            diag = (bbox[6] - bbox[0]).length if len(bbox) >= 7 else 1.0
            cage = max(diag * 0.006, 0.0005)
            safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in _base_object_name(low_obj.name_full))[:80] or "mesh"
            normal = bpy.data.images.new(f"BAKE_NORMAL_{safe}", width=size, height=size, alpha=False, float_buffer=False)
            normal.file_format = "PNG"
            normal.filepath_raw = str(output_dir / f"{safe}_NORMAL.png")
            _bake_image_for_pair(high_obj, low_obj, normal, "NORMAL", True, cage)
            normal.save()

            ao = bpy.data.images.new(f"BAKE_AO_{safe}", width=size, height=size, alpha=False, float_buffer=False)
            ao.file_format = "PNG"
            ao.filepath_raw = str(output_dir / f"{safe}_AO.png")
            _bake_image_for_pair(high_obj, low_obj, ao, "AO", False, 0.0)
            ao.save()
            rows.append({"object": low_obj.name_full, "status": "baked", "normal": Path(normal.filepath_raw).name, "ao": Path(ao.filepath_raw).name, "uv": "AUTO_BAKE_UV", "size": size})
        except Exception as exc:
            rows.append({"object": low_obj.name_full, "status": "failed", "error": str(exc)})
    manifest = {"schemaVersion": 1, "status": "created" if any(r.get("status") == "baked" for r in rows) else "no_bakes", "objects": rows}
    (output_dir / "detail-bake-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def prepare_scene(input_path: Path, ratio: float, texture_size: int, cfg: dict):
    clear_scene()
    import_model(input_path)
    projection = apply_semantic_projection(cfg)
    mesh_native_v9 = apply_mesh_native_semantic_v9(cfg)
    material_dedupe = deduplicate_identical_materials()
    instance_report = deduplicate_identical_mesh_data()
    semantic_rows = []
    for obj in mesh_objects():
        cleanup_mesh(obj, float(cfg.get("minMergeDistance", 1e-6)))
        result = apply_decimate(
            obj,
            ratio,
            bool(cfg.get("preserveShapeKeys", True)),
            bool(cfg.get("preserveAnimation", True)),
        )
        semantic_rows.append({"object": obj.name_full, **result})
    limit_textures(texture_size)
    return {"instancing": instance_report, "materialDeduplication": material_dedupe, "semanticProjection": projection, "semanticMeshV9": mesh_native_v9, "semanticProtection": semantic_rows}


def create_collision(input_path: Path, output: Path, cfg: dict):
    clear_scene()
    import_model(input_path)
    for obj in list(mesh_objects()):
        cleanup_mesh(obj, float(cfg.get("minMergeDistance", 1e-6)))
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        if len(bm.verts) >= 4:
            try:
                result = bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
                interior = result.get("geom_interior", [])
                if interior:
                    bmesh.ops.delete(bm, geom=interior, context="VERTS")
            except Exception:
                pass
        bm.to_mesh(obj.data)
        bm.free()
        for slot in list(obj.material_slots):
            pass
        obj.data.materials.clear()
    # Strip non-mesh visual helpers, but keep transforms/hierarchy simple.
    for obj in list(bpy.context.scene.objects):
        if obj.type not in {"MESH", "EMPTY"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    export_glb(output)


def main():
    args = parse_args()
    input_path = Path(args.input).resolve()
    out = Path(args.output_dir).resolve()
    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    out.mkdir(parents=True, exist_ok=True)

    # HQ import, analysis, immutable GLB conversion and renders.
    clear_scene()
    import_model(input_path)
    source_stats = scene_stats()
    source_instancing = deduplicate_identical_mesh_data()
    render_rig = canonical_render_rig()
    animation_frames = animation_sample_frames()
    export_glb(out / "MASTER_HQ.glb")
    render_views(out / "renders_hq", int(cfg.get("renderSize", 512)), render_rig)
    if (cfg.get("temporalQA") or {}).get("enabled", True):
        render_temporal_micro_motion(out / "renders_temporal_hq", int((cfg.get("temporalQA") or {}).get("renderSize", 384)), render_rig, int((cfg.get("temporalQA") or {}).get("frames", 8)))
    render_animation_samples(out / "renders_anim_hq", int(cfg.get("animationRenderSize", 384)), render_rig, animation_frames)

    source_material_inventory = material_inventory()
    source_texture_manifest = extract_source_textures(out / "textures_source")
    lod_stats = []
    ratios = cfg["lodRatios"]
    texture_sizes = cfg["textureSizes"]
    aaa_report = {"enabled": False, "objects": [], "materials": []}
    aaa_stats = None
    for index, ratio in enumerate(ratios):
        preparation = prepare_scene(input_path, float(ratio), int(texture_sizes[index]), cfg)
        stats = scene_stats()
        stats["lod"] = index
        stats["instancing"] = preparation.get("instancing")
        stats["materialDeduplication"] = preparation.get("materialDeduplication")
        stats["semanticProjection"] = preparation.get("semanticProjection")
        stats["semanticMeshV9"] = preparation.get("semanticMeshV9")
        stats["semanticProtection"] = preparation.get("semanticProtection")
        stats["requestedRatio"] = float(ratio)
        stats["textureMaxSize"] = int(texture_sizes[index])
        lod_stats.append(stats)
        if index == 0:
            export_glb(out / "LOD0_BASE.glb")
            if str(cfg.get("webCompression", "draco")).lower() == "draco":
                export_glb(out / "LOD0_BASE_WEB_DRACO.glb", "draco")
            render_views(out / "renders_lod0_base", int(cfg.get("renderSize", 512)), render_rig)
            if (cfg.get("temporalQA") or {}).get("enabled", True):
                render_temporal_micro_motion(out / "renders_temporal_lod0_base", int((cfg.get("temporalQA") or {}).get("renderSize", 384)), render_rig, int((cfg.get("temporalQA") or {}).get("frames", 8)))
            render_animation_samples(out / "renders_anim_lod0_base", int(cfg.get("animationRenderSize", 384)), render_rig, animation_frames)
            aaa_report = apply_aaa_scene(cfg)
            aaa_stats = scene_stats()
            export_glb(out / "LOD0_AAA.glb")
            if str(cfg.get("webCompression", "draco")).lower() == "draco":
                export_glb(out / "LOD0_AAA_WEB_DRACO.glb", "draco")
            render_views(out / "renders_lod0_aaa", int(cfg.get("renderSize", 512)), render_rig)
        else:
            export_glb(out / f"LOD{index}.glb")
            if index == 1:
                render_views(out / "renders_lod1", int(cfg.get("renderSize", 512)), render_rig)

    # LOD3 scene is still loaded here. Build far-distance assets before changing scene again.
    impostor_views = render_impostor_views(out / "renders_impostor", int(cfg.get("impostorRenderSize", 384)), render_rig)
    hlod_report = create_hlod_current_scene(out / "HLOD.glb")

    # True selected-to-active HQ -> LOD0 tangent-normal bake + AO on a separate reversible UV set.
    detail_source = out / "LOD0_AAA.glb" if (out / "LOD0_AAA.glb").is_file() else out / "LOD0_BASE.glb"
    detail_bake_report = bake_hq_to_lod0_details(input_path, detail_source, out / "detail_bakes", cfg)

    material_manifest = {
        "schemaVersion": 2,
        "sourceMaterialInventory": source_material_inventory,
        "aaaEnhancement": aaa_report,
        "runtimeProfiles": {
            "weathering": "generated_per_material_profile",
            "localizedWetness": "generated_per_material_profile; target adapter required for spatial mask",
            "microdetail": "geometry bevel/irregularity applied when safe; shader/texture detail remains target-adapter driven",
            "ambientOcclusion": "scene/runtime quality preset",
            "globalIllumination": "scene/runtime quality preset",
            "physicalLighting": "scene/runtime quality preset",
            "contactShadows": "scene/runtime quality preset",
            "detailBake": detail_bake_report,
            "impostorViews": impostor_views,
            "hlod": hlod_report,
        },
    }
    (out / "material-enhancement-manifest.json").write_text(json.dumps(material_manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    create_collision(input_path, out / "COLLISION.glb", cfg)
    clear_scene()
    import_model(out / "COLLISION.glb")
    collision_stats = scene_stats()

    manifest = {
        "schemaVersion": 2,
        "sourceStats": source_stats,
        "sourceInstancing": source_instancing,
        "sourceMaterialInventory": source_material_inventory,
        "sourceTextureManifest": source_texture_manifest,
        "animationFrames": animation_frames,
        "detailBake": detail_bake_report,
        "hlod": hlod_report,
        "impostorViews": impostor_views,
        "aaaStats": aaa_stats,
        "renderRig": render_rig,
        "lodStats": lod_stats,
        "collisionStats": collision_stats,
        "policy": cfg,
        "capabilities": {
            "sourcePreservation": "applied",
            "meshCleanup": "applied",
            "normalRepair": "applied",
            "smartLOD": "applied",
            "rigAnimationPreservation": "guarded",
            "shapeKeyPreservation": "guarded",
            "textureDownscalePerLOD": "applied",
            "collisionSeparation": "convex_hull_per_mesh",
            "multiViewVisualGate": "performed_by_worker_after_blender",
            "microBevelHighlightRecovery": "applied_and_exported_when_safe",
            "materialAutoclassification": "applied",
            "exportablePBRScalarNormalization": "applied_only_when_channel_is_not_texture_driven",
            "surfaceIrregularity": "applied_to_safe_static_stone_brick_concrete_ground_roof_and_guarded_by_AAA_gate",
            "textureSharpnessPolicy": "preserves_L0_high_resolution_and_limits_lower_LODs",
            "channelAwareTextureExtraction": "source textures extracted with PBR role inventory for safe post-processing",
            "weatheringWetnessProfiles": "generated_for_target_adapters",
            "spatialWetnessWeatheringMasks": "AUTO_WETNESS/AUTO_WEATHERING vertex-color attributes generated on safe static meshes",
            "physicalLightingProfiles": "generated_for_target_adapters",
            "reversibleBakeUV": "AUTO_BAKE_UV generated without destroying authored UVs",
            "normalAOBake": "HQ-to-LOD0 tangent normal selected-to-active plus geometry AO; per-object when pairing succeeds",
            "curvatureHeightReconstruction": "worker post-processes true normal bake into curvature and Poisson height maps",
            "semanticImportanceMask": "object/material/bone-name semantic retention floors applied before decimation",
            "exactMeshInstancing": "identical static mesh datablocks deduplicated before export",
            "exactMaterialDeduplication": "physically identical material graphs/scalars/image references relinked to canonical material",
            "worldHLODInstancing": "LOD3 static meshes merged into HLOD plus 8-view impostor source renders",
            "animationDeformationQA": "source and LOD0 animation sample renders emitted for worker regression gate",
            "materialAtlasBake": "per-object reversible bake UV implemented; scene-wide material consolidation remains guarded/not forced",
        },
    }
    (out / "mesh-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
