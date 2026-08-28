from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

WORKER = Path(__file__).resolve().parents[1]
if str(WORKER) not in sys.path:
    sys.path.insert(0, str(WORKER))

from ai3d.plugins.characterforge_cpu import CharacterForgeCpuEngine  # noqa: E402


def main():
    p = argparse.ArgumentParser(description="Run a real local CharacterForge CPU job without HTTP auth.")
    p.add_argument("--front", required=True)
    p.add_argument("--side")
    p.add_argument("--back")
    p.add_argument("--left")
    p.add_argument("--resolution", type=int, default=48)
    p.add_argument("--palette-size", type=int, default=24)
    p.add_argument("--output-dir")
    args = p.parse_args()

    front = Path(args.front).resolve()
    if not front.is_file():
        raise SystemExit(f"Front image missing: {front}")
    out = Path(args.output_dir).resolve() if args.output_dir else WORKER / "runtime" / "manual-characterforge" / time.strftime("%Y%m%d-%H%M%S")
    out.mkdir(parents=True, exist_ok=True)
    views = {}
    for role in ("side", "back", "left"):
        raw = getattr(args, role)
        if raw:
            path = Path(raw).resolve()
            if not path.is_file():
                raise SystemExit(f"{role} image missing: {path}")
            views[role] = str(path)

    params = {
        "voxelResolution": max(12, min(args.resolution, 160)),
        "paletteSize": max(8, min(args.palette_size, 64)),
        "removeBackground": True,
        "_characterViews": views,
    }
    engine = CharacterForgeCpuEngine(WORKER)
    print(json.dumps(engine.status(), ensure_ascii=False, indent=2))
    if not engine.available():
        raise SystemExit("CharacterForge unavailable. Run verify_characterforge_cpu.py --require-blender first.")

    def progress(value, message):
        print(f"[{int(value):03d}%] {message}", flush=True)

    result = engine.run(front, out, params, progress)
    report = out / "LOCAL_CHARACTERFORGE_SMOKE.json"
    report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print("CHARACTERFORGE_LOCAL_SMOKE_PASS", report)


if __name__ == "__main__":
    main()
