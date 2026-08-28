#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math
from pathlib import Path
import numpy as np
from PIL import Image

def main():
    ap=argparse.ArgumentParser();ap.add_argument("input_dir");ap.add_argument("--output",default="FRAME_SEQUENCE_QUALITY.json")
    ap.add_argument("--sample",type=int,default=180);args=ap.parse_args()
    files=sorted([*Path(args.input_dir).glob("*.png"),*Path(args.input_dir).glob("*.webp")])
    if not files: raise SystemExit("No PNG/WebP frames")
    if len(files)>args.sample:
        idx=np.linspace(0,len(files)-1,args.sample,dtype=int);files=[files[i] for i in idx]
    means=[];deltas=[];dupes=0;prev=None;dims=set()
    for f in files:
        a=np.asarray(Image.open(f).convert("RGB"),dtype=np.float32)/255.0;dims.add((a.shape[1],a.shape[0]))
        means.append(float(a.mean()))
        if prev is not None:
            d=float(np.abs(a-prev).mean());deltas.append(d)
            if d<0.0015:dupes+=1
        prev=a
    brightness_jump=max([abs(means[i]-means[i-1]) for i in range(1,len(means))] or [0])
    delta_arr=np.array(deltas or [0.0])
    report={"schemaVersion":"1.0.0","framesSampled":len(files),"dimensions":[list(x) for x in sorted(dims)],
      "brightnessMean":float(np.mean(means)),"brightnessStd":float(np.std(means)),"maxBrightnessJump":brightness_jump,
      "meanFrameDelta":float(delta_arr.mean()),"p95FrameDelta":float(np.percentile(delta_arr,95)),
      "duplicateRatio":dupes/max(1,len(files)-1),
      "warnings":[]}
    if len(dims)>1:report["warnings"].append("mixed_dimensions")
    if report["maxBrightnessJump"]>.12:report["warnings"].append("exposure_flicker_or_hard_cut")
    if report["duplicateRatio"]>.20:report["warnings"].append("many_duplicate_frames")
    Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"[analyze_sequence] PASS sampled={len(files)} warnings={len(report['warnings'])}")
if __name__=="__main__":main()
