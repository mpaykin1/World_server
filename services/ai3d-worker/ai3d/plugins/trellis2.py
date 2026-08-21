from __future__ import annotations

import os
import platform
import sys
import threading
from pathlib import Path


class Trellis2Engine:
    def __init__(self) -> None:
        def _resolve_trellis() -> Path:
            v = os.environ.get("TRELLIS2_HOME", "").strip()
            if v:
                p = Path(v).expanduser()
                if p.exists():
                    return p
            for cand in [Path("C:/Users/user/Desktop/3дгенерация/TRELLIS.2"), Path(os.environ.get("AI3D_EXTERNAL_ROOT", "").strip()).expanduser() / "TRELLIS.2" if os.environ.get("AI3D_EXTERNAL_ROOT", "").strip() else None]:
                if cand and cand.exists() and (cand / "trellis2").is_dir():
                    return cand
            return Path(v).expanduser() if v else Path("C:/Users/user/Desktop/3дгенерация/TRELLIS.2")
        self.source = _resolve_trellis()
        self.model_id = os.environ.get("TRELLIS2_MODEL", "microsoft/TRELLIS.2-4B")
        self._pipeline = None
        self._torch = None
        self._o_voxel = None
        self._lock = threading.Lock()

    def available(self) -> bool:
        return platform.system() == "Linux" and bool(self.source and (self.source / "trellis2").is_dir())

    def _load(self) -> None:
        if self._pipeline is not None:
            return
        if platform.system() != "Linux":
            raise RuntimeError("TRELLIS.2 upstream currently supports Linux only. Run this worker on a Linux NVIDIA GPU server.")
        if not self.available():
            raise RuntimeError("TRELLIS.2 source is not configured. Set TRELLIS2_HOME.")
        source = str(self.source.resolve())
        if source not in sys.path:
            sys.path.insert(0, source)
        os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "1")
        os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
        import torch
        if not torch.cuda.is_available():
            raise RuntimeError("TRELLIS.2 requires an NVIDIA CUDA GPU (24GB+ VRAM recommended/required by upstream).")
        from trellis2.pipelines import Trellis2ImageTo3DPipeline
        import o_voxel
        pipeline = Trellis2ImageTo3DPipeline.from_pretrained(self.model_id)
        pipeline.cuda()
        self._pipeline = pipeline
        self._torch = torch
        self._o_voxel = o_voxel

    def run(self, image_path: Path, output_path: Path, params: dict) -> Path:
        with self._lock:
            self._load()
            from PIL import Image
            decimation = max(50_000, min(int(params.get("decimationTarget", 500_000)), 1_000_000))
            texture_size = int(params.get("textureSize", 2048))
            if texture_size not in (1024, 2048, 4096):
                texture_size = 2048
            image = Image.open(image_path).convert("RGBA")
            with self._torch.inference_mode():
                mesh = self._pipeline.run(image)[0]
            mesh.simplify(16_777_216)
            glb = self._o_voxel.postprocess.to_glb(
                vertices=mesh.vertices,
                faces=mesh.faces,
                attr_volume=mesh.attrs,
                coords=mesh.coords,
                attr_layout=mesh.layout,
                voxel_size=mesh.voxel_size,
                aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
                decimation_target=decimation,
                texture_size=texture_size,
                remesh=True,
                remesh_band=1,
                remesh_project=0,
                verbose=False,
            )
            output_path.parent.mkdir(parents=True, exist_ok=True)
            glb.export(str(output_path), extension_webp=True)
            return output_path
