from __future__ import annotations
import argparse,json
from pathlib import Path
from ai3d.texture_runtime_v10 import analyze_optical_flow_temporal
p=argparse.ArgumentParser(); p.add_argument('reference_dir'); p.add_argument('candidate_dir'); a=p.parse_args()
def frames(d): return sorted([x for x in Path(d).iterdir() if x.suffix.lower() in {'.png','.jpg','.jpeg','.webp'}])
r=analyze_optical_flow_temporal(frames(a.reference_dir),frames(a.candidate_dir)); print(json.dumps(r,indent=2))
raise SystemExit(0 if r.get('gate')=='PASS' else 2)
