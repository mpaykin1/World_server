#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path
import numpy as np
from PIL import Image


def analyze_image(path: Path) -> dict:
    with Image.open(path) as im:
        arr = np.asarray(im.convert('RGB'), dtype=np.float32) / 255.0
        w, h = im.size
    gray = 0.2126 * arr[...,0] + 0.7152 * arr[...,1] + 0.0722 * arr[...,2]
    gx = np.diff(gray, axis=1)
    gy = np.diff(gray, axis=0)
    sharp = float((gx.var() + gy.var()) * 10000.0)
    edge = max(1, min(8, w // 80))
    seam = float(np.mean(np.abs(arr[:, :edge] - arr[:, -edge:]))) if w >= 2*edge else 1.0
    dark = float(np.mean(gray < 0.02))
    bright = float(np.mean(gray > 0.98))
    ratio = w / max(h, 1)
    ratio_score = max(0.0, 1.0 - abs(ratio - 2.0) / 0.3)
    seam_score = max(0.0, 1.0 - seam / 0.20)
    sharp_score = max(0.0, min(1.0, sharp / 20.0))
    exposure_score = max(0.0, 1.0 - min(1.0, (dark + bright) / 0.20))
    score = round(100.0 * (0.25*ratio_score + 0.30*seam_score + 0.30*sharp_score + 0.15*exposure_score))
    return {
        'path': str(path), 'width': w, 'height': h, 'aspect_ratio': round(ratio,4),
        'seam_mae': round(seam,5), 'sharpness_index': round(sharp,3),
        'clipped_dark_fraction': round(dark,4), 'clipped_bright_fraction': round(bright,4),
        'score': int(max(0,min(100,score)))
    }


def main() -> int:
    ap=argparse.ArgumentParser(); ap.add_argument('--output',required=True); a=ap.parse_args()
    out=Path(a.output).expanduser().resolve(); mp=out/'GS360_MANIFEST.json'
    if not mp.is_file():
        print(json.dumps({'pass':False,'error':'manifest_missing'})); return 2
    m=json.loads(mp.read_text(encoding='utf-8'))
    paths=[Path(x.get('path','')) for x in m.get('inputs',[]) if x.get('path')]
    rows=[]
    for p in paths:
        if p.is_file(): rows.append(analyze_image(p))
    avg=round(sum(x['score'] for x in rows)/len(rows)) if rows else 0
    rec=[]
    if rows and any(x['seam_mae']>0.12 for x in rows): rec.append('Panorama seam is strong; fix/stitch the left-right seam before accurate reconstruction.')
    if rows and any(x['sharpness_index']<5 for x in rows): rec.append('Some inputs are soft/blurred; recapture or use sharper frames for accurate mode.')
    if rows and any((x['clipped_dark_fraction']+x['clipped_bright_fraction'])>0.15 for x in rows): rec.append('Exposure clipping is high; use more even exposure if possible.')
    rep={'schema':'world-server.gs360-input-quality/v1','pass':bool(rows) and avg>=55,'status':'PASS' if avg>=70 else ('WARN' if avg>=55 else 'FAIL'),'score':avg,'inputs':rows,'recommendations':rec}
    (out/'GS360_INPUT_QUALITY.json').write_text(json.dumps(rep,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps(rep,ensure_ascii=False)); return 0 if rows else 2
if __name__=='__main__': raise SystemExit(main())
