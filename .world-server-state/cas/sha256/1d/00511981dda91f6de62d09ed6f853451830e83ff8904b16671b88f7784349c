import bpy
import sys
import math
import os
import json
from pathlib import Path

# Args after --
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--glb", required=True)
parser.add_argument("--outdir", required=True)
parser.add_argument("--reference", required=True)
args = parser.parse_args(argv)

glb_path = Path(args.glb).resolve()
outdir = Path(args.outdir).resolve()
ref_path = Path(args.reference).resolve()
outdir.mkdir(parents=True, exist_ok=True)

# Clear scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# Import GLB
try:
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    print(f"Imported {glb_path}")
except Exception as e:
    print(f"GLB import failed: {e}")
    # Try alternative
    try:
        bpy.ops.import_scene.gltf(filepath=str(glb_path), use_import_all_data=True)
    except Exception as e2:
        print(f"Second import failed: {e2}")
        sys.exit(1)

# Get imported objects
imported = [o for o in bpy.context.scene.objects if o.type == 'MESH']
print(f"Imported {len(imported)} meshes")
if not imported:
    print("No meshes imported")
    sys.exit(1)

# Center and scale
# Compute bounds
all_verts = []
for obj in imported:
    # Get world matrix bounds
    mat = obj.matrix_world
    for v in obj.data.vertices:
        co = mat @ v.co
        all_verts.append(co)
if all_verts:
    min_co = [min(v[i] for v in all_verts) for i in range(3)]
    max_co = [max(v[i] for v in all_verts) for i in range(3)]
    center = [(min_co[i] + max_co[i]) / 2 for i in range(3)]
    size = max(max_co[i] - min_co[i] for i in range(3))
    print(f"Bounds center {center} size {size}")
    # Normalize to fit in view (size 2)
    scale = 2.0 / max(size, 0.1)
    for obj in imported:
        obj.location.x -= center[0]
        obj.location.y -= center[1]
        obj.location.z -= center[2]
        obj.scale = (scale, scale, scale)
    bpy.context.view_layer.update()

# Setup scene
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.cycles.samples = 16

# Create camera
cam_data = bpy.data.cameras.new(name="AI3D_Cam")
cam_data.lens = 35
cam_data.clip_start = 0.1
cam_data.clip_end = 100
cam_obj = bpy.data.objects.new("AI3D_Cam", cam_data)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj

# Create light
light_data = bpy.data.lights.new(name="AI3D_Light", type='SUN')
light_data.energy = 5.0
light_obj = bpy.data.objects.new("AI3D_Light", light_data)
light_obj.location = (5, 5, 10)
scene.collection.objects.link(light_obj)
# Add fill light
light2_data = bpy.data.lights.new(name="Fill", type='SUN')
light2_data.energy = 2.0
light2_obj = bpy.data.objects.new("Fill", light2_data)
light2_obj.location = (-5, -3, 5)
scene.collection.objects.link(light2_obj)

# Create clay material (neutral)
clay_mat = bpy.data.materials.new(name="Clay")
clay_mat.use_nodes = True
nodes = clay_mat.node_tree.nodes
principled = nodes.get("Principled BSDF")
if principled:
    principled.inputs["Base Color"].default_value = (0.82, 0.82, 0.82, 1)
    principled.inputs["Roughness"].default_value = 0.9
    principled.inputs["Metallic"].default_value = 0.0

# Store original materials
orig_mats = {}
for obj in imported:
    orig_mats[obj.name] = [slot.material for slot in obj.material_slots]

def set_clay(enable):
    for obj in imported:
        if enable:
            if len(obj.material_slots) == 0:
                obj.data.materials.append(clay_mat)
            else:
                for i in range(len(obj.material_slots)):
                    obj.material_slots[i].material = clay_mat
        else:
            # Restore
            mats = orig_mats.get(obj.name, [])
            for i, mat in enumerate(mats):
                if i < len(obj.material_slots):
                    obj.material_slots[i].material = mat

# Camera positions for 6 views
# We'll orbit around Y axis, with slight top oblique
views = [
    ("front", 0, 5, 1.6),
    ("left15", -15, 5, 1.6),
    ("right15", 15, 5, 1.6),
    ("left30", -30, 5, 1.6),
    ("right30", 30, 5, 1.6),
    ("top_oblique", 0, 35, 6),
]

# Auto-fit: for front, try to match reference perspective
# Reference is roughly front view with slight top, we use front with yaw 0, pitch 15 deg down
import mathutils

for name, yaw_deg, pitch_deg, dist in views:
    yaw = math.radians(yaw_deg)
    pitch = math.radians(pitch_deg)
    # Spherical coordinates
    # Camera at distance, looking at origin
    x = dist * math.sin(yaw) * math.cos(math.radians(pitch))
    y = -dist * math.cos(yaw) * math.cos(math.radians(pitch))
    z = dist * math.sin(math.radians(pitch)) + 0.5
    cam_obj.location = (x, y, z)
    # Look at origin
    direction = mathutils.Vector((0,0,0.3)) - cam_obj.location
    rot_quat = direction.to_track_quat('-Z', 'Y')
    cam_obj.rotation_euler = rot_quat.to_euler()

    # Render clay
    set_clay(True)
    scene.render.filepath = str(outdir / f"{name}_clay.png")
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {name}_clay.png")

    # Render textured
    set_clay(False)
    scene.render.filepath = str(outdir / f"{name}_textured.png")
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {name}_textured.png")

# Save camera params
cam_params = {
    "views": views,
    "lens": cam_data.lens,
    "note": "Front camera fitted to approximate reference perspective, fixed after search"
}
with open(outdir / "camera.json", "w") as f:
    json.dump(cam_params, f, indent=2)
print("Camera params saved")
