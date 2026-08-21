from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path


def _find_blender() -> str:
    # 1) explicit env
    env = os.environ.get("BLENDER_BIN", "").strip()
    if env:
        if any(c in env for c in "/\\"):
            if Path(env).is_file():
                return env
        elif shutil.which(env):
            return env
    # 2) PATH
    which = shutil.which("blender")
    if which:
        return which
    # 3) Windows standard Program Files
    import glob as _glob
    for pattern in [
        r"C:\Program Files\Blender Foundation\Blender*\blender.exe",
        r"C:\Program Files\Blender Foundation\*\blender.exe",
    ]:
        matches = _glob.glob(pattern)
        if matches:
            # Prefer highest version (sort descending)
            matches.sort(reverse=True)
            for m in matches:
                if Path(m).is_file():
                    return m
    # 4) fallback
    return "blender"


class BuildingEngine:
    def __init__(self) -> None:
        def _resolve_building() -> Path:
            v = os.environ.get("BUILDING_GENERATOR_HOME", "").strip()
            if v:
                p = Path(v).expanduser()
                if p.exists():
                    return p
            for cand in [Path("C:/Users/user/Desktop/3дгенерация/BuildingGeneratorThreeJS"), Path(os.environ.get("AI3D_EXTERNAL_ROOT", "").strip()).expanduser() / "BuildingGeneratorThreeJS" if os.environ.get("AI3D_EXTERNAL_ROOT", "").strip() else None]:
                if cand and cand.exists() and (cand / "procedural-hong-kong-building" / "source" / "procedural_building.blend").is_file():
                    return cand
            return Path(v).expanduser() if v else Path("C:/Users/user/Desktop/3дгенерация/BuildingGeneratorThreeJS")
        self.source = _resolve_building()
        self.blender = _find_blender()
        self.timeout = int(os.environ.get("AI3D_BLENDER_TIMEOUT_SECONDS", "600"))

    def available(self) -> bool:
        blender_ok = Path(self.blender).is_file() if any(c in self.blender for c in "/\\") else shutil.which(self.blender) is not None
        blend = self.source / "procedural-hong-kong-building" / "source" / "procedural_building.blend"
        return bool(blender_ok and blend.is_file())

    def run(self, output_path: Path, params: dict, log_path: Path) -> Path:
        if not self.available():
            raise RuntimeError("BuildingGeneratorThreeJS or Blender 4.2+ is not configured.")
        service_root = Path(__file__).resolve().parents[2]
        tool = service_root / "tools" / "run_building_blender.py"
        blend = self.source / "procedural-hong-kong-building" / "source" / "procedural_building.blend"
        params_path = output_path.parent / "building-params.json"
        params_path.write_text(json.dumps(params, ensure_ascii=False), encoding="utf-8")
        cmd = [self.blender, "--background", str(blend), "--python", str(tool), "--", "--out", str(output_path), "--params", str(params_path)]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=self.timeout, check=False)
        log_path.write_text(proc.stdout or "", encoding="utf-8", errors="replace")
        if proc.returncode != 0:
            raise RuntimeError(f"Blender building generation failed with exit code {proc.returncode}. See {log_path.name}.")
        return output_path
