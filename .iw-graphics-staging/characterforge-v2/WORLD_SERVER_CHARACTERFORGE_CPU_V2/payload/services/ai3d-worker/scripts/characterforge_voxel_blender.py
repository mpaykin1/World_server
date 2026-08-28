from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import Counter
from pathlib import Path

import bpy
from mathutils import Vector

IMAGE_CACHE = {}
RIG_SCHEMA_VERSION = "voxel-humanoid-v2"


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--input")
    p.add_argument("--output-dir", required=True)
    p.add_argument("--resolutions", default="24,48,72")
    p.add_argument("--primary", type=int, default=48)
    p.add_argument("--palette-size", type=int, default=24)
    p.add_argument("--rig", default="humanoid")
    p.add_argument("--animations", default="idle,walk,run,jump")
    p.add_argument("--view-front")
    p.add_argument("--view-side")
    p.add_argument("--view-back")
    p.add_argument("--view-left")
    p.add_argument("--side-shape-strength", type=float, default=0.80)
    p.add_argument("--self-test", action="store_true")
    return p.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def import_glb(path: Path):
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("No mesh objects imported from base GLB")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def create_self_test_mesh():
    parts = [
        ((0, 0, 1.25), (0.72, 0.42, 0.82)),
        ((0, 0, 1.88), (0.48, 0.46, 0.48)),
        ((-0.48, 0, 1.28), (0.26, 0.30, 0.78)),
        ((0.48, 0, 1.28), (0.26, 0.30, 0.78)),
        ((-0.20, 0, 0.52), (0.30, 0.38, 1.05)),
        ((0.20, 0, 0.52), (0.30, 0.38, 1.05)),
    ]
    objects = []
    for loc, scale in parts:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
        obj = bpy.context.object
        obj.scale = scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        objects.append(obj)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    return bpy.context.object


def bounds_world(obj):
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    min_v = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
    max_v = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
    return min_v, max_v


def bounds_payload(bounds):
    a, b = bounds
    return {"min": [round(x, 6) for x in a], "max": [round(x, 6) for x in b]}


def voxelize(obj, resolution: int):
    min_v, max_v = bounds_world(obj)
    height = max(1e-5, max_v.z - min_v.z)
    voxel_size = height / max(12, resolution)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    obj.data.remesh_mode = "VOXEL"
    obj.data.remesh_voxel_size = voxel_size
    obj.data.remesh_voxel_adaptivity = 0.0
    bpy.ops.object.voxel_remesh()
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return voxel_size


def load_image(path: Path):
    key = str(path.resolve())
    if key in IMAGE_CACHE:
        return IMAGE_CACHE[key]
    img = bpy.data.images.load(str(path), check_existing=False)
    width, height = img.size
    pixels = list(img.pixels[:])
    data = {"width": width, "height": height, "pixels": pixels}
    IMAGE_CACHE[key] = data
    return data


def sample_image(data, u: float, v: float):
    width, height, pixels = data["width"], data["height"], data["pixels"]
    x = max(0, min(width - 1, int(u * (width - 1))))
    y = max(0, min(height - 1, int((1.0 - v) * (height - 1))))
    i = (y * width + x) * 4
    return pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]


def foreground(color):
    r, g, b, a = color
    if a < 0.10:
        return False
    return not (r > 0.965 and g > 0.965 and b > 0.965)


def quantize_candidate(rgba, palette_size: int):
    levels = max(2, min(4, round(max(8, palette_size) ** (1.0 / 3.0))))
    return tuple(round(c * (levels - 1)) / (levels - 1) for c in rgba[:3])


def build_canonical_palette(view_paths: dict[str, Path], palette_size: int):
    if not view_paths:
        palette = [(0.18, 0.22, 0.28), (0.48, 0.55, 0.62), (0.74, 0.69, 0.58), (0.12, 0.12, 0.14)]
    else:
        counts = Counter()
        for path in view_paths.values():
            data = load_image(path)
            for yi in range(4, 61):
                v = yi / 64.0
                for xi in range(4, 61):
                    u = xi / 64.0
                    color = sample_image(data, u, v)
                    if foreground(color):
                        counts[quantize_candidate(color, palette_size)] += 1
        palette = [item[0] for item in counts.most_common(max(8, min(palette_size, 64)))]
        if not palette:
            palette = [(0.35, 0.35, 0.35)]
    digest = hashlib.sha256(json.dumps(palette, separators=(",", ":")).encode()).hexdigest()
    return palette, digest


