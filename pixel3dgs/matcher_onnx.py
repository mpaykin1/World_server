from __future__ import annotations

from pathlib import Path
import numpy as np
import cv2


class PairMatcherONNX:
    """Best-effort CPU ONNX two-image matcher adapter.

    Supports wrappers exposing two image tensors and an Nx4 correspondence output.
    If the graph is incompatible, callers transparently fall back to SIFT/AKAZE/ORB/DIS.
    """
    def __init__(self, model_path: str | Path | None):
        self.session = None
        self.path = None
        if not model_path or not Path(model_path).exists():
            return
        try:
            import onnxruntime as ort
            self.session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
            self.path = str(model_path)
        except Exception:
            self.session = None

    @property
    def available(self) -> bool:
        return self.session is not None

    @staticmethod
    def _tensor(gray: np.ndarray, h: int, w: int) -> np.ndarray:
        im = cv2.resize(gray, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
        return im[None, None]

    def match(self, gray_a: np.ndarray, gray_b: np.ndarray) -> np.ndarray:
        if self.session is None:
            return np.empty((0, 4), np.float32)
        ins = self.session.get_inputs()
        if len(ins) < 2:
            return np.empty((0, 4), np.float32)
        def shape_hw(inp):
            sh = inp.shape
            h = sh[-2] if isinstance(sh[-2], int) and sh[-2] > 0 else 480
            w = sh[-1] if isinstance(sh[-1], int) and sh[-1] > 0 else 640
            return int(h), int(w)
        h0, w0 = shape_hw(ins[0]); h1, w1 = shape_hw(ins[1])
        feeds = {ins[0].name: self._tensor(gray_a, h0, w0), ins[1].name: self._tensor(gray_b, h1, w1)}
        try:
            outs = self.session.run(None, feeds)
        except Exception:
            return np.empty((0, 4), np.float32)
        candidate = None
        for out in outs:
            a = np.asarray(out)
            if a.ndim == 2 and a.shape[1] >= 4 and a.shape[0] >= 4:
                candidate = a[:, :4].astype(np.float32)
                break
            if a.ndim == 3 and a.shape[-1] >= 4:
                candidate = a.reshape(-1, a.shape[-1])[:, :4].astype(np.float32)
                break
        if candidate is None:
            return np.empty((0, 4), np.float32)
        # If coordinates are normalized, convert to source pixel coordinates.
        if np.nanmax(np.abs(candidate)) <= 2.5:
            candidate[:, 0] *= gray_a.shape[1]; candidate[:, 1] *= gray_a.shape[0]
            candidate[:, 2] *= gray_b.shape[1]; candidate[:, 3] *= gray_b.shape[0]
        return candidate[np.all(np.isfinite(candidate), axis=1)]


class DenseFlowONNX:
    """Best-effort RAFT-like CPU ONNX adapter for two RGB/gray inputs and dense 2-channel flow output."""
    def __init__(self, model_path: str | Path | None):
        self.session = None
        self.path = None
        if not model_path or not Path(model_path).exists():
            return
        try:
            import onnxruntime as ort
            self.session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
            self.path = str(model_path)
        except Exception:
            self.session = None

    @property
    def available(self) -> bool:
        return self.session is not None

    @staticmethod
    def _prep(gray: np.ndarray, h: int, w: int) -> np.ndarray:
        im = cv2.resize(gray, (w, h), interpolation=cv2.INTER_AREA)
        rgb = np.repeat(im[..., None], 3, axis=2).astype(np.float32) / 255.0
        return np.transpose(rgb, (2, 0, 1))[None]

    def flow(self, gray_a: np.ndarray, gray_b: np.ndarray) -> np.ndarray | None:
        if self.session is None:
            return None
        ins = self.session.get_inputs()
        if len(ins) < 2:
            return None
        sh = ins[0].shape
        h = sh[-2] if isinstance(sh[-2], int) and sh[-2] > 0 else min(384, gray_a.shape[0])
        w = sh[-1] if isinstance(sh[-1], int) and sh[-1] > 0 else min(640, gray_a.shape[1])
        # RAFT-style nets often prefer multiples of 8.
        h = max(32, int(h) // 8 * 8); w = max(32, int(w) // 8 * 8)
        feeds = {ins[0].name: self._prep(gray_a, h, w), ins[1].name: self._prep(gray_b, h, w)}
        try:
            outs = self.session.run(None, feeds)
        except Exception:
            return None
        cand = None
        for out in reversed(outs):
            a = np.asarray(out)
            if a.ndim == 4 and a.shape[1] == 2:
                cand = np.transpose(a[0], (1, 2, 0)).astype(np.float32); break
            if a.ndim == 4 and a.shape[-1] == 2:
                cand = a[0].astype(np.float32); break
            if a.ndim == 3 and a.shape[-1] == 2:
                cand = a.astype(np.float32); break
        if cand is None:
            return None
        oh, ow = gray_a.shape
        sx, sy = ow / cand.shape[1], oh / cand.shape[0]
        flow = cv2.resize(cand, (ow, oh), interpolation=cv2.INTER_LINEAR)
        flow[..., 0] *= sx; flow[..., 1] *= sy
        return flow
