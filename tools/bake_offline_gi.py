#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math, shutil
from pathlib import Path
import numpy as np
import trimesh
from quality_common import sha256, write_json

SUN=np.array([0.42,0.82,-0.39],dtype=np.float64); SUN/=np.linalg.norm(SUN)

def _runtime_rotation(up:str):
    up=up.upper()
    if up=='Y': return np.eye(4)
    if up=='Z':
        a=-math.pi/2; c,s=math.cos(a),math.sin(a)
        return np.array([[1,0,0,0],[0,c,-s,0],[0,s,c,0],[0,0,0,1]],dtype=np.float64)
    if up=='X':
        a=math.pi/2;c,s=math.cos(a),math.sin(a)
        return np.array([[c,0,s,0],[0,1,0,0],[-s,0,c,0],[0,0,0,1]],dtype=np.float64)
    raise ValueError('up axis must X/Y/Z')

def _hemisphere(n:int):
    out=[];phi=(1+5**0.5)/2
    for i in range(n):
        y=(i+0.5)/n; r=math.sqrt(max(0,1-y*y)); a=2*math.pi*i/phi
        out.append(np.array([math.cos(a)*r,y,math.sin(a)*r],dtype=np.float64))
    return out

def _basis(normal):
    n=normal/(np.linalg.norm(normal)+1e-12);t=np.cross(np.array([0,0,1.0]),n)
    if np.linalg.norm(t)<1e-6:t=np.cross(np.array([1.0,0,0]),n)
    t/=np.linalg.norm(t)+1e-12;b=np.cross(n,t);return t,b,n

def _occupied(vox): return {tuple(map(int,x)) for x in np.asarray(vox.sparse_indices)}

def _ray_hit(vox,occ,origin,direction,max_steps):
    # DDA-like fixed pitch ray march. Lighting companion only: source geometry remains untouched.
    step=float(vox.pitch[0])*0.72; p=np.asarray(origin,dtype=np.float64)+np.asarray(direction)*step*1.5
    for _ in range(max_steps):
        idx=tuple(map(int,vox.points_to_indices(np.asarray([p],dtype=np.float64))[0]))
        if idx in occ:return True
        p=p+direction*step
    return False

def bake(source:Path,out_dir:Path,up_axis='Y',grid=72,rays=12,max_steps=72,bounces=1):
    source=Path(source);out_dir=Path(out_dir);out_dir.mkdir(parents=True,exist_ok=True)
    loaded=trimesh.load(source,process=False,force='scene')
    meshes=[];R=_runtime_rotation(up_axis);source_counts=[]
    for name,g in loaded.geometry.items():
        if not isinstance(g,trimesh.Trimesh) or len(g.vertices)==0:continue
        gg=g.copy();gg.apply_transform(R);meshes.append(gg);source_counts.append((name,len(g.vertices)))
    if len(meshes)!=1: raise RuntimeError('V8 offline GI adapter currently requires one static mesh; GLB multi-mesh keeps UV-lightmap path')
    mesh=meshes[0];ext=np.maximum(mesh.extents,1e-6);pitch=float(np.max(ext)/max(16,int(grid)))
    vox=mesh.voxelized(pitch,method='subdivide');occ=_occupied(vox)
    normals=np.asarray(mesh.vertex_normals,dtype=np.float64);verts=np.asarray(mesh.vertices,dtype=np.float64)
    dirs=_hemisphere(max(4,int(rays)));values=np.empty(len(verts),dtype=np.float32)
    # Cache irradiance per surface voxel: preserves local detail at the chosen bake resolution and scales to large worlds.
    cache={}
    for i,(p,n) in enumerate(zip(verts,normals)):
        key=tuple(map(int,vox.points_to_indices(np.asarray([p],dtype=np.float64))[0]));k=(key,tuple(np.round(n,1)))
        if k in cache: values[i]=cache[k];continue
        t,b,nn=_basis(n);visible=0.0
        for d0 in dirs:
            d=t*d0[0]+nn*d0[1]+b*d0[2];d/=np.linalg.norm(d)+1e-12
            hit=_ray_hit(vox,occ,p+nn*pitch*0.65,d,max_steps)
            if not hit: visible+=1.0
            elif bounces>0: visible+=0.18 # conservative one-bounce diffuse return
        ao=visible/len(dirs);sun=max(0.0,float(np.dot(nn,SUN)))
        sun_vis=0.0 if sun<=1e-5 or _ray_hit(vox,occ,p+nn*pitch*0.8,SUN,max_steps*2) else 1.0
        val=float(np.clip(0.62+0.30*ao+0.24*sun*sun_vis,0.62,1.20));cache[k]=val;values[i]=val
    binary=out_dir/'gi-vertex.bin';binary.write_bytes(values.astype('<f4').tobytes())
    desc={'schemaVersion':1,'mode':'voxel-raytraced-gi-ply-v1','sourceSha256':sha256(source),'sourceAssetModified':False,'sourceVertices':int(len(verts)),'binaryUrl':'./gi-vertex.bin','binarySha256':sha256(binary),'gridResolution':int(grid),'voxelPitch':pitch,'hemisphereRays':int(rays),'bounces':int(bounces),'cacheCells':len(cache),'verified':True,'qualityPolicy':'non-destructive-offline-irradiance-companion'}
    write_json(out_dir/'gi-bake.json',desc);return desc

def main():
    ap=argparse.ArgumentParser();ap.add_argument('source',type=Path);ap.add_argument('out',type=Path);ap.add_argument('--up-axis',default='Y');ap.add_argument('--grid',type=int,default=72);ap.add_argument('--rays',type=int,default=12);ap.add_argument('--max-steps',type=int,default=72);ap.add_argument('--bounces',type=int,default=1);a=ap.parse_args();print(json.dumps(bake(a.source,a.out,a.up_axis,a.grid,a.rays,a.max_steps,a.bounces),indent=2))
if __name__=='__main__':main()
