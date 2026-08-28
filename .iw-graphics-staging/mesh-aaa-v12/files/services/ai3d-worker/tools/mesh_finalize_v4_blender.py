from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--config", required=True)
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def import_glb(path: Path):
    bpy.ops.import_scene.gltf(filepath=str(path))


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def export_glb(path: Path):
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", export_yup=True,
        export_apply=False, export_animations=True, export_skins=True,
        export_morph=True, export_materials="EXPORT", export_texcoords=True,
        export_normals=True, export_tangents=True, export_optimize_animation_size=True,
    )


def scene_stats():
    triangles = 0
    vertices = 0
    draw_calls = 0
    materials = set()
    for obj in mesh_objects():
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        vertices += len(obj.data.vertices)
        active = [slot for slot in obj.material_slots if slot.material]
        draw_calls += max(1, len(active))
        materials.update(slot.material.name_full for slot in active)
    return {"triangles": triangles, "vertices": vertices, "materials": len(materials), "drawCallEstimate": draw_calls}


def bounds():
    points = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in mesh_objects():
        evaluated = obj.evaluated_get(depsgraph)
        points.extend(evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box)
    if not points:
        return Vector((0, 0, 0)), 1.0
    mins = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maxs = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return (mins + maxs) * 0.5, max((maxs - mins).length * 0.5, 0.1)


def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def delete_qa_objects():
    for obj in list(bpy.context.scene.objects):
        if obj.name.startswith("AUTO_V4_QA_"):
            bpy.data.objects.remove(obj, do_unlink=True)


def setup_lighting(center, radius, rig_name):
    delete_qa_objects()
    world = bpy.context.scene.world or bpy.data.worlds.new("AUTO_V4_QA_WORLD")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (0.03, 0.035, 0.045, 1.0)
        background.inputs["Strength"].default_value = 0.18 if rig_name == "sun" else 0.42

    if rig_name == "sun":
        data = bpy.data.lights.new("AUTO_V4_QA_SUN", type="SUN")
        data.energy = 3.2
        data.angle = math.radians(4.0)
        light = bpy.data.objects.new("AUTO_V4_QA_SUN", data)
        bpy.context.scene.collection.objects.link(light)
        light.rotation_euler = (math.radians(32), math.radians(-18), math.radians(-28))
    elif rig_name == "side":
        data = bpy.data.lights.new("AUTO_V4_QA_SIDE", type="AREA")
        data.energy = 1450
        data.size = max(radius * 1.35, 1.0)
        light = bpy.data.objects.new("AUTO_V4_QA_SIDE", data)
        bpy.context.scene.collection.objects.link(light)
        light.location = center + Vector((radius * 2.5, -radius * 0.25, radius * 1.0))
        look_at(light, center)
    else:
        data = bpy.data.lights.new("AUTO_V4_QA_SOFT", type="AREA")
        data.energy = 850
        data.size = max(radius * 3.0, 1.0)
        light = bpy.data.objects.new("AUTO_V4_QA_SOFT", data)
        bpy.context.scene.collection.objects.link(light)
        light.location = center + Vector((-radius * 1.5, -radius * 1.4, radius * 2.6))
        look_at(light, center)


def render_material_qa(output_dir: Path, size: int):
    output_dir.mkdir(parents=True, exist_ok=True)
    center, radius = bounds()
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        pass
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    rows = []
    for rig_name in ("sun", "side", "soft"):
        setup_lighting(center, radius, rig_name)
        camera_data = bpy.data.cameras.new("AUTO_V4_QA_CAMERA")
        camera = bpy.data.objects.new("AUTO_V4_QA_CAMERA", camera_data)
        scene.collection.objects.link(camera)
        scene.camera = camera
        camera.data.lens = 55
        for view_name, direction in {"front": Vector((0, -1, 0.18)), "iso": Vector((1, -1, 0.68))}.items():
            d = direction.normalized()
            camera.location = center + d * max(radius * 2.9, 1.5)
            look_at(camera, center)
            path = output_dir / f"{rig_name}_{view_name}.png"
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            rows.append(path.name)
    return rows


def principled(material):
    if not material or not material.use_nodes or not material.node_tree:
        return None
    return next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)


def socket(node, name):
    try:
        return node.inputs.get(name)
    except Exception:
        return None


def material_is_atlas_safe(material):
    bsdf = principled(material)
    if not bsdf:
        return False
    alpha = socket(bsdf, "Alpha")
    transmission = socket(bsdf, "Transmission Weight") or socket(bsdf, "Transmission")
    metallic = socket(bsdf, "Metallic")
    emission = socket(bsdf, "Emission Strength")
    if alpha and (alpha.is_linked or float(alpha.default_value) < 0.995):
        return False
    if transmission and (transmission.is_linked or float(transmission.default_value) > 0.01):
        return False
    if metallic and (metallic.is_linked or float(metallic.default_value) > 0.08):
        return False
    if emission and (emission.is_linked or float(emission.default_value) > 0.05):
        return False
    return True


def eligible_objects():
    rows = []
    for obj in mesh_objects():
        if any(mod.type == "ARMATURE" for mod in obj.modifiers):
            continue
        if obj.data.shape_keys and len(obj.data.shape_keys.key_blocks) > 1:
            continue
        materials = [slot.material for slot in obj.material_slots if slot.material]
        if materials and all(material_is_atlas_safe(material) for material in materials):
            rows.append(obj)
    return rows


def create_global_atlas_uv(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.data = obj.data.copy()
        uv = obj.data.uv_layers.get("AUTO_ATLAS_UV") or obj.data.uv_layers.new(name="AUTO_ATLAS_UV")
        obj.data.uv_layers.active = uv
        uv.active_render = True
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    try:
        bpy.ops.uv.pack_islands(rotate=True, margin=0.012)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode="OBJECT")


