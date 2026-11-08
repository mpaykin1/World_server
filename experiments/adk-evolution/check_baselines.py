"""Fail CI unless committed baseline HTML matches the canonical manifest."""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
manifest = json.loads((HERE / "ostrov-baselines-manifest.json").read_text(encoding="utf-8"))
for label in ("original", "improved"):
    expected = manifest[label]
    path = HERE / "baselines" / expected["file"]
    if not path.is_file():
        raise SystemExit(f"FAIL {label}: missing committed file {path}")
    actual = path.read_bytes()
    sha = hashlib.sha256(actual).hexdigest()
    if len(actual) != expected["bytes"] or sha != expected["sha256"]:
        raise SystemExit(f"FAIL {label}: bytes={len(actual)}, sha256={sha}")
    print(f"PASS {label}: {len(actual)} bytes sha256={sha}")
print("BASELINES_SHA256_PASS")
