from __future__ import annotations
import json, os, shutil, subprocess
from pathlib import Path
class MeshQualityOptimizer:
    def __init__(self): self.blender=os.environ.get("BLENDER_BIN","").strip() or shutil.which("blender")
    def audit(self,p:Path):
        out={"path":str(p),"bytes":p.stat().st_size if p.is_file() else 0,"valid":False,"vertices":None,"faces":None}
        if not p.is_file(): return out
        try:
            import trimesh
            scene=trimesh.load(str(p),force="scene",process=False);ms=[g for g in scene.geometry.values() if hasattr(g,"vertices")]
            out["vertices"]=sum(len(m.vertices) for m in ms);out["faces"]=sum(len(m.faces) for m in ms);out["valid"]=bool(ms and out["vertices"] and out["faces"])
        except Exception as e: out["error"]=str(e)
        return out
    def _lod(self,src:Path,dst:Path,ratio:float):
        if not self.blender:return False
        script=f"""import bpy;bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath={str(src)!r})
for o in list(bpy.context.scene.objects):
    if o.type=='MESH':
        bpy.context.view_layer.objects.active=o;o.select_set(True);m=o.modifiers.new(name='GoldenLOD',type='DECIMATE');m.ratio={ratio};bpy.ops.object.modifier_apply(modifier=m.name)
bpy.ops.export_scene.gltf(filepath={str(dst)!r},export_format='GLB')"""
        dst.parent.mkdir(parents=True,exist_ok=True);r=subprocess.run([self.blender,"--background","--python-expr",script],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=600);return r.returncode==0 and dst.is_file() and dst.stat().st_size>1024
    def prepare(self,src:Path,job:Path,params:dict):
        lods=[]
        for name,ratio in (("lod1",.65),("lod2",.35),("lod3",.15)):
            d=job/f"{src.stem}-{name}.glb"
            if self._lod(src,d,ratio):lods.append(d)
        rp=job/"mesh-quality-report.json";rp.write_text(json.dumps({"source":self.audit(src),"lods":[self.audit(x) for x in lods],"originalPreserved":True},indent=2),encoding="utf-8");return rp,lods
