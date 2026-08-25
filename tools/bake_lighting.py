#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math, struct
from pathlib import Path
import numpy as np
import trimesh
from quality_common import sha256, read_json, write_json


def rot_xyz(deg):
    rx,ry,rz=[math.radians(float(x)) for x in deg]
    cx,sx=math.cos(rx),math.sin(rx);cy,sy=math.cos(ry),math.sin(ry);cz,sz=math.cos(rz),math.sin(rz)
    Rx=np.array([[1,0,0],[0,cx,-sx],[0,sx,cx]],dtype=np.float64)
    Ry=np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]],dtype=np.float64)
    Rz=np.array([[cz,-sz,0],[sz,cz,0],[0,0,1]],dtype=np.float64)
    return Rz@Ry@Rx


def bake_vertex_scalar(manifest_path:Path, out_dir:Path):
    m=read_json(manifest_path,{})
    v=m['visual']; src=(manifest_path.parent/v['url'].replace('./','',1)).resolve()
    if v['type']!='ply-mesh':
        raise RuntimeError('Built-in light baker currently supports ply-mesh directly. GLB uses the optional Blender adapter.')
    mesh=trimesh.load(src,process=False,force='mesh')
    normals=np.asarray(mesh.vertex_normals,dtype=np.float64)
    if len(normals)!=len(mesh.vertices):raise RuntimeError('Vertex normal count mismatch')
    R=rot_xyz(m.get('transform',{}).get('rotationDeg',[0,0,0]))
    n=(normals@R.T)
    lens=np.linalg.norm(n,axis=1);lens[lens<1e-9]=1;n=n/lens[:,None]
    # Precomputed static sky + key-light response. This companion cache never alters source bytes.
    sun=np.array([0.42,0.82,-0.39],dtype=np.float64);sun/=np.linalg.norm(sun)
    sky=np.clip(n[:,1]*0.5+0.5,0,1)
    direct=np.clip(n@sun,0,1)
    # Slightly compress extremes to avoid baked contrast fighting dynamic lights.
    scalar=np.clip(0.76 + 0.11*sky + 0.20*direct,0.72,1.16).astype('<f4')
    out_dir.mkdir(parents=True,exist_ok=True)
    binary=out_dir/'lighting-vertex.bin';binary.write_bytes(scalar.tobytes(order='C'))
    desc={
      'schemaVersion':1,'mode':'vertex-scalar-ply-v1','sourceSha256':v['sha256'],'sourceVertices':int(len(scalar)),
      'binaryUrl':'./lighting-vertex.bin','binarySha256':sha256(binary),'dtype':'float32-le','channels':1,
      'range':[float(scalar.min()),float(scalar.max())],
      'method':'static-sky-plus-key-directional-response-v1','sourceAssetModified':False,
    }
    descriptor=out_dir/'lighting-bake.json';write_json(descriptor,desc)
    return descriptor,desc


def main():
    ap=argparse.ArgumentParser(description='Non-destructive static lighting bake. Generates companion data; never rewrites visual source.')
    ap.add_argument('manifest',type=Path);ap.add_argument('--out-dir',type=Path,default=None)
    a=ap.parse_args();mp=a.manifest.resolve();out=(a.out_dir or mp.parent/'generated'/'lighting').resolve()
    d,stats=bake_vertex_scalar(mp,out);print(json.dumps({'pass':True,'descriptor':str(d),'stats':stats},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
