from dataclasses import dataclass
from collections import defaultdict
import numpy as np

PALETTE16 = np.array([
    [20,24,28],[44,54,64],[78,89,101],[115,129,145],
    [160,172,184],[214,220,228],[100,72,48],[145,106,68],
    [186,145,96],[83,58,40],[70,96,62],[98,134,86],
    [132,168,120],[141,84,82],[186,120,110],[232,182,152]
], dtype=np.uint8)

@dataclass
class VoxelGrid:
    indices: np.ndarray
    colors: np.ndarray
    world_positions: np.ndarray
    chunk_keys: np.ndarray
    floor_y: float
    quality: dict
    labels: list

def quantize_colors(colors, mode="palette16"):
    c=np.asarray(colors,np.uint8)
    if len(c)==0:return c
    if mode=="palette16":
        diff=c[:,None,:].astype(np.int16)-PALETTE16[None,:,:].astype(np.int16)
        dist=np.sum(diff*diff, axis=2)
        return PALETTE16[np.argmin(dist, axis=1)]
    if mode=="rgb332":
        out=np.empty_like(c)
        out[:,0]=(c[:,0]//32)*32
        out[:,1]=(c[:,1]//32)*32
        out[:,2]=(c[:,2]//64)*64
        return out
    return c

def _fill_vertical(arr_set, max_gap=2):
    added=[]
    columns=defaultdict(list)
    for x,y,z in arr_set:
        columns[(x,z)].append(y)
    for (x,z), ys in columns.items():
        ys=sorted(set(ys))
        for a,b in zip(ys, ys[1:]):
            gap=b-a-1
            if 0 < gap <= max_gap:
                for yy in range(a+1, b):
                    if (x,yy,z) not in arr_set:
                        added.append((x,yy,z))
    for k in added: arr_set.add(k)
    return len(added)

def _fill_floor_holes(arr_set, floor_y_index, neighbors_min=3):
    candidates=set()
    for x,y,z in list(arr_set):
        if abs(y-floor_y_index)<=1:
            for dx,dz in ((1,0),(-1,0),(0,1),(0,-1)):
                k=(x+dx,y,z+dz)
                if k not in arr_set:
                    candidates.add(k)
    added=0
    for x,y,z in candidates:
        if abs(y-floor_y_index)>1: 
            continue
        n=0
        for dx,dz in ((1,0),(-1,0),(0,1),(0,-1)):
            if (x+dx,y,z+dz) in arr_set: n+=1
        if n>=neighbors_min:
            arr_set.add((x,y,z)); added+=1
    return added

def _cull_hidden(arr_set):
    keep=set()
    for x,y,z in arr_set:
        neigh=0
        for dx,dy,dz in ((1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)):
            if (x+dx,y+dy,z+dz) in arr_set: neigh+=1
        if neigh < 6:
            keep.add((x,y,z))
    removed=len(arr_set)-len(keep)
    return keep, removed

def _labels(arr, floor_y_idx):
    out=[]
    if len(arr)==0:return out
    max_y=int(np.max(arr[:,1]))
    for x,y,z in arr.tolist():
        if y <= floor_y_idx + 1:
            out.append("floor")
        elif y >= max_y - 1:
            out.append("roof")
        elif y - floor_y_idx >= 2:
            out.append("wall")
        else:
            out.append("decor")
    return out

def voxelize_points(points, colors, voxel_size=0.22, max_voxels=80000, color_mode="palette16", chunk_size=16,
                    floor_band_percentile=10, max_vertical_fill_gap=2, enable_hidden_voxel_cull=True,
                    enable_floor_hole_fill=True, floor_fill_neighbors_min=3):
    if len(points) == 0:
        return VoxelGrid(np.empty((0,3), np.int32), np.empty((0,3), np.uint8), np.empty((0,3), np.float32),
                         np.empty((0,3), np.int32), 0.0, {"voxels":0,"chunks":0,"status":"empty"}, [])
    pts=np.asarray(points,np.float32)
    cols=quantize_colors(np.asarray(colors,np.uint8), color_mode)
    vidx=np.floor(pts/float(voxel_size)).astype(np.int32)
    bucket=defaultdict(lambda: [np.zeros(3, np.float64), 0])
    for i,v in enumerate(vidx):
        key=(int(v[0]),int(v[1]),int(v[2]))
        bucket[key][0]+=cols[i]
        bucket[key][1]+=1

    keys=list(bucket.keys())
    if len(keys)>max_voxels:
        keys=sorted(keys, key=lambda k: bucket[k][1], reverse=True)[:max_voxels]

    arr_set=set(keys)
    floor_y_index=int(np.percentile(np.array([k[1] for k in arr_set], dtype=np.int32), floor_band_percentile)) if arr_set else 0
    vertical_fill_added=_fill_vertical(arr_set, max_gap=max_vertical_fill_gap)
    floor_fill_added=_fill_floor_holes(arr_set, floor_y_index, neighbors_min=floor_fill_neighbors_min) if enable_floor_hole_fill else 0
    hidden_removed=0
    if enable_hidden_voxel_cull:
        arr_set, hidden_removed = _cull_hidden(arr_set)

    arr=np.array(sorted(arr_set), np.int32)
    cmap={k:(bucket[k][0]/max(1,bucket[k][1])).clip(0,255) if k in bucket else np.array([120,120,120]) for k in set(keys)}
    c=np.array([cmap.get(tuple(v.tolist()), np.array([120,120,120])) for v in arr], np.uint8)
    c=quantize_colors(c, color_mode)
    world=(arr.astype(np.float32)+0.5)*float(voxel_size)
    chunk=np.floor(arr/float(chunk_size)).astype(np.int32)
    floor_y=float(np.percentile(world[:,1], floor_band_percentile)) if len(world) else 0.0
    labels=_labels(arr, floor_y_index)
    q={"voxels":int(len(arr)),
       "chunks":int(len({tuple(x) for x in chunk.tolist()})),
       "voxel_size":float(voxel_size),
       "vertical_fill_added": int(vertical_fill_added),
       "floor_fill_added": int(floor_fill_added),
       "hidden_removed": int(hidden_removed),
       "status":"ok"}
    return VoxelGrid(arr,c,world,chunk,floor_y,q,labels)

def chunk_voxels(indices, colors, chunk_keys, labels=None):
    out={}
    for i,key in enumerate(chunk_keys):
        k=tuple(int(v) for v in key)
        out.setdefault(k, [[],[],[]])
        out[k][0].append(indices[i])
        out[k][1].append(colors[i])
        out[k][2].append(labels[i] if labels else "decor")
    res={}
    for k,(ii,cc,ll) in out.items():
        res[k]=(np.asarray(ii,np.int32),np.asarray(cc,np.uint8),list(ll))
    return res

def _postprocess_grid(vg, cfg):
    from .voxel_postprocess import complete_small_interior_gaps, cleanup_voxel_architecture
    idx, col = vg.indices, vg.colors
    pp = {}
    if cfg.get("enable_interior_completion", True):
        idx, col, rep = complete_small_interior_gaps(idx, col, max_gap=cfg.get("interior_fill_max_gap",2))
        pp["interior_completion"] = rep
    if cfg.get("enable_procedural_cleanup", True):
        idx, col, rep = cleanup_voxel_architecture(idx, col)
        pp["procedural_cleanup"] = rep
    if len(idx):
        world=(idx.astype(np.float32)+0.5)*float(vg.quality.get("voxel_size",0.22))
        chunk=np.floor(idx/float(cfg.get("chunk_size",16))).astype(np.int32)
        floor_y=float(np.percentile(world[:,1], cfg.get("floor_band_percentile",10)))
        labels=_labels(idx, int(np.percentile(idx[:,1], cfg.get("floor_band_percentile",10))))
    else:
        world=np.empty((0,3),np.float32); chunk=np.empty((0,3),np.int32); floor_y=0.0; labels=[]
    q=dict(vg.quality)
    q["postprocess"]=pp
    q["voxels"]=int(len(idx))
    q["chunks"]=int(len({tuple(x) for x in chunk.tolist()})) if len(chunk) else 0
    return VoxelGrid(idx,col,world,chunk,floor_y,q,labels)

def choose_best_voxelization(points, colors, cfg):
    candidates=cfg.get("voxel_size_candidates") or [0.22]
    best=None
    attempts=[]
    for vs in candidates:
        vg=_postprocess_grid(voxelize_points(
            points, colors,
            voxel_size=vs,
            max_voxels=cfg["max_voxels"],
            color_mode=cfg.get("color_mode","palette16"),
            chunk_size=cfg["chunk_size"],
            floor_band_percentile=cfg["floor_band_percentile"],
            max_vertical_fill_gap=cfg.get("max_vertical_fill_gap",2),
            enable_hidden_voxel_cull=cfg.get("enable_hidden_voxel_cull",True),
            enable_floor_hole_fill=cfg.get("enable_floor_hole_fill",True),
            floor_fill_neighbors_min=cfg.get("floor_fill_neighbors_min",3),
        ), cfg)
        vox=vg.quality["voxels"]; ch=vg.quality["chunks"]
        score = (min(1.0, vox/25000.0)*55.0) + (min(1.0, ch/120.0)*10.0) + min(15.0, vg.quality["floor_fill_added"]) + min(20.0, vg.quality["hidden_removed"]/500.0)
        attempts.append({"voxel_size":vs,"score":score,"quality":vg.quality})
        if best is None or score > best[1]:
            best=(vg,score)
    return best[0], attempts
