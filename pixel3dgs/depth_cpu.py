from __future__ import annotations
from pathlib import Path
import cv2
import numpy as np


class NeuralDepthCPU:
    """Optional ONNX monocular depth prior. No GPU required.

    Drop a compatible MiDaS/Depth-Anything ONNX file into models/ and set model_path.
    If no model exists, callers transparently keep the geometric/multiview prior.
    """
    def __init__(self, model_path: Path | None):
        self.path = Path(model_path) if model_path else None
        self.net = None
        self.kind = None
        if self.path and self.path.exists():
            self.net = cv2.dnn.readNetFromONNX(str(self.path))
            self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
            self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
            name=self.path.name.lower()
            self.kind = "midas" if "midas" in name else "depth_anything"

    @property
    def available(self): return self.net is not None

    def predict_relative(self, rgb: np.ndarray) -> np.ndarray | None:
        if self.net is None: return None
        h,w,_=rgb.shape
        size=256 if self.kind=="midas" else 518
        im=cv2.resize(rgb,(size,size),interpolation=cv2.INTER_CUBIC).astype(np.float32)
        if self.kind=="midas":
            im=(im-0.5)/0.5
        else:
            mean=np.array([0.485,0.456,0.406],np.float32)
            std=np.array([0.229,0.224,0.225],np.float32)
            im=(im-mean)/std
        blob=np.transpose(im,(2,0,1))[None]
        self.net.setInput(blob)
        pred=self.net.forward()
        pred=np.squeeze(pred).astype(np.float32)
        pred=cv2.resize(pred,(w,h),interpolation=cv2.INTER_CUBIC)
        lo,hi=np.percentile(pred,[2,98])
        pred=np.clip((pred-lo)/max(hi-lo,1e-6),0,1)
        # Both common model families generally output larger values for nearer surfaces.
        return pred


def blend_relative_depth(metric_prior: np.ndarray, relative_near: np.ndarray | None, strength: float = 0.34) -> tuple[np.ndarray, dict]:
    if relative_near is None:
        return metric_prior, {"used":False}
    p=metric_prior.astype(np.float32)
    rel=relative_near.astype(np.float32)
    # Map relative inverse depth onto robust metric inverse-depth range from the current prior.
    inv=1.0/np.maximum(p,1e-3)
    lo,hi=np.percentile(inv,[5,95])
    inv_neural=lo + rel*(hi-lo)
    d_neural=1.0/np.maximum(inv_neural,1e-5)
    # Preserve exact floor/sky extremes by limiting neural deviation.
    d_neural=np.clip(d_neural,p*0.58,p*1.72)
    out=p*(1-strength)+d_neural*strength
    return out.astype(np.float32), {"used":True,"strength":strength,"relative_min":float(rel.min()),"relative_max":float(rel.max())}
