import numpy as np

def nearest_segment_2d(q, a, b):
    q=np.asarray(q,float); a=np.asarray(a,float); b=np.asarray(b,float)
    ab=b-a
    den=float(np.dot(ab,ab))+1e-9
    t=float(np.clip(np.dot(q-a,ab)/den,0.0,1.0))
    p=a+t*ab
    d=q-p
    dist=float(np.linalg.norm(d))
    cross=float(ab[0]*d[1]-ab[1]*d[0])
    sign=-1.0 if cross < 0 else 1.0
    return dist, t, sign

def percentile_scale(points, extent=30.0):
    if len(points)==0:
        return points, 1.0
    p=np.asarray(points,np.float32)
    lo=np.percentile(p,5,axis=0); hi=np.percentile(p,95,axis=0)
    span=float(np.max(hi-lo))
    s=float(extent/max(span,1e-5))
    center=(lo+hi)*0.5
    p=(p-center)*s
    p[:,1]*=-1.0
    floor=float(np.percentile(p[:,1], 5))
    p[:,1]-=floor
    return p, s
