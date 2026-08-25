from dataclasses import dataclass
import cv2
import numpy as np
from .math3d import percentile_scale

@dataclass
class SceneReconstruction:
    points: np.ndarray
    colors: np.ndarray
    camera_poses: list
    quality: dict
    score: float

class CpuSFM:
    def __init__(self,max_features=2600,ratio_test=.72,min_matches=60,max_scene_points=240000,world_extent_m=30.0):
        self.orb=cv2.ORB_create(nfeatures=int(max_features),fastThreshold=12)
        self.ratio=float(ratio_test);self.min_matches=int(min_matches)
        self.max_points=int(max_scene_points);self.world_extent=float(world_extent_m)
        self.bf=cv2.BFMatcher(cv2.NORM_HAMMING)

    def _features(self,frame,mask):
        gray=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY)
        inv = cv2.bitwise_not(mask) if mask is not None else None
        return self.orb.detectAndCompute(gray, inv)

    def _match(self,d1,d2):
        if d1 is None or d2 is None or len(d1)<8 or len(d2)<8:return []
        out=[]
        for pair in self.bf.knnMatch(d1,d2,k=2):
            if len(pair)==2 and pair[0].distance<self.ratio*pair[1].distance:out.append(pair[0])
        return out

    def reconstruct(self,frames,person_frames):
        h,w=frames[0].shape[:2];f=.92*max(w,h)
        K=np.array([[f,0,w/2],[0,f,h/2],[0,0,1]],np.float64)
        feats=[self._features(fr,pf.mask if pf else None) for fr,pf in zip(frames,person_frames)]
        Tcw=np.eye(4,dtype=np.float64);poses=[np.linalg.inv(Tcw)]
        all_p=[];all_c=[];good=0;skipped=0;pair_scores=[]

        for i in range(len(frames)-1):
            k1,d1=feats[i];k2,d2=feats[i+1];m=self._match(d1,d2)
            if len(m)<self.min_matches:
                poses.append(np.linalg.inv(Tcw).copy());skipped+=1;continue
            p1=np.float32([k1[x.queryIdx].pt for x in m]);p2=np.float32([k2[x.trainIdx].pt for x in m])
            E,_=cv2.findEssentialMat(p1,p2,K,method=cv2.RANSAC,prob=.999,threshold=1.2)
            if E is None:
                poses.append(np.linalg.inv(Tcw).copy());skipped+=1;continue
            _,R,t,pm=cv2.recoverPose(E,p1,p2,K)
            keep=pm.ravel()>0
            if keep.sum()<max(15,self.min_matches//3):
                poses.append(np.linalg.inv(Tcw).copy());skipped+=1;continue
            p1=p1[keep]; P2=K@np.hstack([R,t]); P1=K@np.hstack([np.eye(3),np.zeros((3,1))])
            X4=cv2.triangulatePoints(P1,P2,p1.T,np.float32([k2[x.trainIdx].pt for x,mk in zip(m,keep) if mk]).T)
            X=(X4[:3]/(X4[3:4]+1e-12)).T
            X2=(R@X.T+t).T
            ok=(X[:,2]>.05)&(X2[:,2]>.05)&np.isfinite(X).all(axis=1)
            X=X[ok]; pp=p1[ok]
            if len(X):
                Twc=np.linalg.inv(Tcw);Xw=(Twc[:3,:3]@X.T+Twc[:3,3:4]).T
                pix=np.rint(pp).astype(int);pix[:,0]=np.clip(pix[:,0],0,w-1);pix[:,1]=np.clip(pix[:,1],0,h-1)
                all_p.append(Xw.astype(np.float32));all_c.append(frames[i][pix[:,1],pix[:,0],::-1].astype(np.uint8));good+=1
                pair_scores.append(float(len(X)))
            Trel=np.eye(4);Trel[:3,:3]=R;Trel[:3,3]=t.ravel();Tcw=Trel@Tcw
            poses.append(np.linalg.inv(Tcw).copy())

        if all_p:
            pts=np.concatenate(all_p);cols=np.concatenate(all_c)
            med=np.median(pts,axis=0);r=np.linalg.norm(pts-med,axis=1);keep=r<=np.percentile(r,97)
            pts,cols=pts[keep],cols[keep]
            if len(pts)>self.max_points:
                idx=np.linspace(0,len(pts)-1,self.max_points).astype(int);pts,cols=pts[idx],cols[idx]
            pts,scale=percentile_scale(pts,self.world_extent)
        else:
            pts=np.empty((0,3),np.float32);cols=np.empty((0,3),np.uint8);scale=1.0

        coverage=float(good/max(1,len(frames)-1))
        density=float(min(1.0, len(pts)/28000.0))
        parallax=float(np.mean(pair_scores)/250.0) if pair_scores else 0.0
        score=100.0*(0.45*coverage + 0.40*density + 0.15*min(1.0, parallax))
        quality={"good_pairs":good,"skipped_pairs":skipped,"scene_points":int(len(pts)),"scale":float(scale),
                 "coverage":coverage,"density":density,"status":"ok" if len(pts)>500 else "low_parallax"}
        return SceneReconstruction(pts,cols,poses,quality,float(score))