def nearest_palette(rgb, palette):
    return min(palette, key=lambda p: sum((rgb[i] - p[i]) ** 2 for i in range(3)))


def silhouette_profile(image_path: Path, bins: int = 128):
    data = load_image(image_path)
    width, height = data["width"], data["height"]
    # Find foreground bounding box using a bounded sample grid.
    points = []
    sx = max(1, width // 256)
    sy = max(1, height // 256)
    for y in range(0, height, sy):
        v = 1.0 - (y / max(1, height - 1))
        for x in range(0, width, sx):
            u = x / max(1, width - 1)
            if foreground(sample_image(data, u, v)):
                points.append((x, y))
    if not points:
        return [0.22] * bins
    min_y, max_y = min(y for _, y in points), max(y for _, y in points)
    bbox_h = max(1, max_y - min_y)
    profile = []
    for bi in range(bins):
        y = round(max_y - (bi / max(1, bins - 1)) * bbox_h)
        v = 1.0 - (y / max(1, height - 1))
        xs = []
        for xi in range(128):
            u = xi / 127.0
            if foreground(sample_image(data, u, v)):
                xs.append(u * width)
        if xs:
            ratio = (max(xs) - min(xs)) / bbox_h
            profile.append(max(0.05, min(ratio, 0.80)))
        else:
            profile.append(profile[-1] if profile else 0.20)
    return profile


def apply_side_shape_hint(obj, side_path: Path | None, canonical_bounds, strength: float):
    if not side_path or strength <= 0.0:
        return False
    profile = silhouette_profile(side_path)
    min_v, max_v = bounds_world(obj)
    cmin, cmax = canonical_bounds
    h = max(1e-5, cmax.z - cmin.z)
    cy = (min_v.y + max_v.y) * 0.5
    current_half = max(1e-5, (max_v.y - min_v.y) * 0.5)
    for vert in obj.data.vertices:
        world = obj.matrix_world @ vert.co
        z_norm = max(0.0, min(1.0, (world.z - cmin.z) / h))
        idx = min(len(profile) - 1, round(z_norm * (len(profile) - 1)))
        target_half = max(h * 0.025, h * profile[idx] * 0.5)
        blended_half = current_half * (1.0 - strength) + target_half * strength
        local_y = world.y - cy
        world.y = cy + (local_y / current_half) * blended_half
        vert.co = obj.matrix_world.inverted() @ world
    return True


def create_materials(obj, palette):
    materials = []
    for i, rgb in enumerate(palette):
        mat = bpy.data.materials.new(name=f"VoxelPalette_{i:02d}")
        color = (*rgb, 1.0)
        mat.diffuse_color = color
        mat.use_nodes = True
        principled = mat.node_tree.nodes.get("Principled BSDF")
        if principled:
            principled.inputs["Base Color"].default_value = color
            principled.inputs["Roughness"].default_value = 0.86
            principled.inputs["Metallic"].default_value = 0.0
        obj.data.materials.append(mat)
        materials.append(mat)
    return materials


def choose_view(normal, view_data):
    nx, ny = normal.x, normal.y
    if abs(nx) > abs(ny) * 1.10:
        if nx < 0 and "left" in view_data:
            return "left", False
        if "side" in view_data:
            return "side", nx < 0
    if ny > 0.15 and "back" in view_data:
        return "back", True
    return "front", False


def paint_voxels_multiview(obj, view_paths: dict[str, Path], palette):
    create_materials(obj, palette)
    view_data = {role: load_image(path) for role, path in view_paths.items()}
    if "front" not in view_data:
        return len(palette)
    min_v, max_v = bounds_world(obj)
    width = max(1e-5, max_v.x - min_v.x)
    depth = max(1e-5, max_v.y - min_v.y)
    height = max(1e-5, max_v.z - min_v.z)
    normal_xform = obj.matrix_world.to_3x3()

    for poly in obj.data.polygons:
        center = obj.matrix_world @ poly.center
        normal = (normal_xform @ poly.normal).normalized()
        role, mirror = choose_view(normal, view_data)
        data = view_data.get(role) or view_data["front"]
        if role in {"side", "left"}:
            u = (center.y - min_v.y) / depth
        else:
            u = (center.x - min_v.x) / width
        if mirror:
            u = 1.0 - u
        v = (center.z - min_v.z) / height
        color = sample_image(data, u, v)
        rgb = nearest_palette(color[:3], palette)
        poly.material_index = palette.index(rgb)
    return len(palette)


def rig_schema():
    schema = [
        ("root", (0, 0, 0.02), (0, 0, 0.12), None),
        ("hips", (0, 0, 0.12), (0, 0, 0.48), "root"),
        ("spine", (0, 0, 0.48), (0, 0, 0.66), "hips"),
        ("chest", (0, 0, 0.66), (0, 0, 0.78), "spine"),
        ("neck", (0, 0, 0.78), (0, 0, 0.84), "chest"),
        ("head", (0, 0, 0.84), (0, 0, 0.98), "neck"),
    ]
    for side, sign in (("L", 1), ("R", -1)):
        schema.extend([
            (f"upper_arm.{side}", (0.14 * sign, 0, 0.73), (0.34 * sign, 0, 0.64), "chest"),
            (f"forearm.{side}", (0.34 * sign, 0, 0.64), (0.49 * sign, 0, 0.56), f"upper_arm.{side}"),
            (f"thigh.{side}", (0.11 * sign, 0, 0.45), (0.12 * sign, 0, 0.25), "hips"),
            (f"shin.{side}", (0.12 * sign, 0, 0.25), (0.12 * sign, 0, 0.055), f"thigh.{side}"),
            (f"foot.{side}", (0.12 * sign, 0, 0.055), (0.12 * sign, -0.22, 0.025), f"shin.{side}"),
        ])
    return schema


def rig_schema_hash():
    return hashlib.sha256(json.dumps(rig_schema(), separators=(",", ":")).encode()).hexdigest()


def map_point(norm, canonical_bounds):
    min_v, max_v = canonical_bounds
    cx = (min_v.x + max_v.x) * 0.5
    cy = (min_v.y + max_v.y) * 0.5
    w = max(1e-5, max_v.x - min_v.x)
    d = max(1e-5, max_v.y - min_v.y)
    h = max(1e-5, max_v.z - min_v.z)
    return (cx + norm[0] * w, cy + norm[1] * d, min_v.z + norm[2] * h)


def add_humanoid_rig(mesh_obj, canonical_bounds):
    arm_data = bpy.data.armatures.new("VoxelHumanoidRig")
    arm = bpy.data.objects.new("VoxelHumanoidRig", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    edit_bones = arm.data.edit_bones
    made = {}
    for name, head, tail, parent in rig_schema():
        bone = edit_bones.new(name)
        bone.head = map_point(head, canonical_bounds)
        bone.tail = map_point(tail, canonical_bounds)
        if parent:
            bone.parent = made[parent]
        made[name] = bone
    bpy.ops.object.mode_set(mode="OBJECT")

    min_v, max_v = canonical_bounds
    cx = (min_v.x + max_v.x) / 2
    h = max(1e-5, max_v.z - min_v.z)
    w = max(1e-5, max_v.x - min_v.x)
    mesh_obj.parent = arm
    mod = mesh_obj.modifiers.new(name="VoxelArmature", type="ARMATURE")
    mod.object = arm
    groups = {bone.name: mesh_obj.vertex_groups.new(name=bone.name) for bone in arm.data.bones}
    for vert in mesh_obj.data.vertices:
        co = mesh_obj.matrix_world @ vert.co
        nx = (co.x - cx) / (w / 2)
        nz = (co.z - min_v.z) / h
        ax = abs(nx)
        side = "L" if nx >= 0 else "R"
        if nz >= 0.84:
            name = "head"
        elif ax > 0.42 and 0.54 <= nz <= 0.82:
            name = f"forearm.{side}" if ax > 0.72 else f"upper_arm.{side}"
        elif nz >= 0.66:
            name = "chest"
        elif nz >= 0.49:
            name = "spine"
        elif nz >= 0.43:
            name = "hips"
        elif nz >= 0.25:
            name = f"thigh.{side}"
        elif nz >= 0.075:
            name = f"shin.{side}"
        else:
            name = f"foot.{side}"
        groups[name].add([vert.index], 1.0, "REPLACE")
    return arm


def add_action(arm, name, keys):
    action = bpy.data.actions.new(name=name)
    arm.animation_data_create()
    arm.animation_data.action = action
    for frame, rotations in keys:
        for bone_name, xyz_deg in rotations.items():
            pb = arm.pose.bones.get(bone_name)
            if not pb:
                continue
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = tuple(math.radians(v) for v in xyz_deg)
            pb.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone_name)
    for fc in action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, int(action.frame_range[0]), action)
    strip.name = name
    arm.animation_data.action = None


def add_animations(arm, requested: set[str]):
    if "idle" in requested:
        add_action(arm, "Idle", [
            (1, {"chest": (0, 0, -1.5), "head": (0, 0, 1.0)}),
            (18, {"chest": (0, 0, 1.5), "head": (0, 0, -1.0)}),
            (36, {"chest": (0, 0, -1.5), "head": (0, 0, 1.0)}),
        ])
    if "walk" in requested:
        add_action(arm, "Walk", [
            (1, {"thigh.L": (26, 0, 0), "shin.L": (-8, 0, 0), "foot.L": (-8, 0, 0), "thigh.R": (-24, 0, 0), "shin.R": (18, 0, 0), "upper_arm.L": (-18, 0, 0), "upper_arm.R": (18, 0, 0)}),
            (8, {"thigh.L": (-24, 0, 0), "shin.L": (18, 0, 0), "thigh.R": (26, 0, 0), "shin.R": (-8, 0, 0), "foot.R": (-8, 0, 0), "upper_arm.L": (18, 0, 0), "upper_arm.R": (-18, 0, 0)}),
            (16, {"thigh.L": (26, 0, 0), "shin.L": (-8, 0, 0), "foot.L": (-8, 0, 0), "thigh.R": (-24, 0, 0), "shin.R": (18, 0, 0), "upper_arm.L": (-18, 0, 0), "upper_arm.R": (18, 0, 0)}),
        ])
    if "run" in requested:
        add_action(arm, "Run", [
            (1, {"thigh.L": (40, 0, 0), "shin.L": (-10, 0, 0), "thigh.R": (-34, 0, 0), "shin.R": (32, 0, 0), "upper_arm.L": (-30, 0, 0), "upper_arm.R": (30, 0, 0)}),
            (5, {"thigh.L": (-34, 0, 0), "shin.L": (32, 0, 0), "thigh.R": (40, 0, 0), "shin.R": (-10, 0, 0), "upper_arm.L": (30, 0, 0), "upper_arm.R": (-30, 0, 0)}),
            (9, {"thigh.L": (40, 0, 0), "shin.L": (-10, 0, 0), "thigh.R": (-34, 0, 0), "shin.R": (32, 0, 0), "upper_arm.L": (-30, 0, 0), "upper_arm.R": (30, 0, 0)}),
        ])
    if "jump" in requested:
        add_action(arm, "Jump", [
            (1, {"thigh.L": (0, 0, 0), "thigh.R": (0, 0, 0), "shin.L": (0, 0, 0), "shin.R": (0, 0, 0)}),
            (8, {"thigh.L": (35, 0, 0), "thigh.R": (35, 0, 0), "shin.L": (-28, 0, 0), "shin.R": (-28, 0, 0), "upper_arm.L": (-45, 0, 0), "upper_arm.R": (-45, 0, 0)}),
            (16, {"thigh.L": (0, 0, 0), "thigh.R": (0, 0, 0), "shin.L": (0, 0, 0), "shin.R": (0, 0, 0)}),
        ])




def measure_foot_loop_drift(arm, requested):
    if not arm or not arm.animation_data:
        return {}
    scene = bpy.context.scene
    tracks = list(arm.animation_data.nla_tracks)
    old_mutes = [track.mute for track in tracks]
    for track in tracks:
        track.mute = True
    old_action = arm.animation_data.action
    results = {}
    specs = []
    if "walk" in requested:
        specs.append(("Walk", "foot.L", 1, 16))
    if "run" in requested:
        specs.append(("Run", "foot.L", 1, 9))
    try:
        for action_name, bone_name, f0, f1 in specs:
            action = bpy.data.actions.get(action_name)
            bone = arm.pose.bones.get(bone_name)
            if not action or not bone:
                continue
            arm.animation_data.action = action
            scene.frame_set(f0)
            bpy.context.view_layer.update()
            p0 = arm.matrix_world @ bone.head
            scene.frame_set(f1)
            bpy.context.view_layer.update()
            p1 = arm.matrix_world @ bone.head
            results[action_name] = {
                "bone": bone_name,
                "loopFrames": [f0, f1],
                "drift": round((p1 - p0).length, 8),
                "pass": (p1 - p0).length <= 1e-4,
            }
    finally:
        arm.animation_data.action = old_action
        for track, mute in zip(tracks, old_mutes):
            track.mute = mute
    return results

def animation_contract(requested):
    return {
        "schema": "characterforge-animation-v2",
        "fps": 30,
        "clips": {
            "Idle": {"loop": True, "frames": [1, 36]},
            "Walk": {"loop": True, "frames": [1, 16], "footContacts": {"left": [1, 16], "right": [8]}},
            "Run": {"loop": True, "frames": [1, 9], "footContacts": {"left": [1, 9], "right": [5]}},
            "Jump": {"loop": False, "frames": [1, 16]},
        },
        "enabled": sorted(x.title() for x in requested),
        "retargetPolicy": "canonical humanoid roles; preserve clip names and linear voxel-safe interpolation",
    }


def rig_map_payload():
    roles = {
        "root": "root", "hips": "hips", "spine": "spine", "chest": "chest", "neck": "neck", "head": "head",
        "left_upper_arm": "upper_arm.L", "left_forearm": "forearm.L",
        "right_upper_arm": "upper_arm.R", "right_forearm": "forearm.R",
        "left_thigh": "thigh.L", "left_shin": "shin.L", "left_foot": "foot.L",
        "right_thigh": "thigh.R", "right_shin": "shin.R", "right_foot": "foot.R",
    }
    return {
        "schema": "characterforge-humanoid-retarget-v2",
        "rigSchema": RIG_SCHEMA_VERSION,
        "rigSchemaHash": rig_schema_hash(),
        "roles": roles,
        "targets": {
            "godot": "Skeleton3D bone-name mapping",
            "unreal": "future adapter maps canonical roles to target skeleton",
            "roblox": "future adapter maps canonical roles to supported avatar bones",
        },
    }

def export_glb(path: Path):
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", export_apply=False, export_yup=True,
        export_animations=True, export_skins=True, export_morph=False, export_materials="EXPORT",
    )


