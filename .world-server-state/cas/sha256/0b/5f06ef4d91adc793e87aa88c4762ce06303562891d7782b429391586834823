#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, math, shutil
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh
from quality_common import sha256, write_json

SUN=np.array([0.42,0.82,-0.39],dtype=np.float64);SUN/=np.linalg.norm(SUN)

def _uv_array(mesh):
    uv=getattr(getattr(mesh,'visual',None),'uv',None)
    if uv is None:return None
    uv=np.asarray(uv,dtype=np.float64)
    return uv if uv.ndim==2 and uv.shape[1]>=2 and len(uv)==len(mesh.vertices) else None

def _intensity(mesh):
    n=np.asarray(mesh.vertex_normals,dtype=np.float64)
    sky=np.clip(n[:,1]*0.5+0.5,0,1);direct=np.clip(n@SUN,0,1)
    return np.clip(0.74+0.12*sky+0.22*direct,0.70,1.18)

def _bake_one(mesh,resolution):
    uv=_uv_array(mesh)
    if uv is None:return None
    val=_intensity(mesh)
    img=Image.new('L',(resolution,resolution),int(round(0.82*255)))
    draw=ImageDraw.Draw(img)
    for face in np.asarray(mesh.faces,dtype=np.int64):
        pts=[]
        for i in face:
            u=float(uv[i,0]%1.0);v=float(uv[i,1]%1.0)
            pts.append((int(round(u*(resolution-1))),int(round((1.0-v)*(resolution-1)))))
        light=int(round(float(np.mean(val[face]))/1.18*255))
        draw.polygon(pts,fill=max(0,min(255,light)))
    # Small dilation/blur prevents UV-island edge seams without altering source texture assets.
    img=img.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.55))
    return img

def bake(source:Path,out_dir:Path,resolution:int=512)->dict:
    source=Path(source);out_dir=Path(out_dir)
    if out_dir.exists():shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True,exist_ok=True)
    scene=trimesh.load(source,process=False,force='scene')
    entries=[];fallback=[]
    for name,mesh in scene.geometry.items():
        if not isinstance(mesh,trimesh.Trimesh) or not len(mesh.faces):continue
        img=_bake_one(mesh,resolution)
        if img is None:
            fallback.append({'geometryName':name,'vertices':int(len(mesh.vertices)),'mode':'runtime-normal-scalar-v1'})
            continue
        fn=f'{len(entries):03d}-{hashlib.sha1(name.encode()).hexdigest()[:8]}.png';path=out_dir/fn;img.save(path,optimize=True)
        entries.append({'geometryName':name,'vertices':int(len(mesh.vertices)),'faces':int(len(mesh.faces)),'textureUrl':'./'+fn,'textureSha256':sha256(path),'uvChannel':0,'lightMapIntensity':1.0})
    desc={'schemaVersion':1,'mode':'uv-lightmap-glb-v1','sourceSha256':sha256(source),'sourceAssetModified':False,'resolution':resolution,'entries':entries,'fallbacks':fallback,'verified':bool(entries or fallback)}
    write_json(out_dir/'lighting-bake.json',desc);return desc

def main():
    ap=argparse.ArgumentParser();ap.add_argument('source',type=Path);ap.add_argument('out',type=Path);ap.add_argument('--resolution',type=int,default=512);a=ap.parse_args();print(json.dumps(bake(a.source,a.out,a.resolution),indent=2))
if __name__=='__main__':main()
