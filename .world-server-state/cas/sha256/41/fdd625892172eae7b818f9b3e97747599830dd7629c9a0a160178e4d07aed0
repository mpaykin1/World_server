from dataclasses import dataclass
import math
import numpy as np

BONES={
"torso":("hip_mid","shoulder_mid",.62,.24),"head":("shoulder_mid","nose",.36,.22),
"l_upper_arm":("l_shoulder","l_elbow",.35,.10),"l_lower_arm":("l_elbow","l_wrist",.32,.085),
"r_upper_arm":("r_shoulder","r_elbow",.35,.10),"r_lower_arm":("r_elbow","r_wrist",.32,.085),
"l_upper_leg":("l_hip","l_knee",.48,.12),"l_lower_leg":("l_knee","l_ankle",.47,.10),
"r_upper_leg":("r_hip","r_knee",.48,.12),"r_lower_leg":("r_knee","r_ankle",.47,.10)
}
REST={
"torso":([0,1.24,0],0.0),"head":([0,1.70,0],0.0),
"l_upper_arm":([-.24,1.47,0],math.radians(8)),"l_lower_arm":([-.26,1.17,0],math.radians(-4)),
"r_upper_arm":([.24,1.47,0],math.radians(-8)),"r_lower_arm":([.26,1.17,0],math.radians(4)),
"l_upper_leg":([-.12,.86,0],0.0),"l_lower_leg":([-.12,.39,0],0.0),
"r_upper_leg":([.12,.86,0],0.0),"r_lower_leg":([.12,.39,0],0.0)
}

def enrich(lm):
    if not lm:return {}
    d=dict(lm)
    def mid(a,b):
        if a not in d or b not in d:return None
        return ((d[a][0]+d[b][0])/2,(d[a][1]+d[b][1])/2,min(d[a][2],d[b][2]))
    h=mid("l_hip","r_hip");s=mid("l_shoulder","r_shoulder")
    if h:d["hip_mid"]=h
    if s:d["shoulder_mid"]=s
    return d

def angle(lm,a,b):
    if a not in lm or b not in lm:return None
    dx=lm[b][0]-lm[a][0];dy=lm[b][1]-lm[a][1]
    return float(math.atan2(dx,-dy))

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

@dataclass
class AvatarResult:
    parts: dict
    motion: dict
    quality: dict

def voxelize_local(points, colors, voxel_size, max_count):
    if len(points) == 0:
        return np.empty((0,3),np.float32), np.empty((0,3),np.uint8)
    p=np.asarray(points,np.float32); c=np.asarray(colors,np.uint8)
    idx=np.floor(p/float(voxel_size)).astype(np.int32)
    keys={}
    order=[]
    sums=[]
    counts=[]
    for i,k in enumerate(map(tuple, idx.tolist())):
        if k not in keys:
            keys[k]=len(order); order.append(k); sums.append(c[i].astype(np.float64)); counts.append(1)
        else:
            j=keys[k]; sums[j]+=c[i]; counts[j]+=1
    if len(order)>max_count:
        keep=np.argsort(np.asarray(counts))[::-1][:max_count]
        order=[order[j] for j in keep]; sums=[sums[j] for j in keep]; counts=[counts[j] for j in keep]
    vox=(np.asarray(order,np.float32)+0.5)*float(voxel_size)
    col=np.asarray([np.clip(s/max(1,n),0,255) for s,n in zip(sums,counts)], np.uint8)
    return vox, col

class AvatarBuilder:
    def __init__(self,pixel_stride=5,max_points_per_bone=16000,depth_layers=2,voxel_size=.08,root_motion_gain=2.2,temporal_angle_alpha=0.58):
        self.stride=max(2,int(pixel_stride)); self.max_points=int(max_points_per_bone)
        self.layers=max(1,int(depth_layers)); self.voxel_size=float(voxel_size)
        self.root_motion_gain=float(root_motion_gain); self.temporal_angle_alpha=float(temporal_angle_alpha)

    def build(self,frames,person_frames,timestamps):
        buckets={k:[] for k in BONES}; colors={k:[] for k in BONES}; motion=[]; accepted=0
        prev_angles={}; root_origin=None
        for fi,(fr,pf) in enumerate(zip(frames,person_frames)):
            lm=enrich(pf.landmarks if pf else {})
            if not lm or pf.bbox is None: continue
            req=("l_ankle","r_ankle","nose","hip_mid","shoulder_mid")
            if any(k not in lm for k in req): continue
            body_h=max(50.0,max(lm["l_ankle"][1],lm["r_ankle"][1])-lm["nose"][1]); accepted+=1
            aa={}
            for name,(a,b,_,_) in BONES.items():
                v=angle(lm,a,b)
                if v is not None:
                    if name in prev_angles: v=self.temporal_angle_alpha*prev_angles[name]+(1-self.temporal_angle_alpha)*v
                    aa[name]=v
            prev_angles=aa
            hip=np.array(lm["hip_mid"][:2], np.float32)
            if root_origin is None: root_origin=hip.copy()
            root_px=(hip-root_origin)/max(body_h,1.0)
            root_motion=[float(root_px[0]*self.root_motion_gain), 0.0, float(root_px[1]*0.35*self.root_motion_gain)]
            motion.append({"t":float(timestamps[fi]),"angles":aa,"root":root_motion})
            ys,xs=np.where(pf.mask[::self.stride,::self.stride]>0); xs*=self.stride; ys*=self.stride
            if len(xs)>4800:
                take=np.linspace(0,len(xs)-1,4800).astype(int); xs=xs[take]; ys=ys[take]
            for x,y in zip(xs,ys):
                best=None; q=(float(x),float(y))
                for name,(a,b,blen,thick) in BONES.items():
                    if a not in lm or b not in lm: continue
                    dist,t,sign=nearest_segment_2d(q,lm[a][:2],lm[b][:2]); score=dist/body_h/max(thick,.03)
                    if best is None or score<best[0]: best=(score,name,t,sign,dist,blen,thick,lm[a][:2],lm[b][:2])
                if best is None or best[0]>2.2: continue
                _,name,t,sign,dist,blen,thick,a,b=best
                seg=max(1.0,float(np.linalg.norm(np.array(b)-np.array(a))))
                lateral=sign*(dist/seg)*blen; longitudinal=(t-.5)*blen
                zmag=max(.008,thick*(1.0-min(1.0,abs(lateral)/(thick*1.6+1e-6))))
                rgb=fr[int(y),int(x),::-1].astype(np.uint8)
                zs=[0.0] if self.layers==1 else np.linspace(-zmag,zmag,self.layers)
                for z in zs:
                    buckets[name].append((lateral,longitudinal,float(z))); colors[name].append(tuple(int(v) for v in rgb))
        parts={}; total=0
        for name in BONES:
            vox,col=voxelize_local(buckets[name], colors[name], self.voxel_size, self.max_points)
            parts[name]={"voxels":vox,"colors":col,"voxel_size":self.voxel_size,"rest_position":REST[name][0],"rest_rotation_z":REST[name][1]}
            total+=len(vox)
        return AvatarResult(parts,{"frames":motion},
            {"accepted_pose_frames":accepted,"avatar_voxels":int(total),"status":"ok" if accepted>=3 and total>=300 else "weak_tracking"})
