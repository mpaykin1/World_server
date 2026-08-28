from __future__ import annotations

import json
import shutil
from pathlib import Path


def find_root(start: Path) -> Path:
    for candidate in [start.resolve(), *start.resolve().parents]:
        if (candidate / "package.json").is_file() and (candidate / "services" / "ai3d-worker").is_dir():
            return candidate
    raise SystemExit("World_server root not found")


def main():
    root = find_root(Path.cwd())
    state_path = root / "CHARACTERFORGE_CPU_INSTALL.json"
    if not state_path.is_file():
        raise SystemExit("Install state not found; refuse blind rollback.")
    state = json.loads(state_path.read_text(encoding="utf-8"))
    backup = Path(state["backup"])
    if not backup.is_dir():
        raise SystemExit(f"Backup missing: {backup}")
    for rel_text in state.get("backupFiles", []):
        rel = Path(rel_text)
        src = backup / rel
        if src.is_file():
            dest = root / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
    for rel_text in state.get("createdFiles", []):
        target = root / rel_text
        if target.is_file():
            target.unlink()
    print("CHARACTERFORGE_CPU_V2_ROLLBACK_PASS")


if __name__ == "__main__":
    main()
