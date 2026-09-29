from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Build honest DreamFog layered-depth assets from one reference image using the existing Depth Anything V2 plugin.")
    p.add_argument("--input", required=True, help="Reference image")
    p.add_argument("--repo", default=".", help="World_server repository root")
    p.add_argument("--layers", type=int, default=8, help="Depth bands, 5..12")
    p.add_argument("--depth-size", type=int, default=518)
    p.add_argument("--output", default="apps/dreamfog-world/assets/generated")
    return p.parse_args()


def rgb_hex(v: np.ndarray) -> str:
    q = np.clip(np.rint(v), 0, 255).astype(np.uint8).tolist()
    return "#%02x%02x%02x" % tuple(q)


def main() -> int:
    a = parse_args()
    repo = Path(a.repo).expanduser().resolve()
    src = Path(a.input).expanduser().resolve()
    if not src.is_file():
        raise SystemExit(f"Input image not found: {src}")
    worker = repo / "services" / "ai3d-worker"
    sys.path.insert(0, str(worker))
    try:
        from ai3d.plugins.depth_anything import DepthAnythingEngine
    except Exception as exc:
        raise SystemExit(f"Cannot import existing Depth Anything plugin: {exc}. Run worker bootstrap first.")

    engine = DepthAnythingEngine()
    if not engine.available():
        raise SystemExit(
            "Depth Anything V2 source is not configured. Clone Depth-Anything-V2 and set DEPTH_ANYTHING_HOME. "
            "DreamFog refuses to label a grayscale fallback as AI depth."
        )

    out = repo / a.output
    out.mkdir(parents=True, exist_ok=True)
    depth_path = out / "depth.png"
    engine.run(src, depth_path, max(256, min(int(a.depth_size), 1024)))

    image = Image.open(src).convert("RGB")
    depth_img = Image.open(depth_path).convert("L").resize(image.size, Image.Resampling.BILINEAR)
    rgb = np.asarray(image, dtype=np.uint8)
    dep = np.asarray(depth_img, dtype=np.float32) / 255.0
    n_layers = max(5, min(int(a.layers), 12))
    qs = np.quantile(dep, np.linspace(0.0, 1.0, n_layers + 1))
    layers = []
    for i in range(n_layers):
        lo, hi = float(qs[i]), float(qs[i + 1])
        if i == n_layers - 1:
            mask = (dep >= lo) & (dep <= hi)
        else:
            mask = (dep >= lo) & (dep < hi)
        alpha = Image.fromarray((mask.astype(np.uint8) * 255), mode="L").filter(ImageFilter.GaussianBlur(radius=1.6))
        rgba = image.convert("RGBA")
        rgba.putalpha(alpha)
        name = f"layer_{i:02d}.png"
        rgba.save(out / name, optimize=True)
        pixels = rgb[mask]
        mean = pixels.mean(axis=0) if pixels.size else rgb.reshape(-1, 3).mean(axis=0)
        layers.append({
            "index": i,
            "file": name,
            "depthMin": round(lo, 5),
            "depthMax": round(hi, 5),
            "pixelFraction": round(float(mask.mean()), 5),
            "averageColor": rgb_hex(mean),
        })

    overall = rgb.reshape(-1, 3).mean(axis=0)
    upper = rgb[: max(1, rgb.shape[0] // 2)].reshape(-1, 3).mean(axis=0)
    lower = rgb[rgb.shape[0] // 2 :].reshape(-1, 3).mean(axis=0)
    creature = np.clip(overall * 0.33, 8, 105)
    glow = np.clip(overall * 1.35 + np.array([12, 8, 16]), 0, 255)
    source_hash = hashlib.sha256(src.read_bytes()).hexdigest()
    seed = int(source_hash[:8], 16)
    ext = src.suffix.lower() if src.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"} else ".png"
    ref_name = "reference" + ext
    shutil.copy2(src, out / ref_name)

    manifest = {
        "contract": "DREAMFOG_LAYERED_DEPTH_V2",
        "seed": seed,
        "sourceSha256": source_hash,
        "source": ref_name,
        "width": image.width,
        "height": image.height,
        "depthEngine": "depth_anything_v2_small",
        "depthClaim": "MONOCULAR_INFERRED_RELATIVE",
        "depthSemantics": "Normalized model-relative depth. Layer order is preserved without claiming metric distance.",
        "layerCount": n_layers,
        "layers": layers,
        "theme": {
            "fog": rgb_hex(overall * 0.88),
            "sky": rgb_hex(upper),
            "water": rgb_hex(lower * 0.58),
            "creature": rgb_hex(creature),
            "glow": rgb_hex(glow),
        },
    }
    (out / "dreamfog-scene.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status": "PASS", "output": str(out), "manifest": str(out / "dreamfog-scene.json"), "layers": n_layers, "depthEngine": manifest["depthEngine"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
