from __future__ import annotations

from pathlib import Path
import cv2
import numpy as np


class OptionalSemanticMaskCPU:
    """Generic single/multi-channel ONNX mask adapter running on CPU via OpenCV DNN."""
    def __init__(self, model_path: str | Path | None):
        self.net = None
        self.path = None
        if model_path and Path(model_path).exists():
            try:
                self.net = cv2.dnn.readNetFromONNX(str(model_path))
                self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
                self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
                self.path = str(model_path)
            except Exception:
                self.net = None

    @property
    def available(self) -> bool:
        return self.net is not None

    def unstable_mask(self, frame_rgb: np.ndarray) -> np.ndarray | None:
        if self.net is None:
            return None
        h, w = frame_rgb.shape[:2]
        inp = cv2.resize(np.clip(frame_rgb * 255, 0, 255).astype(np.uint8), (256, 256), interpolation=cv2.INTER_AREA)
        blob = cv2.dnn.blobFromImage(inp, 1 / 255.0, (256, 256), swapRB=False, crop=False)
        self.net.setInput(blob)
        out = np.asarray(self.net.forward())
        out = np.squeeze(out)
        if out.ndim == 3:
            if out.shape[0] <= 8:
                score = np.max(out[1:], axis=0) if out.shape[0] > 1 else out[0]
            else:
                score = np.max(out, axis=-1)
        elif out.ndim == 2:
            score = out
        else:
            return None
        score = score.astype(np.float32)
        score = cv2.resize(score, (w, h), interpolation=cv2.INTER_LINEAR)
        lo, hi = np.percentile(score, [15, 90])
        norm = np.clip((score - lo) / max(float(hi - lo), 1e-6), 0, 1)
        return (norm > 0.72).astype(np.uint8) * 255


def combine_dynamic_and_semantic(dynamic_masks: list[np.ndarray] | None, frames_rgb: list[np.ndarray], model_path: str | Path | None) -> tuple[list[np.ndarray] | None, dict]:
    sem = OptionalSemanticMaskCPU(model_path)
    if dynamic_masks is None and not sem.available:
        return None, {"used": False}
    if dynamic_masks is None:
        dynamic_masks = [np.zeros(f.shape[:2], np.uint8) for f in frames_rgb]
    out, ratios = [], []
    for f, d in zip(frames_rgb, dynamic_masks):
        m = d.copy()
        sm = sem.unstable_mask(f) if sem.available else None
        if sm is not None:
            m = cv2.bitwise_or(m, sm)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        out.append(m)
        ratios.append(float(np.mean(m > 0)))
    return out, {
        "used": True,
        "semantic_model_available": sem.available,
        "semantic_model": sem.path,
        "masked_ratio_mean": round(float(np.mean(ratios)) if ratios else 0.0, 4),
    }
