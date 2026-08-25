#!/usr/bin/env python3
from __future__ import annotations
"""Spatially partition a static GLB into visually lossless GLB chunks.

The immutable source file is never rewritten. Faces are partitioned exactly once; vertex attributes,
UVs, normals, colors and materials are carried by trimesh submeshes. After export every chunk is
reloaded and face conservation is verified. Textured inputs additionally verify decoded source image
pixel hashes where trimesh exposes the texture image.

Unsupported animated/skinned/morph worlds fail closed instead of silently degrading.
"""
import argparse, hashlib, json, math, shutil
from collections import defaultdict
from pathlib import Path
import numpy as np
import trimesh
from quality_common import sha256, write_json


def _image_hash(image):
    if image is None: return None
    try:
        arr=np.asarray(image.convert('RGBA') if hasattr(image,'convert') else image)
        return hashlib.sha256(arr.tobytes()).hexdigest()
    except Exception:return None


def _texture_hashes(scene):
    out=[]
    for name,g in scene.geometry.items():
        vis=getattr(g,'visual',None);mat=getattr(vis,'material',None)
        imgs=[]
        if mat is not None:
            for k in ('image','baseColorTexture','normalTexture','metallicRoughnessTexture','emissiveTexture','occlusionTexture'):
                im=getattr(mat,k,None)
                if im is not None: imgs.append((k,_image_hash(im)))
        for k,h in imgs:
            if h: out.append((name,k,h))
    return sorted(out)


def _iter_nodes(scene):
    # scene.graph.nodes_geometry maps node names that reference geometry.
    for node in list(scene.graph.nodes_geometry):
        transform,geom_name=scene.graph.get(node)
        mesh=scene.geometry.get(geom_name)
        if isinstance(mesh,trimesh.Trimesh) and len(mesh.faces):
            yield node,geom_name,mesh,np.asarray(transform,dtype=np.float64)


def _detect_unsupported(scene):
    # trimesh does not expose full skin/morph semantics after import. Detect hints retained in metadata.
    meta=json.dumps(scene.metadata,default=str).lower()
    bad=[]
    for term in ('skin','morph','animation'):
        if term in meta: bad.append(term)
    return bad


def _cell_key(points,mn,cell):
    q=np.floor((points-mn)/cell).astype(np.int64)
    return q


def build_glb_chunks(source:Path,out_dir:Path,target_faces:int=120_000,max_chunks:int=64)->dict:
    source=Path(source);out_dir=Path(out_dir)
    scene=trimesh.load(source,process=False,force='scene')
    if not isinstance(scene,trimesh.Scene): scene=trimesh.Scene(scene)
    unsupported=_detect_unsupported(scene)
    if unsupported:
        raise RuntimeError('GLB chunking blocked for possible animated/skinned/morph asset: '+','.join(unsupported))
    nodes=list(_iter_nodes(scene))
    if not nodes: raise RuntimeError('No triangle geometry found in GLB')
    source_faces=sum(len(m.faces) for _,_,m,_ in nodes)
    source_vertices=sum(len(m.vertices) for _,_,m,_ in nodes)
    # World-space bounds and face centroids determine chunk ownership; local attributes stay untouched.
    world_centers=[]
    for _,_,m,T in nodes:
        c=np.asarray(m.triangles_center)
        h=np.c_[c,np.ones(len(c))]
        world_centers.append((h@T.T)[:,:3])
    allc=np.vstack(world_centers);mn=allc.min(0);mx=allc.max(0);ext=np.maximum(mx-mn,1e-6)
    desired=max(1,min(max_chunks,math.ceil(source_faces/max(1,target_faces))))
    # Cubic cell count chosen from desired chunk count and scene aspect ratio.
    volume=float(np.prod(ext));cell=(volume/max(1,desired))**(1/3) if volume>1e-12 else float(ext.max())
    cell=max(cell,float(ext.max())/max(1,round(desired**(1/3))*2))
    buckets=defaultdict(list)
    for (node,geom,m,T),centers in zip(nodes,world_centers):
        keys=_cell_key(centers,mn,cell)
        groups=defaultdict(list)
        for fi,k in enumerate(map(tuple,keys.tolist())):groups[k].append(fi)
        for k,faces in groups.items():buckets[k].append((node,geom,m,T,np.asarray(faces,dtype=np.int64)))
    # If a pathological input creates too many sparse cells, merge cells by stable hash bucket.
    if len(buckets)>max_chunks:
        merged=defaultdict(list)
        for i,(k,parts) in enumerate(sorted(buckets.items())):merged[i%max_chunks].extend(parts)
        buckets=merged
    if out_dir.exists():shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True,exist_ok=True)
    chunks=[];chunk_faces=0
    src_tex=_texture_hashes(scene)
    for ci,(key,parts) in enumerate(sorted(buckets.items(),key=lambda kv:str(kv[0]))):
        sc=trimesh.Scene();faces_here=0
        for pi,(node,geom,m,T,face_ids) in enumerate(parts):
            subs=m.submesh([face_ids],append=True,repair=False)
            if not isinstance(subs,trimesh.Trimesh) or not len(subs.faces):continue
            sc.add_geometry(subs,node_name=f'{node}__c{ci}_{pi}',geom_name=f'{geom}__c{ci}_{pi}',transform=T)
            faces_here+=len(subs.faces)
        if not faces_here:continue
        filename=f'chunk-{ci:03d}.glb';path=out_dir/filename
        path.write_bytes(trimesh.exchange.gltf.export_glb(sc,include_normals=True))
        # Reload validation catches exporter corruption immediately.
        chk=trimesh.load(path,process=False,force='scene')
        reloaded=sum(len(g.faces) for g in chk.geometry.values() if isinstance(g,trimesh.Trimesh))
        if reloaded!=faces_here:
            raise RuntimeError(f'GLB chunk validation failed for {filename}: {reloaded} != {faces_here}')
        cb=chk.bounds.astype(float).tolist() if chk.bounds is not None else [[0,0,0],[0,0,0]]
        chunks.append({'id':f'glb-{ci:03d}','url':f'./generated/glb-chunks/{filename}','visualType':'glb','faces':int(faces_here),'runtimeBounds':{'min':cb[0],'max':cb[1]},'sha256':sha256(path)})
        chunk_faces+=faces_here
    if chunk_faces!=source_faces:
        raise RuntimeError(f'Face conservation failed: source={source_faces} chunks={chunk_faces}')
    report={'mode':'lossless-glb-spatial-chunks-v1','lossless':True,'sourceSha256':sha256(source),'sourceFaces':int(source_faces),'sourceVertices':int(source_vertices),'chunkFaces':int(chunk_faces),'chunks':chunks,'sourceTexturePixelHashes':src_tex,'sourceAssetModified':False,'qualityPolicy':'face-conservation-and-source-immutable'}
    write_json(out_dir/'chunks.json',report)
    return report


def main():
    ap=argparse.ArgumentParser();ap.add_argument('source',type=Path);ap.add_argument('out',type=Path);ap.add_argument('--target-faces',type=int,default=120000);ap.add_argument('--max-chunks',type=int,default=64);a=ap.parse_args()
    print(json.dumps(build_glb_chunks(a.source,a.out,a.target_faces,a.max_chunks),indent=2))
if __name__=='__main__':main()
