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


def principled(material):
    if not material or not material.use_nodes or not material.node_tree:
        return None
    return next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)


def sock(node, *names):
    if not node:
        return None
    for name in names:
        socket = node.inputs.get(name)
        if socket:
            return socket
    return None


def scalar(socket, default=0.0):
    if not socket:
        return default
    try:
        value = socket.default_value
        if hasattr(value, "__len__") and not isinstance(value, str):
            return float(sum(value[:3]) / 3.0)
        return float(value)
    except Exception:
        return default


def material_family(material):
    bsdf = principled(material)
    if not bsdf:
        return "unsupported"
    alpha = sock(bsdf, "Alpha")
    transmission = sock(bsdf, "Transmission Weight", "Transmission")
    metallic = sock(bsdf, "Metallic")
    emission_strength = sock(bsdf, "Emission Strength")
    if (alpha and (alpha.is_linked or scalar(alpha, 1.0) < 0.995)) or (transmission and (transmission.is_linked or scalar(transmission) > 0.01)):
        return "transmissive"
    if emission_strength and (emission_strength.is_linked or scalar(emission_strength) > 0.05):
        return "emissive"
    if metallic and (metallic.is_linked or scalar(metallic) > 0.08):
        return "metal"
    return "dielectric"


def eligible_by_family():
    groups = {"dielectric": [], "metal": [], "emissive": [], "transmissive": []}
    for obj in mesh_objects():
        if any(mod.type == "ARMATURE" for mod in obj.modifiers):
            continue
        if obj.data.shape_keys and len(obj.data.shape_keys.key_blocks) > 1:
            continue
        materials = [slot.material for slot in obj.material_slots if slot.material]
        if not materials:
            continue
        families = {material_family(material) for material in materials}
        if len(families) == 1 and next(iter(families)) in groups:
            groups[next(iter(families))].append(obj)
    return groups


def scene_stats():
    triangles = vertices = draw_calls = 0
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


def delete_qa():
    for obj in list(bpy.context.scene.objects):
        if obj.name.startswith("AUTO_V5_QA_"):
            bpy.data.objects.remove(obj, do_unlink=True)


def setup_light(center, radius, rig):
    delete_qa()
    world = bpy.context.scene.world or bpy.data.worlds.new("AUTO_V5_QA_WORLD")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (0.025, 0.03, 0.04, 1)
        background.inputs["Strength"].default_value = 0.16 if rig in {"sun", "grazing"} else 0.40
    if rig == "sun":
        data = bpy.data.lights.new("AUTO_V5_QA_SUN", "SUN")
        data.energy = 3.1
        data.angle = math.radians(4)
        light = bpy.data.objects.new("AUTO_V5_QA_SUN", data)
        bpy.context.scene.collection.objects.link(light)
        light.rotation_euler = (math.radians(32), math.radians(-18), math.radians(-28))
    else:
        data = bpy.data.lights.new("AUTO_V5_QA_AREA", "AREA")
        data.energy = 1650 if rig == "grazing" else (1400 if rig == "side" else 850)
        data.size = max(radius * (0.8 if rig == "grazing" else (1.4 if rig == "side" else 3.0)), 1.0)
        light = bpy.data.objects.new("AUTO_V5_QA_AREA", data)
        bpy.context.scene.collection.objects.link(light)
        offsets = {"side": (2.5, -0.25, 1.0), "soft": (-1.5, -1.4, 2.6), "grazing": (2.9, -2.3, 0.18)}
        light.location = center + Vector(tuple(radius * x for x in offsets[rig]))
        look_at(light, center)


def render_qa(output_dir: Path, size: int):
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
    names = []
    for rig in ("sun", "side", "soft", "grazing"):
        setup_light(center, radius, rig)
        camera_data = bpy.data.cameras.new("AUTO_V5_QA_CAMERA")
        camera = bpy.data.objects.new("AUTO_V5_QA_CAMERA", camera_data)
        scene.collection.objects.link(camera)
        scene.camera = camera
        camera.data.lens = 55
        for view, direction in {"front": Vector((0, -1, 0.18)), "iso": Vector((1, -1, 0.68))}.items():
            camera.location = center + direction.normalized() * max(radius * 2.9, 1.5)
            look_at(camera, center)
            path = output_dir / f"{rig}_{view}.png"
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            names.append(path.name)
    return names


def create_uv(objects, family):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.data = obj.data.copy()
        uv = obj.data.uv_layers.get(f"AUTO_ATLAS_V5_{family}") or obj.data.uv_layers.new(name=f"AUTO_ATLAS_V5_{family}")
        obj.data.uv_layers.active = uv
        uv.active_render = True
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    try:
        bpy.ops.uv.pack_islands(rotate=True, margin=0.012)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode="OBJECT")


