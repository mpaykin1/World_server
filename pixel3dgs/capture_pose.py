from __future__ import annotations

from pathlib import Path
import json
import math
import numpy as np


def _unwrap_degrees(values: np.ndarray) -> np.ndarray:
    if len(values) == 0:
        return values
    return np.rad2deg(np.unwrap(np.deg2rad(values)))


def _interp(times: np.ndarray, vals: np.ndarray, query: np.ndarray) -> np.ndarray:
    if len(times) == 0:
        return np.zeros_like(query, dtype=np.float64)
    if len(times) == 1:
        return np.full_like(query, vals[0], dtype=np.float64)
    return np.interp(query, times, vals)


def _yaw_R(yaw: float) -> np.ndarray:
    cy, sy = math.cos(yaw), math.sin(yaw)
    return np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], np.float32)


def _geo_local(samples: list[dict]) -> tuple[np.ndarray, np.ndarray] | None:
    rows = []
    for s in samples:
        gps = s.get("gps") or {}
        lat, lon = gps.get("lat"), gps.get("lon")
        acc = gps.get("accuracy")
        if lat is None or lon is None:
            continue
        if acc is not None and float(acc) > 25:
            continue
        rows.append((float(s.get("t_s", 0)), float(lat), float(lon)))
    if len(rows) < 3:
        return None
    arr = np.asarray(rows, np.float64)
    lat0, lon0 = arr[0, 1], arr[0, 2]
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(math.radians(lat0))
    x = (arr[:, 2] - lon0) * m_per_deg_lon
    z = (arr[:, 1] - lat0) * m_per_deg_lat
    if np.ptp(x) + np.ptp(z) < 1.5:
        return None
    return arr[:, 0], np.stack([x, z], axis=1)


def load_capture_pose(path: str | Path) -> dict:
    p = Path(path)
    data = json.loads(p.read_text(encoding="utf-8"))
    samples = data.get("samples") or data.get("frames") or []
    normalized = []
    for s in samples:
        t_s = s.get("t_s")
        if t_s is None:
            if "t_ms" in s:
                t_s = float(s["t_ms"]) / 1000.0
            elif "timestamp" in s:
                t_s = float(s["timestamp"])
            else:
                continue
        item = dict(s)
        item["t_s"] = float(t_s)
        normalized.append(item)
    normalized.sort(key=lambda x: x["t_s"])
    return {"source": str(p), "samples": normalized, "meta": {k: v for k, v in data.items() if k not in ("samples", "frames")}}


def fuse_capture_poses(base_cameras: list[dict], frame_records: list[dict], pose_path: str | Path) -> tuple[list[dict], dict]:
    data = load_capture_pose(pose_path)
    samples = data["samples"]
    qtimes = np.asarray([float(r.get("time_s", i)) for i, r in enumerate(frame_records)], np.float64)
    if not samples or not len(qtimes):
        return base_cameras, {"used": False, "reason": "no_pose_samples"}

    st = np.asarray([s["t_s"] for s in samples], np.float64)
    alphas = []
    alpha_times = []
    native_positions = []
    native_times = []
    for s in samples:
        ori = s.get("orientation") or {}
        alpha = ori.get("alpha")
        if alpha is not None:
            alpha_times.append(s["t_s"])
            alphas.append(float(alpha))
        pos = s.get("position")
        if isinstance(pos, list) and len(pos) == 3:
            native_times.append(s["t_s"])
            native_positions.append([float(x) for x in pos])

    cams = []
    orientation_used = False
    native_position_used = False
    gps_position_used = False

    yaw_query = None
    if len(alphas) >= 2:
        aa = _unwrap_degrees(np.asarray(alphas, np.float64))
        aq = _interp(np.asarray(alpha_times), aa, qtimes)
        yaw_query = np.deg2rad(aq - aq[0])
        orientation_used = True

    native_q = None
    if len(native_positions) >= 2:
        nt = np.asarray(native_times, np.float64)
        npv = np.asarray(native_positions, np.float64)
        native_q = np.stack([_interp(nt, npv[:, k], qtimes) for k in range(3)], axis=1)
        native_q -= native_q[0]
        if float(np.linalg.norm(native_q[-1] - native_q[0])) > 0.05:
            native_position_used = True

    gps = _geo_local(samples)
    gps_q = None
    if gps is not None:
        gt, gxz = gps
        gps_q = np.stack([_interp(gt, gxz[:, 0], qtimes), _interp(gt, gxz[:, 1], qtimes)], axis=1)
        gps_q -= gps_q[0]
        gps_position_used = True

    for i, base in enumerate(base_cameras):
        c = dict(base)
        C = np.asarray(base["C"], np.float32).copy()
        R = np.asarray(base["R"], np.float32).copy()
        if native_position_used and native_q is not None:
            # Preserve the base camera height but trust native horizontal motion strongly.
            C[0] = float(native_q[i, 0])
            C[2] = float(native_q[i, 2])
            if abs(float(native_q[i, 1])) < 10:
                C[1] = float(base_cameras[0]["C"][1] + native_q[i, 1])
        elif gps_position_used and gps_q is not None:
            # GPS is noisy; use it as a low-frequency drift anchor, not a hard override.
            C[0] = float(0.65 * C[0] + 0.35 * gps_q[i, 0])
            C[2] = float(0.65 * C[2] + 0.35 * gps_q[i, 1])
        if orientation_used and yaw_query is not None:
            R = _yaw_R(float(yaw_query[i]))
        c["C"] = C
        c["R"] = R
        c["source"] = "sensor_fused_" + str(base.get("source", "vo"))
        cams.append(c)

    report = {
        "used": orientation_used or native_position_used or gps_position_used,
        "orientation_used": orientation_used,
        "native_position_used": native_position_used,
        "gps_position_used": gps_position_used,
        "sample_count": len(samples),
        "frame_count": len(frame_records),
        "coverage_ratio": round(min(1.0, len(samples) / max(1, len(frame_records) * 2)), 4),
        "source": str(pose_path),
    }
    return cams, report
