from __future__ import annotations
import json, math, os, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

def img(path:Path,size=None):
    im=Image.open(path).convert("RGB")
    if size and im.size!=size: im=im.resize(size,Image.Resampling.LANCZOS)
    return im

def gray(im): return np.asarray(im.convert("L"),dtype=np.float64)

def ssim(a,b):
    c1=(.01*255)**2;c2=(.03*255)**2
    ux,uy=a.mean(),b.mean();vx=((a-ux)**2).mean();vy=((b-uy)**2).mean();cov=((a-ux)*(b-uy)).mean()
    return float(((2*ux*uy+c1)*(2*cov+c2))/((ux*ux+uy*uy+c1)*(vx+vy+c2)))

def hist_sim(a,b):
    ha=np.histogram(a,bins=64,range=(0,255),density=True)[0];hb=np.histogram(b,bins=64,range=(0,255),density=True)[0]
    den=float(np.linalg.norm(ha)*np.linalg.norm(hb))
    return float(np.dot(ha,hb)/den) if den else 1.0

def edge_map(a):
    gx=np.zeros_like(a);gy=np.zeros_like(a);gx[:,1:-1]=a[:,2:]-a[:,:-2];gy[1:-1,:]=a[2:,:]-a[:-2,:]
    e=np.hypot(gx,gy);m=e.mean()+e.std()*.5
    return (e>m).astype(np.float64)

def edge_sim(a,b):
    ea,eb=edge_map(a),edge_map(b);inter=(ea*eb).sum();union=np.maximum(ea,eb).sum()
    return float(inter/union) if union else 1.0

def block_layout(a,b,grid=8):
    h,w=a.shape;scores=[]
    for y in range(grid):
      for x in range(grid):
        y0,y1=round(y*h/grid),round((y+1)*h/grid);x0,x1=round(x*w/grid),round((x+1)*w/grid)
        ma=float(a[y0:y1,x0:x1].mean());mb=float(b[y0:y1,x0:x1].mean());scores.append(1-min(abs(ma-mb)/255,1))
    return float(np.mean(scores))

def ahash(im):
    a=np.asarray(im.convert("L").resize((16,16),Image.Resampling.LANCZOS),dtype=np.float64);return a>a.mean()

def hash_sim(a,b): return float(1-np.count_nonzero(a!=b)/a.size)

def main():
    if len(sys.argv)<3: raise SystemExit("usage: cpu_visual_ensemble.py baseline candidate [report]")
    pa,pb=Path(sys.argv[1]),Path(sys.argv[2]);ia=img(pa);ib=img(pb,ia.size);a,b=gray(ia),gray(ib)
    metrics={"ssim":ssim(a,b),"histogram":hist_sim(a,b),"edges":edge_sim(a,b),"layoutBlocks":block_layout(a,b),"averageHash":hash_sim(ahash(ia),ahash(ib))}
    weights={"ssim":.35,"histogram":.15,"edges":.20,"layoutBlocks":.20,"averageHash":.10}
    score=sum(metrics[k]*weights[k] for k in weights);minimum=float(os.environ.get("QUALITY_VISUAL_ENSEMBLE_MIN","0.92"))
    report={"cpuOnly":True,"gpu":False,"paidCost":0,"baseline":str(pa),"candidate":str(pb),"metrics":metrics,"score":score,"minimum":minimum,"pass":score>=minimum}
    out=Path(sys.argv[3]) if len(sys.argv)>3 else Path("CPU_VISUAL_ENSEMBLE_REPORT.json");out.write_text(json.dumps(report,indent=2),encoding="utf-8");print(json.dumps(report))
    raise SystemExit(0 if report["pass"] else 2)
if __name__=="__main__":main()
