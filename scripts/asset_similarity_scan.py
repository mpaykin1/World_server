from __future__ import annotations
import itertools, json, math, sys
from pathlib import Path
import numpy as np
from PIL import Image
def ahash(path):
    a=np.asarray(Image.open(path).convert("L").resize((16,16),Image.Resampling.LANCZOS),dtype=np.float64);return (a>a.mean()).reshape(-1)
def sim(a,b): return 1-float(np.count_nonzero(a!=b))/a.size
def mesh_sig(path):
    try:
        import trimesh
        s=trimesh.load(str(path),force="scene",process=False);m=[g for g in s.geometry.values() if hasattr(g,"vertices")]
        return {"v":sum(len(x.vertices) for x in m),"f":sum(len(x.faces) for x in m),"bytes":path.stat().st_size}
    except Exception:return None
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path("apps");images=[x for x in root.rglob("*") if x.suffix.lower() in {".png",".jpg",".jpeg",".webp"}][:300];meshes=[x for x in root.rglob("*.glb")][:100]
ih={str(x):ahash(x) for x in images};pairs=[]
for a,b in itertools.combinations(images,2):
    s=sim(ih[str(a)],ih[str(b)])
    if s>=.94:pairs.append({"kind":"image","a":str(a),"b":str(b),"similarity":s})
ms={str(x):mesh_sig(x) for x in meshes}
for a,b in itertools.combinations(meshes,2):
    x,y=ms[str(a)],ms[str(b)]
    if not x or not y or not x["v"] or not y["v"] or not x["f"] or not y["f"]:continue
    vd=abs(x["v"]-y["v"])/max(x["v"],y["v"]);fd=abs(x["f"]-y["f"])/max(x["f"],y["f"])
    if vd<=.05 and fd<=.05:pairs.append({"kind":"mesh","a":str(a),"b":str(b),"vertexDelta":vd,"faceDelta":fd})
report={"cpuOnly":True,"gpu":False,"paidCost":0,"images":len(images),"meshes":len(meshes),"similarCandidates":pairs};Path("ASSET_SIMILARITY_REPORT.json").write_text(json.dumps(report,indent=2),encoding="utf-8");print(json.dumps({"images":len(images),"meshes":len(meshes),"candidates":len(pairs)}))
