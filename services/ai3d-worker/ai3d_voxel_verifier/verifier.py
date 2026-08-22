from __future__ import annotations

from pathlib import Path
import hashlib
import json
import math

import numpy as np
from PIL import Image


SCHEMA = "ai3d-voxel-verification-v1"


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _edge_map(rgb: np.ndarray) -> np.ndarray:
    lum = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]) / 255.0
    gx = np.zeros_like(lum, dtype=np.float32)
    gy = np.zeros_like(lum, dtype=np.float32)
    gx[:, 1:-1] = np.abs(lum[:, 2:] - lum[:, :-2])
    gy[1:-1, :] = np.abs(lum[2:, :] - lum[:-2, :])
    return np.clip((gx + gy) * 1.7, 0.0, 1.0).astype(np.float32)


def _clamp_percent(value: float) -> float:
    return round(max(0.0, min(100.0, value)), 2)


def verify_voxel_city(input_path: Path, world_path: Path, output_dir: Path) -> tuple[Path, Path]:
    """
    Independent verifier for the voxel-city artifact.

    It computes only claims it can reproduce from the actual input + world JSON.
    IMPORTANT: 2D front-projection fidelity is NOT 3D reconstruction quality.
    """
    input_path = Path(input_path)
    world_path = Path(world_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if not input_path.is_file():
        raise ValueError("voxel verifier: input image missing")
    if not world_path.is_file():
        raise ValueError("voxel verifier: world artifact missing")

    data = json.loads(world_path.read_text(encoding="utf-8"))
    if data.get("schema") != "ai3d-voxel-city-v2":
        raise ValueError(f"voxel verifier: unsupported schema {data.get('schema')!r}")

    src_meta = data.get("source") or {}
    w = int(src_meta.get("gridWidth") or 0)
    h = int(src_meta.get("gridHeight") or 0)
    if not (16 <= w <= 512 and 16 <= h <= 512):
        raise ValueError("voxel verifier: invalid grid dimensions")

    palette = data.get("palette")
    voxels = data.get("voxels")
    if not isinstance(palette, list) or not (1 <= len(palette) <= 256):
        raise ValueError("voxel verifier: invalid palette")
    if not isinstance(voxels, list) or not voxels:
        raise ValueError("voxel verifier: empty voxel world")

    coords = set()
    projection: dict[tuple[int, int], tuple[int, int]] = {}
    duplicate_count = 0
    out_of_bounds = 0
    palette_errors = 0
    foundation_voxels = 0

    for row in voxels:
        if not isinstance(row, list) or len(row) < 4:
            raise ValueError("voxel verifier: malformed voxel row")
        x, y, z, pi = row[:4]
        if not all(isinstance(v, int) for v in (x, y, z, pi)):
            raise ValueError("voxel verifier: voxel coordinates/palette index must be integers")
        key = (x, y, z)
        if key in coords:
            duplicate_count += 1
        coords.add(key)
        if pi < 0 or pi >= len(palette):
            palette_errors += 1
        if y == -1:
            foundation_voxels += 1
            continue
        if x < 0 or x >= w or y < 0 or y >= h:
            out_of_bounds += 1
            continue
        # Camera front is +Z looking toward -Z: largest z is the visible front voxel.
        pkey = (x, y)
        old = projection.get(pkey)
        if old is None or z > old[0]:
            projection[pkey] = (z, pi)

    if duplicate_count:
        raise ValueError(f"voxel verifier: duplicate voxel coordinates: {duplicate_count}")
    if out_of_bounds:
        raise ValueError(f"voxel verifier: out-of-bounds front voxels: {out_of_bounds}")
    if palette_errors:
        raise ValueError(f"voxel verifier: invalid palette indices: {palette_errors}")

    src = Image.open(input_path).convert("RGB").resize((w, h), Image.Resampling.LANCZOS)
    src_rgb = np.array(src, dtype=np.uint8)
    proj_rgb = np.zeros((h, w, 3), dtype=np.uint8)
    proj_alpha = np.zeros((h, w), dtype=np.uint8)
    front_depths = set()

    for (x, y_world), (z, pi) in projection.items():
        iy = h - 1 - y_world
        if iy < 0 or iy >= h:
            continue
        color = int(palette[pi])
        proj_rgb[iy, x, 0] = (color >> 16) & 255
        proj_rgb[iy, x, 1] = (color >> 8) & 255
        proj_rgb[iy, x, 2] = color & 255
        proj_alpha[iy, x] = 255
        front_depths.add(int(z))

    mask = proj_alpha > 0
    represented = int(mask.sum())
    if represented == 0:
        raise ValueError("voxel verifier: empty front projection")

    # Reproducible 2D facade metrics, explicitly NOT 3D correspondence.
    mae = float(np.abs(src_rgb.astype(np.float32)[mask] - proj_rgb.astype(np.float32)[mask]).mean())
    color_similarity = _clamp_percent((1.0 - mae / 255.0) * 100.0)

    src_masked = np.zeros_like(src_rgb)
    src_masked[mask] = src_rgb[mask]
    src_edges = _edge_map(src_masked)
    proj_edges = _edge_map(proj_rgb)
    edge_mae = float(np.abs(src_edges - proj_edges).mean())
    edge_similarity = _clamp_percent((1.0 - edge_mae) * 100.0)

    coverage = _clamp_percent(represented / float(w * h) * 100.0)

    rgba = np.dstack([proj_rgb, proj_alpha])
    projection_path = output_dir / "voxel-verifier-front-projection.png"
    Image.fromarray(rgba, mode="RGBA").resize((w * 4, h * 4), Image.Resampling.NEAREST).save(projection_path)

    technical_passed = duplicate_count == 0 and out_of_bounds == 0 and palette_errors == 0
    report = {
        "schema": SCHEMA,
        "inputSha256": _sha256(input_path),
        "worldSha256": _sha256(world_path),
        "projectionSha256": _sha256(projection_path),
        "technical": {
            "status": "VERIFIED" if technical_passed else "FAILED",
            "uniqueCoordinates": len(coords),
            "duplicateCoordinates": duplicate_count,
            "outOfBoundsFrontVoxels": out_of_bounds,
            "paletteIndexErrors": palette_errors,
            "foundationVoxels": foundation_voxels,
            "passed": technical_passed,
        },
        "frontProjection2D": {
            "status": "VERIFIED",
            "representedPixels": represented,
            "referenceCoveragePercent": coverage,
            "cityColorSimilarityPercent": color_similarity,
            "maskedEdgeSimilarityPercent": edge_similarity,
            "frontDepthLayers": len(front_depths),
            "note": "Measured only on the reference-facing voxel facade. This is 2D projection fidelity, not 3D reconstruction quality.",
        },
        "depth": {
            "status": "HEURISTIC",
            "frontDepthLayers": len(front_depths),
            "note": "Depth is piecewise cubical heuristic because one image does not reveal unseen geometry.",
        },
        "image3dCorrespondence": {
            "status": "UNTESTED",
            "reason": "Requires independent multi-view render-back comparison. Front facade fidelity alone cannot verify 3D correspondence.",
        },
        "multiViewGeometry": {
            "status": "UNTESTED",
            "reason": "No independent multi-view render-back measurement in this verifier version.",
        },
    }
    report_path = output_dir / "voxel-verification-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report_path, projection_path
