from collections import defaultdict
import numpy as np

def complete_small_interior_gaps(indices, colors, max_gap=2):
    if len(indices)==0:
        return indices,colors,{"added":0,"status":"empty"}
    idx=np.asarray(indices,np.int32)
    col=np.asarray(colors,np.uint8)
    cmap={tuple(k):col[i].astype(np.float32) for i,k in enumerate(idx)}
    s=set(cmap)
    added=[]
    for axis in range(3):
        groups=defaultdict(list)
        for k in s:
            key=tuple(k[i] for i in range(3) if i!=axis)
            groups[key].append(k[axis])
        for key,vals in groups.items():
            vals=sorted(set(vals))
            for a,b in zip(vals,vals[1:]):
                gap=b-a-1
                if 0<gap<=max_gap:
                    for v in range(a+1,b):
                        arr=[0,0,0]; j=0
                        for i in range(3):
                            if i==axis: arr[i]=v
                            else: arr[i]=key[j]; j+=1
                        t=tuple(arr)
                        if t not in s:
                            added.append(t)
    for t in added:
        neigh=[]
        x,y,z=t
        for d in ((1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)):
            q=(x+d[0],y+d[1],z+d[2])
            if q in cmap: neigh.append(cmap[q])
        cmap[t]=np.mean(neigh,axis=0) if neigh else np.array([120,120,120],np.float32)
        s.add(t)
    out=np.array(sorted(s),np.int32)
    outc=np.array([np.clip(cmap[k],0,255) for k in map(tuple,out.tolist())],np.uint8)
    return out,outc,{"added":int(len(added)),"status":"ok"}

def cleanup_voxel_architecture(indices, colors):
    # Removes isolated single voxels and tiny 2-voxel noise clusters.
    if len(indices)==0:
        return indices,colors,{"removed":0,"status":"empty"}
    idx=np.asarray(indices,np.int32); col=np.asarray(colors,np.uint8)
    s=set(map(tuple,idx.tolist()))
    keep=[]
    for i,(x,y,z) in enumerate(idx.tolist()):
        n=0
        for d in ((1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)):
            if (x+d[0],y+d[1],z+d[2]) in s: n+=1
        if n>=1:
            keep.append(i)
    outi=idx[keep] if keep else idx
    outc=col[keep] if keep else col
    return outi,outc,{"removed":int(len(idx)-len(outi)),"status":"ok"}
