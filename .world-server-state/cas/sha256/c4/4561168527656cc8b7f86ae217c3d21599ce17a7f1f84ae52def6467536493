from __future__ import annotations

from pathlib import Path
import json
import cv2
import numpy as np


def _flow(a_gray: np.ndarray, b_gray: np.ndarray) -> np.ndarray:
    try:
        dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        dis.setUseSpatialPropagation(True)
        return dis.calc(a_gray, b_gray, None)
    except Exception:
        return cv2.calcOpticalFlowFarneback(a_gray, b_gray, None, 0.5, 3, 21, 3, 5, 1.2, 0)


def build_character_temporal_tracks(frames_bgr: list[np.ndarray], masks: list[np.ndarray], out_dir: Path, grid_step: int = 12, max_tracks: int = 2500) -> dict:
    """CPU temporal deformation scaffold for dynamic characters.

    It is not CUDA 4DGS training. It builds persistent 2D deformation tracks that can
    drive temporal splat deformation / canonicalization and provides a concrete bridge
    toward a future true 4D Gaussian backend.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if len(frames_bgr) < 2:
        return {"ok": False, "reason": "need_two_frames"}

    grays = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in frames_bgr]
    flows = [_flow(grays[i], grays[i + 1]) for i in range(len(grays) - 1)]
    h, w = grays[0].shape
    ys, xs = np.where(masks[0] > 0)
    if len(xs) == 0:
        return {"ok": False, "reason": "empty_initial_mask"}

    candidates = []
    for y in range(grid_step // 2, h, grid_step):
        for x in range(grid_step // 2, w, grid_step):
            if masks[0][y, x] > 0:
                candidates.append((float(x), float(y)))
    if len(candidates) > max_tracks:
        idx = np.linspace(0, len(candidates) - 1, max_tracks, dtype=int)
        candidates = [candidates[i] for i in idx]

    tracks = np.full((len(candidates), len(frames_bgr), 2), np.nan, np.float32)
    vis = np.zeros((len(candidates), len(frames_bgr)), np.uint8)
    tracks[:, 0, :] = np.asarray(candidates, np.float32)
    vis[:, 0] = 1

    for ti in range(len(candidates)):
        x, y = candidates[ti]
        for fi, fl in enumerate(flows):
            xi, yi = int(round(x)), int(round(y))
            if xi < 1 or yi < 1 or xi >= w - 1 or yi >= h - 1:
                break
            dx, dy = fl[yi, xi]
            nx, ny = x + float(dx), y + float(dy)
            nxi, nyi = int(round(nx)), int(round(ny))
            if nxi < 0 or nyi < 0 or nxi >= w or nyi >= h or masks[fi + 1][nyi, nxi] == 0:
                break
            x, y = nx, ny
            tracks[ti, fi + 1] = (x, y)
            vis[ti, fi + 1] = 1

    lifetime = vis.sum(axis=1)
    keep = lifetime >= max(2, int(len(frames_bgr) * 0.35))
    tracks = tracks[keep]
    vis = vis[keep]
    lifetime = lifetime[keep]
    np.savez_compressed(out_dir / "dynamic4d_tracks.npz", tracks_xy=tracks, visibility=vis, lifetime=lifetime)

    # Motion statistics provide an automatic rigid/dynamic decision.
    diffs = []
    for f in range(1, tracks.shape[1]):
        a, b = tracks[:, f - 1], tracks[:, f]
        valid = np.isfinite(a[:, 0]) & np.isfinite(b[:, 0])
        if np.any(valid):
            diffs.extend(np.linalg.norm(b[valid] - a[valid], axis=1).tolist())
    motion = float(np.median(diffs)) if diffs else 0.0
    dynamic_score = float(np.clip(motion / 5.0, 0, 1))
    report = {
        "ok": True,
        "backend": "cpu_dense_flow_temporal_tracks",
        "track_count": int(len(tracks)),
        "frame_count": int(len(frames_bgr)),
        "median_motion_px": round(motion, 4),
        "dynamic_score": round(dynamic_score, 4),
        "recommended_mode": "dynamic_4d" if dynamic_score >= 0.35 else "rigid_character",
        "tracks_file": str(out_dir / "dynamic4d_tracks.npz"),
        "note": "Temporal deformation tracks are operational; true learned 4D Gaussian deformation remains an optional future backend.",
    }
    (out_dir / "dynamic4d_manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report
