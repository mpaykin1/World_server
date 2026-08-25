from __future__ import annotations

import os
import shutil
import subprocess
import sys
import threading
from pathlib import Path


class InstantMeshEngine:
    """Real InstantMesh CLI bridge. Never reports a flat placeholder as successful 3D."""

    def __init__(self) -> None:
        def env_path(key: str) -> Path | None:
            value = os.environ.get(key, "").strip()
            if not value:
                return None
            p = Path(value).expanduser()
            return p if p.exists() else None

        candidates = [
            env_path("INSTANTMESH_HOME"),
            Path(os.environ["AI3D_EXTERNAL_ROOT"]).expanduser() / "InstantMesh"
            if os.environ.get("AI3D_EXTERNAL_ROOT", "").strip() else None,
            Path("C:/Users/user/Desktop/майн/InstantMesh"),
            Path("C:/Users/user/Desktop/3дгенерация/InstantMesh"),
        ]
        self.source = next((p for p in candidates if p and p.is_dir()), None)
        self._lock = threading.Lock()

    def available(self) -> bool:
        return bool(
            self.source
            and (self.source / "run.py").is_file()
            and (self.source / "configs" / "instant-mesh-large.yaml").is_file()
        )

    def runtime_available(self) -> bool:
        if not self.available():
            return False
        try:
            import torch
            return bool(torch.cuda.is_available())
        except Exception:
            return False

    def _convert_obj_to_glb(self, obj_path: Path, output_path: Path) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            import trimesh
            scene = trimesh.load(str(obj_path), force="scene", process=False)
            data = scene.export(file_type="glb")
            output_path.write_bytes(data)
            if output_path.stat().st_size < 1024:
                raise RuntimeError("Converted GLB is unexpectedly small")
            return output_path
        except Exception as trimesh_error:
            blender = os.environ.get("BLENDER_BIN", "").strip() or shutil.which("blender")
            if not blender:
                raise RuntimeError(
                    f"InstantMesh generated OBJ but GLB conversion failed and Blender is unavailable: {trimesh_error}"
                ) from trimesh_error
            script = (
                "import bpy,sys;"
                "bpy.ops.wm.read_factory_settings(use_empty=True);"
                f"bpy.ops.wm.obj_import(filepath={str(obj_path)!r});"
                f"bpy.ops.export_scene.gltf(filepath={str(output_path)!r},export_format='GLB')"
            )
            subprocess.run([blender, "--background", "--python-expr", script], check=True, timeout=300)
            if not output_path.is_file() or output_path.stat().st_size < 1024:
                raise RuntimeError("Blender did not produce a valid GLB")
            return output_path

    def run(self, image_path: Path, output_path: Path, params: dict) -> Path:
        with self._lock:
            if not self.available():
                raise RuntimeError("InstantMesh source is not configured. Set INSTANTMESH_HOME.")
            if not self.runtime_available():
                raise RuntimeError("InstantMesh requires a CUDA runtime for real inference; placeholder output is forbidden.")

            config_name = str(params.get("instantMeshConfig", "instant-mesh-large")).strip()
            if config_name not in {"instant-mesh-large", "instant-mesh-base", "instant-nerf-large", "instant-nerf-base"}:
                config_name = "instant-mesh-large"
            config = self.source / "configs" / f"{config_name}.yaml"
            if not config.is_file():
                raise RuntimeError(f"InstantMesh config missing: {config}")

            out_root = output_path.parent / "instantmesh-output"
            out_root.mkdir(parents=True, exist_ok=True)
            steps = max(10, min(int(params.get("diffusionSteps", 75)), 100))
            seed = int(params.get("seed", 42))
            cmd = [
                sys.executable,
                str(self.source / "run.py"),
                str(config),
                str(image_path),
                "--output_path", str(out_root),
                "--diffusion_steps", str(steps),
                "--seed", str(seed),
                "--export_texmap",
            ]
            if bool(params.get("noRembg", False)):
                cmd.append("--no_rembg")

            log_path = output_path.parent / "instantmesh.log"
            with log_path.open("w", encoding="utf-8", errors="replace") as log:
                subprocess.run(
                    cmd,
                    cwd=str(self.source),
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    check=True,
                    timeout=int(params.get("instantMeshTimeoutSeconds", 1800)),
                )

            expected = out_root / config_name / "meshes" / f"{image_path.stem}.obj"
            if not expected.is_file():
                candidates = sorted(out_root.rglob("*.obj"), key=lambda q: q.stat().st_mtime, reverse=True)
                if not candidates:
                    raise RuntimeError(f"InstantMesh finished without OBJ output. See {log_path}")
                expected = candidates[0]

            return self._convert_obj_to_glb(expected, output_path)
