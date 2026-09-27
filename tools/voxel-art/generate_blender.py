"""World Server original voxel-art factory. Run through Blender 5.1+ in background mode."""
import argparse
import hashlib
import json
import math
import os
import sys
from pathlib import Path

import bpy

COLORS = {
    "dirt": (0.37, .22, .13, 1), "sand": (.69, .49, .28, 1),
    "grass": (.28, .55, .19, 1), "stone": (.35, .39, .43, 1),
    "road": (.46, .44, .39, 1), "wood": (.38, .19, .075, 1),
    "leaves": (.14, .40, .15, 1), "leaves_light": (.27, .60, .20, 1),
    "wall": (.82, .78, .66, 1), "roof": (.64, .23, .14, 1),
    "glass": (.40, .72, .89, 1), "lava": (1.0, .27, .012, 1),
    "embers": (1.0, .66, .08, 1), "metal": (.55, .63, .67, 1),
    "solar": (.06, .23, .48, 1), "crystal": (.03, .79, 1.0, 1),
    "water": (.035, .39, .77, .75), "smoke": (.49, .49, .47, .85),
    "skin": (.88, .60, .38, 1), "shirt": (.85, .77, .61, 1),
    "pants": (.34, .23, .15, 1),
}
VFX = {"volcano": ["lava_glow", "eruption_embers", "ash"],
       "energy": ["rotor_spin", "electric_spark"],
       "idea": ["crystal_pulse"], "river": ["water_ripples"]}
ANIMS = {"energy": ["rotor_spin"], "idea": ["crystal_pulse"],
         "volcano": ["eruption_embers"], "villager": ["walk_left", "walk_right"]}
PIVOT = {"energy": (0, -.81, 1.75), "idea": (0, 0, 1.55),
         "volcano": (0, 0, 2.86), "villager": (0, 0, .81)}
DIRECTIONS = [(1, 0, 0), (-1, 0, 0), (0, 1, 0),
              (0, -1, 0), (0, 0, 1), (0, 0, -1)]
QUADS = [
    [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)],
    [(-1, 1, -1), (-1, -1, -1), (-1, -1, 1), (-1, 1, 1)],
    [(1, 1, -1), (-1, 1, -1), (-1, 1, 1), (1, 1, 1)],
    [(-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)],
    [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)],
    [(1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1)],
]


def material(name):
    existing = bpy.data.materials.get("VX_" + name)
    if existing:
        return existing
    m = bpy.data.materials.new("VX_" + name)
    color = COLORS[name]
    m.diffuse_color = color
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = .88
    if name in ("lava", "embers", "crystal"):
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = 2.2
    if color[3] < 1:
        bsdf.inputs["Alpha"].default_value = color[3]
        m.surface_render_method = "BLENDED"
    return m


def block(voxels, x, y, z, kind):
    voxels[(int(x), int(y), int(z))] = kind


def cuboid(voxels, xa, xb, ya, yb, za, zb, kind):
    for x in range(xa, xb + 1):
        for y in range(ya, yb + 1):
            for z in range(za, zb + 1):
                block(voxels, x, y, z, kind)


def mesh(voxels, name, pivot=(0, 0, 0), unit=.27):
    vertices, polygons, indices = [], [], []
    palette = sorted(set(voxels.values()))
    for (x, y, z), kind in sorted(voxels.items()):
        for d, (dx, dy, dz) in enumerate(DIRECTIONS):
            if (x + dx, y + dy, z + dz) in voxels:
                continue
            offset = len(vertices)
            for qx, qy, qz in QUADS[d]:
                vertices.append(((x + qx * .5) * unit,
                                 (y + qy * .5) * unit,
                                 (z + qz * .5) * unit))
            polygons.append(tuple(range(offset, offset + 4)))
            indices.append(palette.index(kind))
    data = bpy.data.meshes.new(name + "_geometry")
    data.from_pydata(vertices, [], polygons)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = pivot
    for kind in palette:
        data.materials.append(material(kind))
    for polygon, index in zip(data.polygons, indices):
        polygon.material_index = index
    return obj, len(polygons) * 2


def terrain(kind="grass"):
    voxels = {}
    cuboid(voxels, -6, 5, -6, 5, -1, 0, "dirt")
    cuboid(voxels, -6, 5, -6, 5, 1, 1, kind)
    return voxels


def tree(v, x, y, tall=5):
    cuboid(v, x, x, y, y, 2, tall, "wood")
    for z in range(tall - 1, tall + 3):
        radius = 2 if z < tall + 2 else 1
        for dx in range(-radius, radius + 1):
            for dy in range(-radius, radius + 1):
                if abs(dx) + abs(dy) <= radius + 1:
                    block(v, x + dx, y + dy, z, "leaves_light" if z == tall + 2 else "leaves")


