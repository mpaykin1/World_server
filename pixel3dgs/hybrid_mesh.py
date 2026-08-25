from __future__ import annotations
from pathlib import Path
import math
import numpy as np
import trimesh
from scipy.spatial import ConvexHull


def _quad(a,b,c,d):
    return np.asarray([a,b,c,d],np.float32),np.asarray([[0,1,2],[0,2,3]],np.int64)


def build_space_planar_proxy(scene: dict, plane_report: dict, voxel: float, out_path: Path) -> dict:
    p=scene['points'];sem=scene['semantic']
    parts=[];ground=float(plane_report.get('ground_y',0.0))
    floor=p[sem==1]
    if len(floor)>=4:
        xz=floor[:,[0,2]][::max(1,len(floor)//4000)]
        try:
            hull=ConvexHull(xz);poly=xz[hull.vertices]
        except Exception:
            mn=xz.min(axis=0);mx=xz.max(axis=0);poly=np.array([[mn[0],mn[1]],[mx[0],mn[1]],[mx[0],mx[1]],[mn[0],mx[1]]],np.float32)
        v=np.column_stack([poly[:,0],np.full(len(poly),ground),poly[:,1]])
        faces=[]
        for i in range(1,len(poly)-1):faces.append([0,i,i+1])
        parts.append(trimesh.Trimesh(v,np.asarray(faces,np.int64),process=False))
    wall_count=0
    for pl in plane_report.get('planes',[]):
        typ=pl.get('type','');val=float(pl.get('value',0))
        if typ not in ('vertical_x','vertical_z'):continue
        axis=0 if typ=='vertical_x' else 2
        mask=(np.abs(p[:,axis]-val)<voxel*2.5)&(p[:,1]>ground+voxel)
        q=p[mask]
        if len(q)<12:continue
        y0=max(ground,float(np.percentile(q[:,1],4)));y1=float(np.percentile(q[:,1],96))
        other=2 if axis==0 else 0;o0=float(np.percentile(q[:,other],3));o1=float(np.percentile(q[:,other],97))
        if y1-y0<voxel*2 or o1-o0<voxel*3:continue
        if axis==0:
            verts,faces=_quad([val,y0,o0],[val,y0,o1],[val,y1,o1],[val,y1,o0])
        else:
            verts,faces=_quad([o0,y0,val],[o1,y0,val],[o1,y1,val],[o0,y1,val])
        parts.append(trimesh.Trimesh(verts,faces,process=False));wall_count+=1
    if not parts:return {'ok':False,'reason':'insufficient_planes'}
    mesh=trimesh.util.concatenate(parts);mesh.export(out_path)
    return {'ok':True,'wall_quads':wall_count,'vertices':int(len(mesh.vertices)),'faces':int(len(mesh.faces)),'file':str(out_path)}


def build_character_hull_proxy(scene: dict, out_path: Path) -> dict:
    p=scene['points']
    if len(p)<16:return {'ok':False,'reason':'insufficient_points'}
    # remove outliers before hull
    center=np.median(p,axis=0);d=np.linalg.norm(p-center,axis=1);keep=d<np.quantile(d,.96);q=p[keep]
    q=q[::max(1,len(q)//8000)]
    try:
        mesh=trimesh.convex.convex_hull(q)
        mesh.export(out_path)
        return {'ok':True,'vertices':int(len(mesh.vertices)),'faces':int(len(mesh.faces)),'file':str(out_path)}
    except Exception as exc:
        return {'ok':False,'reason':repr(exc)}
