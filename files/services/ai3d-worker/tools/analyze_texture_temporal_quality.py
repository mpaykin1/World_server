#!/usr/bin/env python3
import argparse,json
from ai3d.texture_runtime_v9 import analyze_temporal_shimmer
p=argparse.ArgumentParser(); p.add_argument('samples'); p.add_argument('--min-frames',type=int,default=24); a=p.parse_args()
rows=json.load(open(a.samples,encoding='utf-8'))
print(json.dumps(analyze_temporal_shimmer(rows,min_frames=a.min_frames),indent=2))
