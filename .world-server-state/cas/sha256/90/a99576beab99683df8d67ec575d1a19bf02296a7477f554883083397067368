from __future__ import annotations
import numpy as np


def manhattan_optimize(scene: dict, voxel: float, snap_distance_voxels: float = 0.65) -> tuple[dict, dict]:
    """Snap architectural normals/nearby points to Manhattan axes and dominant planes."""
    s={k:v.copy() for k,v in scene.items()}
    p=s["points"]; n=s["normals"]; sem=s["semantic"]
    architectural=(sem==0)&(s["confidence"]>0.34)
    axes=np.eye(3,dtype=np.float32)
    snapped=0
    for i in np.where(architectural)[0]:
        a=np.abs(n[i]); ax=int(np.argmax(a))
        if a[ax] > 0.76:
            sign=1.0 if n[i,ax]>=0 else -1.0
            n[i]=axes[ax]*sign; snapped+=1
    # Ground is exact horizontal.
    n[sem==1]=np.array([0,1,0],np.float32)

    plane_snaps=0; planes=[]
    for axis in (0,2):
        mask=architectural & (np.abs(n[:,axis])>0.9)
        vals=p[mask,axis]
        if len(vals)<20: continue
        bins=np.round(vals/(voxel*2)).astype(np.int32)
        u,c=np.unique(bins,return_counts=True)
        for bi,ct in sorted(zip(u,c), key=lambda x:x[1], reverse=True)[:8]:
            if ct<8: continue
            val=float(bi*voxel*2)
            near=mask & (np.abs(p[:,axis]-val) < voxel*snap_distance_voxels)
            p[near,axis]=val
            plane_snaps+=int(np.sum(near)); planes.append({"axis":"x" if axis==0 else "z","value":val,"support":int(ct)})
    return s,{"normal_snaps":snapped,"point_plane_snaps":plane_snaps,"planes":planes}


