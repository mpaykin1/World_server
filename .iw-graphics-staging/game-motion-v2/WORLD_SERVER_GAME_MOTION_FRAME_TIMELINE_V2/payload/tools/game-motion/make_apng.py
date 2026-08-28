#!/usr/bin/env python3
from __future__ import annotations
import argparse
from pathlib import Path
from PIL import Image

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("input_dir"); ap.add_argument("output")
    ap.add_argument("--fps",type=float,default=15); ap.add_argument("--loops",type=int,default=0)
    args=ap.parse_args()
    files=sorted([*Path(args.input_dir).glob("*.png")])
    if not files: raise SystemExit("No PNG frames")
    images=[Image.open(f).convert("RGBA") for f in files]
    duration=max(1,round(1000/max(.1,args.fps)))
    Path(args.output).parent.mkdir(parents=True,exist_ok=True)
    images[0].save(args.output,save_all=True,append_images=images[1:],duration=duration,loop=args.loops,optimize=True,disposal=1,blend=0)
    print(f"[make_apng] PASS frames={len(images)} fps={args.fps:g} output={args.output}")
if __name__=="__main__": main()
