#!/usr/bin/env python3
from __future__ import annotations
import argparse
from pathlib import Path
from PIL import Image

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("input_dir"); ap.add_argument("output_dir")
    ap.add_argument("--quality",type=int,default=82); ap.add_argument("--max-width",type=int,default=0)
    args=ap.parse_args()
    src,dst=Path(args.input_dir),Path(args.output_dir); dst.mkdir(parents=True,exist_ok=True)
    count=0
    for f in sorted(src.glob("*.png")):
        im=Image.open(f).convert("RGBA")
        if args.max_width and im.width>args.max_width:
            h=round(im.height*args.max_width/im.width); im=im.resize((args.max_width,h),Image.Resampling.LANCZOS)
        im.save(dst/(f.stem+".webp"),"WEBP",quality=max(1,min(100,args.quality)),method=6)
        count+=1
    if not count: raise SystemExit("No PNG input frames")
    print(f"[optimize_frames] PASS frames={count}")
if __name__=="__main__": main()
