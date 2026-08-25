from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Callable, Literal
import json
import math

import cv2
import numpy as np

VideoMode = Literal['auto', 'space', 'character']


@dataclass
class VideoIngestConfig:
    mode: VideoMode = 'auto'
    max_frames: int = 72
    min_frames: int = 12
    target_fps: float = 2.5
    min_frame_gap_s: float = 0.18
    blur_floor: float = 22.0
    duplicate_threshold: float = 0.018
    scene_cut_threshold: float = 0.42
    character_detection_sample: int = 18
    prefer_longest_shot: bool = True


def _gray_thumb(frame: np.ndarray, size=(96, 54)) -> np.ndarray:
    g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.resize(g, size, interpolation=cv2.INTER_AREA)


def _blur(frame: np.ndarray) -> float:
    g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(g, cv2.CV_32F).var())


def _exposure(frame: np.ndarray) -> dict:
    g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return {
        'mean': float(g.mean() / 255.0),
        'black_clip': float(np.mean(g < 5)),
        'white_clip': float(np.mean(g > 250)),
    }


def _hist(frame: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    h = cv2.calcHist([hsv], [0, 1], None, [24, 16], [0, 180, 0, 256])
    cv2.normalize(h, h)
    return h


def _frame_diff(a: np.ndarray, b: np.ndarray) -> float:
    aa = a.astype(np.float32) / 255.0
    bb = b.astype(np.float32) / 255.0
    return float(np.mean(np.abs(aa - bb)))


def _detect_person_ratio(frames: list[np.ndarray]) -> float:
    """CPU-safe central-subject heuristic; avoids fragile platform HOG kernels."""
    if not frames:
        return 0.0
    hits = 0
    for frame in frames:
        h, w = frame.shape[:2]
        scale = min(1.0, 320.0 / max(h, w))
        small = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1 else frame
        sh, sw = small.shape[:2]
        x, y = int(sw*0.16), int(sh*0.04)
        bw, bh = int(sw*0.68), int(sh*0.92)
        mask = np.zeros((sh, sw), np.uint8)
        bg = np.zeros((1,65), np.float64); fg = np.zeros((1,65), np.float64)
        try:
            cv2.grabCut(small, mask, (x,y,bw,bh), bg, fg, 2, cv2.GC_INIT_WITH_RECT)
            m = ((mask==cv2.GC_FGD)|(mask==cv2.GC_PR_FGD)).astype(np.uint8)
        except cv2.error:
            continue
        n, labels, stats, _ = cv2.connectedComponentsWithStats(m, 8)
        if n <= 1:
            continue
        ii = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        bx,by,bww,bhh,area = stats[ii]
        ar = bhh/max(1,bww); frac = area/float(sh*sw)
        cx = (bx+bww/2)/sw; cy=(by+bhh/2)/sh
        if 1.15 < ar < 5.0 and 0.055 < frac < 0.62 and abs(cx-.5) < .22 and .34 < cy < .68:
            hits += 1
    return hits / max(1, len(frames))


def probe_video(video_path: Path) -> dict:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f'Cannot open video: {video_path}')
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    duration = count / fps if fps > 0 and count > 0 else 0.0
    cap.release()
    return {
        'path': str(video_path), 'fps': fps, 'frame_count': count,
        'width': width, 'height': height, 'duration_s': duration,
        'aspect_ratio': width / max(1, height),
        'is_equirectangular_360': bool(width >= 2 * height * 0.92 and width <= 2 * height * 1.08),
    }


def _candidate_indices(meta: dict, cfg: VideoIngestConfig) -> list[int]:
    count = meta['frame_count']
    fps = meta['fps'] if meta['fps'] > 0 else 30.0
    if count <= 0:
        return []
    # Analyze at most 700 frames; enough for long clips without linear CPU blow-up.
    step_by_target = max(1, int(round(fps / max(cfg.target_fps * 2.5, 1e-3))))
    step_by_cap = max(1, int(math.ceil(count / 700)))
    step = max(step_by_target, step_by_cap)
    return list(range(0, count, step))


def _read_indices(video_path: Path, indices: list[int]) -> list[tuple[int, np.ndarray]]:
    if not indices:
        return []
    cap = cv2.VideoCapture(str(video_path))
    out = []
    wanted = iter(indices)
    target = next(wanted, None)
    i = 0
    while target is not None:
        cap.set(cv2.CAP_PROP_POS_FRAMES, target)
        ok, frame = cap.read()
        if ok and frame is not None:
            out.append((target, frame))
        target = next(wanted, None)
    cap.release()
    return out


def _longest_shot(samples: list[dict], cut_threshold: float) -> tuple[int, int, list[int]]:
    if not samples:
        return 0, 0, []
    cuts = []
    prev = samples[0]['hist']
    for i in range(1, len(samples)):
        d = float(cv2.compareHist(prev, samples[i]['hist'], cv2.HISTCMP_BHATTACHARYYA))
        samples[i]['scene_delta'] = d
        if d > cut_threshold:
            cuts.append(i)
        prev = samples[i]['hist']
    bounds = [0] + cuts + [len(samples)]
    best = (0, len(samples))
    for a, b in zip(bounds[:-1], bounds[1:]):
        if b - a > best[1] - best[0] or best == (0, len(samples)):
            best = (a, b)
    return best[0], best[1], cuts


