from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path


class ProcgenMapsEngine:
    def __init__(self) -> None:
        self.source = Path(os.environ.get("PROCGEN_MAPS_HOME", "")).expanduser()
        self.blender = os.environ.get("BLENDER_BIN", "blender")
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
