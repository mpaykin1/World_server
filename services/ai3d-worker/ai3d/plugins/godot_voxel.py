from __future__ import annotations

import json
import os
import shutil
from pathlib import Path


class GodotVoxelBridge:
    def __init__(self) -> None:
        self.voxelsrv = Path(os.environ.get("VOXELSRV_HOME", "C:/Users/user/Desktop/майн/voxelsrv"))
        self.little = Path(os.environ.get("LITTLECUBES_HOME", "C:/Users/user/Desktop/майн/LittleCubes"))
        self.hytopia = Path(os.environ.get("HYT OPIA_HOME", "C:/Users/user/Desktop/майн/hytopia-source"))

    def godot_package_ready(self) -> bool:
        # Package = we can emit .tscn + json (always true, no runtime needed)
        return True

    def godot_runtime_available(self) -> bool:
        # Runtime = Godot binary actually installed and runnable
        godot_bin = os.environ.get("GODOT_BIN", "godot")
        if Path(godot_bin).is_file() and Path(godot_bin).exists():
            return True
        return shutil.which(godot_bin) is not None or shutil.which("godot4") is not None

    def godot_runtime_tested(self) -> bool:
        # Tested = we actually launched Godot headless and imported GLB (not done by default)
        # Honest default is False until a real test runs
        return False

    def available(self) -> bool:
        # Legacy alias — now split; keep for backward compat but mark as package ready
        return self.godot_package_ready()

    def emit_godot_stub(self, glb_path: Path, job_dir: Path, params: dict) -> Path | None:
        try:
            tscn = job_dir / "godot_import.tscn"
            glb_name = glb_path.name
            tscn_text = f"""[gd_scene format=3 uid="uid://ai3d_{job_dir.name[:8]}"]

[node name="AI3D_{glb_name.replace('.', '_')}" type="Node3D"]

[node name="{glb_name}" parent="." instance=ExtResource("1_{glb_name}")]

[ext_resource type="PackedScene" uid="uid://ai3d_glb" path="res://{glb_name}" id="1_{glb_name}"]
"""
            tscn.write_text(tscn_text, encoding="utf-8")
            voxel_manifest = job_dir / "godot_voxel.json"
            voxel_data = {
                "source": glb_name,
                "godotScene": tscn.name,
                "pipeline": "godot_voxel_factory_v3_6",
                "compatible": ["godot4_gltf", "voxelsrv", "littlecubes"],
                "origin": "AI3D worker post-process",
                "voxelSize": float(params.get("voxelSize", 0.5)),
                "world": params.get("world", "main"),
                "notes": "Import {0} into Godot 4.x via glTF; tscn stub auto-instances it.".format(glb_name),
                "voxelToolsDetected": {
                    "voxelsrv": (self.voxelsrv / "src").is_dir(),
                    "littlecubes": (self.little / "src").is_dir(),
                },
                "godotPackageReady": self.godot_package_ready(),
                "godotRuntimeAvailable": self.godot_runtime_available(),
                "godotRuntimeTested": self.godot_runtime_tested(),
            }
            voxel_manifest.write_text(json.dumps(voxel_data, ensure_ascii=False, indent=2), encoding="utf-8")
            return voxel_manifest
        except Exception:
            return None

    def plugin_status(self) -> dict:
        return {
            "godotPackageReady": self.godot_package_ready(),
            "godotRuntimeAvailable": self.godot_runtime_available(),
            "godotRuntimeTested": self.godot_runtime_tested(),
            "engine": "Godot glTF bridge + voxel manifest",
            "voxelTools": {
                "voxelsrv": (self.voxelsrv / "src").is_dir(),
                "littlecubes": (self.little / "src").is_dir(),
            },
            "notes": "Package ready does not mean runtime tested; .tscn creation is not proof of Godot import"
        }
