#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Export ABot-Recon world_points.pt + colors.pt as binary PLY")
    p.add_argument("input_dir", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--confidence-threshold", type=float, default=0.0)
    p.add_argument("--max-points", type=int, default=2_000_000)
    return p.parse_args()


def _as_numpy(value) -> np.ndarray:
    if hasattr(value, "detach"):
        value = value.detach().cpu().numpy()
    return np.asarray(value)


def main() -> None:
    args = parse_args()
    points_path = args.input_dir / "world_points.pt"
    colors_path = args.input_dir / "colors.pt"
    if not points_path.is_file() or not colors_path.is_file():
        raise SystemExit("ABot-Recon world_points.pt/colors.pt are required for PLY export")

    points = _as_numpy(torch.load(points_path, map_location="cpu", weights_only=True)).reshape(-1, 3)
    colors = _as_numpy(torch.load(colors_path, map_location="cpu", weights_only=True)).reshape(-1, 3)
    count = min(len(points), len(colors))
    points, colors = points[:count], colors[:count]

    mask = np.isfinite(points).all(axis=1)
    confidence_path = args.input_dir / "confidence.pt"
    if confidence_path.is_file() and args.confidence_threshold > 0:
        confidence = _as_numpy(torch.load(confidence_path, map_location="cpu", weights_only=True)).reshape(-1)
        if len(confidence) >= count:
            mask &= confidence[:count] >= float(args.confidence_threshold)

    points, colors = points[mask], colors[mask]
    if len(points) == 0:
        raise SystemExit("ABot-Recon produced no finite points after filtering")

    max_points = max(10_000, int(args.max_points))
    if len(points) > max_points:
        take = np.linspace(0, len(points) - 1, max_points, dtype=np.int64)
        points, colors = points[take], colors[take]

    if colors.dtype != np.uint8:
        if np.issubdtype(colors.dtype, np.floating) and float(np.nanmax(colors)) <= 1.0:
            colors = colors * 255.0
        colors = np.clip(colors, 0, 255).astype(np.uint8)

    vertex = np.empty(
        len(points),
        dtype=np.dtype([
            ("x", "<f4"), ("y", "<f4"), ("z", "<f4"),
            ("red", "u1"), ("green", "u1"), ("blue", "u1"),
        ]),
    )
    vertex["x"], vertex["y"], vertex["z"] = points[:, 0], points[:, 1], points[:, 2]
    vertex["red"], vertex["green"], vertex["blue"] = colors[:, 0], colors[:, 1], colors[:, 2]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {len(vertex)}\n"
        "property float x\nproperty float y\nproperty float z\n"
        "property uchar red\nproperty uchar green\nproperty uchar blue\n"
        "end_header\n"
    ).encode("ascii")
    with args.output.open("wb") as handle:
        handle.write(header)
        vertex.tofile(handle)
    print(f"Exported {len(vertex)} points to {args.output}")


if __name__ == "__main__":
    main()
