#!/usr/bin/env python3
"""Depth-structure regression without requiring a model download.
If true engine depth maps are supplied, compares them directly. Otherwise computes a conservative
multi-scale depth-structure proxy from luminance/edges/occlusion cues. This is intentionally a floor,
not a claim of metric depth accuracy.
"""
from __future__ import annotations
import argparse,json
from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter

def gray(path,size=(512,512)):
    return np.asarray(Image.open(path).convert('L').resize(size,Image.Resampling.LANCZOS),dtype=np.float32)/255.0

def norm01(x):
    lo,hi=np.percentile(x,[2,98]); return np.clip((x-lo)/(hi-lo+1e-6),0,1)

def proxy(g):
    # dark cinematic scenes: use local contrast, edge persistence and coarse luminance as pseudo-depth cues
    im=Image.fromarray((g*255).astype(np.uint8))
    blur=np.asarray(im.filter(ImageFilter.GaussianBlur(10)),dtype=np.float32)/255
    local=np.abs(g-blur)
    gx=np.diff(g,axis=1,append=g[:,-1:]); gy=np.diff(g,axis=0,append=g[-1:,:])
    edge=np.sqrt(gx*gx+gy*gy)
    # farther regions tend to be lower contrast in the target; combine global darkness and local contrast
    return norm01(0.48*(1-blur)+0.34*(1-norm01(local))+0.18*(1-norm01(edge)))

def score(a,b):
    a=norm01(a); b=norm01(b)
    mae=float(np.mean(np.abs(a-b)))
    corr=float(np.corrcoef(a.ravel(),b.ravel())[0,1]) if a.std()>1e-6 and b.std()>1e-6 else 0.0
    hist_a,_=np.histogram(a,bins=16,range=(0,1),density=True); hist_b,_=np.histogram(b,bins=16,range=(0,1),density=True)
    hist=1-float(np.mean(np.abs(hist_a-hist_b)))/16
    s=max(0.0,min(1.0,0.45*(1-mae)+0.35*((corr+1)/2)+0.20*hist))
    return s,mae,corr,hist

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--reference',required=True); ap.add_argument('--candidate',required=True); ap.add_argument('--reference-depth'); ap.add_argument('--candidate-depth'); ap.add_argument('--out',default='CINEMATIC_DEPTH_REPORT.json'); ap.add_argument('--strict',action='store_true')
    a=ap.parse_args()
    use_true=bool(a.reference_depth and a.candidate_depth and Path(a.reference_depth).exists() and Path(a.candidate_depth).exists())
    rd=gray(a.reference_depth) if use_true else proxy(gray(a.reference))
    cd=gray(a.candidate_depth) if use_true else proxy(gray(a.candidate))
    s,mae,corr,hist=score(rd,cd)
    rep={'schemaVersion':'1.0.0','mode':'engine-depth' if use_true else 'cpu-depth-structure-proxy','depthStructureScore':round(s,5),'mae':round(mae,5),'correlation':round(corr,5),'histogramSimilarity':round(hist,5),'pass':s>=0.82}
    Path(a.out).write_text(json.dumps(rep,indent=2)+'\n',encoding='utf-8')
    print(f"[CINEMATIC_DEPTH] mode={rep['mode']} score={s:.4f} pass={rep['pass']}")
    if a.strict and not rep['pass']: return 14
    return 0
if __name__=='__main__': raise SystemExit(main())
