from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

DEFAULTS = {
    'minFps': 55.0,
    'maxP95FrameMs': 22.0,
    'maxTextureVramMB': 768.0,
    'maxVisualDelta': 0.03,
}


def verify(data: dict, limits: dict) -> dict:
    checks = {
        'fps': float(data.get('fps', 0)) >= float(limits['minFps']),
        'p95FrameMs': float(data.get('p95FrameMs', 1e9)) <= float(limits['maxP95FrameMs']),
        'textureVramMB': float(data.get('textureVramMB', 1e9)) <= float(limits['maxTextureVramMB']),
        'visualDelta': float(data.get('visualDelta', 1e9)) <= float(limits['maxVisualDelta']),
    }
    return {'passed': all(checks.values()), 'checks': checks, 'limits': limits, 'observed': data}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('metrics_json')
    parser.add_argument('--min-fps', type=float, default=DEFAULTS['minFps'])
    parser.add_argument('--max-p95-frame-ms', type=float, default=DEFAULTS['maxP95FrameMs'])
    parser.add_argument('--max-texture-vram-mb', type=float, default=DEFAULTS['maxTextureVramMB'])
    parser.add_argument('--max-visual-delta', type=float, default=DEFAULTS['maxVisualDelta'])
    args = parser.parse_args()
    data = json.loads(Path(args.metrics_json).read_text('utf-8'))
    limits = {
        'minFps': args.min_fps,
        'maxP95FrameMs': args.max_p95_frame_ms,
        'maxTextureVramMB': args.max_texture_vram_mb,
        'maxVisualDelta': args.max_visual_delta,
    }
    result = verify(data, limits)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['passed'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