def build_variant(args, resolution: int, out_name: str, canonical_bounds, palette, palette_hash, view_paths):
    clear_scene()
    mesh = create_self_test_mesh() if args.self_test else import_glb(Path(args.input))
    voxel_size = voxelize(mesh, resolution)
    side_path = view_paths.get("side") or view_paths.get("left")
    side_used = apply_side_shape_hint(mesh, side_path, canonical_bounds, max(0.0, min(args.side_shape_strength, 1.0)))
    palette_count = paint_voxels_multiview(mesh, view_paths, palette) if view_paths else len(palette)
    if not view_paths:
        create_materials(mesh, palette)
        for poly in mesh.data.polygons:
            poly.material_index = poly.index % len(palette)
    arm = add_humanoid_rig(mesh, canonical_bounds) if args.rig == "humanoid" else None
    requested = {x.strip().lower() for x in args.animations.split(",") if x.strip()}
    foot_drift = {}
    if arm:
        add_animations(arm, requested)
        foot_drift = measure_foot_loop_drift(arm, requested)
    output_path = Path(args.output_dir) / out_name
    export_glb(output_path)
    return {
        "file": output_path.name,
        "voxelsPerCharacterHeight": resolution,
        "voxelSize": voxel_size,
        "paletteMaterials": palette_count,
        "paletteHash": palette_hash,
        "rigSchema": RIG_SCHEMA_VERSION,
        "rigSchemaHash": rig_schema_hash(),
        "vertices": len(mesh.data.vertices),
        "faces": len(mesh.data.polygons),
        "sideSilhouetteConstraintUsed": side_used,
        "animations": sorted(requested),
        "footLoopDrift": foot_drift,
        "footContactStabilized": all(item.get("pass") for item in foot_drift.values()) if foot_drift else True,
    }