def house(v, x, y, width=4):
    cuboid(v, x, x + width - 1, y, y + 3, 2, 5, "wall")
    cuboid(v, x - 1, x + width, y - 1, y + 4, 6, 6, "roof")
    cuboid(v, x, x + width - 1, y, y + 3, 7, 7, "roof")
    block(v, x + 1, y - 1, 3, "wood")
    block(v, x + 2, y - 1, 4, "glass")
    block(v, x + 1, y + 4, 4, "glass")


def build_barren():
    v = terrain("sand")
    for x, y in [(-4, -3), (2, 3), (4, -4), (-2, 4)]:
        cuboid(v, x, x + 1, y, y + 1, 2, 2, "stone")
    for x, y in [(-4, 2), (3, 4), (-1, -4)]:
        cuboid(v, x, x, y, y, 2, 4, "wood")
    return v


def build_city():
    v = terrain()
    cuboid(v, -1, 1, -6, 5, 2, 2, "road")
    house(v, -6, -5)
    house(v, 2, 1)
    cuboid(v, -5, -4, 2, 3, 2, 3, "wood")
    return v


def build_forest():
    v = terrain()
    for x, y, height in [(-4, -3, 6), (2, -4, 5), (-4, 3, 6), (3, 3, 7), (0, 0, 5)]:
        tree(v, x, y, height)
    for x, y in [(-2, -5), (5, 0), (-5, 1), (1, 5)]:
        block(v, x, y, 2, "embers")
    return v


def build_volcano():
    v = terrain("stone")
    for z in range(2, 11):
        radius = max(1, int(6 - (z - 2) * .55))
        for x in range(-radius, radius + 1):
            for y in range(-radius, radius + 1):
                if x * x + y * y < radius * radius + 2:
                    block(v, x, y, z, "stone" if (x + y + z) % 7 else "dirt")
    cuboid(v, -1, 1, -1, 1, 10, 10, "lava")
    for z, x in [(9, 1), (8, 2), (7, 3), (6, 4), (5, 5)]:
        block(v, x, -1, z, "lava")
    return v


def build_energy():
    v = terrain()
    cuboid(v, -1, 1, -2, 0, 2, 6, "metal")
    cuboid(v, 2, 5, 0, 4, 2, 2, "solar")
    cuboid(v, -5, -3, 2, 4, 2, 3, "metal")
    block(v, -4, 3, 4, "embers")
    return v


def build_idea():
    v = terrain("stone")
    cuboid(v, -2, 2, -2, 2, 2, 3, "stone")
    cuboid(v, -1, 1, -1, 1, 4, 5, "metal")
    for z, radius in [(0, 1), (1, 2), (2, 2), (3, 1), (4, 0)]:
        for x in range(-radius, radius + 1):
            for y in range(-radius, radius + 1):
                if abs(x) + abs(y) <= radius + 1:
                    block(v, x, y, z, "crystal")
    return v


def build_river():
    v = terrain()
    for y in range(-6, 6):
        center = int(math.sin(y * .4) * 1.7)
        for x in range(center - 2, center + 3):
            for z in (1, 2):
                v.pop((x, y, z), None)
            block(v, x, y, 1, "sand")
            block(v, x, y, 2, "water")
    return v


def build_villager():
    v = {}
    cuboid(v, -1, 1, -1, 1, 3, 5, "shirt")
    cuboid(v, -1, 1, -1, 1, 6, 8, "skin")
    cuboid(v, -2, 2, -2, 2, 9, 9, "sand")
    cuboid(v, -1, 1, -1, 1, 10, 10, "wood")
    block(v, -1, -2, 7, "wood")
    block(v, 1, -2, 7, "wood")
    return v


BUILDERS = {
    "barren": build_barren, "city": build_city, "forest": build_forest,
    "volcano": build_volcano, "energy": build_energy, "idea": build_idea,
    "river": build_river, "villager": build_villager,
}


