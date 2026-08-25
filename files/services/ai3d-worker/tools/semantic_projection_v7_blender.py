from __future__ import annotations
import argparse, json, sys
from pathlib import Path
import bpy
from mathutils import Vector


def parse():
    argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    p=argparse.ArgumentParser(); p.add_argument('mode',choices=['render']); p.add_argument('--input',required=True); p.add_argument('--output-dir',required=True); p.add_argument('--size',type=int,default=512); return p.parse_args(argv)

def clear():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def imp(path):
    ext=path.suffix.lower()
    if ext in {'.glb','.gltf'}: bpy.ops.import_scene.gltf(filepath=str(path))
    elif ext=='.fbx': bpy.ops.import_scene.fbx(filepath=str(path))
    elif ext=='.obj': bpy.ops.wm.obj_import(filepath=str(path))
    elif ext=='.ply': bpy.ops.wm.ply_import(filepath=str(path))
    else: raise RuntimeError(ext)

def bounds():
    pts=[]
    for o in bpy.context.scene.objects:
        if o.type=='MESH': pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    if not pts: raise RuntimeError('No mesh objects')
    mn=Vector((min(p.x for p in pts),min(p.y for p in pts),min(p.z for p in pts))); mx=Vector((max(p.x for p in pts),max(p.y for p in pts),max(p.z for p in pts)))
    return (mn+mx)*.5, max((mx-mn).length*.5,.1)

def look(o,target): o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()

def main():
    a=parse(); out=Path(a.output_dir); out.mkdir(parents=True,exist_ok=True); clear(); imp(Path(a.input)); center,r=bounds(); scene=bpy.context.scene
    try: scene.render.engine='BLENDER_EEVEE_NEXT'
    except Exception: pass
    scene.render.resolution_x=a.size;scene.render.resolution_y=a.size;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
    cd=bpy.data.cameras.new('SEMANTIC_CAMERA'); cam=bpy.data.objects.new('SEMANTIC_CAMERA',cd);scene.collection.objects.link(cam);scene.camera=cam;cam.data.lens=55
    cam.location=center+Vector((0,-max(r*2.9,1.5),r*.15));look(cam,center)
    ld=bpy.data.lights.new('SEMANTIC_KEY','AREA');ld.energy=1100;ld.size=max(r*1.6,1.0);lo=bpy.data.objects.new('SEMANTIC_KEY',ld);scene.collection.objects.link(lo);lo.location=center+Vector((r*1.5,-r*1.5,r*2));look(lo,center)
    scene.render.filepath=str(out/'semantic-reference.png');bpy.ops.render.render(write_still=True)
    (out/'semantic-camera.json').write_text(json.dumps({'schemaVersion':7,'matrixWorld':[list(row) for row in cam.matrix_world],'lens':cam.data.lens,'sensorWidth':cam.data.sensor_width,'sensorHeight':cam.data.sensor_height,'renderSize':[a.size,a.size]},indent=2),encoding='utf-8')
if __name__=='__main__':main()
