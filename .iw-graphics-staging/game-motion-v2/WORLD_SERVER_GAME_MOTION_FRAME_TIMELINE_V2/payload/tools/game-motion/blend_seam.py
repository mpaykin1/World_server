#!/usr/bin/env python3
from __future__ import annotations
import argparse
from pathlib import Path
from PIL import Image

def main():
    ap=argparse.ArgumentParser();ap.add_argument("left_dir");ap.add_argument("right_dir");ap.add_argument("output_dir");ap.add_argument("--frames",type=int,default=8)
    args=ap.parse_args();a=sorted(Path(args.left_dir).glob("*.png"));b=sorted(Path(args.right_dir).glob("*.png"))
    n=min(args.frames,len(a),len(b)); 
    if n<2:raise SystemExit("Need at least 2 frames on each side")
    out=Path(args.output_dir);out.mkdir(parents=True,exist_ok=True)
    for i in range(n):
        left=Image.open(a[-n+i]).convert("RGBA");right=Image.open(b[i]).convert("RGBA")
        if right.size!=left.size:right=right.resize(left.size,Image.Resampling.LANCZOS)
        t=(i+1)/(n+1);Image.blend(left,right,t).save(out/f"seam_{i:04d}.png",optimize=True)
    print(f"[blend_seam] PASS frames={n}")
if __name__=="__main__":main()
