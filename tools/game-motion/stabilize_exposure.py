#!/usr/bin/env python3
from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
from PIL import Image, ImageEnhance

def main():
    ap=argparse.ArgumentParser();ap.add_argument("input_dir");ap.add_argument("output_dir");ap.add_argument("--strength",type=float,default=.7)
    args=ap.parse_args();files=sorted(Path(args.input_dir).glob("*.png"))
    if not files:raise SystemExit("No PNG frames")
    means=[]
    for f in files:
        a=np.asarray(Image.open(f).convert("RGB").resize((64,64)),dtype=np.float32);means.append(float(a.mean()))
    target=float(np.median(means));gains=[];last=1.0
    for m in means:
        raw=max(.65,min(1.45,target/max(1,m)));g=last*.72+raw*.28;last=g;gains.append(1+(g-1)*max(0,min(1,args.strength)))
    out=Path(args.output_dir);out.mkdir(parents=True,exist_ok=True)
    for f,g in zip(files,gains):
        im=Image.open(f).convert("RGBA");rgb=ImageEnhance.Brightness(im.convert("RGB")).enhance(g).convert("RGBA");rgb.putalpha(im.getchannel("A"));rgb.save(out/f.name,optimize=True)
    print(f"[stabilize_exposure] PASS frames={len(files)}")
if __name__=="__main__":main()
