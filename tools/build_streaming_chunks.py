#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math, shutil
from pathlib import Path
import numpy as np
import trimesh
from quality_common import sha256, transform_matrix_for_axis, write_json


def build_ply_chunks(src:Path,out_dir:Path,source_up_axis='Y',scale=1.0,target_faces=150_000,max_chunks=64):
    mesh=trimesh.load(src,process=False)
    if not isinstance(mesh,trimesh.Trimesh) or len(mesh.faces)==0:raise ValueError('Lossless chunking currently requires triangle PLY')
    nfaces=len(mesh.faces);desired=max(1,min(max_chunks,math.ceil(nfaces/target_faces)))
    # Split on an XZ grid in runtime coordinates by triangle centroid. No face is removed or simplified.
    R=transform_matrix_for_axis(source_up_axis,scale);cent=(np.asarray(mesh.triangles_center)@R.T)
    nx=max(1,math.ceil(math.sqrt(desired)));nz=max(1,math.ceil(desired/nx))
    mn=cent[:,[0,2]].min(axis=0);mx=cent[:,[0,2]].max(axis=0);span=np.maximum(mx-mn,1e-9)
    ix=np.minimum(nx-1,np.floor((cent[:,0]-mn[0])/span[0]*nx).astype(int));iz=np.minimum(nz-1,np.floor((cent[:,2]-mn[1])/span[1]*nz).astype(int))
    out_dir.mkdir(parents=True,exist_ok=True);chunks=[];total=0
    for x in range(nx):
      for z in range(nz):
        ids=np.flatnonzero((ix==x)&(iz==z));
        if len(ids)==0:continue
        sub=mesh.submesh([ids],append=True,repair=False)
        # trimesh preserves available vertex color data for PLY submeshes.
        name=f'chunk-{x:02d}-{z:02d}.ply';dst=out_dir/name;sub.export(dst,file_type='ply',encoding='binary_little_endian')
        rv=np.asarray(sub.vertices)@R.T; bmin=rv.min(axis=0).astype(float).tolist();bmax=rv.max(axis=0).astype(float).tolist()
        chunks.append({'id':name[:-4],'url':'./generated/streaming/'+name,'faces':int(len(sub.faces)),'vertices':int(len(sub.vertices)),'sha256':sha256(dst),'runtimeBounds':{'min':bmin,'max':bmax}});total+=len(sub.faces)
    if total!=nfaces:raise RuntimeError(f'Lossless chunk invariant failed: source faces={nfaces}, chunk faces={total}')
    return {'schemaVersion':2,'mode':'lossless-spatial-chunks-v2','sourceSha256':sha256(src),'sourceFaces':int(nfaces),'chunkFaces':int(total),'lossless':True,'targetFaces':target_faces,'chunks':chunks,'preloadRadius':180.0,'unloadRadius':260.0,'concurrency':2}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('src',type=Path);ap.add_argument('out',type=Path);ap.add_argument('--up-axis',default='Y');ap.add_argument('--scale',type=float,default=1);ap.add_argument('--target-faces',type=int,default=150000);a=ap.parse_args()
 m=build_ply_chunks(a.src.resolve(),a.out.resolve(),a.up_axis.upper(),a.scale,a.target_faces);write_json(a.out.resolve().parent/'streaming.json',m);print(json.dumps({'chunks':len(m['chunks']),'sourceFaces':m['sourceFaces'],'chunkFaces':m['chunkFaces']},indent=2))
if __name__=='__main__':main()
