#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math
from collections import defaultdict
from pathlib import Path
import numpy as np
import trimesh
from quality_common import transform_matrix_for_axis, write_json


def load_mesh(path:Path):
    obj=trimesh.load(path,process=False,force='scene' if path.suffix.lower()=='.glb' else None)
    if isinstance(obj,trimesh.Scene):
        meshes=[g for g in obj.geometry.values() if isinstance(g,trimesh.Trimesh) and len(g.faces)]
        if not meshes:raise ValueError('No meshes')
        obj=trimesh.util.concatenate(meshes)
    return obj


def build_navgraph(path:Path, source_up_axis='Y', scale=1.0, cell_size=0.7, max_slope_deg=50, step_height=0.38, max_nodes=12000):
    mesh=load_mesh(path)
    R=transform_matrix_for_axis(source_up_axis,scale)
    v=np.asarray(mesh.vertices,float)@R.T; f=np.asarray(mesh.faces,np.int64); tri=v[f]
    e1=tri[:,1]-tri[:,0];e2=tri[:,2]-tri[:,0];n=np.cross(e1,e2);nl=np.linalg.norm(n,axis=1);valid=nl>1e-9;n[valid]/=nl[valid,None]
    walk=valid&(n[:,1]>=math.cos(math.radians(max_slope_deg)))
    c=tri.mean(axis=1)[walk]; areas=nl[walk]*0.5
    if not len(c):raise ValueError('No walkable triangles for navgraph')
    # Adaptive cell size keeps the graph compact while preserving stairs/corridors.
    bounds=np.array([c.min(axis=0),c.max(axis=0)]); span=np.maximum(bounds[1]-bounds[0],1e-6)
    est=(span[0]/cell_size+1)*(span[2]/cell_size+1)
    if est>max_nodes: cell_size*=math.sqrt(est/max_nodes)
    buckets=defaultdict(list)
    for p,a in zip(c,areas):
        ix=int(round(p[0]/cell_size));iz=int(round(p[2]/cell_size));
        # Keep multiple vertical layers in same XZ cell separated by agent-scale layer height.
        layer=int(round(p[1]/max(0.55,step_height*1.5)))
        buckets[(ix,iz,layer)].append((p,float(a)))
    nodes=[];key_to_id={}
    for key,vals in buckets.items():
        pts=np.array([x[0] for x in vals]);w=np.array([x[1] for x in vals]);
        pos=np.average(pts,axis=0,weights=np.maximum(w,1e-9));nid=len(nodes);key_to_id[key]=nid
        nodes.append({'id':nid,'position':pos.astype(float).tolist(),'grid':[key[0],key[1],key[2]]})
    edges=[]
    dirs=[(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]
    for key,a in key_to_id.items():
        pa=np.array(nodes[a]['position'])
        for dx,dz in dirs:
            candidates=[]
            for dl in (-1,0,1):
                b=key_to_id.get((key[0]+dx,key[1]+dz,key[2]+dl))
                if b is None or b<=a:continue
                pb=np.array(nodes[b]['position']);dy=abs(pb[1]-pa[1]);dist=np.linalg.norm(pb[[0,2]]-pa[[0,2]])
                if dy<=max(step_height*1.35,dist*math.tan(math.radians(max_slope_deg))+0.08):candidates.append((dy,b,pb))
            if candidates:
                _,b,pb=min(candidates,key=lambda x:x[0]);cost=float(np.linalg.norm(pb-pa));edges.append([a,b,cost])
    return {'schemaVersion':2,'generator':'walkable-grid-graph-v2','cellSize':cell_size,'maxSlopeDeg':max_slope_deg,'stepHeight':step_height,'nodes':nodes,'edges':edges,'stats':{'nodes':len(nodes),'edges':len(edges)}}


def main():
    ap=argparse.ArgumentParser();ap.add_argument('mesh',type=Path);ap.add_argument('output',type=Path);ap.add_argument('--up-axis',default='Y');ap.add_argument('--scale',type=float,default=1);ap.add_argument('--cell-size',type=float,default=0.7);a=ap.parse_args()
    g=build_navgraph(a.mesh.resolve(),a.up_axis.upper(),a.scale,a.cell_size);write_json(a.output.resolve(),g);print(json.dumps(g['stats'],indent=2))
if __name__=='__main__':main()
