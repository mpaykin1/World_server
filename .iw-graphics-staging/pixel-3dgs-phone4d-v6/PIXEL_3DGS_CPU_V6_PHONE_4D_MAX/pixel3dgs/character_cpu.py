from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import math
import cv2
import numpy as np
import trimesh


@dataclass
class CharacterConfig:
    target_height_m: float = 1.75
    camera_radius_m: float = 2.8
    orbit_degrees: float = 360.0
    segmentation_model_path: str | None = None
    background_margin: float = 0.10


class OptionalPersonSegmenter:
    """Optional generic ONNX person segmentation adapter.

    Expected model input is NCHW float RGB. Output may be 1x1xHxW or 1xCxHxW.
    For multi-class outputs the highest non-background class probability is used.
    The pipeline falls back to HOG + GrabCut when no model is present.
    """
    def __init__(self, model_path: Path | None):
        self.net = None
        self.path = None
        if model_path and Path(model_path).exists():
            try:
                self.net = cv2.dnn.readNetFromONNX(str(model_path))
                self.path = str(model_path)
            except Exception:
                self.net = None

    @property
    def available(self) -> bool:
        return self.net is not None

    def predict(self, frame_bgr: np.ndarray) -> np.ndarray | None:
        if self.net is None:
            return None
        h, w = frame_bgr.shape[:2]
        inp = cv2.resize(frame_bgr, (256, 256), interpolation=cv2.INTER_AREA)
        blob = cv2.dnn.blobFromImage(inp, 1/255.0, (256,256), swapRB=True, crop=False)
        self.net.setInput(blob)
        out = self.net.forward()
        out = np.asarray(out)
        if out.ndim == 4:
            out = out[0]
        if out.ndim == 3:
            if out.shape[0] == 1:
                score = out[0]
            else:
                # background is assumed channel 0 when present
                score = np.max(out[1:], axis=0) if out.shape[0] > 1 else out[0]
        elif out.ndim == 2:
            score = out
        else:
            return None
        score = cv2.resize(score.astype(np.float32), (w,h), interpolation=cv2.INTER_LINEAR)
        mn, mx = float(score.min()), float(score.max())
        if mx > mn:
            score = (score-mn)/(mx-mn)
        return (score > 0.48).astype(np.uint8) * 255


def _largest_person_box(frame: np.ndarray) -> tuple[int,int,int,int] | None:
    """Adaptive CPU-safe subject box from central GrabCut foreground."""
    h,w=frame.shape[:2]
    scale=min(1.0,360.0/max(h,w))
    small=cv2.resize(frame,None,fx=scale,fy=scale,interpolation=cv2.INTER_AREA) if scale<1 else frame
    sh,sw=small.shape[:2]
    x,y=int(sw*.14),int(sh*.025);bw,bh=int(sw*.72),int(sh*.95)
    mask=np.zeros((sh,sw),np.uint8);bg=np.zeros((1,65),np.float64);fg=np.zeros((1,65),np.float64)
    try:
        cv2.grabCut(small,mask,(x,y,bw,bh),bg,fg,2,cv2.GC_INIT_WITH_RECT)
    except cv2.error:
        return None
    m=((mask==cv2.GC_FGD)|(mask==cv2.GC_PR_FGD)).astype(np.uint8)
    n,labels,stats,_=cv2.connectedComponentsWithStats(m,8)
    if n<=1:return None
    ii=1+int(np.argmax(stats[1:,cv2.CC_STAT_AREA]));bx,by,bww,bhh,area=stats[ii]
    if area<sh*sw*.035:return None
    return (int(bx/scale),int(by/scale),int(bww/scale),int(bhh/scale))


