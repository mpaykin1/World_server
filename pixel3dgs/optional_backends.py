from __future__ import annotations
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / 'models' / 'optional'

OPTIONAL_BACKENDS = {
    'depth_anything_onnx': MODELS / 'depth_anything_v2.onnx',
    'lightglue_onnx': MODELS / 'lightglue.onnx',
    'loftr_onnx': MODELS / 'loftr.onnx',
    'raft_onnx': MODELS / 'raft.onnx',
    'birefnet_onnx': MODELS / 'birefnet.onnx',
    'sam_encoder_onnx': MODELS / 'sam_encoder.onnx',
}


def detect_optional_backends() -> dict:
    out = {}
    for name, path in OPTIONAL_BACKENDS.items():
        out[name] = {'present': path.exists(), 'path': str(path)}
    return out


def load_capture_pose_json(path: str | Path) -> dict:
    p = Path(path)
    data = json.loads(p.read_text(encoding='utf-8'))
    return {
        'source': str(p),
        'frames': data.get('frames', []),
        'has_imu': any('imu' in f for f in data.get('frames', [])),
        'has_pose': any('position' in f and 'rotation' in f for f in data.get('frames', [])),
    }
