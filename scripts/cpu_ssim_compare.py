from __future__ import annotations
import json, math, sys
from pathlib import Path
import numpy as np
from PIL import Image

def load_gray(path: Path, size=None):
    im=Image.open(path).convert("L")
    if size is not None and im.size!=size:
        im=im.resize(size,Image.Resampling.LANCZOS)
    return np.asarray(im,dtype=np.float64)

def ssim(a,b):
    if a.shape!=b.shape: raise ValueError("shape mismatch")
    c1=(0.01*255)**2;c2=(0.03*255)**2
    ux=a.mean();uy=b.mean();vx=((a-ux)**2).mean();vy=((b-uy)**2).mean();cov=((a-ux)*(b-uy)).mean()
    return float(((2*ux*uy+c1)*(2*cov+c2))/((ux*ux+uy*uy+c1)*(vx+vy+c2)))

def main():
    if len(sys.argv)<3: raise SystemExit("usage: cpu_ssim_compare.py baseline.png candidate.png [report.json]")
    base=Path(sys.argv[1]);cand=Path(sys.argv[2]);a=load_gray(base);b=load_gray(cand,a.shape[::-1])
    score=ssim(a,b);report={"baseline":str(base),"candidate":str(cand),"ssim":score,"pass":score>=float(__import__("os").environ.get("QUALITY_SSIM_MIN","0.94")),"cpuOnly":True}
    out=Path(sys.argv[3]) if len(sys.argv)>3 else Path("CPU_SSIM_REPORT.json");out.write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps(report))
    raise SystemExit(0 if report["pass"] else 2)
if __name__=="__main__":main()
