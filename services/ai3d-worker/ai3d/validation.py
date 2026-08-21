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


def file_meta(path: Path, role: str) -> dict[str, Any]:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    suffix = path.suffix.lower()
    mime = {".glb": "model/gltf-binary", ".png": "image/png", ".json": "application/json", ".txt": "text/plain"}.get(suffix, "application/octet-stream")
    return {"name": path.name, "role": role, "bytes": path.stat().st_size, "sha256": digest.hexdigest(), "mime": mime}
