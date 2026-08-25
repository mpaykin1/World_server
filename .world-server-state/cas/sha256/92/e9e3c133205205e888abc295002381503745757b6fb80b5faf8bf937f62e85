from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np

CRITICAL_GROUP_TOKENS = ("head", "face", "eye", "jaw", "mouth", "hand", "finger", "wrist", "weapon", "sword", "gun", "shield")


def args():
    values = sys.argv
    values = values[values.index("--") + 1:] if "--" in values else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--config", required=True)
    return parser.parse_args(values)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_model(path: Path):
    ext = path.suffix.lower()
    if ext in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path)) if hasattr(bpy.ops.wm, "obj_import") else bpy.ops.import_scene.obj(filepath=str(path))
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif ext == ".ply":
        bpy.ops.wm.ply_import(filepath=str(path)) if hasattr(bpy.ops.wm, "ply_import") else bpy.ops.import_mesh.ply(filepath=str(path))
    else:
        raise RuntimeError(f"Unsupported semantic mesh format: {ext}")


def ranges(indices):
    values = sorted(set(int(i) for i in indices))
    if not values:
        return []
    out = []
    start = prev = values[0]
    for value in values[1:]:
        if value == prev + 1:
            prev = value
        else:
            out.append([start, prev]); start = prev = value
    out.append([start, prev])
    return out


def main():
    a = args()
    cfg = json.loads(Path(a.config).read_text(encoding="utf-8"))
    clear(); import_model(Path(a.input))
    angle = math.radians(float(cfg.get("sharpAngleDegrees", 32)))
    minw = float(cfg.get("minWeight", 0.55))
    rows = []
    matrices = []
    object_ids = []
    vertex_ids = []
    total = protected = 0
    feature_names = ["boundary", "seam", "sharp", "materialBoundary", "thinTopology", "shapeKey", "criticalRig", "heightNorm", "radiusNorm", "intrinsicScore"]

    for object_index, obj in enumerate([o for o in bpy.context.scene.objects if o.type == "MESH"]):
        mesh = obj.data
        count = len(mesh.vertices)
        if count <= 0:
            continue
        boundary = [0.0] * count; seam = [0.0] * count; sharp = [0.0] * count; material = [0.0] * count
        degree = [0] * count
        bm = bmesh.new(); bm.from_mesh(mesh); bm.verts.ensure_lookup_table(); bm.edges.ensure_lookup_table()
        for edge in bm.edges:
            i, j = edge.verts[0].index, edge.verts[1].index
            degree[i] += 1; degree[j] += 1
            if cfg.get("protectBoundary", True) and edge.is_boundary:
                boundary[i] = boundary[j] = 1.0
            if edge.seam:
                seam[i] = seam[j] = 1.0
            if len(edge.link_faces) == 2:
                try:
                    if edge.calc_face_angle(0.0) >= angle:
                        sharp[i] = sharp[j] = 1.0
                except Exception:
                    pass
                if cfg.get("protectMaterialBoundaries", True) and edge.link_faces[0].material_index != edge.link_faces[1].material_index:
                    material[i] = material[j] = 1.0
        bm.free()
        thin = [1.0 if cfg.get("protectThinTopology", True) and degree[i] <= 2 else 0.0 for i in range(count)]
        shape = [1.0 if mesh.shape_keys and len(mesh.shape_keys.key_blocks) > 1 else 0.0 for _ in range(count)]
        critical_group_indices = {g.index for g in obj.vertex_groups if any(token in g.name.lower() for token in CRITICAL_GROUP_TOKENS)}
        rig = []
        for vertex in mesh.vertices:
            rig.append(1.0 if any(g.group in critical_group_indices and g.weight > 0.01 for g in vertex.groups) else 0.0)
        zs = [float(v.co.z) for v in mesh.vertices]; radii = [math.sqrt(float(v.co.x) ** 2 + float(v.co.y) ** 2 + float(v.co.z) ** 2) for v in mesh.vertices]
        zmin, zmax = min(zs), max(zs); rmax = max(radii) or 1.0
        height = [(z - zmin) / max(zmax - zmin, 1e-9) for z in zs]
        radius = [r / rmax for r in radii]
        selected = []; weights = []; feature_start = total
        for i in range(count):
            intrinsic = max(
                0.92 * boundary[i], 0.72 * seam[i], 0.86 * sharp[i], 0.84 * material[i],
                0.66 * thin[i], 1.0 * shape[i], 0.98 * rig[i], 0.10,
            )
            vec = [boundary[i], seam[i], sharp[i], material[i], thin[i], shape[i], rig[i], height[i], radius[i], intrinsic]
            matrices.append(vec); object_ids.append(object_index); vertex_ids.append(i)
            if intrinsic >= minw:
                selected.append(i); weights.append(round(intrinsic, 5))
        rows.append({
            "object": obj.name_full, "vertexCount": count, "featureStart": feature_start, "featureCount": count,
            "protectedIndices": selected, "protectedRanges": ranges(selected), "protectedWeights": weights,
        })
        total += count; protected += len(selected)

    output = Path(a.output)
    feature_file = output.with_name("semantic-mesh-v9-features.npz")
    matrix = np.asarray(matrices, dtype=np.float32) if matrices else np.zeros((0, len(feature_names)), dtype=np.float32)
    np.savez_compressed(feature_file, features=matrix, object_ids=np.asarray(object_ids, dtype=np.int32), vertex_ids=np.asarray(vertex_ids, dtype=np.int32))
    result = {
        "schemaVersion": 9, "status": "CREATED", "objects": rows, "vertexCount": total, "protectedVertices": protected,
        "coverage": protected / max(total, 1), "featureFile": str(feature_file), "featureNames": feature_names,
        "features": ["boundary", "seam", "sharp curvature", "material boundary", "thin topology", "shape keys", "critical rig groups", "normalized geometry"],
    }
    output.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
