"""World Server semantic voxel-art factory. Blender 5.1+, deterministic CPU-only."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from recipe_core import PALETTE, Recipe, stable_hash
from recipes_nature import BUILDERS as NATURE_BUILDERS
from recipes_built import BUILDERS as BUILT_BUILDERS

BUILDERS = {**NATURE_BUILDERS, **BUILT_BUILDERS}
KINDS = ("barren", "city", "forest", "volcano", "energy", "idea", "river", "villager")
VFX = {
    "volcano": ["lava_glow", "eruption_embers", "ash"],
    "energy": ["electric_spark", "steam"],
    "idea": ["crystal_pulse"],
    "river": ["water_ripples", "waterfall_mist"],
}
ANIMS = {
    "volcano": ["eruption_embers"], "energy": ["rotor_spin"],
    "idea": ["crystal_pulse"], "villager": ["walk_left", "walk_right"],
}
DIRECTIONS = ((1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1))
QUADS = (
    ((1,-1,-1),(1,1,-1),(1,1,1),(1,-1,1)),
    ((-1,1,-1),(-1,-1,-1),(-1,-1,1),(-1,1,1)),
    ((1,1,-1),(-1,1,-1),(-1,1,1),(1,1,1)),
    ((-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1)),
    ((-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)),
    ((1,-1,-1),(-1,-1,-1),(-1,1,-1),(1,1,-1)),
)


def material(name: str):
    existing = bpy.data.materials.get("VX_" + name)
    if existing:
        return existing
    color = PALETTE[name]
    mat = bpy.data.materials.new("VX_" + name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = .91
    if name.startswith(("lava", "crystal")) or name == "light":
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = 2.3
    if color[3] < 1:
        bsdf.inputs["Alpha"].default_value = color[3]
        mat.surface_render_method = "BLENDED"
    return mat


def _subset(recipe: Recipe, include=None, exclude=None):
    include = set(include or ())
    exclude = set(exclude or ())
    out = {}
    for coord, value in recipe.voxels.items():
        fid = value[1]
        if include and fid not in include:
            continue
        if fid in exclude:
            continue
        out[coord] = value
    return out


def mesh_voxels(voxels, name: str, unit=.22, origin=(0,0,0)):
    vertices, polygons, material_indices = [], [], []
    palette = sorted({value[0] for value in voxels.values()})
    keys = set(voxels)
    ox, oy, oz = origin
    visible_faces = 0
    for (x, y, z), (kind, _) in sorted(voxels.items()):
        for side, (dx, dy, dz) in enumerate(DIRECTIONS):
            if (x+dx, y+dy, z+dz) in keys:
                continue
            offset = len(vertices)
            for qx, qy, qz in QUADS[side]:
                vertices.append(((x + qx*.5 - ox)*unit,
                                 (y + qy*.5 - oy)*unit,
                                 (z + qz*.5 - oz)*unit))
            polygons.append(tuple(range(offset, offset+4)))
            material_indices.append(palette.index(kind))
            visible_faces += 1
    data = bpy.data.meshes.new(name + "_geometry")
    data.from_pydata(vertices, [], polygons)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = (ox*unit, oy*unit, oz*unit)
    for kind in palette:
        data.materials.append(material(kind))
    for polygon, index in zip(data.polygons, material_indices):
        polygon.material_index = index
    return obj, {
        "visibleFaces": visible_faces,
        "triangles": visible_faces * 2,
        "vertices": len(vertices),
        "materialCount": len(palette),
        "drawCalls": len(palette),
    }


def _add_recipe_mesh(recipe: Recipe, name: str):
    animated_parts = set()
    if recipe.kind == "villager" and recipe.lod == 0:
        animated_parts = {"villager:leftLeg", "villager:rightLeg"}
    body, metrics = mesh_voxels(_subset(recipe, exclude=animated_parts), name)
    body["world_server_type"] = recipe.kind
    body["world_server_lod"] = recipe.lod
    body["semantic_graph_version"] = 1
    body["semantic_feature_count"] = recipe.stats()["featureCount"]
    body["semantic_graph_json"] = json.dumps(recipe.graph(), separators=(",", ":"))
    if recipe.meta:
        body["world_server_recipe_meta"] = json.dumps(recipe.meta, separators=(",", ":"))
    if animated_parts:
        part_metrics = []
        leg_h = max(3, int(recipe.params.get("height", 10)) // 3)
        for fid, x, clip, phase in [
            ("villager:leftLeg", -1, "walk_left", 1),
            ("villager:rightLeg", 1, "walk_right", -1),
        ]:
            cells = _subset(recipe, include={fid})
            if not cells:
                continue
            obj, m = mesh_voxels(cells, "ANIM_" + fid.split(":")[-1], origin=(x, 0, leg_h))
            obj.rotation_mode = "XYZ"
            obj.rotation_euler[0] = phase * .34
            obj.keyframe_insert(data_path="rotation_euler", frame=1)
            obj.rotation_euler[0] = -phase * .34
            obj.keyframe_insert(data_path="rotation_euler", frame=13)
            obj.rotation_euler[0] = phase * .34
            obj.keyframe_insert(data_path="rotation_euler", frame=25)
            if obj.animation_data and obj.animation_data.action:
                obj.animation_data.action.name = clip
            part_metrics.append(m)
        for key in metrics:
            if key in ("visibleFaces", "triangles", "vertices", "drawCalls"):
                metrics[key] += sum(m[key] for m in part_metrics)
    return body, metrics


def _simple_anim_mesh(voxels, name, pivot):
    obj, _ = mesh_voxels(voxels, name, origin=(0,0,0))
    obj.location = pivot
    return obj


def animate(kind: str, recipe: Recipe):
    if recipe.lod != 0:
        return
    unit = .22
    if kind == "volcano":
        vox = {
            (0,0,0): ("lava_hot","volcano:ashPlume"),
            (1,0,1): ("lava","volcano:ashPlume"),
            (-1,1,2): ("lava_hot","volcano:ashPlume"),
            (2,-1,0): ("ash_lit","volcano:ashPlume"),
        }
        obj = _simple_anim_mesh(vox, "ANIM_eruption_embers", (0,0,2.45))
        obj.keyframe_insert(data_path="location", frame=1)
        obj.location.z += 1.15
        obj.keyframe_insert(data_path="location", frame=49)
        if obj.animation_data and obj.animation_data.action:
            obj.animation_data.action.name = "eruption_embers"
    elif kind == "idea":
        vox = {}
        fid = "idea:knowledgeCore"
        for z, radius in ((0,1),(1,2),(2,2),(3,1),(4,0)):
            for x in range(-radius, radius+1):
                for y in range(-radius, radius+1):
                    if abs(x)+abs(y) <= radius+1:
                        vox[(x,y,z)] = ("crystal_hot", fid)
        obj = _simple_anim_mesh(vox, "ANIM_crystal_pulse", (0,0,1.42))
        obj.keyframe_insert(data_path="scale", frame=1)
        obj.scale.set((1.08,1.08,1.08))
        obj.keyframe_insert(data_path="scale", frame=25)
        obj.scale.set((1,1,1))
        obj.keyframe_insert(data_path="scale", frame=49)
        if obj.animation_data and obj.animation_data.action:
            obj.animation_data.action.name = "crystal_pulse"
    elif kind == "energy":
        vox = {}
        fid = "energy:complex"
        for angle in (0,120,240):
            a = math.radians(angle)
            for distance in range(1,7):
                x, z = round(math.sin(a)*distance), round(math.cos(a)*distance)
                vox[(x,0,z)] = ("metal_lit", fid)
        obj = _simple_anim_mesh(vox, "ANIM_rotor_spin", (-2.2, .25, 2.3))
        obj.rotation_mode = "XYZ"
        obj.rotation_euler[1] = 0
        obj.keyframe_insert(data_path="rotation_euler", frame=1)
        obj.rotation_euler[1] = 2*math.pi
        obj.keyframe_insert(data_path="rotation_euler", frame=49)
        if obj.animation_data and obj.animation_data.action:
            obj.animation_data.action.name = "rotor_spin"


def _reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for action in tuple(bpy.data.actions):
        bpy.data.actions.remove(action)


def _export_glb(path: Path):
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB",
        export_animations=True, export_extras=True,
    )


def camera_preview(path: Path, kind: str):
    bpy.ops.object.camera_add(location=(10.5,-15.5,12.5))
    cam = bpy.context.object
    target = bpy.data.objects.new("camera_target", None)
    bpy.context.collection.objects.link(target)
    target.location = (0,0,1.2 if kind != "villager" else 1.0)
    cam.rotation_euler = ((target.location - cam.location).to_track_quat("-Z","Y").to_euler())
    bpy.context.scene.camera = cam
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 7.1 if kind != "villager" else 4.2
    bpy.context.scene.render.engine = "BLENDER_WORKBENCH"
    bpy.context.scene.display.shading.light = "STUDIO"
    bpy.context.scene.display.shading.show_shadows = True
    bpy.context.scene.render.film_transparent = True
    bpy.context.scene.render.resolution_x = 640
    bpy.context.scene.render.resolution_y = 640
    bpy.context.scene.render.resolution_percentage = 100
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def _digest(path: Path):
    data = path.read_bytes()
    return {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}


def _semantic_file(output: Path, kind: str, recipe: Recipe):
    semantic_dir = output / "semantics"
    semantic_dir.mkdir(parents=True, exist_ok=True)
    path = semantic_dir / f"{kind}.json"
    payload = {
        **recipe.graph(),
        "recipeMeta": recipe.meta,
        "stats": recipe.stats(),
        "watercolorCompatibility": {
            "hiddenGeometryScaffold": True,
            "semanticEdges": True,
            "showVoxelWireframe": False,
            "pigmentRegionsFromFeatures": True,
        },
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path, payload


def _export_lod(kind: str, seed: int, lod: int, output: Path, params=None):
    _reset_scene()
    start = time.perf_counter()
    recipe = BUILDERS[kind](seed, lod, params)
    _, mesh_metrics = _add_recipe_mesh(recipe, f"VX_{kind}_LOD{lod}")
    animate(kind, recipe)
    file_name = f"{kind}.glb" if lod == 0 else f"{kind}.lod{lod}.glb"
    dest = output / file_name
    _export_glb(dest)
    elapsed = (time.perf_counter() - start) * 1000
    return recipe, {
        "lod": lod, "file": file_name,
        "url": "/apps/voxel-world/voxel-art/" + file_name,
        **_digest(dest), **recipe.stats(), **mesh_metrics,
        "generationMs": round(elapsed, 2),
    }


def make_asset(kind: str, output: Path, preview: bool, seed: int):
    asset_seed = (seed ^ (stable_hash(kind) & 0x7fffffff)) & 0x7fffffff
    lods = []
    semantic_recipe = None
    for lod in (0,1,2):
        recipe, meta = _export_lod(kind, asset_seed, lod, output)
        lods.append(meta)
        if lod == 0:
            semantic_recipe = recipe
            if preview:
                try:
                    camera_preview(output / f"{kind}.png", kind)
                except Exception as exc:
                    print("PREVIEW_WARNING", kind, str(exc))
    semantic_path, semantic_payload = _semantic_file(output, kind, semantic_recipe)
    preview_path = output / f"{kind}.png"
    preview_meta = None
    if preview_path.exists():
        preview_meta = {"file": preview_path.name, **_digest(preview_path)}
    high = lods[0]
    return {
        "id": kind, "type": kind, "file": high["file"], "url": high["url"],
        "sha256": high["sha256"], "bytes": high["bytes"],
        "triangles": high["triangles"], "vertices": high["vertices"],
        "visibleFaces": high["visibleFaces"], "voxelCount": high["voxelCount"],
        "drawCalls": high["drawCalls"], "clips": ANIMS.get(kind, []),
        "vfx": VFX.get(kind, []), "lods": lods,
        "semantic": {
            "file": "semantics/" + semantic_path.name, **_digest(semantic_path),
            "featureCount": semantic_payload["stats"]["featureCount"],
            "macroFeatures": semantic_payload["stats"]["macroFeatures"],
            "mesoFeatures": semantic_payload["stats"]["mesoFeatures"],
            "microFeatures": semantic_payload["stats"]["microFeatures"],
        },
        "format": "glTF-binary", "origin": "World Server original procedural voxel art",
        "license": "CC0-1.0", "unit": "metre", "up": "Y-glTF", "fps": 24,
        "seed": asset_seed, "preview": preview_meta,
    }


def main():
    cli = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="apps/voxel-world/voxel-art")
    parser.add_argument("--kinds", default=",".join(KINDS))
    parser.add_argument("--seed", type=int, default=20260929)
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args(cli)
    output = Path(args.out).resolve()
    output.mkdir(parents=True, exist_ok=True)
    kinds = [s.strip() for s in args.kinds.split(",") if s.strip()]
    if not kinds or any(s not in BUILDERS for s in kinds):
        parser.error("Supported: " + ", ".join(KINDS))
    started = time.perf_counter()
    result = [make_asset(kind, output, args.preview, args.seed) for kind in kinds]
    manifest = {
        "schemaVersion": 2, "generator": "blender-5.1-world-voxel-art-semantic-v2",
        "source": "tools/voxel-art/generate_blender.py",
        "recipeSources": [
            "tools/voxel-art/recipe_core.py",
            "tools/voxel-art/recipes_nature.py",
            "tools/voxel-art/recipes_built.py",
        ],
        "design": "original semantic multi-resolution voxel art",
        "seed": args.seed, "entities": result,
        "defaultFallback": "existing procedural voxel renderer",
        "generationMs": round((time.perf_counter()-started)*1000, 2),
        "optimization": {
            "hiddenFaceRemoval": True, "mergedMeshes": True,
            "perVoxelMeshes": False, "lodLevels": 3,
            "runtimeDistanceCulling": True,
        },
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("VOXEL_ART_V2_OK", json.dumps({
        x["id"]: {
            "features": x["semantic"]["featureCount"],
            "lod0Triangles": x["triangles"], "bytes": x["bytes"],
        } for x in result
    }))


if __name__ == "__main__":
    main()