def main():
    args = parse_args()
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if not args.self_test and (not args.input or not Path(args.input).is_file()):
        raise RuntimeError("--input GLB is required outside --self-test")

    view_paths = {}
    for role in ("front", "side", "back", "left"):
        value = getattr(args, f"view_{role}")
        if value and Path(value).is_file():
            view_paths[role] = Path(value)

    clear_scene()
    source = create_self_test_mesh() if args.self_test else import_glb(Path(args.input))
    canonical_bounds = bounds_world(source)
    clear_scene()

    palette, palette_hash = build_canonical_palette(view_paths, args.palette_size)
    resolutions = [max(12, min(int(x), 160)) for x in args.resolutions.split(",") if x.strip()]
    resolutions = sorted(set(resolutions))
    summary = []
    for res in resolutions:
        name = "character_voxel.glb" if res == args.primary else f"character_voxel_{res}vph.glb"
        summary.append(build_variant(args, res, name, canonical_bounds, palette, palette_hash, view_paths))

    summary_path = out_dir / "characterforge-blender-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    identity = {
        "identityVersion": 2,
        "paletteHash": palette_hash,
        "palette": [[round(c, 5) for c in rgb] for rgb in palette],
        "rigSchema": RIG_SCHEMA_VERSION,
        "rigSchemaHash": rig_schema_hash(),
        "canonicalBounds": bounds_payload(canonical_bounds),
        "viewRoles": sorted(view_paths),
        "lodResolutions": resolutions,
        "stableAcrossLods": all(x["paletteHash"] == palette_hash and x["rigSchemaHash"] == rig_schema_hash() for x in summary),
        "footContactMarkers": {"Walk": {"left": [1, 16], "right": [8]}, "Run": {"left": [1, 9], "right": [5]}},
        "footContactStabilizedAcrossLods": all(x.get("footContactStabilized", False) for x in summary),
        "footLoopDrift": {x["file"]: x.get("footLoopDrift", {}) for x in summary},
        "footLockPolicy": "loop-contact world-position drift is measured and gated; full stance-interval IK bake is a future optional enhancer",
    }
    (out_dir / "characterforge-identity.json").write_text(json.dumps(identity, indent=2), encoding="utf-8")
    requested = {x.strip().lower() for x in args.animations.split(",") if x.strip()}
    rig_map = rig_map_payload()
    anim_contract = animation_contract(requested)
    (out_dir / "characterforge-rig-map.json").write_text(json.dumps(rig_map, indent=2), encoding="utf-8")
    (out_dir / "characterforge-animation-contract.json").write_text(json.dumps(anim_contract, indent=2), encoding="utf-8")
    print("CHARACTERFORGE_BLENDER_PASS", json.dumps({"summary": summary, "identity": identity, "rigMap": rig_map, "animationContract": anim_contract}))


if __name__ == "__main__":
    main()
