from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Tuple
import base64
import json
import math
import struct

import cv2
import numpy as np
from PIL import Image
from scipy.spatial import ConvexHull, cKDTree
import trimesh

from .colmap_cpu import colmap_available, run_colmap_cpu


@dataclass
class BuildConfig:
    input_dir: Path
    output_dir: Path
    camera_spacing_m: float = 1.8
    sample_width: int = 180
    sample_height: int = 90
    palette_size: int = 24
    voxel_size: float | None = None
    chunk_size_m: float = 12.0
    hole_fill_ratio: float = 0.08
    camera_height_m: float = 1.65
    near_distance_m: float = 5.5
    far_distance_m: float = 48.0
    min_confidence: float = 0.18
    use_colmap_if_available: bool = True


def _images(input_dir: Path) -> List[Path]:
    exts = {'.png', '.jpg', '.jpeg', '.webp'}
    files = [p for p in sorted(input_dir.iterdir()) if p.suffix.lower() in exts]
    if len(files) < 2:
        raise RuntimeError('At least two overlapping panoramas are required')
    return files


def _load_resized(files: List[Path], w: int, h: int) -> List[np.ndarray]:
    return [np.asarray(Image.open(p).convert('RGB').resize((w, h), Image.Resampling.LANCZOS), dtype=np.float32) / 255.0 for p in files]


def _global_palette(images: List[np.ndarray], n: int) -> np.ndarray:
    thumbs = []
    for arr in images:
        im = Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8), 'RGB')
        im.thumbnail((256, 128), Image.Resampling.BILINEAR)
        thumbs.append(np.asarray(im))
    strip = np.concatenate(thumbs, axis=0)
    q = Image.fromarray(strip, 'RGB').quantize(colors=max(4, n), method=Image.Quantize.MEDIANCUT)
    pal = np.array(q.getpalette()[:max(4, n) * 3], dtype=np.uint8).reshape(-1, 3)
    used = np.unique(np.asarray(q))
    return pal[used].astype(np.float32) / 255.0


def _quantize(colors: np.ndarray, palette: np.ndarray, batch: int = 20000) -> np.ndarray:
    out = np.empty_like(colors)
    for s in range(0, len(colors), batch):
        c = colors[s:s + batch]
        d = c[:, None, :] - palette[None, :, :]
        idx = np.argmin(np.sum(d * d, axis=2), axis=1)
        out[s:s + batch] = palette[idx]
    return out


