from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path
from typing import Iterable

from .semantic_projection_v7 import run_semantic_mask_inference


def render_semantic_multiview(blender: str, script: Path, model: Path, output_dir: Path, render_size: int = 512, views: int = 8) -> dict:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    command = [
        blender, "--background", "--factory-startup", "--python", str(script), "--",
        "render", "--input", str(model), "--output-dir", str(output_dir),
        "--size", str(int(render_size)), "--views", str(max(4, min(int(views), 12))),
    ]
    proc = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=900, check=False)
    manifest = output_dir / "semantic-multiview-manifest.json"
    if proc.returncode != 0 or not manifest.is_file():
        return {"schemaVersion": 8, "status": "FAILED", "views": [], "logTail": proc.stdout[-5000:]}
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"schemaVersion": 8, "status": "INVALID_MANIFEST", "views": [], "reason": str(exc)}
    rows = []
    for row in data.get("views") or []:
        image = Path(row.get("image") or "")
        camera = Path(row.get("camera") or "")
        if image.is_file() and camera.is_file():
            rows.append({**row, "image": str(image), "camera": str(camera)})
    return {"schemaVersion": 8, "status": "CREATED" if len(rows) >= 4 else "INSUFFICIENT_VIEWS", "views": rows, "logTail": proc.stdout[-3000:]}


def run_multiview_semantic_inference(render_result: dict, output_dir: Path, policy: dict | None = None) -> dict:
    p = dict(policy or {})
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for index, view in enumerate(render_result.get("views") or []):
        image = Path(view["image"])
        mask_path = output_dir / f"semantic-mask-{index:02d}.png"
        inf = run_semantic_mask_inference(image, mask_path, p)
        row = {"index": index, "azimuthDegrees": view.get("azimuthDegrees"), "elevationDegrees": view.get("elevationDegrees"), "cameraPath": view.get("camera"), "inference": inf}
        if inf.get("maskCreated"):
            row["maskPath"] = inf.get("maskPath")
        rows.append(row)
    created = [r for r in rows if r.get("maskPath")]
    coverages = [float((r.get("inference") or {}).get("coverage") or 0.0) for r in created]
    min_views = max(2, int(p.get("minVerifiedViews", 4)))
    status = "READY" if len(created) >= min_views else "INSUFFICIENT_VERIFIED_VIEWS"
    return {
        "schemaVersion": 8,
        "status": status,
        "views": rows,
        "verifiedViewCount": len(created),
        "meanMaskCoverage": round(sum(coverages) / max(1, len(coverages)), 6),
    }


def build_multiview_projection_config(inference_result: dict, policy: dict | None = None) -> dict:
    p = dict(policy or {})
    views = []
    for row in inference_result.get("views") or []:
        mask = Path(str(row.get("maskPath") or ""))
        camera = Path(str(row.get("cameraPath") or ""))
        coverage = float((row.get("inference") or {}).get("coverage") or 0.0)
        if mask.is_file() and camera.is_file() and 0.0005 <= coverage <= 0.92:
            views.append({
                "maskPath": str(mask),
                "cameraPath": str(camera),
                "weight": 1.0,
                "coverage": coverage,
                "azimuthDegrees": row.get("azimuthDegrees"),
                "elevationDegrees": row.get("elevationDegrees"),
            })
    min_views = max(2, int(p.get("minVerifiedViews", 4)))
    if len(views) < min_views:
        return {"enabled": False, "schemaVersion": 8, "status": "FALLBACK_TO_V7_OR_HEURISTIC", "views": views}
    return {
        "enabled": True,
        "schemaVersion": 8,
        "status": "READY",
        "fusionMode": str(p.get("fusionMode", "max_visible_vote")),
        "views": views,
        "minObservedViews": max(1, int(p.get("minObservedViews", 1))),
        "minVoteFraction": max(0.05, min(float(p.get("minVoteFraction", 0.34)), 1.0)),
        "minCoverage": max(0.0005, float(p.get("minCoverage", 0.001))),
        "maxCoverage": min(0.95, float(p.get("maxCoverage", 0.88))),
        "rayVisibility": bool(p.get("rayVisibility", True)),
        "rule": "Multi-view semantic fusion protects a vertex only from verified aligned view evidence; invalid coverage falls back instead of weakening protection.",
    }


def fusion_confidence(view_votes: Iterable[float], observed_views: int, min_observed_views: int = 2) -> float:
    votes = [max(0.0, min(float(v), 1.0)) for v in view_votes]
    if observed_views < max(1, int(min_observed_views)) or not votes:
        return 0.0
    mean_vote = sum(votes) / len(votes)
    diversity = min(1.0, observed_views / 6.0)
    consistency = 1.0 - min(1.0, math.sqrt(sum((v - mean_vote) ** 2 for v in votes) / len(votes)))
    return round(max(0.0, min(1.0, mean_vote * 0.7 + diversity * 0.2 + consistency * 0.1)), 6)