def set_active_bake_image(objects, image):
    nodes = []
    for obj in objects:
        for slot in obj.material_slots:
            material = slot.material
            if not material:
                continue
            material.use_nodes = True
            node = material.node_tree.nodes.new("ShaderNodeTexImage")
            node.name = "AUTO_V4_ATLAS_TARGET"
            node.image = image
            for other in material.node_tree.nodes:
                other.select = False
            node.select = True
            material.node_tree.nodes.active = node
            nodes.append((material, node))
    return nodes


def bake_channel(objects, image, bake_type, pass_filter=None):
    scene = bpy.context.scene
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 16
    except Exception:
        pass
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 12
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    nodes = set_active_bake_image(objects, image)
    kwargs = {"type": bake_type}
    if pass_filter is not None:
        kwargs["pass_filter"] = pass_filter
    if bake_type == "NORMAL":
        kwargs["normal_space"] = "TANGENT"
    try:
        bpy.ops.object.bake(**kwargs)
        image.save()
    finally:
        for material, node in nodes:
            try:
                material.node_tree.nodes.remove(node)
            except Exception:
                pass


def create_atlas_material(albedo, roughness, normal):
    material = bpy.data.materials.new("AUTO_V4_ATLAS_PBR")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    base = nodes.new("ShaderNodeTexImage")
    base.image = albedo
    base.image.colorspace_settings.name = "sRGB"
    rough = nodes.new("ShaderNodeTexImage")
    rough.image = roughness
    rough.image.colorspace_settings.name = "Non-Color"
    norm = nodes.new("ShaderNodeTexImage")
    norm.image = normal
    norm.image.colorspace_settings.name = "Non-Color"
    normal_map = nodes.new("ShaderNodeNormalMap")
    links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    links.new(norm.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def build_atlas(output_dir: Path, size: int):
    objects = eligible_objects()
    before = scene_stats()
    if not objects:
        return {"status": "SKIPPED", "reason": "no safe opaque static meshes", "beforeStats": before}
    safe_materials = {slot.material.name_full for obj in objects for slot in obj.material_slots if slot.material}
    if len(safe_materials) < 2 and before["drawCallEstimate"] <= 2:
        return {"status": "SKIPPED", "reason": "atlas would not materially reduce draw calls", "beforeStats": before}
    create_global_atlas_uv(objects)
    size = max(512, min(int(size), 4096))
    atlas_dir = output_dir / "atlas"
    atlas_dir.mkdir(parents=True, exist_ok=True)
    images = {}
    for key in ("ALBEDO", "ROUGHNESS", "NORMAL", "AO"):
        image = bpy.data.images.new(f"AUTO_V4_{key}", width=size, height=size, alpha=(key == "ALBEDO"), float_buffer=False)
        image.file_format = "PNG"
        image.filepath_raw = str(atlas_dir / f"ATLAS_{key}.png")
        if key != "ALBEDO":
            try:
                image.colorspace_settings.name = "Non-Color"
            except Exception:
                pass
        images[key] = image
    try:
        bake_channel(objects, images["ALBEDO"], "DIFFUSE", {"COLOR"})
        bake_channel(objects, images["ROUGHNESS"], "ROUGHNESS")
        bake_channel(objects, images["NORMAL"], "NORMAL")
        bake_channel(objects, images["AO"], "AO")
    except Exception as exc:
        return {"status": "FAILED", "reason": str(exc), "beforeStats": before}

    atlas_material = create_atlas_material(images["ALBEDO"], images["ROUGHNESS"], images["NORMAL"])
    rebound = []
    for obj in objects:
        previous = [slot.material.name_full for slot in obj.material_slots if slot.material]
        obj.data.materials.clear()
        obj.data.materials.append(atlas_material)
        for polygon in obj.data.polygons:
            polygon.material_index = 0
        rebound.append({"object": obj.name_full, "fromMaterials": previous, "toMaterial": atlas_material.name_full})
    after = scene_stats()
    return {
        "status": "CREATED",
        "size": size,
        "eligibleObjects": len(objects),
        "safeSourceMaterials": len(safe_materials),
        "rebound": rebound,
        "textures": {key.lower(): Path(image.filepath_raw).name for key, image in images.items()},
        "atlasDir": "atlas",
        "beforeStats": before,
        "afterStats": after,
        "drawCallReductionPercent": round((1.0 - after["drawCallEstimate"] / max(before["drawCallEstimate"], 1)) * 100.0, 2),
    }


def main():
    args = parse_args()
    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    output_dir.mkdir(parents=True, exist_ok=True)
    clear_scene()
    import_glb(input_path)
    base_stats = scene_stats()
    qa_size = int((config.get("materialQA") or {}).get("renderSize", 384))
    render_material_qa(output_dir / "renders_material_base", qa_size)
    atlas = build_atlas(output_dir, int((config.get("atlas") or {}).get("size", 2048))) if (config.get("atlas") or {}).get("enabled", True) else {"status": "DISABLED"}
    if atlas.get("status") == "CREATED":
        export_glb(output_dir / "LOD0_ATLAS.glb")
        render_material_qa(output_dir / "renders_material_atlas", qa_size)
    manifest = {
        "schemaVersion": 4,
        "status": "COMPLETED",
        "source": input_path.name,
        "baseStats": base_stats,
        "atlas": atlas,
        "candidate": "LOD0_ATLAS.glb" if (output_dir / "LOD0_ATLAS.glb").is_file() else None,
    }
    (output_dir / "finalize-v4-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
