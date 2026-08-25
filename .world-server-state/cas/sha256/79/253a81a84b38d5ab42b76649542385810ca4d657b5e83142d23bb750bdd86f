from dataclasses import dataclass
import cv2

@dataclass
class VideoFrames:
    frames: list
    timestamps: list
    source_fps: float
    width: int
    height: int

def extract_frames(path, sample_fps=6.0, max_frames=240, resize_max=960):
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"Не удалось открыть видео: {path}")
    src_fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    step = max(1, int(round(src_fps / max(sample_fps, 0.1))))
    frames, ts, idx = [], [], 0
    while True:
        ok = cap.grab()
        if not ok:
            break
        if idx % step == 0:
            ok, frame = cap.retrieve()
            if not ok:
                break
            h, w = frame.shape[:2]
            scale = min(1.0, float(resize_max) / max(w, h))
            if scale < 1.0:
                frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
            frames.append(frame)
            ts.append(idx / src_fps)
            if len(frames) >= max_frames:
                break
        idx += 1
    cap.release()
    if len(frames) < 2:
        raise RuntimeError("В видео недостаточно кадров.")
    h, w = frames[0].shape[:2]
    return VideoFrames(frames, ts, src_fps, w, h)
