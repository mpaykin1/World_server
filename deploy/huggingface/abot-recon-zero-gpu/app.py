from __future__ import annotations

import hmac
import json
import os
import shutil
import tempfile
import urllib.request
import uuid
import zipfile
from pathlib import Path

# ZeroGPU requires spaces to be imported before torch/CUDA-touching modules.
import spaces

UPSTREAM_COMMIT = "7a10be152d0478265270f46c637f9de963e7a60e"
UPSTREAM_DIR = Path(tempfile.gettempdir()) / f"ABot-Recon-{UPSTREAM_COMMIT[:12]}"


def ensure_upstream() -> Path:
    marker = UPSTREAM_DIR / "abot_recon" / "__init__.py"
    if marker.is_file():
        return UPSTREAM_DIR
    archive = Path(tempfile.gettempdir()) / f"abot-recon-{UPSTREAM_COMMIT[:12]}.zip"
    url = f"https://codeload.github.com/amap-cvlab/ABot-Recon/zip/{UPSTREAM_COMMIT}"
    urllib.request.urlretrieve(url, archive)
    with zipfile.ZipFile(archive) as zf:
        zf.extractall(archive.parent)
    extracted = archive.parent / f"ABot-Recon-{UPSTREAM_COMMIT}"
    if not extracted.is_dir():
        raise RuntimeError("Could not materialize pinned ABot-Recon source.")
    if UPSTREAM_DIR.exists():
        shutil.rmtree(UPSTREAM_DIR)
    extracted.rename(UPSTREAM_DIR)
    archive.unlink(missing_ok=True)
    return UPSTREAM_DIR


import sys

sys.path.insert(0, str(ensure_upstream()))

import cv2
import gradio as gr
import numpy as np
import torch
from PIL import Image

from abot_recon import ABotRecon
from abot_recon.preprocessing import preprocess_image

MODEL_ID = "acvlab/ABot-Recon"
MAX_FRAMES = 200
MAX_DENSE_FRAMES = 50
MAX_POINTS = 2_000_000
WORKER_SECRET = os.environ.get("ABOT_WORKER_SECRET", "")

model = ABotRecon.from_pretrained(
    MODEL_ID,
    device="cuda",
    attention_backend="sdpa",
    max_frames=MAX_FRAMES,
    loop_closure=False,
)


def extract_frames(video_path: Path, interval: int, max_frames: int) -> list[Path]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError("Could not open video.")
    out = Path(tempfile.mkdtemp(prefix="abot_frames_"))
    frames: list[Path] = []
    index = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if index % interval == 0:
                path = out / f"{len(frames):06d}.jpg"
                cv2.imwrite(str(path), frame, [cv2.IMWRITE_JPEG_QUALITY, 94])
                frames.append(path)
                if len(frames) >= max_frames:
                    break
            index += 1
    finally:
        cap.release()
    if len(frames) < 2:
        shutil.rmtree(out, ignore_errors=True)
        raise ValueError("Video needs at least two usable sampled frames.")
    return frames


def dense_indices(count: int) -> list[int]:
    if count <= MAX_DENSE_FRAMES:
        return list(range(count))
    return sorted(set(np.linspace(0, count - 1, MAX_DENSE_FRAMES).round().astype(int).tolist()))


def colors_for(frames: list[Path], indices: list[int]) -> torch.Tensor:
    colors = []
    for index in indices:
        with Image.open(frames[index]) as image:
            tensor, _ = preprocess_image(image)
        colors.append((tensor.clamp(0, 1) * 255).round().to(torch.uint8).permute(1, 2, 0))
    return torch.stack(colors)


def build_cloud(result, colors: torch.Tensor, indices: list[int], threshold: float, depth_max: float):
    local = result.local_points.detach().float().cpu()
    confidence = result.confidence.detach().float().cpu()
    rgb = colors.detach().cpu()
    poses = result.camera_poses.detach().float().cpu().numpy()
    points_out, colors_out = [], []
    for pos, frame_index in enumerate(indices):
        pts = local[pos].numpy().reshape(-1, 3)
        conf = confidence[pos].numpy().reshape(-1)
        col = rgb[pos].numpy().reshape(-1, 3)
        count = min(len(pts), len(conf), len(col))
        pts, conf, col = pts[:count], conf[:count], col[:count]
        valid = (
            np.isfinite(pts).all(axis=1)
            & np.isfinite(conf)
            & (pts[:, 2] > 1e-4)
            & (pts[:, 2] <= depth_max)
            & (conf >= threshold)
        )
        selected = pts[valid].astype(np.float64, copy=False)
        if not len(selected):
            continue
        pose = poses[frame_index]
        world = selected @ pose[:3, :3].T + pose[:3, 3]
        finite = np.isfinite(world).all(axis=1)
        points_out.append(world[finite].astype(np.float32))
        colors_out.append(col[valid][finite].astype(np.uint8))
    if not points_out:
        raise ValueError("No valid 3D points after confidence/depth filtering.")
    points = np.concatenate(points_out)
    colors_np = np.concatenate(colors_out)
    if len(points) > MAX_POINTS:
        keep = np.linspace(0, len(points) - 1, MAX_POINTS, dtype=np.int64)
        points, colors_np = points[keep], colors_np[keep]
    return points, colors_np