def tangent_gap_completion(scene: dict, voxel: float, max_ratio: float = 0.06) -> tuple[dict,int]:
    """CPU surfel/plane-constrained completion beyond one-axis hole filling.

    Adds cells only when at least three neighboring cells support a locally coherent tangent surface.
    """
    if max_ratio<=0: return scene,0
    s={k:v.copy() for k,v in scene.items()}
    keys=s["keys"]; lookup={tuple(k):i for i,k in enumerate(keys.tolist())}
    # Candidate empty 6-neighbor cells.
    neigh=[(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
    cand={}
    for k in keys.tolist():
        kt=tuple(k)
        for d in neigh:
            q=(kt[0]+d[0],kt[1]+d[1],kt[2]+d[2])
            if q not in lookup: cand[q]=None
    limit=max(1,int(len(keys)*max_ratio)); adds=[]
    for q in cand:
        ids=[]
        for d in neigh:
            j=lookup.get((q[0]+d[0],q[1]+d[1],q[2]+d[2]))
            if j is not None: ids.append(j)
        if len(ids)<3: continue
        nn=s["normals"][ids]; mean_n=nn.mean(axis=0); ln=np.linalg.norm(mean_n)
        if ln<0.78: continue
        mean_n/=ln
        if np.mean(np.abs(nn@mean_n))<0.86: continue
        cc=s["colors"][ids]
        if float(np.mean(np.linalg.norm(cc-cc.mean(axis=0),axis=1)))>0.28: continue
        adds.append((q,ids,mean_n.copy()))
        if len(adds)>=limit: break
    if not adds:return s,0

    extra={k:[] for k in s}
    for q,ids,nn in adds:
        extra["keys"].append(q); extra["points"].append((np.array(q,np.float32)+0.5)*voxel)
        extra["colors"].append(s["colors"][ids].mean(axis=0)); extra["normals"].append(nn)
        extra["confidence"].append(float(np.min(s["confidence"][ids])*0.72)); extra["semantic"].append(int(np.bincount(s["semantic"][ids]).argmax()))
        extra["counts"].append(1.0); extra["view_support"].append(float(np.min(s["view_support"][ids])))
        extra["scale_u"].append(float(np.mean(s["scale_u"][ids]))); extra["scale_v"].append(float(np.mean(s["scale_v"][ids])))
        extra["alpha"].append(float(np.mean(s["alpha"][ids])*0.92))
    out={}; dtypes={"keys":np.int32,"semantic":np.uint8}
    for k in s:
        out[k]=np.concatenate([s[k],np.asarray(extra[k],dtype=dtypes.get(k,np.float32))],axis=0)
    return out,len(adds)


def optional_poisson_mesh(scene: dict, out_path, depth: int = 8) -> dict:
    """Optional Open3D Poisson reconstruction. It is never required for the base CPU build."""
    try:
        import open3d as o3d
    except Exception:
        return {"available":False,"ran":False}
    pcd=o3d.geometry.PointCloud()
    pcd.points=o3d.utility.Vector3dVector(scene["points"].astype(np.float64))
    pcd.normals=o3d.utility.Vector3dVector(scene["normals"].astype(np.float64))
    pcd.colors=o3d.utility.Vector3dVector(np.clip(scene["colors"],0,1).astype(np.float64))
    mesh,density=o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(pcd,depth=depth,n_threads=1)
    density=np.asarray(density)
    if len(density):
        mesh.remove_vertices_by_mask(density < np.quantile(density,0.03))
    o3d.io.write_triangle_mesh(str(out_path),mesh,write_ascii=False)
    return {"available":True,"ran":True,"vertices":len(mesh.vertices),"triangles":len(mesh.triangles)}


def surfel_fusion_relax(scene: dict, voxel: float, iterations: int = 2) -> tuple[dict, dict]:
    """CPU surfel fusion: local point-to-plane consensus relaxation.

    It reduces floating/noisy splats without inventing large surfaces. This is a
    sparse surfel-fusion analogue; it is intentionally bounded for generated input.
    """
    from scipy.spatial import cKDTree
    s={k:v.copy() for k,v in scene.items()}
    p=s['points']; n=s['normals']; conf=s['confidence']; sem=s['semantic']
    total_moved=0; rms=[]
    for _ in range(max(0,iterations)):
        tree=cKDTree(p)
        newp=p.copy(); residuals=[]
        for i in range(len(p)):
            if sem[i]==1 or conf[i]<0.25: continue
            ids=tree.query_ball_point(p[i],r=voxel*2.15)
            if len(ids)<4: continue
            ids=np.asarray(ids,np.int32); dots=n[ids]@n[i]
            ids=ids[np.abs(dots)>0.80]
            if len(ids)<4: continue
            # neighbor tangent planes: n_j dot (x-p_j)=0
            r=np.sum(n[ids]*(p[i]-p[ids]),axis=1)
            med=float(np.median(r))
            if abs(med)>voxel*0.85: continue
            step=np.clip(med,-voxel*0.22,voxel*0.22)
            newp[i]=p[i]-n[i]*step*0.55
            residuals.append(abs(med)); total_moved+=1
        p[:]=newp
        if residuals:rms.append(float(np.sqrt(np.mean(np.square(residuals)))))
    s['points']=p
    return s,{'iterations':iterations,'point_updates':total_moved,'residual_rms_m':rms}


def sparse_tsdf_completion(raw: dict, cams: np.ndarray, scene: dict, voxel: float, max_new_ratio: float = 0.035) -> tuple[dict, dict]:
    """Sparse CPU TSDF hash fusion around observed surfaces.

    Each observation contributes a truncated signed-distance band along its camera ray.
    Cells near a fused zero crossing and supported by multiple observations can fill
    small gaps in the stylized surfel scene.
    """
    from collections import defaultdict
    from scipy.spatial import cKDTree
    points=raw['points']; views=raw['views']; conf=raw['confidence']
    # Sample observations to bound CPU/memory while preserving every view.
    max_obs=90000
    stride=max(1,len(points)//max_obs)
    idx=np.arange(0,len(points),stride,dtype=np.int32)
    p=points[idx]; v=views[idx]; w=np.clip(conf[idx],0.05,1.0)
    origins=cams[v,:3]; ray=p-origins; ray/=np.maximum(np.linalg.norm(ray,axis=1,keepdims=True),1e-7)
    trunc=voxel*1.8
    offsets=np.array([-trunc,-0.5*trunc,0,0.5*trunc,trunc],np.float32)
    acc=defaultdict(lambda:[0.0,0.0,0]) # sdf*w, w, zero-hit count
    for off in offsets:
        q=p+ray*off
        keys=np.floor(q/voxel).astype(np.int32)
        sdf=float(off/trunc)
        for k,ww in zip(map(tuple,keys.tolist()),w.tolist()):
            a=acc[k];a[0]+=sdf*ww;a[1]+=ww;a[2]+=1 if abs(off)<1e-7 else 0
    existing={tuple(k):i for i,k in enumerate(scene['keys'].tolist())}
    candidates=[]
    for k,(sw,ws,zh) in acc.items():
        if k in existing or ws<1.45:continue
        tsdf=sw/max(ws,1e-7)
        if abs(tsdf)>0.22:continue
        candidates.append((k,ws,abs(tsdf)))
    if not candidates:return scene,{'sampled_observations':len(idx),'candidate_cells':0,'added':0}
    candidates.sort(key=lambda x:(-x[1],x[2]));limit=max(1,int(len(scene['points'])*max_new_ratio));candidates=candidates[:limit]
    tree=cKDTree(scene['points']);extra={k:[] for k in scene}
    added=0
    for k,ws,err in candidates:
        pos=(np.array(k,np.float32)+0.5)*voxel
        dist,j=tree.query(pos,k=1)
        if dist>voxel*1.9:continue
        extra['keys'].append(k);extra['points'].append(pos);extra['colors'].append(scene['colors'][j]);extra['normals'].append(scene['normals'][j])
        extra['confidence'].append(float(min(0.82,scene['confidence'][j]*0.78+min(ws/8,0.18))));extra['semantic'].append(int(scene['semantic'][j]));extra['counts'].append(1.0)
        extra['view_support'].append(float(max(1,scene['view_support'][j])));extra['scale_u'].append(float(scene['scale_u'][j]));extra['scale_v'].append(float(scene['scale_v'][j]));extra['alpha'].append(float(scene['alpha'][j]*0.90));added+=1
    if not added:return scene,{'sampled_observations':len(idx),'candidate_cells':len(candidates),'added':0}
    dtypes={'keys':np.int32,'semantic':np.uint8};out={}
    for k in scene:out[k]=np.concatenate([scene[k],np.asarray(extra[k],dtype=dtypes.get(k,np.float32))],axis=0)
    return out,{'sampled_observations':len(idx),'candidate_cells':len(candidates),'added':added,'truncation_m':float(trunc)}
