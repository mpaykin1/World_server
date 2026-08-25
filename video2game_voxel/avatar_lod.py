import numpy as np

def generate_lods(parts, distances=(8.0,18.0,32.0)):
    result={}
    total=0
    for name,part in parts.items():
        p=np.asarray(part["voxels"],np.float32)
        c=np.asarray(part["colors"],np.uint8)
        lods=[]
        for level,stride in enumerate((1,2,4)):
            pp=p[::stride] if len(p) else p
            cc=c[::stride] if len(c) else c
            lods.append({"level":level,"voxels":pp,"colors":cc,"distance":float(distances[min(level,len(distances)-1)])})
            total += len(pp)
        result[name]={"base":part,"lods":lods}
    return result, {"lod_voxels_total":int(total),"levels":3,"status":"ok"}
