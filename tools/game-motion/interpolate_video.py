#!/usr/bin/env python3
from __future__ import annotations
import argparse, subprocess
from pathlib import Path
import imageio_ffmpeg

def main():
    ap=argparse.ArgumentParser();ap.add_argument("input");ap.add_argument("output");ap.add_argument("--fps",type=float,default=30)
    ap.add_argument("--mode",choices=["motion","duplicate"],default="motion");args=ap.parse_args()
    ff=imageio_ffmpeg.get_ffmpeg_exe();Path(args.output).parent.mkdir(parents=True,exist_ok=True)
    vf=(f"minterpolate=fps={args.fps:g}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
        if args.mode=="motion" else f"fps={args.fps:g}")
    cmd=[ff,"-hide_banner","-loglevel","error","-y","-i",args.input,"-vf",vf,"-c:v","libx264","-preset","medium","-crf","18","-an",args.output]
    subprocess.run(cmd,check=True);print(f"[interpolate_video] PASS mode={args.mode} fps={args.fps:g}")
if __name__=="__main__":main()
