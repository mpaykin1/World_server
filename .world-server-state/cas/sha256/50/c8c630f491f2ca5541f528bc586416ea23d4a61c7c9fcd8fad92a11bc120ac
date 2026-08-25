#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math
from pathlib import Path
import numpy as np
import trimesh

from quality_common import inspect_asset, write_json, transform_matrix_for_axis


def _load_mesh(path: Path) -> trimesh.Trimesh:
    obj = trimesh.load(path, process=False, force='scene' if path.suffix.lower()=='.glb' else None)
    if isinstance(obj, trimesh.Scene):
        meshes=[]
        for name,g in obj.geometry.items():
            if isinstance(g,trimesh.Trimesh) and len(g.faces):
                meshes.append(g)
        if not meshes: raise ValueError('No triangle meshes')
        obj=trimesh.util.concatenate(meshes)
    if not isinstance(obj,trimesh.Trimesh): raise ValueError('Not a triangle mesh')
    return obj


def analyze_mesh(path: Path, source_up_axis: str='Y', scale: float=1.0, max_slope_deg: float=50.0) -> dict:
    mesh=_load_mesh(path)
    verts=np.asarray(mesh.vertices,dtype=float)
    faces=np.asarray(mesh.faces,dtype=np.int64)
    R=transform_matrix_for_axis(source_up_axis,scale)
    rv=verts @ R.T
    tri=rv[faces]
    e1=tri[:,1]-tri[:,0]; e2=tri[:,2]-tri[:,0]
    n=np.cross(e1,e2)
    area=np.linalg.norm(n,axis=1)*0.5
    valid=area>1e-12
    n[valid] /= (area[valid,None]*2)
    cy=tri.mean(axis=1)[:,1]
    abs_y=np.abs(n[:,1])
    walkable=valid & (n[:,1] >= math.cos(math.radians(max_slope_deg)))
    horizontal=valid & (abs_y >= math.cos(math.radians(max_slope_deg)))
    walls=valid & (abs_y <= math.sin(math.radians(25)))
    total_area=float(area[valid].sum()) if valid.any() else 0.0
    walk_area=float(area[walkable].sum())
    wall_area=float(area[walls].sum())

    # Dominant horizontal elevation bands are strong floor/roof candidates.
    bins=[]
    if horizontal.any():
        ys=cy[horizontal]; wa=area[horizontal]
        span=max(float(rv[:,1].max()-rv[:,1].min()),0.01)
        bw=max(0.12, min(0.5, span/80))
        keys=np.round(ys/bw).astype(np.int64)
        uniq=np.unique(keys)
        for k in uniq:
            m=keys==k
            a=float(wa[m].sum())
            if a<=0: continue
            bins.append({'y':float(k*bw),'area':a,'ratio':a/max(total_area,1e-9)})
        bins.sort(key=lambda x:x['area'], reverse=True)
        bins=bins[:16]

    bounds=np.array([rv.min(axis=0),rv.max(axis=0)])
    size=bounds[1]-bounds[0]
    # Conservative semantic contract. More detailed semantic labeling can be added engine-side.
    return {
        'schemaVersion':2,
        'source':str(path.name),
        'bounds':{'min':bounds[0].tolist(),'max':bounds[1].tolist(),'size':size.tolist()},
        'triangles':int(len(faces)),
        'surfaceArea':total_area,
        'walkableArea':walk_area,
        'walkableRatio':walk_area/max(total_area,1e-9),
        'wallArea':wall_area,
        'wallRatio':wall_area/max(total_area,1e-9),
        'dominantHorizontalBands':bins,
        'classes':{
            'floor':{'rule':'normal.y >= cos(maxSlopeDeg)','estimatedArea':walk_area},
            'wall':{'rule':'abs(normal.y) <= sin(25deg)','estimatedArea':wall_area},
            'ceilingOrRoof':{'rule':'normal.y < -cos(maxSlopeDeg)'},
            'void':{'rule':'outside collision mesh'},
        },
        'navigation':{
            'maxSlopeDeg':max_slope_deg,
            'recommendedCellSize':float(max(0.12,min(0.45,max(size[0],size[2])/240))),
            'recommendedAgentRadius':0.32,
            'recommendedAgentHeight':1.72,
        }
    }


def main():
    ap=argparse.ArgumentParser(description='Analyze collision geometry into shared semantic/navigation metadata.')
    ap.add_argument('mesh',type=Path)
    ap.add_argument('output',type=Path)
    ap.add_argument('--up-axis',default='Y',choices=['X','Y','Z','x','y','z'])
    ap.add_argument('--scale',type=float,default=1.0)
    ap.add_argument('--max-slope',type=float,default=50.0)
    a=ap.parse_args()
    out=analyze_mesh(a.mesh.resolve(),a.up_axis.upper(),a.scale,a.max_slope)
    write_json(a.output.resolve(),out)
    print(json.dumps(out,ensure_ascii=False,indent=2))

if __name__=='__main__': main()
