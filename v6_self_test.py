from __future__ import annotations
from pathlib import Path
import json
import tempfile
import numpy as np
import cv2

from pixel3dgs.capture_pose import fuse_capture_poses
from pixel3dgs.dynamic4d_cpu import build_character_temporal_tracks
from pixel3dgs.model_manager import scan_models
from pixel3dgs.api import app

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'output' / 'demo_build'
OUT.mkdir(parents=True, exist_ok=True)

checks = {}

# 1) phone pose fusion
pose_path = OUT / 'synthetic_capture_pose.json'
samples = []
for i in range(40):
    samples.append({
        't_s': i * 0.05,
        'orientation': {'alpha': 10 + i * 0.6, 'beta': 0, 'gamma': 0},
        'position': [i * 0.01, 0, i * 0.02],
    })
pose_path.write_text(json.dumps({'version': 'test', 'samples': samples}), encoding='utf-8')
base = [{'C': np.array([0,1.65,i*0.1], np.float32), 'R': np.eye(3,dtype=np.float32), 'source':'test'} for i in range(10)]
frames = [{'time_s': i*0.18} for i in range(10)]
fused, report = fuse_capture_poses(base, frames, pose_path)
checks['phone_pose_fusion'] = bool(report.get('used') and report.get('orientation_used') and report.get('native_position_used') and len(fused)==10)

# 2) dynamic 4D temporal tracks
frames_bgr=[];masks=[]
for i in range(12):
    im=np.zeros((128,96,3),np.uint8)
    x=30+i
    cv2.rectangle(im,(x,22),(x+28,112),(80,180,230),-1)
    cv2.circle(im,(x+14,18),10,(120,210,250),-1)
    mask=np.zeros((128,96),np.uint8)
    cv2.rectangle(mask,(x,18),(x+28,116),255,-1)
    frames_bgr.append(im);masks.append(mask)
d4 = build_character_temporal_tracks(frames_bgr,masks,OUT/'v6_dynamic4d_test',grid_step=8,max_tracks=600)
checks['dynamic4d_tracks'] = bool(d4.get('ok') and d4.get('track_count',0)>10 and Path(d4['tracks_file']).exists())

# 3) model manager/autodetection
models = scan_models()
checks['model_manager'] = all(k in models for k in ('depth','matcher','flow','segmentation'))

# 4) API routes
routes = {getattr(r,'path',None) for r in app.routes}
checks['phone_capture_api'] = '/capture/upload' in routes and '/models/status' in routes
checks['phone_capture_static'] = '/capture-app' in routes
checks['phone_capture_files'] = (ROOT/'phone_capture'/'index.html').exists() and (ROOT/'phone_capture'/'manifest.webmanifest').exists()

result = {
    'ok': all(checks.values()),
    'checks': checks,
    'pose_report': report,
    'dynamic4d_report': d4,
    'model_status': models,
}
(OUT/'v6_self_test_report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
raise SystemExit(0 if result['ok'] else 1)
