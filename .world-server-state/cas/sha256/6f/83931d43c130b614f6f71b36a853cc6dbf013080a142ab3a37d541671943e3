from __future__ import annotations
import argparse, json
from pathlib import Path
from pixel3dgs.video_pipeline import VideoBuildConfig, build_video

p=argparse.ArgumentParser(description='CPU-only Pixel 3DGS from video')
p.add_argument('video')
p.add_argument('--mode',choices=['auto','space','character'],default='auto')
p.add_argument('--out',default='output/video_build')
p.add_argument('--max-frames',type=int,default=72)
p.add_argument('--height-m',type=float,default=1.75,help='character target height')
p.add_argument('--fov-deg',type=float,default=70.0)
p.add_argument('--step-m',type=float,default=0.42,help='estimated camera travel per selected space frame')
a=p.parse_args()

def progress(stage,value): print(f'[{value*100:5.1f}%] {stage}')
r=build_video(VideoBuildConfig(video_path=Path(a.video),output_dir=Path(a.out),mode=a.mode,max_frames=a.max_frames,character_height_m=a.height_m,fov_deg=a.fov_deg,space_step_m=a.step_m),progress)
print(json.dumps(r,ensure_ascii=False,indent=2))
