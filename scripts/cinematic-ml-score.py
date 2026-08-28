#!/usr/bin/env python3
"""Optional semantic/perceptual scorer.
Hard-dependency free beyond Pillow/NumPy. Uses OpenCLIP/DINOv2/LPIPS only when already installed.
CPU is always supported; heavy backends are optional and never required for baseline verification.
"""
from __future__ import annotations
import argparse, json, math, os, sys
from pathlib import Path
import numpy as np
from PIL import Image


def load_rgb(p, size=224):
    return np.asarray(Image.open(p).convert('RGB').resize((size,size), Image.Resampling.LANCZOS), dtype=np.float32)/255.0

def cosine(a,b):
    a=np.asarray(a,dtype=np.float64).ravel(); b=np.asarray(b,dtype=np.float64).ravel()
    den=np.linalg.norm(a)*np.linalg.norm(b)
    return float(np.dot(a,b)/den) if den>1e-12 else 0.0

def _corr01(a,b):
    a=np.asarray(a,dtype=np.float64).ravel(); b=np.asarray(b,dtype=np.float64).ravel()
    a=a-a.mean(); b=b-b.mean(); den=np.linalg.norm(a)*np.linalg.norm(b)
    c=float(np.dot(a,b)/den) if den>1e-12 else 0.0
    return max(0.0,min(1.0,(c+1.0)/2.0))

def _edge(g):
    gx=np.diff(g,axis=1,append=g[:,-1:]); gy=np.diff(g,axis=0,append=g[-1:,:])
    return np.sqrt(gx*gx+gy*gy)

def _hist_intersection(a,b):
    vals=[]
    for ch in range(3):
        ha,_=np.histogram(a[:,:,ch],bins=32,range=(0,1)); hb,_=np.histogram(b[:,:,ch],bins=32,range=(0,1))
        ha=ha/(ha.sum()+1e-9); hb=hb/(hb.sum()+1e-9); vals.append(float(np.minimum(ha,hb).sum()))
    return float(np.mean(vals))

def fallback_similarity(a,b):
    # Structural fallback deliberately resists the common dark-flat false positive.
    sims=[]
    for size in (32,64,128):
        aa=np.asarray(Image.fromarray((a*255).astype(np.uint8)).resize((size,size),Image.Resampling.BILINEAR),dtype=np.float32)/255
        bb=np.asarray(Image.fromarray((b*255).astype(np.uint8)).resize((size,size),Image.Resampling.BILINEAR),dtype=np.float32)/255
        ga=aa.mean(2); gb=bb.mean(2)
        sims.append(0.42*_corr01(ga,gb)+0.33*_corr01(_edge(ga),_edge(gb))+0.25*_hist_intersection(aa,bb))
    return float(np.mean(sims))

def try_openclip(ref_path,cand_path):
    try:
        import torch, open_clip
        device='cuda' if torch.cuda.is_available() else 'cpu'
        model,_,preprocess=open_clip.create_model_and_transforms('ViT-B-32', pretrained=None)
        # No implicit model download. Only use backend if caller supplies weights.
        weights=os.getenv('CINEMATIC_OPENCLIP_WEIGHTS')
        if not weights or not Path(weights).exists(): return None,'weights-missing'
        sd=torch.load(weights,map_location='cpu')
        model.load_state_dict(sd,strict=False); model.eval().to(device)
        imgs=torch.stack([preprocess(Image.open(ref_path).convert('RGB')),preprocess(Image.open(cand_path).convert('RGB'))]).to(device)
        with torch.no_grad(): z=model.encode_image(imgs); z=z/z.norm(dim=-1,keepdim=True)
        return float((z[0]*z[1]).sum().cpu()),device
    except Exception as e:
        return None,f'unavailable:{type(e).__name__}'

def try_lpips(ref_path,cand_path):
    try:
        import torch, lpips
        device='cuda' if torch.cuda.is_available() else 'cpu'
        loss=lpips.LPIPS(net='alex',pnet_rand=True).to(device)  # no network download
        def t(p):
            a=np.asarray(Image.open(p).convert('RGB').resize((256,256)),dtype=np.float32)/127.5-1
            return torch.from_numpy(a.transpose(2,0,1)).unsqueeze(0).to(device)
        with torch.no_grad(): d=float(loss(t(ref_path),t(cand_path)).cpu().item())
        sim=max(0.0,1.0-min(d,2.0)/2.0)
        return sim,device
    except Exception as e:
        return None,f'unavailable:{type(e).__name__}'

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--reference',required=True); ap.add_argument('--candidate',required=True); ap.add_argument('--out',default='CINEMATIC_ML_REPORT.json')
    ap.add_argument('--strict',action='store_true'); a=ap.parse_args()
    r=load_rgb(a.reference); c=load_rgb(a.candidate)
    fallback=fallback_similarity(r,c)
    oc,oc_note=try_openclip(a.reference,a.candidate)
    lp,lp_note=try_lpips(a.reference,a.candidate)
    available=[x for x in (oc,lp) if x is not None]
    semantic=float(np.mean(available)) if available else fallback
    report={
      'schemaVersion':'1.0.0','fallbackStructuralSimilarity':round(fallback,5),
      'openClipSimilarity':None if oc is None else round(oc,5),'openClipBackend':oc_note,
      'lpipsSimilarity':None if lp is None else round(lp,5),'lpipsBackend':lp_note,
      'effectivePerceptualSimilarity':round(semantic,5),
      'backendMode':'optional-ml' if available else 'cpu-fallback',
      'pass': bool(semantic>=0.62)
    }
    Path(a.out).write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(f"[CINEMATIC_ML] mode={report['backendMode']} score={semantic:.4f} pass={report['pass']}")
    if a.strict and not report['pass']: return 13
    return 0
if __name__=='__main__': raise SystemExit(main())