def write_ply(path: Path, points: np.ndarray, colors: np.ndarray) -> None:
    dtype = np.dtype([
        ("x", "<f4"), ("y", "<f4"), ("z", "<f4"),
        ("red", "u1"), ("green", "u1"), ("blue", "u1"),
    ])
    data = np.empty(len(points), dtype=dtype)
    data["x"], data["y"], data["z"] = points[:, 0], points[:, 1], points[:, 2]
    data["red"], data["green"], data["blue"] = colors[:, 0], colors[:, 1], colors[:, 2]
    header = (
        "ply\nformat binary_little_endian 1.0\n"
        f"element vertex {len(data)}\n"
        "property float x\nproperty float y\nproperty float z\n"
        "property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n"
    ).encode("ascii")
    with path.open("wb") as handle:
        handle.write(header)
        data.tofile(handle)


@spaces.GPU(duration=120)
def reconstruct_api(
    api_secret: str,
    video: str,
    frame_interval: int = 5,
    max_frames: int = 200,
    confidence_threshold: float = 0.1,
    point_depth_max: float = 40.0,
):
    if not WORKER_SECRET or not hmac.compare_digest(str(api_secret or ""), WORKER_SECRET):
        raise gr.Error("Unauthorized worker request.")
    if not video:
        raise gr.Error("Video is required.")

    interval = max(1, min(int(frame_interval), 30))
    frame_cap = max(12, min(int(max_frames), MAX_FRAMES))
    threshold = max(0.0, min(float(confidence_threshold), 1.0))
    depth_max = max(5.0, min(float(point_depth_max), 200.0))
    frame_paths = extract_frames(Path(video), interval, frame_cap)
    work = Path(tempfile.mkdtemp(prefix="abot_result_"))
    try:
        dense = dense_indices(len(frame_paths))
        result = model.infer(
            frame_paths,
            output_local_points=True,
            output_world_points=False,
            output_confidence=True,
            confidence_threshold=threshold,
            loop_closure=False,
            dense_output_indices=dense,
        )
        if result.local_points is None or result.confidence is None:
            raise gr.Error("ABot-Recon returned no dense reconstruction.")
        points, rgb = build_cloud(result, colors_for(frame_paths, dense), dense, threshold, depth_max)

        ply = work / "reconstruction.ply"
        poses = work / "camera_poses.npy"
        relative = work / "relative_poses.npy"
        metadata = work / "metadata.json"
        archive = work / "abot_recon_result.zip"
        write_ply(ply, points, rgb)
        np.save(poses, result.camera_poses.detach().float().cpu().numpy())
        np.save(relative, result.relative_poses.detach().float().cpu().numpy())
        metadata.write_text(json.dumps({
            "engine": "ABot-Recon",
            "upstreamCommit": UPSTREAM_COMMIT,
            "framesProcessed": len(frame_paths),
            "denseFrames": len(dense),
            "points": int(len(points)),
            "frameInterval": interval,
            "confidenceThreshold": threshold,
            "pointDepthMax": depth_max,
            "loopClosure": False,
            "codeLicense": "Apache-2.0",
            "officialWeightsLicense": "CC BY-NC 4.0",
        }, indent=2) + "\n", encoding="utf-8")
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for item in (ply, poses, relative, metadata):
                zf.write(item, arcname=item.name)
        stable = Path(tempfile.gettempdir()) / "abot_recon_outputs" / uuid.uuid4().hex
        stable.mkdir(parents=True, exist_ok=True)
        target = stable / archive.name
        shutil.copy2(archive, target)
        return str(target), {
            "frames": len(frame_paths),
            "points": int(len(points)),
            "denseFrames": len(dense),
        }
    finally:
        shutil.rmtree(frame_paths[0].parent, ignore_errors=True)
        shutil.rmtree(work, ignore_errors=True)


with gr.Blocks(title="World Server ABot-Recon ZeroGPU Worker") as demo:
    gr.Markdown("# World Server · ABot-Recon ZeroGPU worker\nSecret-protected RGB video → 3D reconstruction.")
    secret = gr.Textbox(label="Worker secret", type="password")
    video = gr.File(label="RGB video", type="filepath", file_types=["video"])
    with gr.Row():
        interval = gr.Slider(1, 30, value=5, step=1, label="Frame interval")
        frame_cap = gr.Slider(12, 200, value=200, step=1, label="Max frames")
    with gr.Row():
        confidence = gr.Slider(0, 1, value=0.1, step=0.05, label="Confidence threshold")
        depth = gr.Slider(5, 200, value=40, step=5, label="Max point depth")
    run = gr.Button("Reconstruct", variant="primary")
    output = gr.File(label="Result ZIP")
    summary = gr.JSON(label="Summary")
    run.click(
        fn=reconstruct_api,
        inputs=[secret, video, interval, frame_cap, confidence, depth],
        outputs=[output, summary],
        api_name="reconstruct_api",
        api_visibility="public",
    )

demo.launch(allowed_paths=[str(Path(tempfile.gettempdir()) / "abot_recon_outputs")])