def animate(kind):
    if kind == "energy":
        blades = {}
        cuboid(blades, -1, 1, -1, 1, -1, 1, "metal")
        for angle in (0, 120, 240):
            a = math.radians(angle)
            for distance in range(2, 9):
                x, z = round(math.sin(a) * distance), round(math.cos(a) * distance)
                block(blades, x, 0, z, "wall")
                if distance > 4:
                    block(blades, x + 1, 0, z, "glass")
        rotor, _ = mesh(blades, "ANIM_rotor_spin", PIVOT[kind])
        rotor.rotation_mode = "XYZ"
        rotor.rotation_euler[1] = 0
        rotor.keyframe_insert(data_path="rotation_euler", frame=1)
        rotor.rotation_euler[1] = 2 * math.pi
        rotor.keyframe_insert(data_path="rotation_euler", frame=49)
        action = rotor.animation_data.action
        if action:
            action.name = "rotor_spin"
    elif kind == "idea":
        crystal = {}
        for z, width in [(0, 1), (1, 2), (2, 2), (3, 1), (4, 0)]:
            cuboid(crystal, -width, width, -width, width, z, z, "crystal")
        ob, _ = mesh(crystal, "ANIM_crystal_pulse", PIVOT[kind])
        ob.keyframe_insert(data_path="location", frame=1)
        ob.location.z += .20
        ob.keyframe_insert(data_path="location", frame=25)
        ob.location.z -= .20
        ob.keyframe_insert(data_path="location", frame=49)
        if ob.animation_data.action:
            ob.animation_data.action.name = "crystal_pulse"
    elif kind == "volcano":
        ember = {(0, 0, 0): "embers", (1, 0, 1): "embers", (-1, 1, 2): "embers"}
        ob, _ = mesh(ember, "ANIM_eruption_embers", PIVOT[kind])
        ob.keyframe_insert(data_path="location", frame=1)
        ob.location.z += .85
        ob.keyframe_insert(data_path="location", frame=49)
        if ob.animation_data.action:
            ob.animation_data.action.name = "eruption_embers"
    elif kind == "villager":
        for side, suffix in [(-1, "left"), (1, "right")]:
            leg = {}
            cuboid(leg, 0, 0, -1, 1, -3, -1, "pants")
            obj, _ = mesh(leg, "ANIM_leg_" + suffix,
                          pivot=(side * .27, 0, .81))
            obj.rotation_euler[0] = side * .4
            obj.keyframe_insert(data_path="rotation_euler", frame=1)
            obj.rotation_euler[0] = -side * .4
            obj.keyframe_insert(data_path="rotation_euler", frame=13)
            obj.rotation_euler[0] = side * .4
            obj.keyframe_insert(data_path="rotation_euler", frame=25)
            if obj.animation_data.action:
                obj.animation_data.action.name = "walk_" + suffix


def camera_preview(path):
    bpy.ops.object.camera_add(location=(9, -13, 11))
    cam = bpy.context.object
    target = bpy.data.objects.new("camera_target", None)
    bpy.context.collection.objects.link(target)
    cam.rotation_euler = ((target.location - cam.location).to_track_quat("-Z", "Y").to_euler())
    bpy.context.scene.camera = cam
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 6.5
    bpy.context.scene.render.engine = "BLENDER_WORKBENCH"
    bpy.context.scene.render.film_transparent = True
    bpy.context.scene.render.resolution_x = 512
    bpy.context.scene.render.resolution_y = 512
    bpy.context.scene.render.resolution_percentage = 100
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def make_asset(kind, output, preview):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 49
    bpy.context.scene.render.fps = 24
    obj, triangles = mesh(BUILDERS[kind](), "VX_" + kind)
    obj["world_server_type"] = kind
    animate(kind)
    dest = output / (kind + ".glb")
    bpy.ops.export_scene.gltf(filepath=str(dest), export_format="GLB",
                              export_animations=True, export_extras=True)
    if preview:
        try:
            camera_preview(output / (kind + ".png"))
        except Exception as exc:
            print("PREVIEW_WARNING", kind, str(exc))
    return {
        "id": kind, "type": kind, "file": kind + ".glb", "url": "/apps/voxel-world/voxel-art/" + kind + ".glb",
        "sha256": hashlib.sha256(dest.read_bytes()).hexdigest(), "bytes": dest.stat().st_size,
        "triangles": triangles, "clips": ANIMS.get(kind, []), "vfx": VFX.get(kind, []),
        "format": "glTF-binary", "origin": "World Server original procedural voxel art",
        "license": "CC0-1.0", "unit": "metre", "up": "Y-glTF", "fps": 24,
    }


def main():
    cli = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="apps/voxel-world/voxel-art")
    parser.add_argument("--kinds", default=",".join(BUILDERS))
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args(cli)
    output = Path(args.out).resolve()
    output.mkdir(parents=True, exist_ok=True)
    kinds = [s.strip() for s in args.kinds.split(",") if s.strip()]
    if not kinds or any(s not in BUILDERS for s in kinds):
        parser.error("Supported: " + ", ".join(BUILDERS))
    result = [make_asset(k, output, args.preview) for k in kinds]
    manifest = {
        "schemaVersion": 1, "generator": "blender-5.1-world-voxel-art",
        "source": "tools/voxel-art/generate_blender.py",
        "design": "original isometric industrial voxel art",
        "entities": result, "defaultFallback": "existing procedural voxel renderer",
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("VOXEL_ART_OK", json.dumps({x["id"]: x["bytes"] for x in result}))


if __name__ == "__main__":
    main()
