from __future__ import annotations
import math
import numpy as np
from scipy.optimize import least_squares


def _wrap(a: np.ndarray | float):
    return (a + math.pi) % (2*math.pi) - math.pi


def optimize_yaw_pose_graph(images: list[np.ndarray], feature_pair_fn, initial_cams: np.ndarray, max_pair_gap: int = 3) -> tuple[np.ndarray, dict]:
    """Global yaw pose graph with loop-closure candidates.

    Translation comes from exact metadata / capture path. The graph globally minimizes
    rotational inconsistency over neighbors and wider-overlap pairs.
    """
    n=len(images)
    edges=[]
    for i in range(n):
        for j in range(i+1,min(n,i+max_pair_gap+1)):
            r=feature_pair_fn(images[i],images[j])
            if r.get("overlap",0) >= 0.18 or r.get("matches",0) >= 6:
                edges.append((i,j,float(r.get("yaw_delta",0.0)),float(max(0.08,r.get("overlap",0.08))),r))
    # explicit loop closure for closed/near-closed capture paths
    if n >= 5:
        r=feature_pair_fn(images[0],images[-1])
        if r.get("overlap",0) >= 0.35 or r.get("matches",0) >= 12:
            edges.append((0,n-1,float(r.get("yaw_delta",0.0)),float(max(0.12,r.get("overlap",0.12))),r))

    y0=initial_cams[:,3].astype(np.float64)
    if not edges:
        return initial_cams, {"used":False,"edge_count":0,"loop_closure":False}

    # Anchor yaw 0 to remove gauge freedom.
    def residual(x):
        y=np.concatenate(([y0[0]],x))
        out=[]
        for i,j,delta,w,_ in edges:
            # feature delta approximates image-j relative horizontal rotation vs image-i
            pred=_wrap((y[j]-y[i]) + delta)
            out.append(pred*math.sqrt(w))
        # conservative regularization keeps graph close to initial sequence
        out.extend(((y[1:]-y0[1:])*0.08).tolist())
        return np.asarray(out,np.float64)
    opt=least_squares(residual,y0[1:],loss="huber",f_scale=0.04,max_nfev=80)
    y=np.concatenate(([y0[0]],opt.x)).astype(np.float32)
    out=initial_cams.copy(); out[:,3]=y
    loop=any(i==0 and j==n-1 for i,j,*_ in edges)
    return out, {
        "used":True,"edge_count":len(edges),"loop_closure":loop,
        "cost":float(opt.cost),"success":bool(opt.success),
        "max_yaw_change_deg":float(np.max(np.abs(_wrap(y-y0)))*180/math.pi),
        "edges":[{"i":i,"j":j,"overlap":round(w,4),"matches":int(r.get("matches",0))} for i,j,_,w,r in edges],
    }
