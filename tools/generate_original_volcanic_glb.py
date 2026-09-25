"""Original CPU Blender generator for World Server volcanic RTS assets.

Run: blender --background --python tools/generate_original_volcanic_glb.py -- /output/path
Requires Blender 3.6+; no upstream Minecraft assets or scripts are imported.
Exports three independent GLBs for existing Three.js / Godot pipelines.
"""
import bpy
import math
import random
import sys
from pathlib import Path

SEED = 260926
OUT = Path(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else Path("work/original-volcanic")
OUT.mkdir(parents=True, exist_ok=True)


def material(name, color, metal=0.0, rough=0.85, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = 2.0
    return mat


def cube(name, pos, scale, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("machined edges", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def cylinder(name, pos, radius, depth, mat, vertices=12, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=pos,
                                        rotation=rotation or (0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def reset():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def export(name):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name + ".glb")), export_format="GLB",
                              export_apply=True, export_materials="EXPORT")
    print("EXPORTED", name, len(bpy.context.scene.objects))


rock = material("original basalt", (0.065, 0.075, 0.084))
ash = material("original ash", (0.13, 0.115, 0.105))
steel = material("original dark steel", (0.21, 0.25, 0.27), 0.82, 0.38)
concrete = material("original heat-resistant concrete", (0.33, 0.34, 0.33))
lava = material("original lava emissive", (0.98, 0.17, 0.018), 0.0, 0.5, (1.0, 0.075, 0.008))
warning = material("original safety stripe", (0.94, 0.51, 0.035), 0.15, 0.5)

# Rock cluster: 12 unique irregular rocks, seeded and reproducible.
reset()
rng = random.Random(SEED)
for i in range(12):
    angle = i * math.tau / 12
    radius = 1.2 + rng.random() * 3.0
    x, y = math.cos(angle) * radius, math.sin(angle) * radius
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=(x, y, 0.4))
    obj = bpy.context.object
    obj.name = "basalt_%02d" % i
    obj.scale = (0.4 + rng.random() * 0.8, 0.4 + rng.random() * 0.9, 0.5 + rng.random() * 1.4)
    for vertex in obj.data.vertices:
        vertex.co *= 0.78 + rng.random() * 0.46
    obj.data.materials.append(rock if i % 3 else ash)
export("original_basalt_cluster")

# Geothermal hero: distinct, readable silhouette from both RTS scales.
reset()
cube("geothermal_foundation", (0, 0, 0.25), (5, 4, 0.5), concrete, 0.08)
cube("generator_hall", (0, 0, 1.4), (3.6, 2.7, 1.8), steel, 0.09)
cube("raised_roof", (0, 0, 2.38), (4.1, 3.0, 0.22), concrete, 0.04)
for x in (-1.55, 1.55):
    cylinder("heat_exchanger", (x, 0.4, 3.4), 0.45, 2.4, steel)
    cylinder("exchanger_lid", (x, 0.4, 4.64), 0.51, 0.16, warning)
for y in (-1.45, 1.45):
    cube("service_walkway", (0, y, 1.8), (5.3, 0.52, 0.14), steel)
    for x in (-2.45, -1.2, 0, 1.2, 2.45):
        cube("guardrail_post", (x, y, 2.24), (0.06, 0.06, 0.82), warning)
    cube("guardrail_top", (0, y, 2.66), (5.0, 0.065, 0.065), warning)
for x in (-0.85, 0.85):
    cylinder("vent", (x, -0.7, 2.9), 0.28, 1.1, steel)
export("original_geothermal_hero")

# Small emissive lava vent: reuse by instancing rather than unique meshes.
reset()
cylinder("vent_rock", (0, 0, 0.24), 1.1, 0.48, rock, vertices=9)
cylinder("vent_glow", (0, 0, 0.5), 0.76, 0.08, lava, vertices=12)
for i in range(7):
    angle = i * math.tau / 7
    cylinder("rim_%02d" % i, (math.cos(angle) * 0.85, math.sin(angle) * 0.85, 0.6),
             0.21, 0.5, rock, vertices=6)
export("original_lava_vent")
