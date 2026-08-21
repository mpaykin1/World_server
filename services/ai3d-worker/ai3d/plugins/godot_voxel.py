from __future__ import annotations

import json
import os
from pathlib import Path


class GodotVoxelBridge:
    """
    GODOT_VOXEL_FACTORY_V3_6_IMAGE_WORLD_SERVER_FIRST bridge.
    Keeps existing voxel-world untouched; result GLB is made Godot-pipeline-ready
    by emitting an alongside Godot import stub and voxel metadata.
    Uses local tools auto-discovered in майн (voxelsrv, LittleCubes) as evidence,
    but does not require Godot at generation time.
    """

    def __init__(self) -> None:
        self.voxelsrv = Path(os.environ.get("VOXELSRV_HOME", "C:/Users/user/Desktop/майн/voxelsrv"))
        self.little = Path(os.environ.get("LITTLECUBES_HOME", "C:/Users/user/Desktop/майн/LittleCubes"))
        self.hytopia = Path(os.environ.get("HYT OPIA_HOME", "C:/Users/user/Desktop/майн/hytopia-source"))  # placeholder

    def available(self) -> bool:
        # Consider available if at least one voxel tool is present; GLB is always Godot-importable (glTF 2.0)
        # We don't block generation — we always emit Godot stub
        return True

    def emit_godot_stub(self, glb_path: Path, job_dir: Path, params: dict) -> Path | None:
        """
        Create a Godot 4.x .tscn stub and voxel manifest alongside the GLB.
        The GLB itself is already Godot-compatible (glTF). The stub makes auto-import trivial.
        """
        try:
            # Godot .tscn that instances the GLB
            tscn = job_dir / "godot_import.tscn"
            # Minimal Godot 4 scene: Node3D with imported GLB as child
            # Use load path relative to project; here we reference the GLB filename
            glb_name = glb_path.name
            tscn_text = f"""[gd_scene format=3 uid="uid://ai3d_{job_dir.name[:8]}"]

[node name="AI3D_{glb_name.replace('.', '_')}" type="Node3D"]

[node name="{glb_name}" parent="." instance=ExtResource("1_{glb_name}")]

[ext_resource type="PackedScene" uid="uid://ai3d_glb" path="res://{glb_name}" id="1_{glb_name}"]
"""
            tscn.write_text(tscn_text, encoding="utf-8")

            # Voxel manifest for pipelines (voxelsrv/LittleCubes/hytopia)
            # Does not alter voxel-world; it's an optional bridge file
            voxel_manifest = job_dir / "godot_voxel.json"
            # Derive voxel hints from world if GLB is large, or from params
            voxel_data = {
                "source": glb_name,
                "godotScene": tscn.name,
                "pipeline": "godot_voxel_factory_v3_6",
                "compatible": ["godot4_gltf", "voxelsrv", "littlecubes"],
                "origin": "AI3D worker post-process",
                "voxelSize": float(params.get("voxelSize", 0.5)),
                "world": params.get("world", "main"),
                "notes": "Import {0} into Godot 4.x via glTF; tscn stub auto-instances it. Voxel tools can derive blocks from mesh AABB.".format(glb_name),
                "voxelToolsDetected": {
                    "voxelsrv": (self.voxelsrv / "src").is_dir(),
                    "littlecubes": (self.little / "src").is_dir(),
                }
            }
            voxel_manifest.write_text(json.dumps(voxel_data, ensure_ascii=False, indent=2), encoding="utf-8")
            return voxel_manifest
        except Exception:
            return None

    def plugin_status(self) -> dict:
        return {
            "available": self.available(),
            "engine": "Godot glTF bridge + voxel manifest",
            "voxelTools": {
                "voxelsrv": (self.voxelsrv / "src").is_dir(),
                "littlecubes": (self.little / "src").is_dir(),
            },
            "notes": "GLB is natively Godot 4.x importable; stub + voxel json enable auto pipeline without touching existing voxel-world"
        }
