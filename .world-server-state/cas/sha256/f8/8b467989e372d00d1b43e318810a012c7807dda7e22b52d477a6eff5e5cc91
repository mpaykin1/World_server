from dataclasses import dataclass
import cv2
import numpy as np

MP = {
    "nose": 0, "l_shoulder": 11, "r_shoulder": 12, "l_elbow": 13, "r_elbow": 14,
    "l_wrist": 15, "r_wrist": 16, "l_hip": 23, "r_hip": 24, "l_knee": 25,
    "r_knee": 26, "l_ankle": 27, "r_ankle": 28
}

@dataclass
class PersonFrame:
    mask: np.ndarray
    landmarks: dict
    bbox: tuple | None
    confidence: float

class PersonTracker:
    def __init__(self, prefer_mediapipe=True, mask_dilate_px=10, temporal_alpha=0.68):
        self.mask_dilate_px = int(mask_dilate_px)
        self.temporal_alpha = float(temporal_alpha)
        self.pose = None
        if prefer_mediapipe:
            try:
                import mediapipe as mp
                self.pose = mp.solutions.pose.Pose(
                    static_image_mode=False,
                    model_complexity=1,
                    smooth_landmarks=True,
                    enable_segmentation=True,
                    min_detection_confidence=0.45,
                    min_tracking_confidence=0.45,
                )
            except Exception:
                self.pose = None
        if self.pose is None:
            self.hog = cv2.HOGDescriptor()
            self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
        else:
            self.hog = None

    def _dilate(self, mask):
        if self.mask_dilate_px <= 0:
            return mask
        k = self.mask_dilate_px * 2 + 1
        return cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k,k)))

    def _from_mediapipe(self, frame):
        res = self.pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        h,w = frame.shape[:2]
        if not res.pose_landmarks:
            return None
        lms={}
        for name,idx in MP.items():
            lm=res.pose_landmarks.landmark[idx]
            lms[name]=(float(lm.x*w),float(lm.y*h),float(lm.visibility))
        if getattr(res,"segmentation_mask",None) is not None:
            m=(res.segmentation_mask>0.35).astype(np.uint8)*255
        else:
            m=np.zeros((h,w),np.uint8)
        m=self._dilate(m)
        ys,xs=np.where(m>0)
        bbox=None if len(xs)==0 else (int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1))
        return PersonFrame(m,lms,bbox,float(np.mean([v[2] for v in lms.values()])))

    def _approx_landmarks(self, bbox):
        x,y,w,h=bbox
        def p(rx,ry): return (x+rx*w,y+ry*h,0.35)
        return {
            "nose":p(.50,.10),"l_shoulder":p(.36,.25),"r_shoulder":p(.64,.25),
            "l_elbow":p(.28,.43),"r_elbow":p(.72,.43),"l_wrist":p(.22,.61),"r_wrist":p(.78,.61),
            "l_hip":p(.42,.54),"r_hip":p(.58,.54),"l_knee":p(.42,.74),"r_knee":p(.58,.74),
            "l_ankle":p(.40,.96),"r_ankle":p(.60,.96)
        }

    def _from_hog(self, frame):
        h,w=frame.shape[:2]
        s=min(1.0,640.0/max(w,h))
        sm=cv2.resize(frame,None,fx=s,fy=s) if s<1 else frame
        rects,weights=self.hog.detectMultiScale(sm,winStride=(8,8),padding=(8,8),scale=1.05)
        if len(rects)==0:
            return PersonFrame(np.zeros((h,w),np.uint8),{},None,0.0)
        j=int(np.argmax(weights))
        x,y,bw,bh=rects[j]
        inv=1.0/s
        x,y,bw,bh=[int(v*inv) for v in (x,y,bw,bh)]
        x=max(0,x);y=max(0,y);bw=min(w-x,bw);bh=min(h-y,bh)
        m=np.zeros((h,w),np.uint8);m[y:y+bh,x:x+bw]=255
        m=self._dilate(m)
        return PersonFrame(m,self._approx_landmarks((x,y,bw,bh)),(x,y,x+bw,y+bh),float(weights[j]))

    def process(self, frames):
        raw=[]; prev_box=None; prev_lm={}; prev_mask=None; a=self.temporal_alpha
        for frame in frames:
            pf=self._from_mediapipe(frame) if self.pose is not None else self._from_hog(frame)
            if pf is None:
                pf=PersonFrame(np.zeros(frame.shape[:2],np.uint8),{},None,0.0)
            if pf.bbox is None and prev_box is not None:
                x0,y0,x1,y1=prev_box
                m=np.zeros(frame.shape[:2],np.uint8);m[y0:y1,x0:x1]=255
                pf=PersonFrame(self._dilate(m),prev_lm,prev_box,0.1)

            mask=pf.mask
            if prev_mask is not None:
                mask=np.clip(a*prev_mask+(1-a)*mask,0,255).astype(np.uint8)
                mask=(mask>64).astype(np.uint8)*255

            lms={}
            for k,v in (pf.landmarks or {}).items():
                if k in prev_lm:
                    px,py,pv=prev_lm[k]
                    lms[k]=(float(a*px+(1-a)*v[0]), float(a*py+(1-a)*v[1]), float(max(v[2],pv*0.85)))
                else:
                    lms[k]=v

            bbox=pf.bbox
            if bbox is None and prev_box is not None:
                bbox=prev_box
            elif bbox is not None and prev_box is not None:
                bbox=tuple(int(a*pb+(1-a)*b) for pb,b in zip(prev_box,bbox))

            out=PersonFrame(mask,lms,bbox,pf.confidence)
            raw.append(out)
            prev_box=bbox or prev_box
            prev_lm=lms or prev_lm
            prev_mask=mask
        return raw
