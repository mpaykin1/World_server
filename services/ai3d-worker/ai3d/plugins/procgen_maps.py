from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path


def _find_blender() -> str:
    env = os.environ.get("BLENDER_BIN", "").strip()
    if env:
        if any(c in env for c in "/\\"):
            if Path(env).is_file():
                return env
        elif shutil.which(env):
            return env
    which = shutil.which("blender")
    if which:
        return which
    import glob as _glob
    for pattern in [
        r"C:\Program Files\Blender Foundation\Blender*\blender.exe",
        r"C:\Program Files\Blender Foundation\*\blender.exe",
    ]:
        matches = _glob.glob(pattern)
        if matches:
            matches.sort(reverse=True)
            for m in matches:
                if Path(m).is_file():
                    return m
    return "blender"


class ProcgenMapsEngine:
    def __init__(self) -> None:
        def _resolve_procgen() -> Path:
            v = os.environ.get("PROCGEN_MAPS_HOME", "").strip()
            if v:
                p = Path(v).expanduser()
                if p.exists():
                    return p
            for cand in [Path("C:/Users/user/Desktop/3дгенерация/bene-proggen-maps"), Path(os.environ.get("AI3D_EXTERNAL_ROOT", "").strip()).expanduser() / "bene-proggen-maps" if os.environ.get("AI3D_EXTERNAL_ROOT", "").strip() else None]:
                if cand and cand.exists() and (cand / "procgen_maps" / "__init__.py").is_file():
                    return cand
            return Path(v).expanduser() if v else Path("C:/Users/user/Desktop/3дгенерация/bene-proggen-maps")
        self.source = _resolve_procgen()
        self.blender = _find_blender()
        self.timeout = int(os.environ.get("AI3D_BLENDER_TIMEOUT_SECONDS", "1200"))

    def available(self) -> bool:
        blender_ok = Path(self.blender).is_file() if any(c in self.blender for c in "/\\") else shutil.which(self.blender) is not None
        return bool(blender_ok and (self.source / "procgen_maps" / "__init__.py").is_file())

    def run(self, output_path: Path, params: dict, log_path: Path) -> tuple[Path, Path | None]:
        if not self.available():
            raise RuntimeError("bene-proggen-maps or Blender 4.2+ is not configured.")
        service_root = Path(__file__).resolve().parents[2]
        tool = service_root / "tools" / "run_procgen_blender.py"
        params_path = output_path.parent / "map-params.json"
        params_path.write_text(json.dumps(params, ensure_ascii=False), encoding="utf-8")
        cmd = [self.blender, "--background", "--factory-startup", "--python", str(tool), "--", "--source", str(self.source), "--out", str(output_path), "--params", str(params_path)]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=self.timeout, check=False)
        log_path.write_text(proc.stdout or "", encoding="utf-8", errors="replace")
        if proc.returncode != 0:
            raise RuntimeError(f"Blender map generation failed with exit code {proc.returncode}. See {log_path.name}.")
        stats = output_path.with_suffix(".json")
        return output_path, stats if stats.is_file() else None
