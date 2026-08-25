# Run with Blender: blender -b input.blend --python repair_uv_health.py -- --output candidate.blend
# Candidate-only UV repair. Never overwrites the input file.
import argparse, sys
try:
    import bpy
except Exception:
    bpy=None

def main():
    if bpy is None: raise RuntimeError('This script must run inside Blender.')
    argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    p=argparse.ArgumentParser(); p.add_argument('--output',required=True); p.add_argument('--margin',type=float,default=.004); a=p.parse_args(argv)
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH': continue
        bpy.context.view_layer.objects.active=obj; obj.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(island_margin=max(.001,min(a.margin,.05)))
        bpy.ops.uv.pack_islands(margin=max(.001,min(a.margin,.05)))
        bpy.ops.object.mode_set(mode='OBJECT'); obj.select_set(False)
    bpy.ops.wm.save_as_mainfile(filepath=a.output,check_existing=False)
if __name__=='__main__': main()
