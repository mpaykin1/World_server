from __future__ import annotations

import io
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageSequence

VIDEO_SUFFIXES = {".mp4", ".webm", ".mov", ".m4v"}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def _clip(value: float) -> float:
    return float(max(0.0, min(1.0, value)))


def _palette(image: Image.Image, colors: int = 8) -> list[str]:
    pal = image.convert("P", palette=Image.Palette.ADAPTIVE, colors=colors)
    counts = sorted(pal.getcolors() or [], reverse=True)
    raw = pal.getpalette() or []
    out = []
    for _, index in counts[:colors]:
        offset = index * 3
        if offset + 2 >= len(raw):
            continue
        r, g, b = raw[offset:offset + 3]
        out.append(f"#{r:02x}{g:02x}{b:02x}")
    return out


def _frame_metrics(image: Image.Image) -> dict:
    source_width, source_height = image.size
    rgb = image.convert("RGB")
    rgb.thumbnail((160, 160), Image.Resampling.BILINEAR)
    arr = np.asarray(rgb, dtype=np.float32) / 255.0
    lum = arr[..., 0] * 0.2126 + arr[..., 1] * 0.7152 + arr[..., 2] * 0.0722
    dx = np.abs(lum[:, 1:] - lum[:, :-1])
    dy = np.abs(lum[1:, :] - lum[:-1, :])
    edge = float(((dx > 0.08).mean() + (dy > 0.08).mean()) * 0.5)
    mx, mn = arr.max(axis=2), arr.min(axis=2)
    sat = float(np.mean(mx - mn))
    dark = float(np.mean(lum < 0.25))
    bright = float(np.mean(lum > 0.82))
    warm = float(np.mean((arr[..., 0] > arr[..., 2] + 0.08) & (arr[..., 0] > arr[..., 1] - 0.03)))
    flat_x = float(np.mean(np.max(np.abs(arr[:, 1:] - arr[:, :-1]), axis=2) < 0.01))
    flat_y = float(np.mean(np.max(np.abs(arr[1:] - arr[:-1]), axis=2) < 0.01))
    blockiness = (flat_x + flat_y) * 0.5
    unique_colors = int(len(np.unique((arr * 31).astype(np.uint8).reshape(-1, 3), axis=0)))
    pixel_conf = _clip((blockiness - 0.55) * 1.4 + max(0, 96 - unique_colors) / 160)
    green_ratio = float(np.mean((arr[..., 1] > 0.47) & (arr[..., 0] < 0.40) & (arr[..., 2] < 0.40)))
    gray_ratio = float(np.mean(np.abs(arr[..., 0] - arr[..., 1]) < 0.04))
    aspect = source_width / max(1, source_height)
    if pixel_conf > 0.58 and max(source_width, source_height) > 256:
        semantic_class = "voxel"
    elif green_ratio > 0.30 and edge < 0.16:
        semantic_class = "landscape"
    elif green_ratio > 0.15 and aspect > 1.2:
        semantic_class = "terrain"
    elif gray_ratio > 0.34 and contrast > 0.40:
        semantic_class = "city"
    elif aspect < 0.85:
        semantic_class = "building"
    elif edge > 0.22:
        semantic_class = "street"
    else:
        semantic_class = "single_object"
    contrast = _clip(float(np.std(lum)) * 3.0)
    fog = _clip((1.0 - contrast) * (1.0 - sat * 0.8))
    emissive = _clip(bright * (1.0 + dark * 3.0) * 3.0)
    tags = []
    if dark > 0.42:
        tags.append("dark")
    if warm > 0.38:
        tags.append("warm")
    if fog > 0.58:
        tags.append("fog")
    if edge > 0.16:
        tags.append("high-edge-density")
    if sat < 0.18:
        tags.append("low-saturation")
    styles = ["voxel"] if semantic_class == "voxel" else (["pixel-art"] if pixel_conf > 0.58 else [])
    return {
        "style": styles,
        "tags": tags,
        "objects": [semantic_class],
        "palette": _palette(rgb),
        "dimension": "2d" if pixel_conf > 0.72 else None,
        "lighting": {"contrast": round(contrast, 4), "fog": round(fog, 4), "emissive": round(emissive, 4)},
        "metrics": {
            "brightness": round(float(np.mean(lum)), 4),
            "saturation": round(sat, 4),
            "edgeDensity": round(edge, 4),
            "darkRatio": round(dark, 4),
            "warmRatio": round(warm, 4),
            "blockiness": round(blockiness, 4),
            "pixelArtConfidence": round(pixel_conf, 4),
            "semanticClass": semantic_class,
        },
    }