def _fallback_box(frame: np.ndarray, margin: float) -> tuple[int,int,int,int]:
    h,w=frame.shape[:2]
    # turntable/person videos normally keep the subject near center
    bw=int(w*(0.64+margin)); bh=int(h*(0.90+margin*0.5))
    bw=min(w-2,bw); bh=min(h-2,bh)
    return ((w-bw)//2,max(1,(h-bh)//2),bw,bh)


def segment_character_frames(frames: list[np.ndarray], cfg: CharacterConfig) -> tuple[list[np.ndarray], dict]:
    model_path=Path(cfg.segmentation_model_path) if cfg.segmentation_model_path else None
    seg=OptionalPersonSegmenter(model_path)
    masks=[];boxes=[];areas=[];hog_hits=0
    prev_box=None
    for frame in frames:
        mask=seg.predict(frame)
        box=None
        if mask is None:
            box=_largest_person_box(frame)
            if box is not None: hog_hits+=1
            if box is None: box=prev_box or _fallback_box(frame,cfg.background_margin)
            x,y,w,h=box
            # expand modestly to preserve hands/hair/feet
            ex=int(w*0.08); ey=int(h*0.04)
            x=max(1,x-ex); y=max(1,y-ey); w=min(frame.shape[1]-x-1,w+2*ex); h=min(frame.shape[0]-y-1,h+2*ey)
            gc=np.zeros(frame.shape[:2],np.uint8)
            bg=np.zeros((1,65),np.float64);fg=np.zeros((1,65),np.float64)
            try:
                cv2.grabCut(frame,gc,(x,y,w,h),bg,fg,3,cv2.GC_INIT_WITH_RECT)
                mask=np.where((gc==cv2.GC_FGD)|(gc==cv2.GC_PR_FGD),255,0).astype(np.uint8)
            except cv2.error:
                mask=np.zeros(frame.shape[:2],np.uint8);mask[y:y+h,x:x+w]=255
        # cleanup and keep largest connected component
        k=np.ones((5,5),np.uint8)
        mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,k,iterations=2)
        mask=cv2.morphologyEx(mask,cv2.MORPH_OPEN,np.ones((3,3),np.uint8),iterations=1)
        n,labels,stats,_=cv2.connectedComponentsWithStats((mask>0).astype(np.uint8),8)
        if n>1:
            ii=1+int(np.argmax(stats[1:,cv2.CC_STAT_AREA]));mask=np.where(labels==ii,255,0).astype(np.uint8)
            x,y,w,h,area=stats[ii]
            box=(int(x),int(y),int(w),int(h));prev_box=box
        elif box is None:
            box=_fallback_box(frame,cfg.background_margin)
        masks.append(mask)
        boxes.append(box)
        areas.append(float(np.mean(mask>0)))
    report={
        'onnx_segmentation_available':seg.available,
        'onnx_segmentation_model':seg.path,
        'adaptive_bbox_ratio':round(hog_hits/max(1,len(frames)),4),
        'foreground_area_mean':round(float(np.mean(areas)),4),
        'foreground_area_min':round(float(np.min(areas)),4),
        'foreground_area_max':round(float(np.max(areas)),4),
        'boxes':[list(map(int,b)) for b in boxes],
    }
    return masks,report


def character_orbit_cameras(count: int, cfg: CharacterConfig) -> list[dict]:
    target=np.array([0.0,cfg.target_height_m*0.52,0.0],np.float32)
    cams=[]
    span=math.radians(cfg.orbit_degrees)
    for i in range(count):
        angle=(-0.5*span + span*i/max(1,count-1)) if cfg.orbit_degrees < 359 else (2*math.pi*i/max(1,count))
        C=np.array([math.sin(angle)*cfg.camera_radius_m,target[1],math.cos(angle)*cfg.camera_radius_m],np.float32)
        forward=target-C;forward/=max(float(np.linalg.norm(forward)),1e-7)
        up0=np.array([0,1,0],np.float32)
        right=np.cross(forward,up0);right/=max(float(np.linalg.norm(right)),1e-7)
        up=np.cross(right,forward);up/=max(float(np.linalg.norm(up)),1e-7)
        R=np.stack([right,up,forward],axis=1).astype(np.float32)
        cams.append({'C':C,'R':R,'angle_rad':float(angle),'source':'character_orbit'})
    return cams


def export_character_collision(scene: dict, output_path: Path, target_height_m: float) -> dict:
    p=scene['points']
    if len(p)==0:
        return {'ok':False,'reason':'no_points'}
    mn=np.percentile(p,2,axis=0);mx=np.percentile(p,98,axis=0)
    width=float(max(mx[0]-mn[0],mx[2]-mn[2]));height=float(mx[1]-mn[1])
    radius=max(0.12,min(width*0.32,target_height_m*0.22))
    body_height=max(radius*2,target_height_m-radius*2)
    mesh=trimesh.creation.capsule(height=body_height,radius=radius,count=[12,12])
    # trimesh capsule runs along z; rotate to y
    T=trimesh.transformations.rotation_matrix(math.pi/2,[1,0,0])
    mesh.apply_transform(T)
    center=np.array([(mn[0]+mx[0])/2, max(radius,target_height_m/2), (mn[2]+mx[2])/2])
    mesh.apply_translation(center)
    mesh.export(output_path)
    return {'ok':True,'radius_m':round(radius,4),'height_m':round(target_height_m,4),'center':center.tolist()}