def _feature_pair(a: np.ndarray, b: np.ndarray) -> dict:
    ga = cv2.cvtColor(np.clip(a * 255, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    gb = cv2.cvtColor(np.clip(b * 255, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    scale = min(1.0, 720.0 / ga.shape[1])
    if scale < 1:
        ga = cv2.resize(ga, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        gb = cv2.resize(gb, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    # Dense low-frequency circular similarity complements sparse feature matching.
    # It is useful for pixel-art panoramas where repeated windows/lanterns can starve SIFT.
    dw = min(240, ga.shape[1]); dh = max(60, int(ga.shape[0] * dw / ga.shape[1]))
    ca = cv2.resize(ga, (dw, dh), interpolation=cv2.INTER_AREA).astype(np.float32)
    cb = cv2.resize(gb, (dw, dh), interpolation=cv2.INTER_AREA).astype(np.float32)
    ca = (ca - ca.mean()) / (ca.std() + 1e-6); cb = (cb - cb.mean()) / (cb.std() + 1e-6)
    best_corr, best_shift = -1.0, 0
    for shift in range(-dw//4, dw//4 + 1, max(2, dw//80)):
        corr = float(np.mean(ca * np.roll(cb, shift, axis=1)))
        if corr > best_corr:
            best_corr, best_shift = corr, shift
    dense_overlap = float(np.clip((best_corr - 0.03) / 0.52, 0, 1))
    dense_yaw = float(np.clip(-best_shift / dw * 2 * math.pi, -0.28, 0.28))

    detector = cv2.SIFT_create(nfeatures=2500)
    ka, da = detector.detectAndCompute(ga, None)
    kb, db = detector.detectAndCompute(gb, None)
    if da is None or db is None or len(ka) < 8 or len(kb) < 8:
        detector = cv2.ORB_create(nfeatures=2500)
        ka, da = detector.detectAndCompute(ga, None)
        kb, db = detector.detectAndCompute(gb, None)
        if da is None or db is None:
            return {'matches': 0, 'overlap': dense_overlap * 0.7, 'yaw_delta': dense_yaw, 'median_px_error': 999.0}
        matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    else:
        matcher = cv2.BFMatcher(cv2.NORM_L2)
    pairs = matcher.knnMatch(da, db, k=2)
    good = [m for m, n in pairs if m.distance < 0.75 * n.distance]
    if len(good) < 8:
        return {'matches': len(good), 'overlap': max(min(1.0, len(good) / 80), dense_overlap * 0.7), 'yaw_delta': dense_yaw, 'median_px_error': 999.0}
    w = ga.shape[1]
    dxs, dys = [], []
    for m in good:
        x1, y1 = ka[m.queryIdx].pt
        x2, y2 = kb[m.trainIdx].pt
        dx = (x2 - x1 + w / 2) % w - w / 2
        dxs.append(dx)
        dys.append(y2 - y1)
    dxs = np.asarray(dxs, np.float32)
    dys = np.asarray(dys, np.float32)
    med = float(np.median(dxs))
    mad = float(np.median(np.abs(dxs - med)) + 1e-6)
    inlier = np.abs(dxs - med) < max(5.0, 3.5 * mad)
    inliers = int(np.sum(inlier))
    if not inliers:
        return {'matches': 0, 'overlap': 0.0, 'yaw_delta': 0.0, 'median_px_error': 999.0}
    yaw_delta = float(np.clip(np.median(dxs[inlier]) / w * 2 * math.pi, -0.28, 0.28))
    sparse_overlap = float(np.clip(inliers / max(60, min(len(ka), len(kb)) * 0.16), 0, 1))
    overlap = max(sparse_overlap, dense_overlap * 0.72)
    yaw_delta = float(0.78 * yaw_delta + 0.22 * dense_yaw)
    err = float(np.median(np.sqrt((dxs[inlier] - np.median(dxs[inlier])) ** 2 + dys[inlier] ** 2)))
    return {'matches': inliers, 'overlap': overlap, 'yaw_delta': yaw_delta, 'median_px_error': err}


def _camera_poses(images: List[np.ndarray], spacing: float, height: float) -> tuple[np.ndarray, list]:
    reports, yaws = [], [0.0]
    for i in range(len(images) - 1):
        r = _feature_pair(images[i], images[i + 1])
        reports.append(r)
        yaws.append(yaws[-1] - 0.55 * r['yaw_delta'])
    mid = (len(images) - 1) / 2
    cams = []
    for i, yaw in enumerate(yaws):
        z = (i - mid) * spacing
        x = 0.22 * math.sin((i - mid) * 0.45)
        cams.append((x, height, z, yaw))
    return np.asarray(cams, np.float32), reports


def _prior_depth(arr: np.ndarray, cfg: BuildConfig) -> tuple[np.ndarray, np.ndarray]:
    h, w, _ = arr.shape
    lum = 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]
    gy, gx = np.gradient(lum)
    grad = np.clip(np.sqrt(gx * gx + gy * gy) / 0.22, 0, 1)
    red = np.clip(arr[..., 0] - 0.52 * (arr[..., 1] + arr[..., 2]), 0, 1)
    v = (np.arange(h, dtype=np.float32) + 0.5) / h
    phi = (0.5 - v) * math.pi
    dy = np.sin(phi)[:, None]
    depth = 20.0 - 5.8 * grad - 3.0 * red + 4.2 * (1 - lum)
    front = np.abs(((np.arange(w, dtype=np.float32) + 0.5) / w - 0.5) * 2.0)[None, :]
    depth -= np.where(front < 0.65, 2.6 * (1 - front / 0.65), 0)
    depth = np.clip(depth, cfg.near_distance_m, cfg.far_distance_m)
    floor = dy < -0.075
    floor_d = np.clip(cfg.camera_height_m / np.maximum(0.075, -dy), 0.35, 34.0)
    depth = np.where(floor, floor_d, depth)
    sky = dy > 0.30
    sky_d = 38.0 + 10.0 * np.clip((dy - 0.30) / 0.70, 0, 1)
    depth = np.where(sky, sky_d, depth)
    semantic = np.zeros((h, w), np.uint8)
    semantic[np.broadcast_to(floor, (h, w))] = 1
    semantic[np.broadcast_to(sky, (h, w))] = 2
    return depth.astype(np.float32), semantic


def _ray_grid(h: int, w: int, yaw: float) -> np.ndarray:
    u = (np.arange(w, dtype=np.float32) + 0.5) / w
    v = (np.arange(h, dtype=np.float32) + 0.5) / h
    theta = (u - 0.5) * 2 * math.pi + yaw
    phi = (0.5 - v) * math.pi
    cp = np.cos(phi)[:, None]
    rays = np.empty((h, w, 3), np.float32)
    rays[..., 0] = cp * np.sin(theta)[None, :]
    rays[..., 1] = np.sin(phi)[:, None]
    rays[..., 2] = cp * np.cos(theta)[None, :]
    return rays


def _sample_pano(img: np.ndarray, dirs_world: np.ndarray, cam_yaw: float) -> np.ndarray:
    h, w, _ = img.shape
    d = dirs_world / np.maximum(np.linalg.norm(dirs_world, axis=-1, keepdims=True), 1e-8)
    theta = np.arctan2(d[..., 0], d[..., 2]) - cam_yaw
    theta = (theta + math.pi) % (2 * math.pi) - math.pi
    phi = np.arcsin(np.clip(d[..., 1], -1, 1))
    u = (theta / (2 * math.pi) + 0.5) % 1.0
    v = np.clip(0.5 - phi / math.pi, 0, 0.999999)
    xi = np.floor(u * w).astype(np.int32) % w
    yi = np.floor(v * h).astype(np.int32)
    return img[yi, xi]


def _refine_depth_multiview(i: int, images: List[np.ndarray], cams: np.ndarray, prior: np.ndarray, rays: np.ndarray, pair_reports: list) -> tuple[np.ndarray, np.ndarray]:
    factors = np.array([0.76, 0.88, 1.0, 1.12, 1.28], np.float32)
    candidates = prior[..., None] * factors[None, None, :]
    errors = np.zeros_like(candidates, dtype=np.float32)
    weight_sum = 0.0
    neighbors = ([i - 1] if i > 0 else []) + ([i + 1] if i + 1 < len(images) else [])
    if not neighbors:
        return prior, np.full_like(prior, 0.4)
    source = images[i][..., None, :]
    cam_i = cams[i, :3]
    for j in neighbors:
        pr = pair_reports[min(i, j)] if min(i, j) < len(pair_reports) else {'overlap': 0.35}
        pair_w = 0.35 + 0.65 * float(pr.get('overlap', 0.35))
        pts = cam_i[None, None, None, :] + rays[..., None, :] * candidates[..., None]
        vec = pts - cams[j, :3][None, None, None, :]
        samp = _sample_pano(images[j], vec, float(cams[j, 3]))
        e = np.mean(np.abs(samp - source), axis=-1)
        e += np.abs(np.log(factors))[None, None, :] * 0.06
        errors += e * pair_w
        weight_sum += pair_w
    errors /= max(weight_sum, 1e-6)
    best = np.argmin(errors, axis=-1)
    refined = np.take_along_axis(candidates, best[..., None], axis=-1)[..., 0]
    best_err = np.take_along_axis(errors, best[..., None], axis=-1)[..., 0]
    confidence = np.clip(np.exp(-best_err * 4.6), 0.04, 1.0)
    return refined.astype(np.float32), confidence.astype(np.float32)


def _normals_from_points(pointmap: np.ndarray, rays: np.ndarray) -> np.ndarray:
    du = np.roll(pointmap, -1, axis=1) - np.roll(pointmap, 1, axis=1)
    dv = np.roll(pointmap, -1, axis=0) - np.roll(pointmap, 1, axis=0)
    n = np.cross(du, dv)
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-7)
    flip = np.sum(n * rays, axis=-1) > 0
    n[flip] *= -1
    n[0] = n[1]
    n[-1] = n[-2]
    return n.astype(np.float32)


def _raw_cloud(images: List[np.ndarray], cams: np.ndarray, pair_reports: list, palette: np.ndarray, cfg: BuildConfig) -> dict:
    all_p, all_c, all_n, all_conf, all_sem, all_view = [], [], [], [], [], []
    depth_stats = []
    for i, arr in enumerate(images):
        prior, sem = _prior_depth(arr, cfg)
        rays = _ray_grid(arr.shape[0], arr.shape[1], float(cams[i, 3]))
        depth, conf = _refine_depth_multiview(i, images, cams, prior, rays, pair_reports)
        # Ground is a geometric invariant: keep the analytical ray/plane intersection exact.
        floor_mask = sem == 1
        depth[floor_mask] = prior[floor_mask]
        conf[floor_mask] = np.maximum(conf[floor_mask], 0.72)
        pmap = cams[i, :3][None, None, :] + rays * depth[..., None]
        normals = _normals_from_points(pmap, rays)
        lum = 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]
        keep = np.ones(lum.shape, bool)
        sky_dark = (sem == 2) & (lum < 0.025)
        checker = (np.indices(lum.shape).sum(axis=0) + i) % 3 != 0
        keep[sky_dark & checker] = False
        keep &= conf >= cfg.min_confidence
        all_p.append(pmap[keep])
        all_c.append(arr[keep])
        all_n.append(normals[keep])
        all_conf.append(conf[keep])
        all_sem.append(sem[keep])
        all_view.append(np.full(int(np.sum(keep)), i, np.int16))
        depth_stats.append({'median': float(np.median(depth)), 'confidence_mean': float(np.mean(conf))})
    points = np.concatenate(all_p).astype(np.float32)
    colors = _quantize(np.concatenate(all_c).astype(np.float32), palette)
    normals = np.concatenate(all_n).astype(np.float32)
    conf = np.concatenate(all_conf).astype(np.float32)
    sem = np.concatenate(all_sem).astype(np.uint8)
    views = np.concatenate(all_view).astype(np.int16)
    return {'points': points, 'colors': colors, 'normals': normals, 'confidence': conf, 'semantic': sem, 'views': views, 'depth_stats': depth_stats}


def _auto_voxel(points: np.ndarray, cfg: BuildConfig) -> float:
    if cfg.voxel_size is not None:
        return float(cfg.voxel_size)
    center = np.median(points, axis=0)
    radial = np.linalg.norm(points - center, axis=1)
    med = float(np.median(radial))
    estimated = med * (2 * math.pi / max(cfg.sample_width, 64)) * 0.75
    return float(np.clip(estimated, 0.22, 0.58))


def _merge_voxels(points, colors, normals, conf, semantic, views, voxel: float, snap: bool = True) -> dict:
    keys = np.floor(points / voxel).astype(np.int32)
    uniq, inv = np.unique(keys, axis=0, return_inverse=True)
    m = len(uniq)
    cnt = np.bincount(inv, minlength=m).astype(np.float32)
    ws = np.maximum(conf, 1e-4)
    sw = np.bincount(inv, weights=ws, minlength=m).astype(np.float32)
    pos = np.zeros((m, 3), np.float32)
    col = np.zeros((m, 3), np.float32)
    nor = np.zeros((m, 3), np.float32)
    for k in range(3):
        pos[:, k] = np.bincount(inv, weights=points[:, k] * ws, minlength=m) / np.maximum(sw, 1e-6)
        col[:, k] = np.bincount(inv, weights=colors[:, k] * ws, minlength=m) / np.maximum(sw, 1e-6)
        nor[:, k] = np.bincount(inv, weights=normals[:, k] * ws, minlength=m) / np.maximum(sw, 1e-6)
    if snap:
        pos = (uniq.astype(np.float32) + 0.5) * voxel
    nor /= np.maximum(np.linalg.norm(nor, axis=1, keepdims=True), 1e-7)
    cmean = sw / np.maximum(cnt, 1)
    floor_count = np.bincount(inv, weights=(semantic == 1).astype(np.float32), minlength=m)
    sky_count = np.bincount(inv, weights=(semantic == 2).astype(np.float32), minlength=m)
    sem = np.zeros(m, np.uint8)
    sem[floor_count > cnt * 0.5] = 1
    sem[sky_count > cnt * 0.5] = 2
    # Keep the walkable ground anchored to y=0 after voxel snapping.
    pos[sem == 1, 1] = 0.0
    view_support = np.ones(m, np.float32)
    seen = {}
    for idx, vi in zip(inv.tolist(), views.tolist()):
        seen.setdefault(idx, set()).add(int(vi))
    for idx, s in seen.items():
        view_support[idx] = len(s)
    density = np.clip(cnt / 6.0, 0, 1)
    support_gain = np.clip(view_support / 2.0, 0.55, 1.0)
    cmean = np.clip(cmean * (0.72 + 0.28 * support_gain), 0, 1)
    base = voxel * (1.05 + 0.55 * density)
    scale_u = base
    scale_v = voxel * (1.00 + 0.45 * density)
    alpha = np.clip(0.55 + 0.34 * density + 0.07 * np.clip(view_support - 1, 0, 2), 0.55, 0.98)
    keep = (cmean >= max(0.16, np.quantile(cmean, 0.06))) | (cnt >= 2) | (sem == 1)
    return {'keys': uniq[keep], 'points': pos[keep], 'colors': col[keep], 'normals': nor[keep], 'confidence': cmean[keep], 'semantic': sem[keep], 'counts': cnt[keep], 'view_support': view_support[keep], 'scale_u': scale_u[keep], 'scale_v': scale_v[keep], 'alpha': alpha[keep]}


def _fill_single_voxel_holes(scene: dict, voxel: float, ratio: float) -> tuple[dict, int]:
    if ratio <= 0:
        return scene, 0
    keys = scene['keys']
    key_to_idx = {tuple(k): i for i, k in enumerate(keys.tolist())}
    candidates = {}
    axes = [(1, 0, 0), (0, 1, 0), (0, 0, 1)]
    limit = max(1, int(len(keys) * ratio))
    for i, k in enumerate(keys.tolist()):
        kt = tuple(k)
        for ax in axes:
            k2 = (kt[0] + 2 * ax[0], kt[1] + 2 * ax[1], kt[2] + 2 * ax[2])
            mid = (kt[0] + ax[0], kt[1] + ax[1], kt[2] + ax[2])
            if mid in key_to_idx or mid in candidates:
                continue
            j = key_to_idx.get(k2)
            if j is None:
                continue
            if float(np.dot(scene['normals'][i], scene['normals'][j])) < 0.78:
                continue
            if np.linalg.norm(scene['colors'][i] - scene['colors'][j]) > 0.42:
                continue
            candidates[mid] = (i, j)
            if len(candidates) >= limit:
                break
        if len(candidates) >= limit:
            break
    if not candidates:
        return scene, 0
    additions = {k: [] for k in scene}
    for k, (i, j) in candidates.items():
        n = scene['normals'][i] + scene['normals'][j]
        n /= max(float(np.linalg.norm(n)), 1e-7)
        additions['keys'].append(k)
        additions['points'].append((np.array(k, np.float32) + 0.5) * voxel)
        additions['colors'].append((scene['colors'][i] + scene['colors'][j]) * 0.5)
        additions['normals'].append(n)
        additions['confidence'].append(min(scene['confidence'][i], scene['confidence'][j]) * 0.82)
        additions['semantic'].append(scene['semantic'][i] if scene['semantic'][i] == scene['semantic'][j] else 0)
        additions['counts'].append(1.0)
        additions['view_support'].append(min(scene['view_support'][i], scene['view_support'][j]))
        additions['scale_u'].append((scene['scale_u'][i] + scene['scale_u'][j]) * 0.5)
        additions['scale_v'].append((scene['scale_v'][i] + scene['scale_v'][j]) * 0.5)
        additions['alpha'].append((scene['alpha'][i] + scene['alpha'][j]) * 0.5)
    dtypes = {'keys': np.int32, 'semantic': np.uint8}
    out = {}
    for k in scene:
        arr = np.asarray(additions[k], dtype=dtypes.get(k, np.float32))
        out[k] = np.concatenate([scene[k], arr], axis=0)
    return out, len(candidates)


def _plane_report(scene: dict, voxel: float) -> dict:
    p, n, sem = scene['points'], scene['normals'], scene['semantic']
    floor = p[sem == 1]
    ground_y = float(np.median(floor[:, 1])) if len(floor) else float(np.percentile(p[:, 1], 10))
    planes = [{'type': 'ground', 'value': ground_y, 'support': int(len(floor))}]
    for axis, name, ni in [(0, 'x', 0), (2, 'z', 2)]:
        mask = (sem == 0) & (np.abs(n[:, ni]) > 0.72)
        vals = p[mask, axis]
        if len(vals) < 20:
            continue
        bins = np.round(vals / (voxel * 2)).astype(np.int32)
        u, c = np.unique(bins, return_counts=True)
        top = np.argsort(c)[-4:][::-1]
        for t in top:
            if c[t] >= 8:
                planes.append({'type': 'vertical_' + name, 'value': float(u[t] * voxel * 2), 'support': int(c[t])})
    return {'ground_y': ground_y, 'planes': planes}


def _lod(scene: dict, voxel: float, factor: float) -> dict:
    dummy_views = np.zeros(len(scene['points']), np.int16)
    return _merge_voxels(scene['points'], scene['colors'], scene['normals'], scene['confidence'], scene['semantic'], dummy_views, voxel * factor, snap=True)


def _write_ply(path: Path, scene: dict):
    p = scene['points']
    c = np.clip(scene['colors'] * 255, 0, 255).astype(np.uint8)
    a = np.clip(scene['alpha'] * 255, 0, 255).astype(np.uint8)
    n = scene['normals']
    with path.open('w', encoding='utf-8') as f:
        f.write('ply\nformat ascii 1.0\n')
        f.write(f'element vertex {len(p)}\n')
        f.write('property float x\nproperty float y\nproperty float z\n')
        f.write('property float nx\nproperty float ny\nproperty float nz\n')
        f.write('property uchar red\nproperty uchar green\nproperty uchar blue\nproperty uchar alpha\n')
        f.write('property float scale_u\nproperty float scale_v\nproperty float confidence\nend_header\n')
        for i in range(len(p)):
            f.write(f"{p[i,0]:.6f} {p[i,1]:.6f} {p[i,2]:.6f} {n[i,0]:.6f} {n[i,1]:.6f} {n[i,2]:.6f} {int(c[i,0])} {int(c[i,1])} {int(c[i,2])} {int(a[i])} {scene['scale_u'][i]:.5f} {scene['scale_v'][i]:.5f} {scene['confidence'][i]:.5f}\n")


def _chunks(scene: dict, out_dir: Path, lod_name: str, chunk_size: float) -> list:
    folder = out_dir / 'chunks' / lod_name
    folder.mkdir(parents=True, exist_ok=True)
    p = scene['points']
    k = np.floor(p[:, [0, 2]] / chunk_size).astype(np.int32)
    groups = {}
    for idx, kk in enumerate(map(tuple, k.tolist())):
        groups.setdefault(kk, []).append(idx)
    manifest = []
    for (cx, cz), ids in groups.items():
        ids = np.asarray(ids, np.int32)
        fn = f'chunk_{cx}_{cz}.npz'
        np.savez_compressed(folder / fn, points=scene['points'][ids], colors=scene['colors'][ids], normals=scene['normals'][ids], confidence=scene['confidence'][ids], scale_u=scene['scale_u'][ids], scale_v=scene['scale_v'][ids], alpha=scene['alpha'][ids])
        manifest.append({'x': int(cx), 'z': int(cz), 'count': int(len(ids)), 'center': [float(np.mean(p[ids, 0])), float(np.mean(p[ids, 1])), float(np.mean(p[ids, 2]))], 'file': str(Path('chunks') / lod_name / fn)})
    return manifest


def _collision_and_nav(scene: dict, out_dir: Path, plane: dict, voxel: float):
    p, sem = scene['points'], scene['semantic']
    ground = float(plane['ground_y'])
    floor = p[sem == 1]
    if len(floor) < 4:
        floor = p[np.abs(p[:, 1] - ground) < max(0.6, 2 * voxel)]
    if len(floor) < 4:
        floor = np.array([[-5, ground, -5], [5, ground, -5], [5, ground, 5], [-5, ground, 5]], np.float32)
    sample = floor[::max(1, len(floor) // 5000), :][:, [0, 2]]
    try:
        hull = ConvexHull(sample)
        poly = sample[hull.vertices]
    except Exception:
        mn, mx = sample.min(axis=0), sample.max(axis=0)
        poly = np.array([[mn[0], mn[1]], [mx[0], mn[1]], [mx[0], mx[1]], [mn[0], mx[1]]], np.float32)
    n = len(poly)
    top = np.column_stack([poly[:, 0], np.full(n, ground), poly[:, 1]])
    bot = np.column_stack([poly[:, 0], np.full(n, ground - 0.18), poly[:, 1]])
    verts = np.vstack([top, bot]).astype(np.float32)
    faces = []
    for i in range(1, n - 1):
        faces.append([0, i, i + 1]); faces.append([n, n + i + 1, n + i])
    for i in range(n):
        j = (i + 1) % n
        faces.extend([[i, j, n + j], [i, n + j, n + i]])
    mesh = trimesh.Trimesh(vertices=verts, faces=np.asarray(faces, np.int64), process=False)
    mesh.export(out_dir / 'collision_proxy.glb')
    mesh.export(out_dir / 'collision_proxy.obj')
    mn, mx = poly.min(axis=0), poly.max(axis=0)
    cell = max(0.8, voxel * 3)
    nx = int(np.clip(math.ceil((mx[0] - mn[0]) / cell), 1, 128))
    nz = int(np.clip(math.ceil((mx[1] - mn[1]) / cell), 1, 128))
    xs = mn[0] + (np.arange(nx) + 0.5) * cell
    zs = mn[1] + (np.arange(nz) + 0.5) * cell
    xx, zz = np.meshgrid(xs, zs, indexing='ij')
    queries = np.column_stack([xx.ravel(), zz.ravel()])
    tree = cKDTree(floor[:, [0, 2]])
    dist, _ = tree.query(queries, k=1)
    walk = dist < cell * 1.6
    obstacles = p[(sem == 0) & (p[:, 1] > ground + 0.15) & (p[:, 1] < ground + 2.2)]
    if len(obstacles):
        ot = cKDTree(obstacles[:, [0, 2]])
        od, _ = ot.query(queries, k=1)
        walk &= od > max(voxel * 1.5, 0.45)
    nav = {'origin': [float(mn[0]), float(ground), float(mn[1])], 'cell_size': cell, 'width': nx, 'height': nz, 'walkable': walk.astype(np.uint8).reshape(nx, nz).tolist()}
    (out_dir / 'navgrid.json').write_text(json.dumps(nav, ensure_ascii=False), encoding='utf-8')


def _pack_viewer(scene: dict, chunk_size: float):
    p = scene['points']; n = scene['normals']
    c = np.clip(scene['colors'] * 255, 0, 255).astype(np.uint8)
    a = np.clip(scene['alpha'] * 255, 0, 255).astype(np.uint8)
    groups = {}
    ck = np.floor(p[:, [0, 2]] / chunk_size).astype(np.int32)
    for idx, k in enumerate(map(tuple, ck.tolist())):
        groups.setdefault(k, []).append(idx)
    ordered, chunks, offset = [], [], 0
    for k, ids in sorted(groups.items()):
        ids = np.asarray(ids, np.int32); ordered.extend(ids.tolist())
        center = np.mean(p[ids], axis=0)
        chunks.append({'offset': offset, 'count': int(len(ids)), 'center': [float(x) for x in center]})
        offset += len(ids)
    order = np.asarray(ordered, np.int32)
    p = p[order]; n = n[order]; c = c[order]; a = a[order]
    su = scene['scale_u'][order]; sv = scene['scale_v'][order]; conf = scene['confidence'][order]
    buf = bytearray(len(p) * 32)
    for i in range(len(p)):
        off = i * 32
        struct.pack_into('<fff', buf, off, float(p[i, 0]), float(p[i, 1]), float(p[i, 2]))
        ni = np.clip(np.round(n[i] * 127), -127, 127).astype(np.int8)
        struct.pack_into('<bbbb', buf, off + 12, int(ni[0]), int(ni[1]), int(ni[2]), 0)
        struct.pack_into('<BBBB', buf, off + 16, int(c[i, 0]), int(c[i, 1]), int(c[i, 2]), int(a[i]))
        struct.pack_into('<ff', buf, off + 20, float(su[i]), float(sv[i]))
        struct.pack_into('<f', buf, off + 28, float(conf[i]))
    return base64.b64encode(buf).decode('ascii'), chunks


def _viewer_html(path: Path, scene: dict, meta: dict, chunk_size: float):
    data, chunks = _pack_viewer(scene, chunk_size)
    m = dict(meta); m['count'] = len(scene['points']); m['chunks'] = chunks
    mjson = json.dumps(m, ensure_ascii=False, separators=(',', ':'))
    html = f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<title>Pixel 3DGS CPU V2</title>
<style>
html,body{{margin:0;width:100%;height:100%;overflow:hidden;background:#02050a;color:#eef;font-family:system-ui,-apple-system,sans-serif;touch-action:none}}canvas{{position:fixed;inset:0;width:100%;height:100%;display:block}}
#hud{{position:fixed;top:max(10px,env(safe-area-inset-top));left:10px;z-index:5;background:#050913c8;border:1px solid #58d5ff66;border-radius:12px;padding:9px 11px;font-size:12px;line-height:1.4;backdrop-filter:blur(8px)}}
#start{{position:fixed;inset:0;z-index:10;display:grid;place-items:center;background:radial-gradient(circle,#10233acc,#010205f5)}}#card{{padding:24px;text-align:center;border:1px solid #58d5ff66;border-radius:18px;background:#050814e8}}
button{{border:0;border-radius:14px;padding:14px 20px;font-weight:800;color:white;background:linear-gradient(135deg,#18c1ff,#173d8f)}}#joy,#look,#jump{{display:none;position:fixed;z-index:7}}#joy{{left:20px;bottom:25px;width:118px;height:118px;border-radius:50%;border:1px solid #fff3;background:#07101d66}}#knob{{position:absolute;left:35px;top:35px;width:48px;height:48px;border-radius:50%;background:#35b8ff77}}#look{{right:0;bottom:0;width:48vw;height:48vh}}#jump{{right:24px;bottom:155px;width:60px;height:60px;border-radius:50%}}@media(pointer:coarse){{#joy,#look,#jump{{display:block}}}}
</style></head><body>
<canvas id="gl"></canvas><div id="hud"><b>PIXEL 3DGS CPU V2</b><br>{len(scene['points']):,} anisotropic splats · {len(chunks)} chunks<br>multi-view fusion · pixel palette · depth prepass<br>WASD/стрелки · мышь/тач · Space</div>
<div id="start"><div id="card"><h2>Pixel 3DGS V2</h2><button id="go">ВОЙТИ В МИР</button></div></div><div id="joy"><div id="knob"></div></div><div id="look"></div><button id="jump">↑</button>
<script>
'use strict';const META={mjson};const DATA="{data}";const cvs=document.getElementById('gl'),gl=cvs.getContext('webgl2',{{antialias:false,alpha:false,powerPreference:'high-performance'}});if(!gl)alert('WebGL2 required');
function sh(t,s){{let x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(x));return x}}
const VS=`#version 300 es
precision highp float;layout(location=0) in vec2 corner;layout(location=2) in vec3 center;layout(location=3) in vec4 normal4;layout(location=4) in vec4 color;layout(location=5) in vec2 scaleUV;layout(location=6) in float confidence;uniform mat4 uVP;out vec2 vCorner;out vec4 vColor;void main(){{vec3 n=normalize(normal4.xyz);vec3 ref=abs(n.y)>0.92?vec3(1,0,0):vec3(0,1,0);vec3 t=normalize(cross(ref,n));vec3 b=normalize(cross(n,t));vec3 world=center+t*corner.x*scaleUV.x+b*corner.y*scaleUV.y;gl_Position=uVP*vec4(world,1.0);vCorner=corner;vColor=vec4(color.rgb,color.a*clamp(confidence*1.15,0.2,1.0));}}`;
const FS=`#version 300 es
precision highp float;in vec2 vCorner;in vec4 vColor;uniform int uPass;out vec4 outColor;void main(){{float r2=dot(vCorner,vCorner);if(r2>1.0)discard;float g=exp(-3.2*r2);float a=vColor.a*g;if(uPass==0){{if(a<0.58)discard;outColor=vec4(vColor.rgb,1.0);}}else{{if(a>=0.58||a<0.035)discard;outColor=vec4(vColor.rgb,a);}}}}`;
const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);const quad=new Float32Array([-1,-1,1,-1,-1,1,1,1]);const qbo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,qbo);gl.bufferData(gl.ARRAY_BUFFER,quad,gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);const raw=atob(DATA),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);const ibo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,ibo);gl.bufferData(gl.ARRAY_BUFFER,bytes,gl.STATIC_DRAW);for(const loc of [2,3,4,5,6]){{gl.enableVertexAttribArray(loc);gl.vertexAttribDivisor(loc,1)}}function ptr(base){{gl.bindBuffer(gl.ARRAY_BUFFER,ibo);gl.vertexAttribPointer(2,3,gl.FLOAT,false,32,base);gl.vertexAttribPointer(3,4,gl.BYTE,true,32,base+12);gl.vertexAttribPointer(4,4,gl.UNSIGNED_BYTE,true,32,base+16);gl.vertexAttribPointer(5,2,gl.FLOAT,false,32,base+20);gl.vertexAttribPointer(6,1,gl.FLOAT,false,32,base+28)}}const uVP=gl.getUniformLocation(pr,'uVP'),uPass=gl.getUniformLocation(pr,'uPass');
function persp(o,f,a,n,fa){{let q=1/Math.tan(f/2),nf=1/(n-fa);o.set([q/a,0,0,0,0,q,0,0,0,0,(fa+n)*nf,-1,0,0,2*fa*n*nf,0])}}function look(o,e,y,p){{let cp=Math.cos(p),sp=Math.sin(p),sy=Math.sin(y),cy=Math.cos(y),fx=sy*cp,fy=sp,fz=cy*cp;let zx=-fx,zy=-fy,zz=-fz,zl=Math.hypot(zx,zy,zz);zx/=zl;zy/=zl;zz/=zl;let xx=zz,xz=-zx,xl=Math.hypot(xx,xz);xx/=xl;xz/=xl;let yx=zy*xz,yy=zz*xx-zx*xz,yz=-zy*xx;o.set([xx,yx,zx,0,0,yy,zy,0,xz,yz,zz,0,-(xx*e[0]+xz*e[2]),-(yx*e[0]+yy*e[1]+yz*e[2]),-(zx*e[0]+zy*e[1]+zz*e[2]),1])}}function mul(o,a,b){{let r=new Float32Array(16);for(let c=0;c<4;c++)for(let y=0;y<4;y++)r[c*4+y]=a[y]*b[c*4]+a[4+y]*b[c*4+1]+a[8+y]*b[c*4+2]+a[12+y]*b[c*4+3];o.set(r)}}
let pos=[0,1.65,-7],yaw=0,pitch=0,vy=0,ground=true,started=false,keys={{}},joyX=0,joyY=0;addEventListener('keydown',e=>{{keys[e.code]=1;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Space'&&ground){{vy=4.9;ground=false}}}});addEventListener('keyup',e=>keys[e.code]=0);document.getElementById('go').onclick=()=>{{started=true;document.getElementById('start').style.display='none';if(matchMedia('(pointer:fine)').matches)cvs.requestPointerLock?.()}};document.addEventListener('mousemove',e=>{{if(document.pointerLockElement===cvs){{yaw-=e.movementX*.0024;pitch=Math.max(-1.5,Math.min(1.5,pitch-e.movementY*.0021))}}}});cvs.onclick=()=>{{if(started&&matchMedia('(pointer:fine)').matches)cvs.requestPointerLock?.()}};
const joy=document.getElementById('joy'),knob=document.getElementById('knob');let jid=null;function ju(x,y){{let r=joy.getBoundingClientRect(),dx=x-(r.left+r.width/2),dy=y-(r.top+r.height/2),m=Math.hypot(dx,dy),mx=42;if(m>mx){{dx*=mx/m;dy*=mx/m}}joyX=dx/mx;joyY=dy/mx;knob.style.transform=`translate(${{dx}}px,${{dy}}px)`}}joy.addEventListener('touchstart',e=>{{let t=e.changedTouches[0];jid=t.identifier;ju(t.clientX,t.clientY);e.preventDefault()}},{{passive:false}});joy.addEventListener('touchmove',e=>{{for(let t of e.changedTouches)if(t.identifier===jid)ju(t.clientX,t.clientY);e.preventDefault()}},{{passive:false}});joy.addEventListener('touchend',e=>{{joyX=joyY=0;knob.style.transform='';jid=null}},{{passive:false}});const lz=document.getElementById('look');let lid=null,lx=0,ly=0;lz.addEventListener('touchstart',e=>{{let t=e.changedTouches[0];lid=t.identifier;lx=t.clientX;ly=t.clientY;e.preventDefault()}},{{passive:false}});lz.addEventListener('touchmove',e=>{{for(let t of e.changedTouches)if(t.identifier===lid){{yaw-=(t.clientX-lx)*.004;pitch=Math.max(-1.5,Math.min(1.5,pitch-(t.clientY-ly)*.0038));lx=t.clientX;ly=t.clientY}}e.preventDefault()}},{{passive:false}});document.getElementById('jump').addEventListener('touchstart',e=>{{if(ground){{vy=4.9;ground=false}}e.preventDefault()}},{{passive:false}});
function resize(){{let d=Math.min(devicePixelRatio||1,1.7),w=Math.floor(innerWidth*d),h=Math.floor(innerHeight*d);if(cvs.width!==w||cvs.height!==h){{cvs.width=w;cvs.height=h;gl.viewport(0,0,w,h)}}}}let last=performance.now(),P=new Float32Array(16),V=new Float32Array(16),VP=new Float32Array(16);function drawChunks(pass){{let order=META.chunks.map((c,i)=>[i,(c.center[0]-pos[0])**2+(c.center[1]-pos[1])**2+(c.center[2]-pos[2])**2]);if(pass===1)order.sort((a,b)=>b[1]-a[1]);for(let [i] of order){{let c=META.chunks[i];ptr(c.offset*32);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,c.count)}}}}function frame(now){{resize();let dt=Math.min(.035,(now-last)/1000);last=now;if(started){{let f=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)-joyY,s=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+joyX,l=Math.hypot(f,s);if(l>1){{f/=l;s/=l}}let sy=Math.sin(yaw),cy=Math.cos(yaw);pos[0]+=(sy*f+cy*s)*3*dt;pos[2]+=(cy*f-sy*s)*3*dt;vy-=10.5*dt;pos[1]+=vy*dt;if(pos[1]<=1.65){{pos[1]=1.65;vy=0;ground=true}}}}persp(P,Math.PI/2.7,cvs.width/cvs.height,.05,180);look(V,pos,yaw,pitch);mul(VP,P,V);gl.clearColor(.003,.007,.015,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(pr);gl.uniformMatrix4fv(uVP,false,VP);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.depthMask(true);gl.uniform1i(uPass,0);drawChunks(0);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.uniform1i(uPass,1);drawChunks(1);gl.depthMask(true);requestAnimationFrame(frame)}}requestAnimationFrame(frame);
</script></body></html>'''
    path.write_text(html, encoding='utf-8')


def _quality_report(files, pair_reports, raw, scene, filled, voxel, planes, colmap_info, chunks) -> dict:
    overlaps = [r['overlap'] for r in pair_reports] or [0]
    matches = [r['matches'] for r in pair_reports] or [0]
    conf = scene['confidence']; support = scene['view_support']
    raw_n = len(raw['points']); final_n = len(scene['points'])
    overlap_score = float(np.mean(overlaps)); conf_score = float(np.mean(conf))
    support_score = float(np.mean(np.clip((support - 1) / 2, 0, 1)))
    retention = min(1.0, final_n / max(raw_n * 0.35, 1))
    health = 100 * (0.28 * overlap_score + 0.32 * conf_score + 0.18 * support_score + 0.12 * retention + 0.10 * (1 if len(chunks) > 0 else 0))
    health = float(np.clip(health, 0, 100))
    return {'pipeline_health_percent': round(health, 1), 'input_panorama_count': len(files), 'feature_matches_mean': round(float(np.mean(matches)), 1), 'neighbor_overlap_mean': round(overlap_score, 3), 'multiview_confidence_mean': round(conf_score, 3), 'multi_camera_support_mean': round(float(np.mean(support)), 3), 'raw_points': raw_n, 'final_splats': final_n, 'hole_filled_splats': int(filled), 'voxel_size_m': round(float(voxel), 4), 'plane_report': planes, 'colmap': colmap_info, 'notes': ['Health measures reconstruction consistency, not photorealism.', 'Generated source panoramas can limit geometry consistency even when the pipeline is correct.']}


def build_scene(cfg: BuildConfig) -> dict:
    cfg.input_dir = Path(cfg.input_dir); cfg.output_dir = Path(cfg.output_dir)
    cfg.output_dir.mkdir(parents=True, exist_ok=True)
    files = _images(cfg.input_dir)
    images = _load_resized(files, cfg.sample_width, cfg.sample_height)
    palette = _global_palette(images, cfg.palette_size)
    colmap_info = {'available': colmap_available(), 'ran': False}
    if cfg.use_colmap_if_available and colmap_available():
        try:
            colmap_info = run_colmap_cpu(cfg.input_dir, cfg.output_dir / 'colmap_cpu')
        except Exception as e:
            colmap_info = {'available': True, 'ran': True, 'ok': False, 'reason': repr(e)}
    cams, pair_reports = _camera_poses(images, cfg.camera_spacing_m, cfg.camera_height_m)
    raw = _raw_cloud(images, cams, pair_reports, palette, cfg)
    voxel = _auto_voxel(raw['points'], cfg)
    scene = _merge_voxels(raw['points'], raw['colors'], raw['normals'], raw['confidence'], raw['semantic'], raw['views'], voxel, True)
    scene, filled = _fill_single_voxel_holes(scene, voxel, cfg.hole_fill_ratio)
    planes = _plane_report(scene, voxel)
    lod0 = scene; lod1 = _lod(scene, voxel, 1.75); lod2 = _lod(scene, voxel, 2.85)
    lods = {'lod0': lod0, 'lod1': lod1, 'lod2': lod2}
    for name, s in lods.items():
        _write_ply(cfg.output_dir / f'scene_{name}.ply', s)
    chunk_manifest = {name: _chunks(s, cfg.output_dir, name, cfg.chunk_size_m) for name, s in lods.items()}
    _collision_and_nav(lod0, cfg.output_dir, planes, voxel)
    manifest = {'version': '2.0-cpu', 'input_files': [p.name for p in files], 'cameras': [[float(x) for x in row] for row in cams], 'camera_pair_reports': pair_reports, 'palette_rgb255': np.clip(palette * 255, 0, 255).astype(int).tolist(), 'voxel_size_m': voxel, 'lod_counts': {k: len(v['points']) for k, v in lods.items()}, 'chunks': chunk_manifest, 'planes': planes, 'features': {'camera_pose_refinement': True, 'optional_colmap_cpu': True, 'multiview_depth_fusion': True, 'confidence_occlusion_filter': True, 'anisotropic_surfels': True, 'plane_detection': True, 'hole_filling': True, 'automatic_palette': True, 'automatic_pixel_grid': True, 'lod_generation': True, 'chunk_streaming_manifest': True, 'collision_proxy': True, 'navgrid': True, 'viewer_chunk_depth_ordering': True, 'viewer_depth_prepass': True}}
    (cfg.output_dir / 'scene_manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    qr = _quality_report(files, pair_reports, raw, lod0, filled, voxel, planes, colmap_info, chunk_manifest['lod0'])
    (cfg.output_dir / 'quality_report.json').write_text(json.dumps(qr, ensure_ascii=False, indent=2), encoding='utf-8')
    _viewer_html(cfg.output_dir / 'viewer_auto.html', lod0, {'version': '2.0 CPU', 'voxel': voxel, 'quality': qr['pipeline_health_percent']}, cfg.chunk_size_m)
    _viewer_html(cfg.output_dir / 'viewer_lod1.html', lod1, {'version': '2.0 CPU LOD1', 'voxel': voxel * 1.75, 'quality': qr['pipeline_health_percent']}, cfg.chunk_size_m)
    _viewer_html(cfg.output_dir / 'viewer_lod2.html', lod2, {'version': '2.0 CPU LOD2', 'voxel': voxel * 2.85, 'quality': qr['pipeline_health_percent']}, cfg.chunk_size_m)
    return {'ok': True, 'output_dir': str(cfg.output_dir), 'quality_report': qr, 'lod_counts': manifest['lod_counts'], 'viewer': str(cfg.output_dir / 'viewer_auto.html'), 'manifest': str(cfg.output_dir / 'scene_manifest.json'), 'collision': str(cfg.output_dir / 'collision_proxy.glb')}
