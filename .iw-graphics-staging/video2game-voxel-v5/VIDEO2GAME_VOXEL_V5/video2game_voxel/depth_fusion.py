from dataclasses import dataclass
import os, subprocess, json
from pathlib import Path
import numpy as np

@dataclass
class DepthFusionResult:
    points: np.ndarray
    colors: np.ndarray
    report: dict

def _cpu_sparse_fusion(points, colors, fill_radius_voxels=2, max_generated_points=70000):
    if len(points) == 0:
        return DepthFusionResult(points, colors, {"mode":"cpu_sparse_fusion","generated_points":0,"status":"empty"})
    p=np.asarray(points,np.float32)
    c=np.asarray(colors,np.uint8)
    center=np.median(p, axis=0)
    generated=[]
    generated_c=[]
    stride=max(1, len(p)//max(1, max_generated_points//6))
    sample=p[::stride]
    sample_c=c[::stride]
    # Conservative local completion: interpolate a few points toward local/global center.
    # This creates voxel-friendly support without pretending to recover unseen detail.
    for pt,col in zip(sample, sample_c):
        v=center-pt
        for a in (0.12,0.24,0.36):
            q=pt+v*a
            generated.append(q)
            generated_c.append(col)
            if len(generated)>=max_generated_points:
                break
        if len(generated)>=max_generated_points:
            break
    if generated:
        gp=np.asarray(generated,np.float32)
        gc=np.asarray(generated_c,np.uint8)
        out_p=np.concatenate([p,gp],axis=0)
        out_c=np.concatenate([c,gc],axis=0)
    else:
        out_p,out_c=p,c
    return DepthFusionResult(out_p,out_c,{
        "mode":"cpu_sparse_fusion","generated_points":int(len(generated)),
        "input_points":int(len(p)),"output_points":int(len(out_p)),"status":"ok"
    })

def fuse_depth(points, colors, cfg, work_dir=None):
    if not cfg.get("enabled", True):
        return DepthFusionResult(points, colors, {"mode":"disabled","generated_points":0,"status":"disabled"})
    command=(cfg.get("external_depth_command") or "").strip()
    if command:
        # Adapter contract for MiDaS/Depth Anything/etc. external workers.
        # The worker can replace this fallback without changing the game/runtime contract.
        return DepthFusionResult(points, colors,{
            "mode":"external_adapter_configured","command_configured":True,
            "generated_points":0,"status":"adapter_ready"
        })
    return _cpu_sparse_fusion(
        points, colors,
        fill_radius_voxels=cfg.get("fill_radius_voxels",2),
        max_generated_points=cfg.get("max_generated_points",70000)
    )
