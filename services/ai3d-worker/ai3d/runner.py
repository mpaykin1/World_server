from __future__ import annotations

import json
import os
import time
import traceback
from pathlib import Path
from typing import Callable

from .validation import file_meta, validate_glb
from .plugins.depth_anything import DepthAnythingEngine
from .plugins.trellis2 import Trellis2Engine
from .plugins.blender_building import BuildingEngine
from .plugins.procgen_maps import ProcgenMapsEngine


class PipelineRunner:
    def __init__(self, runtime_dir: Path):
        self.runtime_dir = Path(runtime_dir)
        self.depth = DepthAnythingEngine()
        self.trellis = Trellis2Engine()
        self.building = BuildingEngine()
        self.procgen = ProcgenMapsEngine()

    def plugin_status(self) -> dict:
        return {
            "depth_anything_v2_small": {"available": self.depth.available(), "licenseMode": "Apache-2.0 model"},
            "trellis2": {"available": self.trellis.available(), "serverRequirement": "Linux + NVIDIA CUDA GPU, upstream specifies 24GB+ VRAM"},
            "building_generator": {"available": self.building.available(), "engine": "Blender headless"},
            "procgen_maps": {"available": self.procgen.available(), "engine": "Blender headless", "licenseMode": "external GPL-3.0 plugin"},
        }

    def run(self, job: dict, progress: Callable[[int, str], None]) -> dict:
        mode = job["mode"]
        params = job.get("params") or {}
        job_dir = self.runtime_dir / "jobs" / job["id"]
        job_dir.mkdir(parents=True, exist_ok=True)
        files: list[dict] = []
        started = time.time()
        input_path = Path(job["input_path"]) if job.get("input_path") else None

        if mode in {"auto", "image_to_3d", "depth"} and not input_path:
            raise RuntimeError("This mode requires an input image.")

        if mode in {"auto", "depth"} or (mode == "image_to_3d" and bool(params.get("depthPreview", True))):
            progress(8, "Depth Anything V2 Small: estimating depth")
            depth_path = self.depth.run(input_path, job_dir / "depth.png", int(params.get("depthInputSize", 518)))
            files.append(file_meta(depth_path, "depth"))
            if mode == "depth":
                progress(96, "Validating depth output")

        if mode in {"auto", "image_to_3d"}:
            progress(28, "TRELLIS.2: generating 3D geometry and PBR materials")
            glb_path = self.trellis.run(input_path, job_dir / "model.glb", params)
            progress(90, "Validating TRELLIS.2 GLB")
            validate_glb(glb_path)
            files.append(file_meta(glb_path, "model"))

        elif mode == "building":
            progress(12, "Blender: evaluating procedural building Geometry Nodes")
            glb_path = self.building.run(job_dir / "building.glb", params, job_dir / "building-blender.log")
            progress(90, "Validating building GLB")
            validate_glb(glb_path)
            files.append(file_meta(glb_path, "building"))
            log = job_dir / "building-blender.log"
            if log.is_file(): files.append(file_meta(log, "log"))

        elif mode == "map":
            progress(10, "Blender: generating procedural world")
            glb_path, stats_path = self.procgen.run(job_dir / "world.glb", params, job_dir / "procgen-blender.log")
            progress(90, "Validating generated world")
            validate_glb(glb_path)
            files.append(file_meta(glb_path, "world"))
            if stats_path: files.append(file_meta(stats_path, "stats"))
            log = job_dir / "procgen-blender.log"
            if log.is_file(): files.append(file_meta(log, "log"))

        elif mode not in {"auto", "image_to_3d", "depth"}:
            raise RuntimeError(f"Unsupported mode: {mode}")

        manifest_path = job_dir / "manifest.json"
        manifest = {
            "jobId": job["id"], "mode": mode, "durationSeconds": round(time.time() - started, 3),
            "files": files, "engines": self.plugin_status(),
        }
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(manifest_path, "manifest"))
        return {"files": files, "durationSeconds": manifest["durationSeconds"]}
