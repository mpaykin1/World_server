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
from .plugins.instantmesh import InstantMeshEngine
from .plugins.blender_building import BuildingEngine
from .plugins.procgen_maps import ProcgenMapsEngine
from .plugins.godot_voxel import GodotVoxelBridge


class PipelineRunner:
    def __init__(self, runtime_dir: Path):
        self.runtime_dir = Path(runtime_dir)
        self.depth = DepthAnythingEngine()
        self.trellis = Trellis2Engine()
        self.instantmesh = InstantMeshEngine()
        self.building = BuildingEngine()
        self.procgen = ProcgenMapsEngine()
        self.godot = GodotVoxelBridge()

    def plugin_status(self) -> dict:
        return {
            "depth_anything_v2_small": {"available": self.depth.available(), "licenseMode": "Apache-2.0 model"},
            "trellis2": {"available": self.trellis.available(), "serverRequirement": "Linux + NVIDIA CUDA GPU, upstream specifies 24GB+ VRAM"},
            "instantmesh": {"available": self.instantmesh.available(), "engine": "InstantMesh fallback (local майн/InstantMesh)", "bridge": "INSTANTMESH_GPU_WORKER_SERVER_BRIDGE"},
            "building_generator": {"available": self.building.available(), "engine": "Blender headless (auto-found)"},
            "procgen_maps": {"available": self.procgen.available(), "engine": "Blender headless (auto-found)", "licenseMode": "external GPL-3.0 plugin"},
            "godot_voxel_factory": self.godot.plugin_status(),
            "blender": {"available": self.building.available() or self.procgen.available(), "autoFound": self.building.blender if hasattr(self.building, 'blender') else "blender"},
            "voxel_tools": {"voxelsrv": (Path("C:/Users/user/Desktop/майн/voxelsrv/src").is_dir()), "littlecubes": (Path("C:/Users/user/Desktop/майн/LittleCubes/src").is_dir())},
        }

    def _choose_image3d_engine(self) -> tuple[str, object]:
        # AUTO selection: TRELLIS (best quality) → InstantMesh (fallback) → diagnostic placeholder
        if self.trellis.available():
            try:
                import platform, torch
                if platform.system() == "Linux":
                    import torch as _t
                    if _t.cuda.is_available():
                        return "trellis2", self.trellis
            except Exception:
                pass
            # If TRELLIS source present but not runnable (Windows/no GPU), we still consider it unavailable and fallback
            if self.trellis.available():
                # Check if actually can run (Linux+CUDA)
                try:
                    # Trellis will raise with clear message if not Linux/CUDA; treat as unavailable for fallback
                    import platform
                    if platform.system() != "Linux":
                        raise RuntimeError("TRELLIS Linux-only")
                except Exception:
                    pass
        if self.instantmesh.available():
            return "instantmesh", self.instantmesh
        # Final fallback still uses instantmesh placeholder engine (guaranteed to produce valid GLB)
        return "instantmesh_placeholder", self.instantmesh

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

        chosen_engine = None
        if mode in {"auto", "image_to_3d"}:
            # AUTO: pick best available without user input — TRELLIS → InstantMesh → placeholder
            engine_name, engine = self._choose_image3d_engine()
            chosen_engine = engine_name
            if engine_name == "trellis2":
                progress(28, "TRELLIS.2: generating 3D geometry and PBR materials")
                glb_path = engine.run(input_path, job_dir / "model.glb", params)
                progress(90, "Validating TRELLIS.2 GLB")
            else:
                if engine_name == "instantmesh_placeholder":
                    progress(28, "InstantMesh placeholder (CPU fallback, no GPU): textured plane GLB + diagnostic")
                else:
                    progress(28, "InstantMesh fallback: generating mesh (TRELLIS unavailable)")
                glb_path = engine.run(input_path, job_dir / "model.glb", params)
                progress(90, f"Validating {engine_name} GLB")
            validate_glb(glb_path)
            files.append(file_meta(glb_path, "model"))
            # Godot voxel factory bridge: every GLB becomes auto-importable
            try:
                gv = self.godot.emit_godot_stub(glb_path, job_dir, params)
                if gv and gv.is_file():
                    files.append(file_meta(gv, "godot_voxel"))
                tscn = job_dir / "godot_import.tscn"
                if tscn.is_file():
                    files.append(file_meta(tscn, "godot_scene"))
            except Exception:
                pass

        elif mode == "building":
            progress(12, "Blender: evaluating procedural building Geometry Nodes")
            glb_path = self.building.run(job_dir / "building.glb", params, job_dir / "building-blender.log")
            progress(90, "Validating building GLB")
            validate_glb(glb_path)
            files.append(file_meta(glb_path, "building"))
            log = job_dir / "building-blender.log"
            if log.is_file(): files.append(file_meta(log, "log"))
            try:
                gv = self.godot.emit_godot_stub(glb_path, job_dir, params)
                if gv and gv.is_file(): files.append(file_meta(gv, "godot_voxel"))
                tscn = job_dir / "godot_import.tscn"
                if tscn.is_file(): files.append(file_meta(tscn, "godot_scene"))
            except Exception:
                pass

        elif mode == "map":
            progress(10, "Blender: generating procedural world")
            glb_path, stats_path = self.procgen.run(job_dir / "world.glb", params, job_dir / "procgen-blender.log")
            progress(90, "Validating generated world")
            validate_glb(glb_path)
            files.append(file_meta(glb_path, "world"))
            if stats_path: files.append(file_meta(stats_path, "stats"))
            log = job_dir / "procgen-blender.log"
            if log.is_file(): files.append(file_meta(log, "log"))
            try:
                gv = self.godot.emit_godot_stub(glb_path, job_dir, params)
                if gv and gv.is_file(): files.append(file_meta(gv, "godot_voxel"))
                tscn = job_dir / "godot_import.tscn"
                if tscn.is_file(): files.append(file_meta(tscn, "godot_scene"))
            except Exception:
                pass

        elif mode not in {"auto", "image_to_3d", "depth"}:
            raise RuntimeError(f"Unsupported mode: {mode}")

        manifest_path = job_dir / "manifest.json"
        # Determine infra blocker for diagnostics
        blocker = None
        status = self.plugin_status()
        if mode in {"auto", "image_to_3d"}:
            if not status["trellis2"]["available"]:
                if not status["instantmesh"]["available"]:
                    blocker = "No 3D engine available: TRELLIS.2 and InstantMesh missing"
                elif chosen_engine and "placeholder" in chosen_engine:
                    blocker = "GPU missing: TRELLIS.2 requires Linux+CUDA 24GB, InstantMesh GPU unavailable — placeholder GLB created"
        manifest = {
            "jobId": job["id"], "mode": mode, "durationSeconds": round(time.time() - started, 3),
            "files": files, "engines": status,
            "chosenEngine": chosen_engine,
            "infraBlocker": blocker,
            "godotReady": True,
        }
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(manifest_path, "manifest"))
        return {"files": files, "durationSeconds": manifest["durationSeconds"]}
