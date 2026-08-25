from __future__ import annotations
from pathlib import Path
import cv2
import numpy as np


class SuperPointONNX:
    """Optional CPU ONNX descriptor hook.

    The base system does not require model weights. If a SuperPoint ONNX model is
    supplied, this module can be extended without changing the pipeline API.
    Current production fallback is a SIFT+AKAZE+ORB ensemble.
    """
    def __init__(self, model_path: Path | None):
        self.path=Path(model_path) if model_path else None
        self.available=bool(self.path and self.path.exists())


def _match_detector(detector, norm, ga, gb, ratio=0.76):
    ka,da=detector.detectAndCompute(ga,None); kb,db=detector.detectAndCompute(gb,None)
    if da is None or db is None or len(ka)<4 or len(kb)<4: return [],ka or [],kb or []
    matcher=cv2.BFMatcher(norm)
    pairs=matcher.knnMatch(da,db,k=2)
    good=[m for m,n in pairs if m.distance < ratio*n.distance]
    return good,ka,kb


def ensemble_correspondences(ga: np.ndarray, gb: np.ndarray) -> tuple[list[tuple[float,float,float,float]], dict]:
    configs=[
        (cv2.SIFT_create(nfeatures=3500),cv2.NORM_L2,0.76,"SIFT"),
        (cv2.AKAZE_create(),cv2.NORM_HAMMING,0.78,"AKAZE"),
        (cv2.ORB_create(nfeatures=4000,fastThreshold=7),cv2.NORM_HAMMING,0.80,"ORB"),
    ]
    pts=[]; counts={}
    for det,norm,ratio,name in configs:
        good,ka,kb=_match_detector(det,norm,ga,gb,ratio)
        counts[name]=len(good)
        for m in good:
            x1,y1=ka[m.queryIdx].pt; x2,y2=kb[m.trainIdx].pt
            pts.append((x1,y1,x2,y2))
    # Deduplicate in source coordinate bins; keep ensemble recall without triple counting.
    dedup={}
    for q in pts:
        key=(round(q[0]/3),round(q[1]/3),round(q[2]/3),round(q[3]/3))
        dedup[key]=q
    return list(dedup.values()), counts
