from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(float(value), high))


def compare_animation_sets(hq_dir: Path, lod_dir: Path, compare_pair, thresholds: dict) -> dict:
    hq_dir = Path(hq_dir)
    lod_dir = Path(lod_dir)
    frames = []
    for hq in sorted(hq_dir.glob("*.png")):
        lod = lod_dir / hq.name
        if not lod.is_file():
            continue
        row = compare_pair(hq, lod)
        row["sample"] = hq.stem
        frames.append(row)
    if not frames:
        return {"status": "SKIPPED_NO_ANIMATION", "passed": True, "samples": []}
    min_sil = min(x["silhouetteIoU"] for x in frames)
    avg_vis = sum(x["visualSimilarity"] for x in frames) / len(frames)
    passed = min_sil >= float(thresholds.get("silhouetteIoU", 0.965)) and avg_vis >= float(thresholds.get("visualSimilarity", 0.88))
    return {
        "status": "PASSED" if passed else "FAILED",
        "passed": bool(passed),
        "minSilhouetteIoU": round(min_sil, 6),
        "avgVisualSimilarity": round(avg_vis, 6),
        "thresholds": thresholds,
        "samples": frames,
    }


def stitch_impostor_atlas(source_dir: Path, output_path: Path, cell_size: int = 512) -> dict:
    source_dir = Path(source_dir)
    files = sorted(source_dir.glob("*.png"))
    if not files:
        return {"status": "SKIPPED", "reason": "no impostor renders"}
    cell_size = max(128, min(int(cell_size), 2048))
    cols = 4
    rows = int(math.ceil(len(files) / cols))
    atlas = Image.new("RGBA", (cols * cell_size, rows * cell_size), (0, 0, 0, 0))
    cells = []
    for index, path in enumerate(files):
        with Image.open(path).convert("RGBA") as image:
            image.thumbnail((cell_size, cell_size), Image.Resampling.LANCZOS)
            x = (index % cols) * cell_size + (cell_size - image.width) // 2
            y = (index // cols) * cell_size + (cell_size - image.height) // 2
            atlas.alpha_composite(image, (x, y))
            cells.append({"name": path.stem, "index": index, "x": x, "y": y, "width": image.width, "height": image.height})
    output_path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output_path, optimize=True)
    manifest = output_path.with_suffix(".json")
    manifest.write_text(json.dumps({"schemaVersion": 1, "atlas": output_path.name, "cellSize": cell_size, "columns": cols, "rows": rows, "cells": cells}, indent=2), encoding="utf-8")
    return {"status": "CREATED", "atlas": output_path.name, "manifest": manifest.name, "views": len(files)}


def reconstruct_detail_maps(normal_path: Path, ao_path: Path | None, output_dir: Path) -> dict:
    normal_path = Path(normal_path)
    if not normal_path.is_file():
        return {"status": "SKIPPED", "reason": "normal bake missing"}
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(normal_path).convert("RGB") as image:
        n = np.asarray(image, dtype=np.float32) / 255.0 * 2.0 - 1.0
    nx, ny, nz = n[..., 0], n[..., 1], np.clip(n[..., 2], 0.08, 1.0)
    gx = -nx / nz
    gy = -ny / nz

    h, w = gx.shape
    fx = np.fft.fftfreq(w)[None, :] * (2.0 * np.pi)
    fy = np.fft.fftfreq(h)[:, None] * (2.0 * np.pi)
    denom = fx * fx + fy * fy
    denom[0, 0] = 1.0
    div_hat = 1j * fx * np.fft.fft2(gx) + 1j * fy * np.fft.fft2(gy)
    height = np.real(np.fft.ifft2(-div_hat / denom))
    height -= float(height.min())
    peak = float(height.max())
    if peak > 1e-8:
        height /= peak
    curvature = np.sqrt(np.gradient(gx, axis=1) ** 2 + np.gradient(gy, axis=0) ** 2)
    p99 = float(np.percentile(curvature, 99.0)) if curvature.size else 1.0
    curvature = np.clip(curvature / max(p99, 1e-8), 0.0, 1.0)

    height_path = output_dir / "HEIGHT_RECONSTRUCTED.png"
    curvature_path = output_dir / "CURVATURE.png"
    Image.fromarray(np.round(height * 255).astype(np.uint8), mode="L").save(height_path, optimize=True)
    Image.fromarray(np.round(curvature * 255).astype(np.uint8), mode="L").save(curvature_path, optimize=True)

    orm_path = None
    if ao_path and Path(ao_path).is_file():
        with Image.open(ao_path).convert("L") as ao_img:
            ao = np.asarray(ao_img.resize((w, h), Image.Resampling.LANCZOS), dtype=np.uint8)
        orm = np.zeros((h, w, 3), dtype=np.uint8)
        orm[..., 0] = ao
        orm[..., 1] = 128
        orm[..., 2] = 0
        orm_path = output_dir / "ORM_BASE.png"
        Image.fromarray(orm, mode="RGB").save(orm_path, optimize=True)

    return {
        "status": "CREATED",
        "normal": normal_path.name,
        "ao": Path(ao_path).name if ao_path and Path(ao_path).is_file() else None,
        "height": height_path.name,
        "heightMethod": "Poisson reconstruction from HQ-to-LOD tangent-space normal bake",
        "curvature": curvature_path.name,
        "ormBase": orm_path.name if orm_path else None,
    }