def tri_area2(a, b, c):
    return abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) * 0.5


def uv_audit(objects):
    ratios = []
    for obj in objects:
        uv = obj.data.uv_layers.active
        if not uv:
            continue
        for poly in obj.data.polygons:
            if len(poly.loop_indices) < 3:
                continue
            p0 = obj.data.vertices[poly.vertices[0]].co
            p1 = obj.data.vertices[poly.vertices[1]].co
            p2 = obj.data.vertices[poly.vertices[2]].co
            area_3d = ((p1 - p0).cross(p2 - p0)).length * 0.5
            if area_3d <= 1e-12:
                continue
            l0 = uv.data[poly.loop_indices[0]].uv
            l1 = uv.data[poly.loop_indices[1]].uv
            l2 = uv.data[poly.loop_indices[2]].uv
            area_uv = tri_area2(l0, l1, l2)
            if area_uv > 1e-12:
                ratios.append(area_uv / area_3d)
    if len(ratios) < 4:
        return {"samples": len(ratios), "p95OverP05": 1.0}
    ratios.sort()
    p05 = ratios[max(0, int(len(ratios) * 0.05) - 1)]
    p95 = ratios[min(len(ratios) - 1, int(len(ratios) * 0.95))]
    return {"samples": len(ratios), "p05": p05, "p95": p95, "p95OverP05": round(p95 / max(p05, 1e-12), 5)}


def active_bake_nodes(objects, image):
    rows = []
    for obj in objects:
        for slot in obj.material_slots:
            material = slot.material
            if not material:
                continue
            material.use_nodes = True
            node = material.node_tree.nodes.new("ShaderNodeTexImage")
            node.name = "AUTO_V5_BAKE_TARGET"
            node.image = image
            for other in material.node_tree.nodes:
                other.select = False
            node.select = True
            material.node_tree.nodes.active = node
            rows.append((material, node))
    return rows


def bake(objects, image, bake_type, pass_filter=None):
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
    nodes = active_bake_nodes(objects, image)
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


def value_to_rgba(value):
    try:
        if hasattr(value, "__len__") and not isinstance(value, str):
            values = list(value)
            return tuple(float(values[i] if i < len(values) else 1.0) for i in range(4))
        f = float(value)
        return (f, f, f, 1.0)
    except Exception:
        return (0, 0, 0, 1)


def bake_socket(objects, image, names):
    states = []
    for obj in objects:
        for slot in obj.material_slots:
            material = slot.material
            if not material or any(state[0] is material for state in states):
                continue
            bsdf = principled(material)
            output = next((node for node in material.node_tree.nodes if node.type == "OUTPUT_MATERIAL" and getattr(node, "is_active_output", True)), None) if material.use_nodes and material.node_tree else None
            target = sock(bsdf, *names)
            surface = output.inputs.get("Surface") if output else None
            if not bsdf or not target or not surface:
                continue
            old = surface.links[0].from_socket if surface.is_linked and surface.links else None
            temp = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
            emission_color = sock(temp, "Emission Color", "Emission")
            emission_strength = sock(temp, "Emission Strength")
            if emission_strength:
                emission_strength.default_value = 1.0
            if target.is_linked and emission_color:
                material.node_tree.links.new(target.links[0].from_socket, emission_color)
            elif emission_color:
                emission_color.default_value = value_to_rgba(target.default_value)
            material.node_tree.links.new(temp.outputs.get("BSDF"), surface)
            states.append((material, surface, old, temp))
    try:
        bake(objects, image, "EMIT")
    finally:
        for material, surface, old, temp in states:
            try:
                if old:
                    material.node_tree.links.new(old, surface)
                material.node_tree.nodes.remove(temp)
            except Exception:
                pass


def new_image(path: Path, size: int, alpha=False, noncolor=True):
    image = bpy.data.images.new(path.stem, width=size, height=size, alpha=alpha, float_buffer=False)
    image.file_format = "PNG"
    image.filepath_raw = str(path)
    if noncolor:
        try:
            image.colorspace_settings.name = "Non-Color"
        except Exception:
            pass
    return image


