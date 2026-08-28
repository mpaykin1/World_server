#!/usr/bin/env python3
"""WORLD_SERVER GS360 smart pipeline.

Adds user-facing preference modes, hardware/backend detection, ETA estimation,
benchmark history, and truthful CPU/GPU selection while preserving the V1
CPU-first panorama -> perspective dataset -> synthetic parallax pipeline.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import platform
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np
from PIL import Image

VERSION = "6.0.0"
BENCHMARK_DIRNAME = ".benchmarks"
BENCHMARK_FILENAME = "gs360_benchmarks.json"
_DEPTH_ANYTHING_CACHE: dict[str, object] = {}
_ONNX_DEPTH_CACHE: dict[str, tuple[object, str, int, int]] = {}
_OPENVINO_DEPTH_CACHE: dict[str, tuple[object, int, int]] = {}


def _json_dump(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def _clamp(v: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return np.minimum(np.maximum(v, lo), hi)


def load_rgb(path: Path) -> np.ndarray:
    with Image.open(path) as img:
        return np.asarray(img.convert("RGB"), dtype=np.uint8)


def save_rgb(path: Path, arr: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.asarray(_clamp(arr, 0, 255), dtype=np.uint8), "RGB").save(path, optimize=True)


def validate_panorama(path: Path, tolerance: float = 0.18) -> dict:
    with Image.open(path) as img:
        w, h = img.size
    ratio = w / max(h, 1)
    is_equirect = abs(ratio - 2.0) <= tolerance
    return {
        "path": str(path),
        "width": w,
        "height": h,
        "aspect_ratio": round(ratio, 5),
        "equirectangular_2to1": bool(is_equirect),
    }


def perspective_from_equirect(
    pano: np.ndarray,
    yaw_deg: float,
    pitch_deg: float,
    fov_deg: float,
    out_w: int,
    out_h: int,
) -> np.ndarray:
    h, w, _ = pano.shape
    fov = math.radians(fov_deg)
    aspect = out_w / out_h
    tan_h = math.tan(fov / 2.0)
    tan_v = tan_h / aspect

    xs = np.linspace(-tan_h, tan_h, out_w, dtype=np.float32)
    ys = np.linspace(tan_v, -tan_v, out_h, dtype=np.float32)
    xx, yy = np.meshgrid(xs, ys)
    zz = np.ones_like(xx)
    norm = np.sqrt(xx * xx + yy * yy + zz * zz)
    x = xx / norm
    y = yy / norm
    z = zz / norm

    pitch = math.radians(pitch_deg)
    cp, sp = math.cos(pitch), math.sin(pitch)
    y2 = y * cp - z * sp
    z2 = y * sp + z * cp
    x2 = x

    yaw = math.radians(yaw_deg)
    cy, sy = math.cos(yaw), math.sin(yaw)
    x3 = x2 * cy + z2 * sy
    y3 = y2
    z3 = -x2 * sy + z2 * cy

    lon = np.arctan2(x3, z3)
    lat = np.arcsin(_clamp(y3, -1.0, 1.0))
    u = (lon / (2.0 * math.pi) + 0.5) * w
    v = (0.5 - lat / math.pi) * h

    u0 = np.floor(u).astype(np.int64) % w
    v0 = np.floor(v).astype(np.int64)
    u1 = (u0 + 1) % w
    v1 = np.minimum(v0 + 1, h - 1)
    v0 = np.clip(v0, 0, h - 1)

    du = (u - np.floor(u))[..., None]
    dv = (v - np.floor(v))[..., None]
    p00 = pano[v0, u0].astype(np.float32)
    p10 = pano[v0, u1].astype(np.float32)
    p01 = pano[v1, u0].astype(np.float32)
    p11 = pano[v1, u1].astype(np.float32)
    top = p00 * (1.0 - du) + p10 * du
    bot = p01 * (1.0 - du) + p11 * du
    return top * (1.0 - dv) + bot * dv


def proxy_depth(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    x = rgb.astype(np.float32) / 255.0
    lum = 0.2126 * x[..., 0] + 0.7152 * x[..., 1] + 0.0722 * x[..., 2]
    gx = np.zeros_like(lum)
    gy = np.zeros_like(lum)
    gx[:, 1:-1] = np.abs(lum[:, 2:] - lum[:, :-2]) * 0.5
    gy[1:-1, :] = np.abs(lum[2:, :] - lum[:-2, :]) * 0.5
    edge = np.sqrt(gx * gx + gy * gy)
    h, _ = lum.shape
    vertical = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    depth = 0.55 + 1.35 * (1.0 - vertical) + 0.22 * lum
    depth = _clamp(depth, 0.35, 2.2)
    confidence = _clamp(1.0 - edge * 3.5, 0.1, 1.0)
    return depth.astype(np.float32), confidence.astype(np.float32)


def _resize_float(arr: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    lo, hi = float(np.min(arr)), float(np.max(arr))
    if hi - lo < 1e-9:
        return np.full((size[1], size[0]), lo, dtype=np.float32)
    normalized = ((arr - lo) / (hi - lo) * 65535.0).astype(np.uint16)
    img = Image.fromarray(normalized, mode="I;16")
    img = img.resize(size, Image.Resampling.BICUBIC)
    out = np.asarray(img, dtype=np.float32) / 65535.0
    return out * (hi - lo) + lo


def onnx_depth(rgb: np.ndarray, model_path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Cached ONNX Runtime CPU depth adapter.

    Session creation and graph optimization are intentionally cached because a
    panorama may generate dozens of perspective views in one job.
    """
    import onnxruntime as ort

    key = str(model_path.resolve())
    cached = _ONNX_DEPTH_CACHE.get(key)
    if cached is None:
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess = ort.InferenceSession(str(model_path), sess_options=opts, providers=["CPUExecutionProvider"])
        inp = sess.get_inputs()[0]
        shape = inp.shape
        ih = int(shape[-2]) if isinstance(shape[-2], int) else 384
        iw = int(shape[-1]) if isinstance(shape[-1], int) else 384
        cached = (sess, inp.name, ih, iw)
        _ONNX_DEPTH_CACHE[key] = cached
    sess, input_name, ih, iw = cached
    pil = Image.fromarray(rgb, "RGB").resize((iw, ih), Image.Resampling.BICUBIC)
    x = np.asarray(pil, dtype=np.float32) / 255.0
    x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    x = np.transpose(x, (2, 0, 1))[None, ...].astype(np.float32)
    out = np.asarray(sess.run(None, {input_name: x})[0]).squeeze().astype(np.float32)
    while out.ndim > 2:
        out = out[0]
    out = _resize_float(out, (rgb.shape[1], rgb.shape[0]))
    p2, p98 = np.percentile(out, [2.0, 98.0])
    norm = _clamp((out - p2) / max(p98 - p2, 1e-6), 0.0, 1.0)
    depth = 0.45 + (1.0 - norm) * 1.65
    conf = np.full_like(depth, 0.82, dtype=np.float32)
    return depth.astype(np.float32), conf