def _normal_safe_resize(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    rgb = np.asarray(image.convert("RGB").resize(size, Image.Resampling.LANCZOS), dtype=np.float32) / 255.0 * 2.0 - 1.0
    length = np.linalg.norm(rgb, axis=2, keepdims=True)
    rgb = rgb / np.maximum(length, 1e-6)
    rgb = np.clip((rgb * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(rgb, mode="RGB")


def enhance_texture_file(source: Path, destination: Path, role: str, target_min: int = 2048) -> dict:
    source = Path(source)
    destination = Path(destination)
    with Image.open(source) as raw:
        image = raw.copy()
    max_dim = max(image.size)
    scale = 1
    while max_dim * scale < target_min and scale < 4:
        scale *= 2
    size = (image.width * scale, image.height * scale)
    if role == "normal":
        enhanced = _normal_safe_resize(image, size)
    else:
        enhanced = image.resize(size, Image.Resampling.LANCZOS)
        if role in {"albedo", "emissive", "generic"}:
            enhanced = enhanced.filter(ImageFilter.UnsharpMask(radius=1.2, percent=110, threshold=3))
    destination.parent.mkdir(parents=True, exist_ok=True)
    enhanced.save(destination, optimize=True)
    return {"source": source.name, "output": destination.name, "role": role, "scale": scale, "backend": "channel-aware-lanczos"}


def try_ai_texture_enhancement(source: Path, destination: Path, role: str, target_min: int = 2048) -> dict:
    # Prefer an explicitly provisioned Real-ESRGAN executable. Never silently download models at runtime.
    exe = os.environ.get("REALESRGAN_BIN") or shutil.which("realesrgan-ncnn-vulkan")
    if exe and role in {"albedo", "emissive", "generic"}:
        destination.parent.mkdir(parents=True, exist_ok=True)
        cmd = [exe, "-i", str(source), "-o", str(destination), "-s", "2"]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=600, check=False)
        if proc.returncode == 0 and destination.is_file():
            return {"source": Path(source).name, "output": destination.name, "role": role, "scale": 2, "backend": "realesrgan-ncnn-vulkan"}
    return enhance_texture_file(source, destination, role, target_min=target_min)



def glb_extensions(path: Path) -> set[str]:
    import struct
    path = Path(path)
    if not path.is_file():
        return set()
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        return set()
    try:
        json_len, json_type = struct.unpack("<II", data[12:20])
        if json_type != 0x4E4F534A:
            return set()
        doc = json.loads(data[20:20 + json_len].decode("utf-8"))
        return set(doc.get("extensionsUsed") or []) | set(doc.get("extensionsRequired") or [])
    except Exception:
        return set()

def static_performance_gate(manifest: dict, policy: dict) -> dict:
    source = manifest.get("sourceStats") or {}
    lods = manifest.get("lodStats") or []
    lod0 = lods[0] if lods else {}
    collision = manifest.get("collisionStats") or {}
    src_tri = int(source.get("triangles", 0) or 0)
    lod_tri = int(lod0.get("triangles", 0) or 0)
    source_mats = int(source.get("materials", 0) or 0)
    lod_mats = int(lod0.get("materials", 0) or 0)
    collision_tri = int(collision.get("triangles", 0) or 0)
    reduction = 0.0 if src_tri <= 0 else (1.0 - lod_tri / src_tri)
    max_collision_ratio = float(policy.get("maxCollisionTriangleRatio", 0.12))
    material_growth = lod_mats - source_mats
    source_draw = int(source.get("drawCallEstimate", 0) or 0)
    lod_draw = int(lod0.get("drawCallEstimate", 0) or 0)
    checks = {
        "lod0DoesNotExceedSourceTriangles": lod_tri <= src_tri or src_tri == 0,
        "materialCountDoesNotExplode": material_growth <= max(4, int(source_mats * 0.15)),
        "collisionBudget": collision_tri <= max(2000, int(src_tri * max_collision_ratio)) if src_tri else True,
        "hasProgressiveLods": len(lods) >= 4 and all(int(lods[i].get("triangles", 0) or 0) >= int(lods[i + 1].get("triangles", 0) or 0) for i in range(len(lods) - 1)),
        "drawCallsDoNotIncrease": lod_draw <= max(source_draw, 1) + max(2, int(source_draw * 0.10)),
    }
    passed = all(checks.values())
    return {
        "passed": passed,
        "status": "PASSED" if passed else "FAILED",
        "checks": checks,
        "metrics": {
            "sourceTriangles": src_tri,
            "lod0Triangles": lod_tri,
            "lod0ReductionPercent": round(reduction * 100.0, 2),
            "sourceMaterials": source_mats,
            "lod0Materials": lod_mats,
            "collisionTriangles": collision_tri,
            "sourceDrawCallEstimate": source_draw,
            "lod0DrawCallEstimate": lod_draw,
            "lod0EstimatedGeometryBytes": int(lod0.get("estimatedGeometryBytes", 0) or 0),
            "lod0TexturePixels": int(lod0.get("texturePixels", 0) or 0),
        },
        "note": "Static production gate. Engine-native GPU/FPS/VRAM telemetry remains a separate runtime gate.",
    }
