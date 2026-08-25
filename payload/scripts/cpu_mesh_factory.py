from __future__ import annotations
import json, sys, os
from pathlib import Path

def main():
    if len(sys.argv)<2: raise SystemExit("usage: cpu_mesh_factory.py file.glb [outdir]")
    src=Path(sys.argv[1]);out=Path(sys.argv[2]) if len(sys.argv)>2 else Path(".quality-generated/meshes")/src.stem;out.mkdir(parents=True,exist_ok=True)
    import trimesh
    scene=trimesh.load(str(src),force="scene",process=False)
    meshes=[g.copy() for g in scene.geometry.values() if isinstance(g,trimesh.Trimesh)]
    before={"vertices":sum(len(m.vertices) for m in meshes),"faces":sum(len(m.faces) for m in meshes)}
    cleaned=[]
    for m in meshes:
        try: m.remove_unreferenced_vertices()
        except Exception: pass
        try: m.merge_vertices()
        except Exception: pass
        cleaned.append(m)
    new=trimesh.Scene()
    for i,m in enumerate(cleaned): new.add_geometry(m,node_name=f"mesh_{i}")
    clean_path=out/(src.stem+"-clean.glb");clean_path.write_bytes(new.export(file_type="glb"))
    # Conservative collision proxy: convex hull of concatenated geometry.
    collision=None
    try:
        combined=trimesh.util.concatenate(cleaned); hull=combined.convex_hull
        collision=out/(src.stem+"-collision.glb");collision.write_bytes(trimesh.Scene(hull).export(file_type="glb"))
    except Exception: pass
    report={"cpuOnly":True,"gpu":False,"paidCost":0,"source":str(src),"before":before,"clean":str(clean_path),"collision":str(collision) if collision else None,"originalPreserved":True}
    Path("CPU_MESH_FACTORY_REPORT.json").write_text(json.dumps(report,indent=2),encoding="utf-8");print(json.dumps(report))
if __name__=="__main__":main()