def depth_anything_v2_small_depth(rgb: np.ndarray, repo_root: Path, checkpoint: Path) -> tuple[np.ndarray, np.ndarray]:
    """Official Depth Anything V2 Small adapter, CPU-capable.

    The upstream code chooses CPU when CUDA/MPS is unavailable. We cache the
    loaded model so a panorama with many perspective views does not reload the
    checkpoint for every view. Output is treated as relative, not metric, depth.
    """
    import importlib
    import torch

    key = f"{repo_root}|{checkpoint}"
    model = _DEPTH_ANYTHING_CACHE.get(key)
    if model is None:
        repo_s = str(repo_root)
        if repo_s not in sys.path:
            sys.path.insert(0, repo_s)
        mod = importlib.import_module('depth_anything_v2.dpt')
        cls = getattr(mod, 'DepthAnythingV2')
        model = cls(encoder='vits', features=64, out_channels=[48, 96, 192, 384])
        state = torch.load(str(checkpoint), map_location='cpu')
        model.load_state_dict(state)
        model = model.to('cpu').eval()
        _DEPTH_ANYTHING_CACHE[key] = model
    # Official infer_image expects an OpenCV-style BGR ndarray.
    bgr = np.asarray(rgb[..., ::-1], dtype=np.uint8)
    raw = np.asarray(model.infer_image(bgr, 392), dtype=np.float32)
    raw = _resize_float(raw, (rgb.shape[1], rgb.shape[0]))
    p2, p98 = np.percentile(raw, [2.0, 98.0])
    norm = _clamp((raw - p2) / max(p98 - p2, 1e-6), 0.0, 1.0)
    depth = 0.45 + (1.0 - norm) * 1.65
    conf = np.full_like(depth, 0.88, dtype=np.float32)
    return depth.astype(np.float32), conf


