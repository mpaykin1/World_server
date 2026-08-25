from __future__ import annotations
import hashlib, json, os, shutil, subprocess, sys
from pathlib import Path
from PIL import Image

EXT={".png",".jpg",".jpeg",".webp"}
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def process(src:Path,out_root:Path):
    im=Image.open(src).convert("RGBA");results=[]
    for scale in (1.0,.5,.25):
        size=(max(1,round(im.width*scale)),max(1,round(im.height*scale)))
        cur=im if scale==1 else im.resize(size,Image.Resampling.LANCZOS)
        for q in (92,82,72):
            d=out_root/src.stem/f"{int(scale*100)}";d.mkdir(parents=True,exist_ok=True)
            out=d/f"{src.stem}-q{q}.webp";cur.save(out,"WEBP",quality=q,method=6)
            results.append({"path":str(out),"bytes":out.stat().st_size,"scale":scale,"quality":q,"sha256":sha(out)})
    return {"source":str(src),"sourceBytes":src.stat().st_size,"sourceSha256":sha(src),"variants":results}
def main():
    root=Path(sys.argv[1]) if len(sys.argv)>1 else Path("apps")
    out=Path(sys.argv[2]) if len(sys.argv)>2 else Path(".quality-generated/textures")
    files=[x for x in root.rglob("*") if x.is_file() and x.suffix.lower() in EXT]
    reports=[];errors=[]
    for f in files:
        try: reports.append(process(f,out))
        except Exception as e: errors.append({"file":str(f),"error":str(e)})
    report={"cpuOnly":True,"gpu":False,"paidCost":0,"files":len(files),"reports":reports,"errors":errors}
    Path("CPU_TEXTURE_FACTORY_REPORT.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps({"files":len(files),"errors":len(errors),"variants":sum(len(x["variants"]) for x in reports)}))
    raise SystemExit(1 if errors else 0)
if __name__=="__main__": main()
