#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math
from pathlib import Path
import numpy as np
import trimesh
from quality_common import sha256, write_json


def _meshlets_for(vertices: np.ndarray, faces: np.ndarray, max_tris: int, geometry_id: str):
    out=[]
    for start in range(0,len(faces),max_tris):
        end=min(len(faces),start+max_tris)
        f=faces[start:end]
        ids=np.unique(f.reshape(-1))
        pts=vertices[ids]
        mn=pts.min(axis=0); mx=pts.max(axis=0); c=(mn+mx)*0.5
        r=float(np.linalg.norm(pts-c,axis=1).max()) if len(pts) else 0.0
        out.append({
            'id':f'{geometry_id}:{start//max_tris}',
            'geometry':geometry_id,
            'firstTriangle':int(start),'triangleCount':int(end-start),
            'uniqueVertexCount':int(len(ids)),
            'bounds':{'min':[float(x) for x in mn],'max':[float(x) for x in mx]},
            'sphere':{'center':[float(x) for x in c],'radius':r},
        })
    return out


def build(source: Path, output: Path, max_tris: int=64):
    source=source.resolve(); ext=source.suffix.lower(); geometries=[]; total_faces=0; meshlets=[]
    if ext=='.ply':
        m=trimesh.load(source,force='mesh',process=False)
        if not isinstance(m,trimesh.Trimesh): raise RuntimeError('PLY is not a triangle mesh')
        f=np.asarray(m.faces,dtype=np.int64); v=np.asarray(m.vertices,dtype=np.float64)
        geometries.append({'id':'mesh0','triangles':int(len(f)),'vertices':int(len(v))})
        meshlets += _meshlets_for(v,f,max_tris,'mesh0'); total_faces+=len(f)
    elif ext in ('.glb','.gltf'):
        sc=trimesh.load(source,force='scene',process=False)
        if isinstance(sc,trimesh.Trimesh): sc=trimesh.Scene(sc)
        for i,(name,m) in enumerate(sc.geometry.items()):
            if not isinstance(m,trimesh.Trimesh) or len(m.faces)==0: continue
            gid=f'g{i}:{name}'
            f=np.asarray(m.faces,dtype=np.int64); v=np.asarray(m.vertices,dtype=np.float64)
            geometries.append({'id':gid,'triangles':int(len(f)),'vertices':int(len(v))})
            meshlets += _meshlets_for(v,f,max_tris,gid); total_faces+=len(f)
    else: raise RuntimeError('meshlet builder supports PLY/GLB/GLTF')
    if sum(x['triangleCount'] for x in meshlets)!=total_faces: raise RuntimeError('face conservation failed')
    d={'schemaVersion':1,'mode':'lossless-source-triangle-meshlets-v1','source':source.name,'sourceSha256':sha256(source),'sourceTriangles':int(total_faces),'meshletTriangles':int(sum(x['triangleCount'] for x in meshlets)),'faceConservation':True,'maxTrianglesPerMeshlet':int(max_tris),'geometries':geometries,'meshlets':meshlets,'sourceAssetModified':False}
    output.parent.mkdir(parents=True,exist_ok=True);write_json(output,d);return d

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('source',type=Path);ap.add_argument('output',type=Path);ap.add_argument('--max-tris',type=int,default=64);a=ap.parse_args();d=build(a.source,a.output,a.max_tris);print(json.dumps({'meshlets':len(d['meshlets']),'triangles':d['sourceTriangles'],'conserved':d['faceConservation']},indent=2))
