from __future__ import annotations

import os
import sys
import threading
from pathlib import Path
import requests

_SMALL_MODEL_URL = "https://huggingface.co/depth-anything/Depth-Anything-V2-Small/resolve/main/depth_anything_v2_vits.pth?download=true"
_MODEL_CONFIG = {"encoder": "vits", "features": 64, "out_channels": [48, 96, 192, 384]}


class DepthAnythingEngine:
    def __init__(self) -> None:
        def _resolve_depth_home() -> Path:
            v = os.environ.get("DEPTH_ANYTHING_HOME", "").strip()
            if v:
                p = Path(v).expanduser()
                if p.exists():
                    return p
            for cand in [Path("C:/Users/user/Desktop/3дгенерация/Depth-Anything-V2"), Path(os.environ.get("AI3D_EXTERNAL_ROOT", "").strip()).expanduser() / "Depth-Anything-V2" if os.environ.get("AI3D_EXTERNAL_ROOT", "").strip() else None]:
                if cand and cand.exists() and (cand / "depth_anything_v2" / "dpt.py").is_file():
                    return cand
            return Path(v).expanduser() if v else Path("C:/Users/user/Desktop/3дгенерация/Depth-Anything-V2")
        self.source = _resolve_depth_home()
        self.model_dir = Path(os.environ.get("AI3D_MODEL_DIR", "./runtime/models")).expanduser().resolve()
        self.checkpoint = Path(os.environ.get("DEPTH_ANYTHING_CHECKPOINT", self.model_dir / "depth_anything_v2_vits.pth"))
        self._model = None
        self._torch = None
        self._device = None
        self._lock = threading.Lock()

    def available(self) -> bool:
        return bool(self.source and (self.source / "depth_anything_v2" / "dpt.py").is_file())

    def _download_checkpoint(self) -> None:
        if self.checkpoint.is_file() and self.checkpoint.stat().st_size > 1_000_000:
            return
        self.checkpoint.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.checkpoint.with_suffix(self.checkpoint.suffix + ".part")
        with requests.get(_SMALL_MODEL_URL, stream=True, timeout=(20, 300)) as response:
            response.raise_for_status()
            with tmp.open("wb") as handle:
                for chunk in response.iter_content(1024 * 1024):
                    if chunk:
                        handle.write(chunk)
        tmp.replace(self.checkpoint)

    def _load(self) -> None:
        if self._model is not None:
            return
        if not self.available():
            raise RuntimeError("Depth-Anything-V2 source is not configured. Set DEPTH_ANYTHING_HOME.")
        self._download_checkpoint()
        source = str(self.source.resolve())
        if source not in sys.path:
            sys.path.insert(0, source)
        import torch
        from depth_anything_v2.dpt import DepthAnythingV2
        device = "cuda" if torch.cuda.is_available() else "mps" if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available() else "cpu"
        model = DepthAnythingV2(**_MODEL_CONFIG)
        try:
            state = torch.load(self.checkpoint, map_location="cpu", weights_only=True)
        except TypeError:
            state = torch.load(self.checkpoint, map_location="cpu")
        model.load_state_dict(state)
        self._model = model.to(device).eval()
        self._torch = torch
        self._device = device

    def run(self, image_path: Path, output_path: Path, input_size: int = 518) -> Path:
        with self._lock:
            self._load()
            import cv2
            import numpy as np
            from PIL import Image
            raw = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
            if raw is None:
                raise RuntimeError("Depth Anything could not decode the input image.")
            with self._torch.inference_mode():
                depth = self._model.infer_image(raw, max(256, min(int(input_size), 1024)))
            span = float(depth.max() - depth.min())
            if span <= 1e-8:
                norm = np.zeros(depth.shape, dtype=np.uint8)
            else:
                norm = ((depth - depth.min()) / span * 255.0).clip(0, 255).astype(np.uint8)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            Image.fromarray(norm, mode="L").save(output_path, format="PNG", optimize=True)
            return output_path
