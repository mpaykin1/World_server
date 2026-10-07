from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

from .reference_media import _frame_metrics


def _border_rgb(arr: np.ndarray) -> np.ndarray:
    border = np.concatenate((arr[0], arr[-1], arr[:, 0], arr[:, -1]), axis=0)
    return np.median(border[:, :3], axis=0)


def _foreground_mask(image: Image.Image) -> np.ndarray:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.float32)
    bg = _border_rgb(rgba)
    delta = np.linalg.norm(rgba[..., :3] - bg[None, None, :], axis=2) / 441.7
    mask = (delta > 0.075) & (rgba[..., 3] > 20)
    coverage = float(mask.mean())
    if coverage < 0.01 or coverage > 0.92:
        alpha = rgba[..., 3] > 20
        if 0.01 <= float(alpha.mean()) <= 0.92:
            mask = alpha
    return mask


def _bbox(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        h, w = mask.shape
        return 0, 0, w, h
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _fit_reference(image: Image.Image, mask: np.ndarray, width: int, height: int, colors: int) -> Image.Image:
    x0, y0, x1, y1 = _bbox(mask)
    crop = image.convert("RGBA").crop((x0, y0, x1, y1))
    ratio = min((width - 4) / max(1, crop.width), (height - 4) / max(1, crop.height))
    size = (max(1, round(crop.width * ratio)), max(1, round(crop.height * ratio)))
    resized = crop.resize(size, Image.Resampling.NEAREST)
    alpha = resized.getchannel("A")
    quant = resized.convert("RGB").convert("P", palette=Image.Palette.ADAPTIVE, colors=colors).convert("RGBA")
    quant.putalpha(alpha)
    frame = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    frame.alpha_composite(quant, ((width - size[0]) // 2, height - size[1] - 2))
    return frame


def _dilate(mask: np.ndarray) -> np.ndarray:
    out = mask.copy()
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)):
        out |= np.roll(np.roll(mask, dy, axis=0), dx, axis=1)
    return out


def _outline(frame: Image.Image) -> Image.Image:
    arr = np.asarray(frame, dtype=np.uint8).copy()
    mask = arr[..., 3] > 20
    edge = _dilate(mask) & ~mask
    if mask.any():
        rgb = arr[..., :3][mask]
        tone = np.percentile(rgb, 18, axis=0).astype(np.uint8)
    else:
        tone = np.array([24, 24, 28], dtype=np.uint8)
    arr[edge, :3] = tone
    arr[edge, 3] = 255
    return Image.fromarray(arr, mode="RGBA")


def _variant_color(frame: Image.Image, digest: bytes, strength: float) -> Image.Image:
    arr = np.asarray(frame, dtype=np.float32).copy()
    factors = np.array([digest[0], digest[1], digest[2]], dtype=np.float32) / 255.0
    factors = 1.0 + (factors - 0.5) * strength * 2.0
    mask = arr[..., 3] > 20
    arr[..., :3][mask] = np.clip(arr[..., :3][mask] * factors, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), mode="RGBA")


def _animated_frame(base: Image.Image, index: int) -> Image.Image:
    width, height = base.size
    bob = (0, -1, 0, 0)[index % 4]
    leg_shift = (0, -1, 0, 1)[index % 4]
    frame = Image.new("RGBA", base.size, (0, 0, 0, 0))
    frame.alpha_composite(base, (0, bob))
    split = int(height * 0.68)
    lower = frame.crop((0, split, width, height))
    blank = Image.new("RGBA", (width, height - split), (0, 0, 0, 0))
    blank.alpha_composite(lower, (leg_shift, 0))
    frame.paste((0, 0, 0, 0), (0, split, width, height))
    frame.alpha_composite(blank, (0, split))
    return frame


class ReferenceSpriteSynthesizer:
    def available(self) -> bool:
        return True

    def status(self) -> dict:
        return {"available": True, "engine": "reference-derived-cpu-sprite-v1", "frames": 4}

    def run(self, input_path: Path, output_dir: Path, params: dict | None = None, progress=None) -> tuple[Path, Path]:
        params = params or {}
        width = max(16, min(int(params.get("frameWidth", 32)), 128))
        height = max(16, min(int(params.get("frameHeight", 48)), 160))
        colors = max(4, min(int(params.get("paletteColors", 12)), 32))
        strength = max(0.0, min(float(params.get("variationStrength", 0.06)), 0.25))
        if progress:
            progress(18, "Reference sprite: segmenting foreground")
        source = Image.open(input_path).convert("RGBA")
        mask = _foreground_mask(source)
        base = _fit_reference(source, mask, width, height, colors)
        digest = hashlib.sha256(input_path.read_bytes()).digest()
        base = _outline(_variant_color(base, digest, strength))
        frames = [_animated_frame(base, i) for i in range(4)]
        atlas = Image.new("RGBA", (width * 4, height), (0, 0, 0, 0))
        for i, frame in enumerate(frames):
            atlas.alpha_composite(frame, (i * width, 0))
        output_dir.mkdir(parents=True, exist_ok=True)
        atlas_path = output_dir / "reference-sprite-atlas.png"
        manifest_path = output_dir / "reference-sprite-manifest.json"
        atlas.save(atlas_path, optimize=True)
        evidence = _frame_metrics(source)
        manifest = {
            "schemaVersion": "1.0.0", "generator": "reference-derived-cpu-sprite-v1",
            "frameWidth": width, "frameHeight": height, "frames": 4, "fps": int(params.get("fps", 6)),
            "paletteColors": colors, "variationStrength": strength, "derivedFromReference": True,
            "pixelExactCopy": False, "animation": ["idle", "walk-a", "idle-b", "walk-b"],
            "styleEvidence": evidence,
        }
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        if progress:
            progress(96, "Reference sprite atlas ready")
        return atlas_path, manifest_path


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output_dir")
    parser.add_argument("--width", type=int, default=32)
    parser.add_argument("--height", type=int, default=48)
    args = parser.parse_args()
    paths = ReferenceSpriteSynthesizer().run(Path(args.input), Path(args.output_dir), {"frameWidth": args.width, "frameHeight": args.height})
    print(json.dumps([str(x) for x in paths]))