def make_material(family, images):
    material = bpy.data.materials.new(f"AUTO_V5_ATLAS_{family.upper()}")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")

    def tex(key, noncolor=True):
        image = images.get(key)
        if not image:
            return None
        node = nodes.new("ShaderNodeTexImage")
        node.image = image
        try:
            node.image.colorspace_settings.name = "Non-Color" if noncolor else "sRGB"
        except Exception:
            pass
        return node

    base = tex("albedo", False)
    rough = tex("roughness")
    normal = tex("normal")
    if base:
        links.new(base.outputs["Color"], sock(bsdf, "Base Color"))
    if rough:
        links.new(rough.outputs["Color"], sock(bsdf, "Roughness"))
    if normal:
        normal_map = nodes.new("ShaderNodeNormalMap")
        links.new(normal.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], sock(bsdf, "Normal"))
    mappings = {"metallic": ("Metallic",), "transmission": ("Transmission Weight", "Transmission"), "alpha": ("Alpha",), "emission": ("Emission Color", "Emission"), "emission_strength": ("Emission Strength",)}
    for key, names in mappings.items():
        node = tex(key, key != "emission")
        target = sock(bsdf, *names)
        if node and target:
            links.new(node.outputs["Color"], target)
    if family == "transmissive":
        try:
            material.surface_render_method = "DITHERED"
        except Exception:
            try:
                material.blend_method = "BLEND"
            except Exception:
                pass
    return material


def build_family_atlases(output_dir: Path, size: int):
    before = scene_stats()
    groups = eligible_by_family()
    families = []
    created = 0
    root = output_dir / "atlas_v5"
    root.mkdir(parents=True, exist_ok=True)
    for family, objects in groups.items():
        source_materials = {slot.material.name_full for obj in objects for slot in obj.material_slots if slot.material}
        estimated_calls = sum(max(1, len([slot for slot in obj.material_slots if slot.material])) for obj in objects)
        if not objects or (len(source_materials) < 2 and estimated_calls <= 2):
            continue
        create_uv(objects, family)
        audit = uv_audit(objects)
        family_dir = root / family
        family_dir.mkdir(parents=True, exist_ok=True)
        keys = ["albedo", "roughness", "normal", "ao"]
        if family == "metal":
            keys += ["metallic"]
        if family == "emissive":
            keys += ["emission", "emission_strength"]
        if family == "transmissive":
            keys += ["alpha", "transmission"]
        images = {key: new_image(family_dir / f"ATLAS_{family.upper()}_{key.upper()}.png", size, alpha=(key in {"albedo", "alpha"}), noncolor=(key not in {"albedo", "emission"})) for key in keys}
        try:
            bake(objects, images["albedo"], "DIFFUSE", {"COLOR"})
            bake(objects, images["roughness"], "ROUGHNESS")
            bake(objects, images["normal"], "NORMAL")
            bake(objects, images["ao"], "AO")
            for key, names in {"metallic": ("Metallic",), "emission": ("Emission Color", "Emission"), "emission_strength": ("Emission Strength",), "alpha": ("Alpha",), "transmission": ("Transmission Weight", "Transmission")}.items():
                if key in images:
                    bake_socket(objects, images[key], names)
        except Exception as exc:
            families.append({"family": family, "status": "FAILED", "reason": str(exc), "uvAudit": audit})
            continue
        atlas_material = make_material(family, images)
        rebound = []
        for obj in objects:
            previous = [slot.material.name_full for slot in obj.material_slots if slot.material]
            obj.data.materials.clear()
            obj.data.materials.append(atlas_material)
            for polygon in obj.data.polygons:
                polygon.material_index = 0
            rebound.append({"object": obj.name_full, "fromMaterials": previous, "toMaterial": atlas_material.name_full})
        families.append({"family": family, "status": "CREATED", "eligibleObjects": len(objects), "sourceMaterials": len(source_materials), "textures": {key: str(Path(image.filepath_raw).relative_to(output_dir)) for key, image in images.items()}, "uvAudit": audit, "rebound": rebound})
        created += 1
    after = scene_stats()
    return {"status": "CREATED" if created else "SKIPPED", "schemaVersion": 5, "families": families, "beforeStats": before, "afterStats": after, "drawCallReductionPercent": round((1.0 - after["drawCallEstimate"] / max(before["drawCallEstimate"], 1)) * 100.0, 2)}


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
    render_qa(output_dir / "renders_material_base", qa_size)
    atlas = build_family_atlases(output_dir, int((config.get("atlas") or {}).get("size", 2048))) if (config.get("atlas") or {}).get("enabled", True) else {"status": "DISABLED", "families": []}
    candidate = None
    if atlas.get("status") == "CREATED":
        candidate = output_dir / "LOD0_ATLAS_V5.glb"
        export_glb(candidate)
        render_qa(output_dir / "renders_material_atlas", qa_size)
    manifest = {"schemaVersion": 5, "status": "COMPLETED", "source": input_path.name, "baseStats": base_stats, "atlas": atlas, "candidate": candidate.name if candidate else None}
    (output_dir / "finalize-v5-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
