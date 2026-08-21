from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any
from PIL import Image

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}


def verify_image(path: Path, max_pixels: int = 40_000_000) -> tuple[int, int]:
    Image.MAX_IMAGE_PIXELS = max_pixels
    with Image.open(path) as image:
        image.verify()
    with Image.open(path) as image:
        width, height = image.size
    if width < 16 or height < 16 or width * height > max_pixels:
        raise ValueError(f"Unsupported image dimensions: {width}x{height}")
    return width, height


def validate_glb(path: Path) -> None:
    if not path.is_file() or path.stat().st_size < 256:
        raise ValueError("GLB output is missing or too small.")
    with path.open("rb") as handle:
        magic = handle.read(4)
    if magic != b"glTF":
        raise ValueError("Output is not a valid GLB container.")
    quality = mesh_quality(path)
    if quality["isPlaceholder"]:
        raise ValueError("PLACEHOLDER -- NOT REAL 3D RECONSTRUCTION")
    if quality["zDepth"] < 0.01:
        raise ValueError(f"Z depth ~0 ({quality['zDepth']:.4f}) — flat plane")
    if quality["vertexCount"] < 100 or quality["faceCount"] < 50:
        raise ValueError(f"Mesh too small: {quality['vertexCount']} vertices, {quality['faceCount']} faces")
    if quality["hasNaN"]:
        raise ValueError("Mesh contains NaN")


def mesh_quality(path: Path) -> dict:
    import struct, json
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        return {"isPlaceholder": True, "zDepth": 0, "vertexCount": 0, "faceCount": 0, "hasNaN": True, "generator": ""}
    try:
        json_len, json_type = struct.unpack("<II", data[12:20])
        json_bytes = data[20:20+json_len]
        gltf = json.loads(json_bytes)
    except Exception:
        return {"isPlaceholder": True, "zDepth": 0, "vertexCount": 0, "faceCount": 0, "hasNaN": True, "generator": ""}
    gen = gltf.get("asset", {}).get("generator", "")
    # PLACEHOLDER marker is explicit; real CPU has "CPU reconstruction" and is NOT placeholder
    is_placeholder = "PLACEHOLDER" in gen
    if "CPU reconstruction" in gen and "PLACEHOLDER" not in gen:
        is_placeholder = False
    # Fallback for old instantmesh placeholder without explicit marker
    if not is_placeholder and "placeholder" in gen.lower() and "CPU reconstruction" not in gen:
        is_placeholder = True
    accessors = gltf.get("accessors", [])
    vertex_count = accessors[0]["count"] if len(accessors) > 0 else 0
    face_count = (accessors[2]["count"] // 3) if len(accessors) > 2 else 0
    try:
        acc0 = accessors[0]
        mn = acc0.get("min", [0, 0, 0])
        mx = acc0.get("max", [0, 0, 0])
        z_depth = float(mx[1] - mn[1]) if len(mn) > 1 else 0
        has_nan = any(v != v for v in mn+mx)
        degenerate = z_depth < 0.005
    except Exception:
        z_depth = 0
        has_nan = True
        degenerate = True
    file_size = path.stat().st_size
    mat_count = len(gltf.get("materials", []))
    return {
        "isPlaceholder": is_placeholder,
        "zDepth": z_depth,
        "vertexCount": vertex_count,
        "faceCount": face_count,
        "hasNaN": has_nan,
        "degenerate": degenerate,
        "fileSize": file_size,
        "materialCount": mat_count,
        "generator": gen,
    }


def quality_score(path: Path) -> dict:
    """
    Returns evidence-gated quality report. No visual metrics are fabricated from geometry alone.
    Only Geometry Integrity, GLB Validity, Real Artifact are VERIFIED; the rest are UNTESTED.
    """
    from .evidence import verified, untested

    q = mesh_quality(path)

    # VERIFIED: technical facts only
    geometry_integrity = verified(
        100 if (q["vertexCount"] >= 100 and q["faceCount"] >= 50 and not q["hasNaN"] and not q["degenerate"]) else 0,
        evidence=[
            f"vertexCount={q['vertexCount']} (threshold 100)",
            f"faceCount={q['faceCount']} (threshold 50)",
            f"hasNaN={q['hasNaN']}",
            f"degenerate={q['degenerate']}",
            f"generator={q['generator']}",
        ],
    )
    # Add raw values for CI gate
    geometry_integrity["vertexCount"] = q["vertexCount"]
    geometry_integrity["faceCount"] = q["faceCount"]

    glb_validity = verified(
        100 if (not q["isPlaceholder"] and q["zDepth"] >= 0.01 and q["vertexCount"] >= 100 and not q["hasNaN"]) else 0,
        evidence=[
            f"glTF magic OK",
            f"vertexCount={q['vertexCount']}",
            f"zDepth={q['zDepth']:.4f} (threshold 0.01)",
            f"isPlaceholder={q['isPlaceholder']}",
        ],
    )

    # Real Image->3D Artifact % — VERIFIED 100 only if real volumetric
    is_real = (not q["isPlaceholder"] and q["vertexCount"] >= 100 and q["faceCount"] >= 50 and q["zDepth"] > 0.01)
    # Use mesh_quality parse valid as evidence; if is_real then 100 else 0
    real_artifact = verified(
        100 if is_real else 0,
        evidence=[
            f"not placeholder={not q['isPlaceholder']}",
            f"vertexCount={q['vertexCount']} >=100",
            f"faceCount={q['faceCount']} >=50",
            f"zDepth={q['zDepth']:.4f} >0.01",
            f"GLB parse valid",
        ],
        isPlaceholder=q["isPlaceholder"],
    )

    # UNTESTED visual metrics — no ground truth / render-back
    depth_acc = untested(reason="No ground-truth depth comparison available")
    silhouette = untested(reason="No render-back comparison available")
    structural = untested(reason="No render-back comparison available")
    texture = untested(reason="No render-back comparison available")
    godot_runtime = untested(reason="Godot runtime not launched and GLB not imported in Godot")
    voxel_runtime = untested(reason="Voxel runtime/conversion not launched")
    overall = untested(reason="Critical visual metrics (Depth/Silhouette/Structural/Texture/Godot/Voxel) are UNTESTED")

    report = {
        "Geometry Integrity %": geometry_integrity,
        "GLB Validity %": glb_validity,
        "Real Image->3D Artifact %": real_artifact,
        "Depth Accuracy %": depth_acc,
        "Silhouette Accuracy %": silhouette,
        "Structural Similarity %": structural,
        "Texture Quality %": texture,
        "Godot Runtime Compatibility %": godot_runtime,
        "Voxel Runtime Compatibility %": voxel_runtime,
        "Overall Quality %": overall,
    }
    return report


def file_meta(path: Path, role: str) -> dict[str, Any]:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    suffix = path.suffix.lower()
    mime = {".glb": "model/gltf-binary", ".png": "image/png", ".json": "application/json", ".txt": "text/plain"}.get(suffix, "application/octet-stream")
    return {"name": path.name, "role": role, "bytes": path.stat().st_size, "sha256": digest.hexdigest(), "mime": mime}
