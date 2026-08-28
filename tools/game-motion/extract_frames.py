#!/usr/bin/env python3
from __future__ import annotations
import argparse, subprocess
from pathlib import Path
import imageio_ffmpeg

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--fps",type=float,default=15)
    ap.add_argument("--scale",default="")
    args=ap.parse_args()
    out=Path(args.output); out.mkdir(parents=True,exist_ok=True)
    ff=imageio_ffmpeg.get_ffmpeg_exe()
    vf=[f"fps={args.fps:g}"]
    if args.scale: vf.append(f"scale={args.scale}")
    cmd=[ff,"-hide_banner","-loglevel","error","-y","-i",args.input,"-vf",",".join(vf),str(out/"frame_%05d.png")]
    subprocess.run(cmd,check=True)
    frames=sorted(out.glob("frame_*.png"))
    if not frames: raise SystemExit("No frames extracted")
    print(f"[extract_frames] PASS frames={len(frames)} ffmpeg={ff}")
if __name__=="__main__": main()