def _image_frames(path: Path, max_frames: int) -> tuple[list[Image.Image], dict]:
    with Image.open(path) as src:
        total = int(getattr(src, "n_frames", 1) or 1)
        indexes = np.linspace(0, total - 1, min(max_frames, total), dtype=int)
        wanted = set(int(x) for x in indexes)
        frames = [frame.convert("RGB").copy() for i, frame in enumerate(ImageSequence.Iterator(src)) if i in wanted]
        return frames, {"durationSeconds": None, "decoder": "pillow", "sourceFrames": total}


def _probe_duration(path: Path) -> float:
    probe = shutil.which("ffprobe")
    if not probe:
        raise RuntimeError("ffprobe is required for video reference analysis")
    cp = subprocess.run([probe, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
                        capture_output=True, text=True, timeout=20, check=True)
    return max(0.01, float(cp.stdout.strip()))


def _video_frames(path: Path, max_frames: int) -> tuple[list[Image.Image], dict]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required for video reference analysis")
    duration = _probe_duration(path)
    times = np.linspace(duration * 0.05, duration * 0.95, max_frames)
    frames = []
    for stamp in times:
        cp = subprocess.run([ffmpeg, "-loglevel", "error", "-ss", f"{stamp:.4f}", "-i", str(path), "-frames:v", "1",
                             "-f", "image2pipe", "-vcodec", "png", "pipe:1"], capture_output=True, timeout=30, check=True)
        with Image.open(io.BytesIO(cp.stdout)) as frame:
            frames.append(frame.convert("RGB").copy())
    return frames, {"durationSeconds": round(duration, 4), "decoder": "ffmpeg", "sourceFrames": None}


def _motion_amount(frames: list[Image.Image]) -> float:
    if len(frames) < 2:
        return 0.0
    values = []
    previous = None
    for frame in frames:
        gray = frame.convert("L").resize((96, 96), Image.Resampling.BILINEAR)
        arr = np.asarray(gray, dtype=np.float32) / 255.0
        if previous is not None:
            values.append(float(np.mean(np.abs(arr - previous))))
        previous = arr
    return round(_clip(float(np.mean(values)) * 3.0), 4)


def _normalized_reference(metrics: list[dict], source_type: str, motion: float) -> dict:
    frames = []
    for item in metrics:
        frames.append({
            "style": item["style"], "tags": item["tags"], "objects": item["objects"], "palette": item["palette"],
            "dimension": item["dimension"], "lighting": item["lighting"], "motion": {"amount": motion},
        })
    return {"sourceType": source_type, "frameCount": len(frames), "frames": frames, "motion": {"amount": motion}}


class ReferenceMediaAnalyzer:
    def available(self) -> bool:
        return True

    def status(self) -> dict:
        return {"available": True, "ffmpeg": bool(shutil.which("ffmpeg")), "ffprobe": bool(shutil.which("ffprobe"))}

    def run(self, input_path: Path, output_path: Path, params: dict | None = None, progress=None) -> Path:
        params = params or {}
        max_frames = max(1, min(int(params.get("maxFrames", 8)), 12))
        suffix = input_path.suffix.lower()
        if progress:
            progress(12, "Reference analyzer: sampling media")
        if suffix in VIDEO_SUFFIXES:
            frames, meta = _video_frames(input_path, max_frames)
            source_type = "video"
        elif suffix in IMAGE_SUFFIXES:
            frames, meta = _image_frames(input_path, max_frames)
            source_type = "image" if len(frames) == 1 else "animation"
        else:
            raise ValueError(f"Unsupported reference media suffix: {suffix}")
        if not frames:
            raise RuntimeError("Reference analyzer decoded zero frames")
        metrics = [_frame_metrics(frame) for frame in frames]
        motion = _motion_amount(frames)
        result = {
            "schemaVersion": "1.0.0", "sourceType": source_type, "sampledFrames": len(frames),
            "motionAmount": motion, "decoder": meta["decoder"], "durationSeconds": meta["durationSeconds"],
            "frames": metrics, "normalizedReference": _normalized_reference(metrics, source_type, motion),
        }
        output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        if progress:
            progress(96, "Reference analyzer: visual grammar evidence ready")
        return output_path


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output", nargs="?", default="reference-analysis.json")
    parser.add_argument("--max-frames", type=int, default=8)
    args = parser.parse_args()
    ReferenceMediaAnalyzer().run(Path(args.input), Path(args.output), {"maxFrames": args.max_frames})
    print(Path(args.output).read_text(encoding="utf-8"))
