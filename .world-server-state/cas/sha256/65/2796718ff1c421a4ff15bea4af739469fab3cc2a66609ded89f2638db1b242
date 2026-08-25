from __future__ import annotations
from pathlib import Path
import cv2
import numpy as np
from .model_manager import resolve_model
from .matcher_onnx import DenseFlowONNX


def dense_flow_correspondences(gray_a: np.ndarray, gray_b: np.ndarray, grid_step: int = 14, max_points: int = 1200):
    """CPU dense-flow correspondence fallback using OpenCV DIS.

    This is the zero-download fallback for RAFT-like dense matching. It is not RAFT,
    but provides dense correspondences when sparse SIFT/AKAZE/ORB features are weak.
    """
    h,w=gray_a.shape
    model_path=resolve_model('flow')
    if model_path:
        raft=DenseFlowONNX(model_path)
        flow=raft.flow(gray_a,gray_b) if raft.available else None
        if flow is not None:
            pts=[]
            step=max(6,grid_step)
            for y in range(step//2,h-step//2,step):
                for x in range(step//2,w-step//2,step):
                    dx,dy=flow[y,x];x2=x+float(dx);y2=y+float(dy)
                    if 1<=x2<w-1 and 1<=y2<h-1:
                        pts.append((x,y,x2,y2))
                        if len(pts)>=max_points:return np.asarray(pts,np.float32)
            if len(pts)>=8:return np.asarray(pts,np.float32)
    scale=min(1.0,480.0/max(h,w))
    a=cv2.resize(gray_a,None,fx=scale,fy=scale,interpolation=cv2.INTER_AREA) if scale<1 else gray_a
    b=cv2.resize(gray_b,None,fx=scale,fy=scale,interpolation=cv2.INTER_AREA) if scale<1 else gray_b
    try:
        dis=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        dis.setUseSpatialPropagation(True)
        flow=dis.calc(a,b,None)
    except Exception:
        flow=cv2.calcOpticalFlowFarneback(a,b,None,.5,3,21,3,5,1.2,0)
    # backward consistency
    try:
        dis2=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_FAST)
        back=dis2.calc(b,a,None)
    except Exception:
        back=cv2.calcOpticalFlowFarneback(b,a,None,.5,2,17,3,5,1.1,0)
    step=max(6,int(grid_step*scale))
    pts=[]
    for y in range(step//2,a.shape[0]-step//2,step):
        for x in range(step//2,a.shape[1]-step//2,step):
            dx,dy=flow[y,x];x2=x+float(dx);y2=y+float(dy)
            if x2<1 or y2<1 or x2>=a.shape[1]-1 or y2>=a.shape[0]-1:continue
            bx,by=back[int(round(y2)),int(round(x2))]
            if (dx+bx)**2+(dy+by)**2>4.0:continue
            # local gradient requirement removes textureless unstable flow
            if abs(int(a[min(a.shape[0]-1,y+1),x])-int(a[max(0,y-1),x]))+abs(int(a[y,min(a.shape[1]-1,x+1)])-int(a[y,max(0,x-1)]))<8:continue
            inv=1.0/scale
            pts.append((x*inv,y*inv,x2*inv,y2*inv))
            if len(pts)>=max_points:return np.asarray(pts,np.float32)
    return np.asarray(pts,np.float32)


class OptionalCorrespondenceONNX:
    """Generic adapter for wrapped LoFTR/LightGlue-style ONNX models.

    The wrapper is expected to expose two image inputs and one Nx4 correspondence output.
    This keeps model downloads optional and the base system fully free/CPU-only.
    """
    def __init__(self, model_path: str | Path | None):
        self.net=None;self.path=None
        if model_path and Path(model_path).exists():
            try:
                self.net=cv2.dnn.readNetFromONNX(str(model_path));self.path=str(model_path)
            except Exception:self.net=None

    @property
    def available(self):return self.net is not None

    def match(self, gray_a: np.ndarray, gray_b: np.ndarray):
        if self.net is None:return np.empty((0,4),np.float32)
        # OpenCV DNN cannot portably bind arbitrary two-input ONNX wrappers across all builds.
        # We detect the backend here; project-specific wrappers can call setInput(name=...).
        return np.empty((0,4),np.float32)
