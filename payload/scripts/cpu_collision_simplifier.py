from __future__ import annotations
import json, sys
from pathlib import Path
import trimesh
def main():
    if len(sys.argv)<2: raise SystemExit("usage: cpu_collision_simplifier.py model.glb [outdir]")
    src=Path(sys.argv[1]);out=Path(sys.argv[2]) if len(sys.argv)>2 else Path(".quality-generated/collisions")/src.stem;out.mkdir(parents=True,exist_ok=True)
    scene=trimesh.load(str(src),force="scene",process=False);meshes=[g for g in scene.geometry.values() if isinstance(g,trimesh.Trimesh)]
    if not meshes: raise SystemExit("no meshes")
    combined=trimesh.util.concatenate(meshes);results=[]
    hull=combined.convex_hull;hp=out/(src.stem+"-convex.glb");hp.write_bytes(trimesh.Scene(hull).export(file_type="glb"));results.append({"kind":"convexHull","path":str(hp),"vertices":len(hull.vertices),"faces":len(hull.faces)})
    box=trimesh.creation.box(extents=combined.bounding_box.extents,transform=combined.bounding_box.transform);bp=out/(src.stem+"-aabb.glb");bp.write_bytes(trimesh.Scene(box).export(file_type="glb"));results.append({"kind":"box","path":str(bp),"vertices":len(box.vertices),"faces":len(box.faces)})
    report={"cpuOnly":True,"gpu":False,"paidCost":0,"source":str(src),"sourceVertices":len(combined.vertices),"sourceFaces":len(combined.faces),"candidates":results,"originalPreserved":True};Path("CPU_COLLISION_SIMPLIFIER_REPORT.json").write_text(json.dumps(report,indent=2),encoding="utf-8");print(json.dumps(report))
if __name__=="__main__":main()