def openvino_depth(rgb: np.ndarray, model_path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Cached OpenVINO CPU depth adapter with persistent model compilation cache."""
    import openvino as ov  # optional dependency

    key = str(model_path.resolve())
    cached = _OPENVINO_DEPTH_CACHE.get(key)
    if cached is None:
        core = ov.Core()
        cache_dir = Path(os.getenv("GS360_OPENVINO_CACHE", str(Path(__file__).resolve().parent / "data" / "openvino_cache")))
        cache_dir.mkdir(parents=True, exist_ok=True)
        try:
            core.set_property({"CACHE_DIR": str(cache_dir)})
        except Exception:
            pass
        model = core.read_model(str(model_path))
        inp = model.inputs[0]
        shape = list(inp.partial_shape)
        def dim_value(d, fallback):
            try:
                return int(d.get_length()) if d.is_static else fallback
            except Exception:
                try:
                    return int(d)
                except Exception:
                    return fallback
        ih = dim_value(shape[-2], 384) if len(shape) >= 4 else 384
        iw = dim_value(shape[-1], 384) if len(shape) >= 4 else 384
        hint = os.getenv("GS360_OPENVINO_HINT", "LATENCY").upper()
        if hint not in {"LATENCY", "THROUGHPUT"}:
            hint = "LATENCY"
        compiled = core.compile_model(model, "CPU", {"PERFORMANCE_HINT": hint})
        cached = (compiled, ih, iw)
        _OPENVINO_DEPTH_CACHE[key] = cached
    compiled, ih, iw = cached
    pil = Image.fromarray(rgb, "RGB").resize((iw, ih), Image.Resampling.BICUBIC)
    x = np.asarray(pil, dtype=np.float32) / 255.0
    x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    x = np.transpose(x, (2, 0, 1))[None, ...].astype(np.float32)
    result = compiled([x])
    out = np.asarray(result[compiled.output(0)]).squeeze().astype(np.float32)
    while out.ndim > 2:
        out = out[0]
    out = _resize_float(out, (rgb.shape[1], rgb.shape[0]))
    p2, p98 = np.percentile(out, [2.0, 98.0])
    norm = _clamp((out - p2) / max(p98 - p2, 1e-6), 0.0, 1.0)
    depth = 0.45 + (1.0 - norm) * 1.65
    conf = np.full_like(depth, 0.86, dtype=np.float32)
    return depth.astype(np.float32), conf


def synthesize_parallax(rgb: np.ndarray, depth: np.ndarray, dx: float, dy: float) -> np.ndarray:
    h, w, _ = rgb.shape
    yy, xx = np.meshgrid(np.arange(h, dtype=np.float32), np.arange(w, dtype=np.float32), indexing="ij")
    inv = 1.0 / np.maximum(depth, 0.1)
    inv -= float(np.median(inv))
    sx = xx - dx * w * inv
    sy = yy - dy * h * inv
    sx = _clamp(sx, 0.0, w - 1.001)
    sy = _clamp(sy, 0.0, h - 1.001)
    x0 = np.floor(sx).astype(np.int64)
    y0 = np.floor(sy).astype(np.int64)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    fx = (sx - x0)[..., None]
    fy = (sy - y0)[..., None]
    a = rgb[y0, x0].astype(np.float32) * (1 - fx) + rgb[y0, x1].astype(np.float32) * fx
    b = rgb[y1, x0].astype(np.float32) * (1 - fx) + rgb[y1, x1].astype(np.float32) * fx
    return a * (1 - fy) + b * fy


def camera_transform(yaw_deg: float, pitch_deg: float, position: Sequence[float]) -> list[list[float]]:
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    cy, sy = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)
    forward = np.array([sy * cp, sp, cy * cp], dtype=np.float64)
    right = np.array([cy, 0.0, -sy], dtype=np.float64)
    up = np.cross(forward, right)
    mat = np.eye(4, dtype=np.float64)
    mat[:3, 0] = right
    mat[:3, 1] = up
    mat[:3, 2] = forward
    mat[:3, 3] = np.asarray(position, dtype=np.float64)
    return [[round(float(v), 8) for v in row] for row in mat]


@dataclass
class Frame:
    file_path: str
    yaw: float
    pitch: float
    position: tuple[float, float, float]
    source_index: int
    synthetic: bool
    depth_kind: str


def create_gaussian_seed(pano: np.ndarray, out_path: Path, max_points: int, seed: int = 42) -> int:
    h, w, _ = pano.shape
    total = h * w
    step = max(1, int(math.sqrt(total / max(max_points, 1))))
    ys = np.arange(step // 2, h, step)
    xs = np.arange(step // 2, w, step)
    xx, yy = np.meshgrid(xs, ys)
    xx = xx.reshape(-1)
    yy = yy.reshape(-1)
    if len(xx) > max_points:
        rng = np.random.default_rng(seed)
        idx = rng.choice(len(xx), size=max_points, replace=False)
        xx, yy = xx[idx], yy[idx]

    rgb = pano[yy, xx]
    lon = (xx.astype(np.float32) / w - 0.5) * (2 * math.pi)
    lat = (0.5 - yy.astype(np.float32) / h) * math.pi
    lum = (0.2126 * rgb[:, 0] + 0.7152 * rgb[:, 1] + 0.0722 * rgb[:, 2]) / 255.0
    radial = 1.45 + 0.5 * (0.5 - yy / max(h - 1, 1)) + 0.12 * lum
    radial = np.clip(radial, 0.65, 2.1)
    x = radial * np.sin(lon) * np.cos(lat)
    y = radial * np.sin(lat)
    z = radial * np.cos(lon) * np.cos(lat)

    SH_C0 = 0.28209479177387814
    colors = rgb.astype(np.float32) / 255.0
    fdc = (colors - 0.5) / SH_C0
    opacity_logit = math.log(0.92 / (1.0 - 0.92))
    log_scale = -4.15

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="\n") as f:
        f.write("ply\nformat ascii 1.0\n")
        f.write(f"element vertex {len(x)}\n")
        for name in ("x", "y", "z", "nx", "ny", "nz", "f_dc_0", "f_dc_1", "f_dc_2", "opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"):
            f.write(f"property float {name}\n")
        f.write("end_header\n")
        for i in range(len(x)):
            vals = (
                x[i], y[i], z[i], 0.0, 0.0, 0.0,
                fdc[i, 0], fdc[i, 1], fdc[i, 2], opacity_logit,
                log_scale, log_scale, log_scale,
                1.0, 0.0, 0.0, 0.0,
            )
            f.write(" ".join(f"{float(v):.7g}" for v in vals) + "\n")
    return len(x)


def format_command(template: str, *, input_dir: Path, output_dir: Path, manifest: Path) -> str:
    return template.format(input=str(input_dir), output=str(output_dir), manifest=str(manifest))


def run_shell_hook(template: str, *, input_dir: Path, output_dir: Path, manifest: Path, cwd: Path) -> dict:
    command = format_command(template, input_dir=input_dir, output_dir=output_dir, manifest=manifest)
    started = time.time()
    proc = subprocess.run(command, cwd=str(cwd), shell=True, text=True, capture_output=True)
    return {
        "command": command,
        "returncode": proc.returncode,
        "elapsed_seconds": round(time.time() - started, 3),
        "stdout_tail": proc.stdout[-4000:],
        "stderr_tail": proc.stderr[-4000:],
        "pass": proc.returncode == 0,
    }


def try_colmap(dataset_dir: Path, output_dir: Path) -> dict:
    exe = shutil.which("colmap")
    if not exe:
        return {"available": False, "attempted": False, "pass": False, "reason": "colmap_not_found"}
    db = output_dir / "colmap.db"
    sparse = output_dir / "sparse"
    sparse.mkdir(parents=True, exist_ok=True)
    commands = [
        [exe, "feature_extractor", "--database_path", str(db), "--image_path", str(dataset_dir)],
        [exe, "exhaustive_matcher", "--database_path", str(db)],
        [exe, "mapper", "--database_path", str(db), "--image_path", str(dataset_dir), "--output_path", str(sparse)],
    ]
    logs = []
    for cmd in commands:
        proc = subprocess.run(cmd, text=True, capture_output=True)
        logs.append({"command": cmd, "returncode": proc.returncode, "stderr_tail": proc.stderr[-2500:]})
        if proc.returncode != 0:
            return {"available": True, "attempted": True, "pass": False, "logs": logs}
    return {"available": True, "attempted": True, "pass": True, "logs": logs, "sparse_dir": str(sparse)}


def _detect_total_memory_gb() -> float | None:
    try:
        import psutil  # type: ignore
        return round(psutil.virtual_memory().total / (1024 ** 3), 2)
    except Exception:
        pass
    if hasattr(os, "sysconf") and "SC_PAGE_SIZE" in os.sysconf_names and "SC_PHYS_PAGES" in os.sysconf_names:
        try:
            total = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
            return round(total / (1024 ** 3), 2)
        except Exception:
            pass
    try:
        if Path("/proc/meminfo").is_file():
            text = Path("/proc/meminfo").read_text(encoding="utf-8", errors="ignore")
            for line in text.splitlines():
                if line.startswith("MemTotal:"):
                    kb = float(line.split()[1])
                    return round(kb / (1024 ** 2), 2)
    except Exception:
        pass
    return None


def detect_hardware() -> dict:
    gpu = {"available": False, "name": None, "vram_gb": None, "driver": None, "provider": "cpu_only"}
    nvidia_smi = shutil.which("nvidia-smi")
    if nvidia_smi:
        try:
            proc = subprocess.run(
                [nvidia_smi, "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"],
                text=True,
                capture_output=True,
                timeout=4,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                first = proc.stdout.strip().splitlines()[0]
                parts = [x.strip() for x in first.split(",")]
                gpu = {
                    "available": True,
                    "name": parts[0] if parts else "NVIDIA GPU",
                    "vram_gb": round(float(parts[1]) / 1024.0, 2) if len(parts) > 1 and parts[1] else None,
                    "driver": parts[2] if len(parts) > 2 else None,
                    "provider": "cuda",
                }
        except Exception:
            pass
    return {
        "platform": platform.platform(),
        "python": sys.version.split()[0],
        "cpu_cores_logical": os.cpu_count(),
        "memory_gb": _detect_total_memory_gb(),
        "gpu": gpu,
    }


def detect_backends(depth_model: Path | None, depth_openvino: Path | None, depth_anything_root: Path | None, depth_anything_checkpoint: Path | None, backend_command: str) -> dict:
    return {
        "colmap": bool(shutil.which("colmap")),
        "onnxruntime": _module_exists("onnxruntime"),
        "openvino": _module_exists("openvino"),
        "depth_model_path_exists": bool(depth_model and depth_model.is_file()),
        "depth_openvino_path_exists": bool(depth_openvino and depth_openvino.is_file()),
        "torch": bool(depth_anything_root and depth_anything_checkpoint and _module_exists("torch")),
        "depth_anything_root_exists": bool(depth_anything_root and (depth_anything_root / "depth_anything_v2" / "dpt.py").is_file()),
        "depth_anything_checkpoint_exists": bool(depth_anything_checkpoint and depth_anything_checkpoint.is_file()),
        "backend_command_configured": bool(backend_command),
    }


def _module_exists(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False


def classify_input(checks: list[dict]) -> str:
    if len(checks) == 1 and checks[0]["equirectangular_2to1"]:
        return "single_360_panorama"
    if len(checks) > 1 and all(x["equirectangular_2to1"] for x in checks):
        return "multi_360_panorama"
    if len(checks) == 1:
        return "single_image"
    return "multi_image"


def load_benchmark_history(root: Path) -> list[dict]:
    path = root / BENCHMARK_DIRNAME / BENCHMARK_FILENAME
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def save_benchmark(root: Path, entry: dict) -> None:
    path = root / BENCHMARK_DIRNAME / BENCHMARK_FILENAME
    rows = load_benchmark_history(root)
    rows.append(entry)
    rows = rows[-250:]
    _json_dump(path, rows)


def estimate_eta_seconds(preference: str, source_count: int, views: int, synthetic_per_view: int, width: int, height: int, hardware: dict, history: list[dict]) -> tuple[int, int, dict]:
    total_frames = max(1, source_count * views * (1 + synthetic_per_view))
    pixels_factor = max(0.25, (width * height) / float(512 * 512))
    cpu_cores = max(1, int(hardware.get("cpu_cores_logical") or 1))
    cpu_factor = min(3.0, 0.65 + math.log2(cpu_cores + 1) / 2.8)
    gpu = hardware.get("gpu", {})
    gpu_factor = 2.5 if gpu.get("available") else 1.0

    if preference == "accurate":
        base = 420.0 + total_frames * 10.0 * pixels_factor
        speed = cpu_factor * gpu_factor
    elif preference == "preview_then_refine":
        base = 120.0 + total_frames * 3.5 * pixels_factor
        speed = cpu_factor * max(1.0, gpu_factor)
    else:
        base = 35.0 + total_frames * 1.5 * pixels_factor
        speed = cpu_factor

    est = base / max(speed, 0.3)
    bucket = {
        "preference": preference,
        "has_gpu": bool(gpu.get("available")),
        "source_count": source_count,
    }
    samples = [x for x in history if x.get("preference") == bucket["preference"] and bool(x.get("has_gpu")) == bucket["has_gpu"] and int(x.get("source_count", -1)) == bucket["source_count"]]
    sample_count = len(samples)
    if sample_count:
        avg = sum(float(x.get("elapsed_seconds", est)) for x in samples) / sample_count
        est = est * 0.55 + avg * 0.45
    lo = max(15, int(est * 0.7))
    hi = max(lo + 10, int(est * 1.45))
    meta = {"history_matches": sample_count, "frames": total_frames, "pixels_factor": round(pixels_factor, 3)}
    return lo, hi, meta


def human_eta(seconds: int) -> str:
    if seconds < 90:
        return f"~{seconds} sec"
    minutes = seconds / 60.0
    if minutes < 90:
        return f"~{round(minutes)} min"
    hours = minutes / 60.0
    return f"~{hours:.1f} h"


def select_plan(preference: str, input_kind: str, hardware: dict, backends: dict) -> dict:
    gpu = hardware.get("gpu", {})
    has_gpu = bool(gpu.get("available"))
    configured_backend = bool(backends.get("backend_command_configured"))
    rationale: list[str] = []

    if preference == "auto":
        if input_kind == "multi_360_panorama" and (has_gpu or configured_backend):
            selected = "accurate"
            rationale.append("multiple panoramas + GPU/backend detected -> accurate path")
        elif input_kind == "single_360_panorama" and has_gpu and configured_backend:
            selected = "preview_then_refine"
            rationale.append("single panorama + GPU/backend detected -> preview then refine")
        else:
            selected = "approximate"
            rationale.append("fallback to fast style-first for CPU-first practicality")
    else:
        selected = preference
        rationale.append(f"user selected {preference}")

    mode = {
        "approximate": "STYLE_FIRST_360",
        "accurate": "QUALITY_360",
        "preview_then_refine": "PREVIEW_THEN_REFINE_360",
    }[selected]

    use_backend_now = configured_backend and selected in {"accurate", "preview_then_refine"}
    if selected == "accurate" and not configured_backend:
        rationale.append("backend not configured -> prepare accurate-ready dataset but keep truthful preview")
    if selected == "accurate" and not has_gpu:
        rationale.append("no GPU -> best-effort CPU path will be slower")
    if selected == "approximate":
        rationale.append("prioritise style/speed over metric accuracy")

    return {
        "requested_preference": preference,
        "selected_preference": selected,
        "mode": mode,
        "run_backend_now": use_backend_now,
        "rationale": rationale,
    }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Smart 360 panorama -> GS pipeline")
    p.add_argument("--input", nargs="+", required=True, help="One or more panorama images")
    p.add_argument("--output", required=True)
    p.add_argument("--preference", choices=["auto", "accurate", "approximate", "preview_then_refine"], default="auto")
    p.add_argument("--mode", choices=["auto", "style", "quality"], default=None, help="legacy alias")
    p.add_argument("--views", type=int, default=12)
    p.add_argument("--width", type=int, default=512)
    p.add_argument("--height", type=int, default=512)
    p.add_argument("--fov", type=float, default=92.0)
    p.add_argument("--synthetic-per-view", type=int, default=1, choices=[0, 1, 2])
    p.add_argument("--baseline", type=float, default=0.022)
    p.add_argument("--seed-points", type=int, default=18000)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--depth-model", default=os.getenv("GS360_DEPTH_ONNX", ""))
    p.add_argument("--depth-openvino", default=os.getenv("GS360_DEPTH_OPENVINO", ""))
    p.add_argument("--depth-anything-root", default=os.getenv("GS360_DEPTH_ANYTHING_ROOT", ""))
    p.add_argument("--depth-anything-checkpoint", default=os.getenv("GS360_DEPTH_ANYTHING_CHECKPOINT", ""))
    p.add_argument("--backend-command", default=os.getenv("GS360_TRAIN_CMD", ""))
    p.add_argument("--pose-estimation", choices=["auto", "off", "colmap"], default="auto")
    p.add_argument("--strict-panorama", action="store_true")
    p.add_argument("--inspect-only", action="store_true")
    p.add_argument("--benchmark-root", default=os.getenv("GS360_BENCHMARK_ROOT", str(Path(__file__).resolve().parent / "data")))
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    started = time.time()
    raw_argv = list(argv) if argv is not None else list(sys.argv[1:])
    views_explicit = "--views" in raw_argv
    synthetic_explicit = "--synthetic-per-view" in raw_argv
    args = parse_args(argv)
    if args.mode and args.preference == "auto":
        args.preference = {"style": "approximate", "quality": "accurate", "auto": "auto"}[args.mode]

    inputs = [Path(x).expanduser().resolve() for x in args.input]
    missing = [str(p) for p in inputs if not p.is_file()]
    if missing:
        print(json.dumps({"pass": False, "error": "input_missing", "files": missing}, ensure_ascii=False), file=sys.stderr)
        return 2
    if args.views < 4 or args.views > 64:
        print("--views must be between 4 and 64", file=sys.stderr)
        return 2
    if args.width < 64 or args.height < 64 or args.width > 4096 or args.height > 4096:
        print("invalid output dimensions", file=sys.stderr)
        return 2

    checks = [validate_panorama(p) for p in inputs]
    if args.strict_panorama and not all(x["equirectangular_2to1"] for x in checks):
        print(json.dumps({"pass": False, "error": "not_2to1_panorama", "inputs": checks}, ensure_ascii=False), file=sys.stderr)
        return 3

    out = Path(args.output).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    dataset = out / "dataset"
    views_dir = dataset / "views"
    depth_dir = dataset / "depth"
    game_dir = out / "game"
    for d in (views_dir, depth_dir, game_dir):
        d.mkdir(parents=True, exist_ok=True)

    depth_model = Path(args.depth_model).expanduser().resolve() if args.depth_model else None
    depth_openvino = Path(args.depth_openvino).expanduser().resolve() if args.depth_openvino else None
    depth_anything_root = Path(args.depth_anything_root).expanduser().resolve() if args.depth_anything_root else None
    depth_anything_checkpoint = Path(args.depth_anything_checkpoint).expanduser().resolve() if args.depth_anything_checkpoint else None
    hardware = detect_hardware()
    backends = detect_backends(depth_model, depth_openvino, depth_anything_root, depth_anything_checkpoint, args.backend_command)
    input_kind = classify_input(checks)
    benchmark_root = Path(args.benchmark_root).expanduser().resolve()
    bench_history = load_benchmark_history(benchmark_root)
    plan = select_plan(args.preference, input_kind, hardware, backends)
    # Adaptive defaults: preserve explicit user values, otherwise spend more work only where it can improve quality.
    has_gpu = bool(hardware.get("gpu", {}).get("available"))
    if not views_explicit:
        if plan["selected_preference"] == "accurate":
            args.views = 20 if has_gpu else 16
        elif plan["selected_preference"] == "preview_then_refine":
            args.views = 16 if has_gpu else 12
        else:
            args.views = 12
    if not synthetic_explicit:
        args.synthetic_per_view = 2 if (has_gpu and plan["selected_preference"] == "accurate") else 1
    eta_lo, eta_hi, eta_meta = estimate_eta_seconds(plan["selected_preference"], len(inputs), args.views, args.synthetic_per_view, args.width, args.height, hardware, bench_history)

    inspect = {
        "pass": True,
        "version": VERSION,
        "input_kind": input_kind,
        "hardware": hardware,
        "backends": backends,
        "plan": plan,
        "estimated_time_seconds": {"min": eta_lo, "max": eta_hi},
        "estimated_time_human": f"{human_eta(eta_lo)} – {human_eta(eta_hi)}",
        "estimator_meta": eta_meta,
        "benchmark_root": str(benchmark_root),
        "adaptive_defaults": {"views": args.views, "synthetic_per_view": args.synthetic_per_view, "views_explicit": views_explicit, "synthetic_explicit": synthetic_explicit},
    }
    if args.inspect_only:
        print(json.dumps(inspect, indent=2, ensure_ascii=False))
        return 0

    depth_kind_global = "proxy"
    depth_error = None
    openvino_ok = bool(depth_openvino and depth_openvino.is_file() and backends.get("openvino"))
    depth_anything_ok = bool(depth_anything_root and depth_anything_checkpoint and backends.get("torch") and backends.get("depth_anything_root_exists") and backends.get("depth_anything_checkpoint_exists"))
    onnx_ok = bool(depth_model and depth_model.is_file() and backends.get("onnxruntime"))

    frames: list[Frame] = []
    yaws = [i * 360.0 / args.views for i in range(args.views)]
    pitches = [0.0 if i % 4 not in (1, 3) else (18.0 if i % 4 == 1 else -18.0) for i in range(args.views)]

    for src_i, src_path in enumerate(inputs):
        pano = load_rgb(src_path)
        for view_i, (yaw, pitch) in enumerate(zip(yaws, pitches)):
            rgb = perspective_from_equirect(pano, yaw, pitch, args.fov, args.width, args.height)
            base_name = f"p{src_i:02d}_v{view_i:03d}"
            base_rel = f"views/{base_name}.png"
            save_rgb(dataset / base_rel, rgb)

            depth_kind = "proxy"
            if openvino_ok:
                try:
                    depth, confidence = openvino_depth(np.asarray(rgb, np.uint8), depth_openvino)  # type: ignore[arg-type]
                    depth_kind = "openvino_monocular"
                    depth_kind_global = "openvino_monocular"
                except Exception as exc:
                    depth_error = f"OpenVINO {type(exc).__name__}: {exc}"
                    openvino_ok = False
                    if depth_anything_ok:
                        try:
                            depth, confidence = depth_anything_v2_small_depth(np.asarray(rgb, np.uint8), depth_anything_root, depth_anything_checkpoint)  # type: ignore[arg-type]
                            depth_kind = "depth_anything_v2_small_cpu"
                            depth_kind_global = "depth_anything_v2_small_cpu"
                        except Exception as exc2:
                            depth_error += f"; DepthAnythingV2 {type(exc2).__name__}: {exc2}"
                            depth_anything_ok = False
                            if onnx_ok:
                                try:
                                    depth, confidence = onnx_depth(np.asarray(rgb, np.uint8), depth_model)  # type: ignore[arg-type]
                                    depth_kind = "onnx_monocular"
                                    depth_kind_global = "onnx_monocular"
                                except Exception as exc3:
                                    depth, confidence = proxy_depth(np.asarray(rgb, np.uint8))
                                    depth_error += f"; ONNX {type(exc3).__name__}: {exc3}"
                                    onnx_ok = False
                            else:
                                depth, confidence = proxy_depth(np.asarray(rgb, np.uint8))
                    elif onnx_ok:
                        try:
                            depth, confidence = onnx_depth(np.asarray(rgb, np.uint8), depth_model)  # type: ignore[arg-type]
                            depth_kind = "onnx_monocular"
                            depth_kind_global = "onnx_monocular"
                        except Exception as exc2:
                            depth, confidence = proxy_depth(np.asarray(rgb, np.uint8))
                            depth_error += f"; ONNX {type(exc2).__name__}: {exc2}"
                            onnx_ok = False
                    else:
                        depth, confidence = proxy_depth(np.asarray(rgb, np.uint8))
            elif depth_anything_ok:
                try:
                    depth, confidence = depth_anything_v2_small_depth(np.asarray(rgb, np.uint8), depth_anything_root, depth_anything_checkpoint)  # type: ignore[arg-type]
                    depth_kind = "depth_anything_v2_small_cpu"
                    depth_kind_global = "depth_anything_v2_small_cpu"
                except Exception as exc:
                    depth_error = f"DepthAnythingV2 {type(exc).__name__}: {exc}"
                    depth_anything_ok = False
                    if onnx_ok:
                        try:
                            depth, confidence = onnx_depth(np.asarray(rgb, np.uint8), depth_model)  # type: ignore[arg-type]
                            depth_kind = "onnx_monocular"
                            depth_kind_global = "onnx_monocular"
                        except Exception as exc2:
                            depth, confidence = proxy_depth(np.asarray(rgb, np.uint8))
                            depth_error += f"; ONNX {type(exc2).__name__}: {exc2}"
                            onnx_ok = False
                    else:
                        depth, confidence = proxy_depth(np.asarray(rgb, np.uint8))
            elif onnx_ok:
                try:
                    depth, confidence = onnx_depth(np.asarray(rgb, np.uint8), depth_model)  # type: ignore[arg-type]
                    depth_kind = "onnx_monocular"
                    depth_kind_global = "onnx_monocular"
                except Exception as exc:
                    depth, confidence = proxy_depth(np.asarray(rgb, np.uint8))
                    depth_error = f"ONNX {type(exc).__name__}: {exc}"
                    onnx_ok = False
            else:
                depth, confidence = proxy_depth(np.asarray(rgb, np.uint8))

            depth_preview = (_clamp((depth - depth.min()) / max(float(depth.max() - depth.min()), 1e-6), 0, 1) * 255).astype(np.uint8)
            Image.fromarray(depth_preview, "L").save(depth_dir / f"{base_name}.png", optimize=True)

            src_x = (src_i - (len(inputs) - 1) / 2.0) * 0.12
            position = (src_x, 0.0, 0.0)
            frames.append(Frame(base_rel, yaw, pitch, position, src_i, False, depth_kind))

            offsets = []
            if args.synthetic_per_view >= 1:
                offsets.append((args.baseline, 0.0))
            if args.synthetic_per_view >= 2:
                offsets.append((-args.baseline, args.baseline * 0.35))
            for syn_i, (dx, dy) in enumerate(offsets):
                syn = synthesize_parallax(np.asarray(rgb, np.uint8), depth, dx, dy)
                syn_name = f"{base_name}_s{syn_i}"
                syn_rel = f"views/{syn_name}.png"
                save_rgb(dataset / syn_rel, syn)
                local_right = np.array([math.cos(math.radians(yaw)), 0.0, -math.sin(math.radians(yaw))])
                pos = np.asarray(position) + local_right * (0.035 if dx >= 0 else -0.035)
                frames.append(Frame(syn_rel, yaw, pitch, tuple(float(x) for x in pos), src_i, True, depth_kind))

    camera_angle_x = math.radians(args.fov)
    transforms = {
        "camera_model": "PINHOLE",
        "camera_angle_x": camera_angle_x,
        "w": args.width,
        "h": args.height,
        "coordinate_convention": "gs360_internal_right_handed",
        "poses_are_metric": False,
        "frames": [
            {
                "file_path": f.file_path,
                "transform_matrix": camera_transform(f.yaw, f.pitch, f.position),
                "source_panorama": f.source_index,
                "synthetic": f.synthetic,
                "depth_kind": f.depth_kind,
                "yaw_deg": f.yaw,
                "pitch_deg": f.pitch,
            }
            for f in frames
        ],
    }
    _json_dump(dataset / "transforms.json", transforms)

    first_pano = load_rgb(inputs[0])
    seed_path = game_dir / "seed_gaussians.ply"
    seed_count = create_gaussian_seed(first_pano, seed_path, args.seed_points, args.seed)

    pose_result = {"available": bool(shutil.which("colmap")), "attempted": False, "pass": False}
    should_colmap = args.pose_estimation == "colmap" or (args.pose_estimation == "auto" and len(inputs) > 1 and shutil.which("colmap"))
    if should_colmap:
        pose_result = try_colmap(views_dir, out / "pose_estimation")

    execution_plan = {
        **inspect,
        "artifacts": {
            "dataset": str(dataset),
            "transforms": str(dataset / "transforms.json"),
            "gaussian_seed": str(seed_path),
        },
    }
    _json_dump(out / "GS360_EXECUTION_PLAN.json", execution_plan)

    manifest_path = out / "GS360_MANIFEST.json"
    manifest = {
        "schema": "world-server.gs360/v3",
        "version": VERSION,
        "pass": True,
        "input_kind": input_kind,
        "mode": plan["mode"],
        "requested_preference": args.preference,
        "selected_preference": plan["selected_preference"],
        "inputs": checks,
        "source_panorama_count": len(inputs),
        "base_views_per_panorama": args.views,
        "synthetic_per_base_view": args.synthetic_per_view,
        "total_frames": len(frames),
        "hardware": hardware,
        "backends": backends,
        "estimated_time_seconds": {"min": eta_lo, "max": eta_hi},
        "estimated_time_human": f"{human_eta(eta_lo)} – {human_eta(eta_hi)}",
        "depth": {
            "kind": depth_kind_global,
            "model": str(depth_openvino) if depth_kind_global == "openvino_monocular" and depth_openvino else (str(depth_anything_checkpoint) if depth_kind_global == "depth_anything_v2_small_cpu" and depth_anything_checkpoint else (str(depth_model) if depth_model else None)),
            "provider": "openvino_cpu" if depth_kind_global == "openvino_monocular" else ("depth_anything_v2_small_cpu" if depth_kind_global == "depth_anything_v2_small_cpu" else ("onnxruntime_cpu" if depth_kind_global == "onnx_monocular" else "proxy_cpu")),
            "fallback_used": depth_kind_global == "proxy",
            "warning": "Proxy depth is non-metric and intended only for STYLE_FIRST visual parallax." if depth_kind_global == "proxy" else None,
            "last_model_error": depth_error,
        },
        "pose_estimation": pose_result,
        "artifacts": {
            "dataset": str(dataset),
            "transforms": str(dataset / "transforms.json"),
            "gaussian_seed": str(seed_path),
            "gaussian_seed_points": seed_count,
        },
        "quality_contract": {
            "trained_3dgs": False,
            "style_preservation_target": True,
            "metric_geometry_claimed": False,
            "requires_backend_for_trained_3dgs": True,
            "status_label": "Preview" if plan["selected_preference"] != "accurate" else "Accurate-ready preview",
        },
        "backend": {"configured": bool(args.backend_command), "ran": False, "pass": None},
        "plan": plan,
    }
    _json_dump(manifest_path, manifest)

    backend_result = None
    if plan["run_backend_now"] and args.backend_command:
        trained_dir = out / "trained"
        trained_dir.mkdir(parents=True, exist_ok=True)
        backend_result = run_shell_hook(args.backend_command, input_dir=dataset, output_dir=trained_dir, manifest=manifest_path, cwd=out)
        manifest["backend"] = {"configured": True, "ran": True, **backend_result}
        manifest["quality_contract"]["trained_3dgs"] = bool(backend_result["pass"])
        manifest["quality_contract"]["status_label"] = "True trained 3DGS" if backend_result["pass"] else manifest["quality_contract"]["status_label"]
        _json_dump(manifest_path, manifest)

    game_manifest = {
        "schema": "world-server.game-gs360/v2",
        "mode": plan["mode"],
        "entry": "seed_gaussians.ply" if not (backend_result and backend_result["pass"]) else "../trained",
        "lod": [
            {"distance": 0, "fraction": 1.0},
            {"distance": 12, "fraction": 0.55},
            {"distance": 28, "fraction": 0.25},
            {"distance": 60, "fraction": 0.10},
        ],
        "runtime_notes": "Use trained backend output when available; seed_gaussians.ply is a truthful preview/fallback.",
        "quick_preview_first": plan["selected_preference"] in {"approximate", "preview_then_refine"},
    }
    _json_dump(game_dir / "scene.gs360.json", game_manifest)

    elapsed = round(time.time() - started, 3)
    save_benchmark(benchmark_root, {
        "timestamp": int(time.time()),
        "preference": plan["selected_preference"],
        "has_gpu": bool(hardware.get("gpu", {}).get("available")),
        "source_count": len(inputs),
        "elapsed_seconds": elapsed,
        "width": args.width,
        "height": args.height,
        "views": args.views,
    })

    print(json.dumps({
        "pass": True,
        "mode": plan["mode"],
        "selected_preference": plan["selected_preference"],
        "frames": len(frames),
        "depth": depth_kind_global,
        "estimated_time_human": manifest["estimated_time_human"],
        "trained_3dgs": manifest["quality_contract"]["trained_3dgs"],
        "manifest": str(manifest_path),
        "game": str(game_dir),
    }, ensure_ascii=False))
    return 0 if not backend_result or backend_result["pass"] else 10


if __name__ == "__main__":
    raise SystemExit(main())
