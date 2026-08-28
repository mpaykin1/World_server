from __future__ import annotations

from pathlib import Path
import json
import math
from typing import List

import cv2
import numpy as np


def load_exact_camera_metadata(input_dir: Path, files: List[Path], default_height: float) -> tuple[np.ndarray | None, dict]:
    """Load exact capture metadata when present.

    Supported file: capture.json
    {
      "cameras": [
        {"file":"a.png","x":0,"y":1.65,"z":0,"yaw_deg":0,"pitch_deg":0,"roll_deg":0}, ...
      ]
    }

    Pitch/roll are retained in the report. The current reconstruction backend consumes
    x/y/z/yaw directly; the viewer remains roll-free by design.
    """
    path = input_dir / "capture.json"
    if not path.exists():
        return None, {"present": False, "used": False}
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
        rows = obj.get("cameras", [])
        by_name = {str(r.get("file")): r for r in rows}
        cams = []
        extras = []
        for p in files:
            r = by_name.get(p.name)
            if r is None:
                return None, {"present": True, "used": False, "reason": f"missing camera metadata for {p.name}"}
            x = float(r.get("x", 0.0)); y = float(r.get("y", default_height)); z = float(r.get("z", 0.0))
            yaw = math.radians(float(r.get("yaw_deg", r.get("yaw", 0.0))))
            pitch = math.radians(float(r.get("pitch_deg", r.get("pitch", 0.0))))
            roll = math.radians(float(r.get("roll_deg", r.get("roll", 0.0))))
            cams.append((x, y, z, yaw))
            extras.append({"file": p.name, "pitch_rad": pitch, "roll_rad": roll})
        return np.asarray(cams, np.float32), {"present": True, "used": True, "source": str(path), "extras": extras}
    except Exception as exc:
        return None, {"present": True, "used": False, "reason": repr(exc)}


def write_capture_template(path: Path, files: List[Path], spacing_m: float, height_m: float) -> None:
    mid = (len(files) - 1) / 2.0
    cams = []
    for i, p in enumerate(files):
        cams.append({
            "file": p.name,
            "x": 0.0,
            "y": height_m,
            "z": round((i-mid)*spacing_m, 4),
            "yaw_deg": 0.0,
            "pitch_deg": 0.0,
            "roll_deg": 0.0,
        })
    path.write_text(json.dumps({"units":"meters","cameras":cams}, ensure_ascii=False, indent=2), encoding="utf-8")


def _blur_score(arr: np.ndarray) -> float:
    gray = cv2.cvtColor(np.clip(arr*255,0,255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_32F).var())


def capture_quality_gate(images: list[np.ndarray], pair_reports: list[dict], strict: bool = False) -> dict:
    blurs = [_blur_score(x) for x in images]
    overlaps = [float(r.get("overlap",0)) for r in pair_reports]
    matches = [int(r.get("matches",0)) for r in pair_reports]
    seam = []
    for im in images:
        left = im[:, :max(1, im.shape[1]//100)]
        right = im[:, -max(1, im.shape[1]//100):]
        seam.append(float(np.mean(np.abs(left-right))))
    mean_overlap = float(np.mean(overlaps)) if overlaps else 0.0
    mean_matches = float(np.mean(matches)) if matches else 0.0
    mean_blur = float(np.mean(blurs)) if blurs else 0.0
    mean_seam = float(np.mean(seam)) if seam else 1.0

    issues=[]
    if len(images) < 4: issues.append("fewer_than_4_panoramas")
    if mean_overlap < 0.28: issues.append("low_neighbor_overlap")
    if mean_matches < 6: issues.append("weak_geometric_feature_matches")
    if mean_blur < 18: issues.append("blur_or_low_texture")
    if mean_seam > 0.18: issues.append("poor_360_seam_consistency")

    score = 100.0*(0.42*np.clip(mean_overlap,0,1) + 0.20*np.clip(mean_matches/35.0,0,1) + 0.20*np.clip(mean_blur/120.0,0,1) + 0.18*np.clip(1.0-mean_seam/0.25,0,1))
    accepted = len(issues) == 0 or not strict
    return {
        "accepted": bool(accepted),
        "strict": bool(strict),
        "score_percent": round(float(np.clip(score,0,100)),1),
        "issues": issues,
        "metrics": {
            "neighbor_overlap_mean": round(mean_overlap,4),
            "feature_matches_mean": round(mean_matches,2),
            "blur_score_mean": round(mean_blur,2),
            "seam_error_mean": round(mean_seam,4),
        },
    }
