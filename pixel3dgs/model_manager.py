from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import hashlib
import json
import os
import shutil
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models" / "optional"
CONFIG_PATH = ROOT / "configs" / "optional_backends.json"

ALIASES = {
    "depth": ["depth_anything_v2.onnx", "midas.onnx"],
    "matcher": ["lightglue.onnx", "loftr.onnx"],
    "flow": ["raft.onnx"],
    "segmentation": ["birefnet.onnx", "sam_encoder.onnx", "person_segmentation.onnx"],
}

ENV_MAP = {
    "depth": "PIXEL3DGS_DEPTH_MODEL",
    "matcher": "PIXEL3DGS_MATCHER_MODEL",
    "flow": "PIXEL3DGS_FLOW_MODEL",
    "segmentation": "PIXEL3DGS_SEGMENTATION_MODEL",
}


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def scan_models() -> dict:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    out = {}
    for alias, names in ALIASES.items():
        env = os.getenv(ENV_MAP[alias])
        candidates = []
        if env:
            candidates.append(Path(env))
        candidates.extend(MODEL_DIR / n for n in names)
        found = next((p for p in candidates if p.exists() and p.is_file()), None)
        out[alias] = {
            "active": bool(found),
            "path": str(found) if found else None,
            "source": "env" if found and env and Path(env) == found else ("models/optional" if found else None),
        }
    return out


def resolve_model(alias: str) -> Path | None:
    st = scan_models().get(alias)
    return Path(st["path"]) if st and st.get("active") and st.get("path") else None


def install_from_url(alias: str, url: str, filename: str | None = None, sha256: str | None = None) -> dict:
    if alias not in ALIASES:
        raise ValueError(f"Unknown model alias: {alias}")
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    name = filename or ALIASES[alias][0]
    dst = MODEL_DIR / name
    tmp = dst.with_suffix(dst.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": "Pixel3DGS-CPU/6"})
    with urllib.request.urlopen(req, timeout=120) as r, tmp.open("wb") as f:
        shutil.copyfileobj(r, f)
    if sha256:
        actual = _sha256(tmp)
        if actual.lower() != sha256.lower():
            tmp.unlink(missing_ok=True)
            raise RuntimeError(f"SHA256 mismatch: {actual}")
    tmp.replace(dst)
    return {"ok": True, "alias": alias, "path": str(dst), "sha256": _sha256(dst)}


def auto_install_from_manifest() -> dict:
    """Installs only entries whose URL is explicitly configured.

    No unverified URL is baked into the package. Add URL/SHA to configs/optional_backends.json
    or use environment-provided model paths. This keeps server deployment deterministic.
    """
    if not CONFIG_PATH.exists():
        return {"installed": [], "skipped": ["manifest_missing"]}
    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    installed, skipped, failed = [], [], []
    for alias in ALIASES:
        item = cfg.get(alias) or cfg.get(alias + "_onnx") or {}
        if resolve_model(alias):
            skipped.append({"alias": alias, "reason": "already_present"})
            continue
        url = item.get("url")
        if not url:
            skipped.append({"alias": alias, "reason": "url_not_configured"})
            continue
        try:
            installed.append(install_from_url(alias, url, item.get("filename"), item.get("sha256")))
        except Exception as exc:
            failed.append({"alias": alias, "error": repr(exc)})
    return {"installed": installed, "skipped": skipped, "failed": failed, "status": scan_models()}
