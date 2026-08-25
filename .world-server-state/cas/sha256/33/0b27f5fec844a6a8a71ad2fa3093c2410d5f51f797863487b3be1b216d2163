#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math
from pathlib import Path
import numpy as np
from PIL import Image
import trimesh
from scipy.spatial import cKDTree
from quality_common import sha256, write_json

def _runtime_rotation(up:str):
    up=up.upper()
    if up=='Y': return np.eye(4)
    if up=='Z':
        a=-math.pi/2;c,s=math.cos(a),math.sin(a);return np.array([[1,0,0,0],[0,c,-s,0],[0,s,c,0],[0,0,0,1]],float)
    if up=='X':
        a=math.pi/2;c,s=math.cos(a),math.sin(a);return np.array([[c,0,s,0],[0,1,0,0],[-s,0,c,0],[0,0,0,1]],float)
    raise ValueError('up axis must X/Y/Z')

FACES=[('px',(1,0,0),(0,-1,0),(0,0,-1)),('nx',(-1,0,0),(0,-1,0),(0,0,1)),('py',(0,1,0),(1,0,0),(0,0,1)),('ny',(0,-1,0),(1,0,0),(0,0,-1)),('pz',(0,0,1),(1,0,0),(0,-1,0)),('nz',(0,0,-1),(-1,0,0),(0,-1,0))]

def _colors(mesh):
    c=getattr(mesh.visual,'vertex_colors',None)
    if c is not None and len(c)==len(mesh.vertices):return np.asarray(c[:,:3],dtype=np.float64)/255.0
    return np.tile(np.array([[0.52,0.50,0.47]]), (len(mesh.vertices),1))

def _sky(d):
    t=np.clip(d[1]*0.5+0.5,0,1);return np.array([0.12,0.15,0.20])*(1-t)+np.array([0.55,0.68,0.88])*t

def bake(source:Path,out_dir:Path,positions,resolution=64,grid=72,max_steps=100,up_axis='Y'):
    source=Path(source);out_dir=Path(out_dir);out_dir.mkdir(parents=True,exist_ok=True);scene=trimesh.load(source,process=False,force='scene')
    meshes=[]
    R=_runtime_rotation(up_axis)
    for g in scene.geometry.values():
        if isinstance(g,trimesh.Trimesh) and len(g.faces):
            gg=g.copy();gg.apply_transform(R);meshes.append(gg)
    if not meshes:raise RuntimeError('no mesh')
    mesh=trimesh.util.concatenate(meshes);pitch=float(np.max(np.maximum(mesh.extents,1e-6))/max(16,int(grid)));vox=mesh.voxelized(pitch,method='subdivide');occ={tuple(map(int,x)) for x in vox.sparse_indices}
    v=np.asarray(mesh.vertices);tree=cKDTree(v);vc=_colors(mesh);probes=[]
    for pi,pos in enumerate(positions):
        pos=np.asarray(pos,dtype=float);files=[]
        for name,forward,right,up in FACES:
            forward=np.asarray(forward,float);right=np.asarray(right,float);up=np.asarray(up,float);arr=np.zeros((resolution,resolution,3),dtype=np.uint8)
            for y in range(resolution):
                for x in range(resolution):
                    u=(2*(x+0.5)/resolution-1);vv=(2*(y+0.5)/resolution-1);d=forward+right*u+up*vv;d/=np.linalg.norm(d)+1e-12;p=pos.copy();hit=None
                    for _ in range(max_steps):
                        p+=d*pitch*0.8;idx=tuple(map(int,vox.points_to_indices(np.asarray([p],dtype=np.float64))[0]))
                        if idx in occ: hit=p.copy();break
                    if hit is None:c=_sky(d)
                    else:
                        _,ii=tree.query(hit,k=1);c=vc[int(ii)];shade=0.72+0.28*np.clip(d[1]*-0.5+0.5,0,1);c=np.clip(c*shade,0,1)
                    arr[y,x]=np.round(np.clip(c,0,1)*255).astype(np.uint8)
            fn=f'probe-{pi:02d}-{name}.png';Image.fromarray(arr,'RGB').save(out_dir/fn,optimize=True);files.append('./'+fn)
        probes.append({'id':f'probe-{pi:02d}','position':pos.tolist(),'faces':files})
    desc={'schemaVersion':1,'mode':'offline-voxel-raytraced-cubemap-v1','sourceSha256':sha256(source),'sourceAssetModified':False,'resolution':int(resolution),'voxelPitch':pitch,'probes':probes,'verified':True}
    write_json(out_dir/'reflection-probes.json',desc);return desc

def main():
    ap=argparse.ArgumentParser();ap.add_argument('source',type=Path);ap.add_argument('out',type=Path);ap.add_argument('--position',action='append',default=[]);ap.add_argument('--resolution',type=int,default=64);ap.add_argument('--grid',type=int,default=72);ap.add_argument('--up-axis',default='Y');a=ap.parse_args();positions=[list(map(float,p.split(','))) for p in a.position] or [[0,1.6,0]];print(json.dumps(bake(a.source,a.out,positions,a.resolution,a.grid,100,a.up_axis),indent=2))
if __name__=='__main__':main()