def extract_keyframes(video_path: Path, work_dir: Path, cfg: VideoIngestConfig, progress: Callable[[str, float], None] | None = None) -> dict:
    video_path = Path(video_path)
    work_dir = Path(work_dir)
    frames_dir = work_dir / 'frames'
    frames_dir.mkdir(parents=True, exist_ok=True)
    meta = probe_video(video_path)
    if progress: progress('video_probe', 0.03)
    indices = _candidate_indices(meta, cfg)
    raw = _read_indices(video_path, indices)
    if len(raw) < cfg.min_frames:
        raise RuntimeError(f'Video yielded only {len(raw)} readable candidates; need at least {cfg.min_frames}')

    samples = []
    for idx, frame in raw:
        thumb = _gray_thumb(frame)
        samples.append({
            'index': idx,
            'time_s': idx / max(meta['fps'], 1e-6),
            'frame': frame,
            'thumb': thumb,
            'blur': _blur(frame),
            'exposure': _exposure(frame),
            'hist': _hist(frame),
            'scene_delta': 0.0,
        })
    if progress: progress('video_quality_analysis', 0.12)

    a, b, cuts = _longest_shot(samples, cfg.scene_cut_threshold)
    pool = samples[a:b] if cfg.prefer_longest_shot else samples
    if len(pool) < cfg.min_frames:
        pool = samples

    # Score and greedily select sharp, non-duplicate, evenly distributed frames.
    fps = meta['fps'] if meta['fps'] > 0 else 30.0
    min_gap_frames = max(1, int(cfg.min_frame_gap_s * fps))
    target_gap_frames = max(1, int(fps / max(cfg.target_fps, 1e-3)))
    selected = []
    last = None
    for s in pool:
        exp = s['exposure']
        exposure_penalty = min(1.0, (exp['black_clip'] + exp['white_clip']) * 2.5)
        sharp = np.clip(math.log1p(s['blur']) / math.log1p(220.0), 0, 1)
        s['quality'] = float(np.clip(0.78 * sharp + 0.22 * (1 - exposure_penalty), 0, 1))
        if s['blur'] < cfg.blur_floor and len(pool) > cfg.min_frames * 1.5:
            continue
        if last is not None:
            gap = s['index'] - last['index']
            if gap < min_gap_frames:
                continue
            diff = _frame_diff(s['thumb'], last['thumb'])
            if diff < cfg.duplicate_threshold and gap < target_gap_frames * 2:
                continue
        selected.append(s)
        last = s

    if len(selected) > cfg.max_frames:
        # Preserve temporal coverage; within each temporal bin choose highest quality.
        edges = np.linspace(0, len(selected), cfg.max_frames + 1).astype(int)
        reduced = []
        for x, y in zip(edges[:-1], edges[1:]):
            chunk = selected[x:max(x + 1, y)]
            reduced.append(max(chunk, key=lambda z: z['quality']))
        selected = reduced

    if len(selected) < cfg.min_frames:
        # Deterministic fallback: evenly spaced frames from the longest shot.
        picks = np.linspace(0, len(pool) - 1, min(cfg.max_frames, max(cfg.min_frames, len(pool))), dtype=int)
        selected = [pool[i] for i in sorted(set(picks.tolist()))]

    # Auto mode classification only from a small subset to keep CPU bounded.
    mode = cfg.mode
    person_ratio = 0.0
    if mode == 'auto':
        sample_count = min(cfg.character_detection_sample, len(selected))
        picks = np.linspace(0, len(selected) - 1, sample_count, dtype=int)
        person_ratio = _detect_person_ratio([selected[i]['frame'] for i in picks])
        mode = 'character' if person_ratio >= 0.42 else 'space'

    records = []
    for i, s in enumerate(selected):
        fn = f'frame_{i:04d}.png'
        cv2.imwrite(str(frames_dir / fn), s['frame'])
        records.append({
            'file': fn, 'source_frame': int(s['index']), 'time_s': round(float(s['time_s']), 6),
            'blur': round(float(s['blur']), 3), 'quality': round(float(s['quality']), 4),
            'exposure': s['exposure'],
        })
    report = {
        'video': meta,
        'requested_mode': cfg.mode,
        'resolved_mode': mode,
        'person_detection_ratio': round(float(person_ratio), 4),
        'candidate_count': len(samples),
        'selected_count': len(records),
        'scene_cuts_detected': len(cuts),
        'selected_shot_candidate_range': [int(a), int(b)],
        'frames_dir': str(frames_dir),
        'frames': records,
        'config': asdict(cfg),
    }
    (work_dir / 'video_ingest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    if progress: progress('video_keyframes_ready', 0.22)
    return report
