from __future__ import annotations
import math
from pathlib import Path
import numpy as np
from PIL import Image


def _ssim_global(a: np.ndarray, b: np.ndarray) -> float:
    la = a[...,0]*0.2126 + a[...,1]*0.7152 + a[...,2]*0.0722
    lb = b[...,0]*0.2126 + b[...,1]*0.7152 + b[...,2]*0.0722
    ma, mb = float(la.mean()), float(lb.mean())
    va, vb = float(la.var()), float(lb.var())
    cov = float(np.mean((la-ma)*(lb-mb)))
    c1, c2 = 0.01**2, 0.03**2
    den = (ma*ma + mb*mb + c1) * (va + vb + c2)
    return max(0.0, min(1.0, ((2*ma*mb+c1)*(2*cov+c2))/den if den else 1.0))


def compare_renderbacks(before: Path, after: Path) -> dict:
    with Image.open(before) as a_raw, Image.open(after) as b_raw:
        a = a_raw.convert('RGB')
        b = b_raw.convert('RGB')
        resized = False
        if b.size != a.size:
            b = b.resize(a.size, Image.Resampling.LANCZOS)
            resized = True
        aa = np.asarray(a, dtype=np.float32)/255.0
        bb = np.asarray(b, dtype=np.float32)/255.0
    mae = float(np.mean(np.abs(aa-bb)))
    rmse = float(math.sqrt(np.mean((aa-bb)**2)))
    ssim = _ssim_global(aa,bb)
    visual_delta = max(0.0, min(1.0, 0.55*(1.0-ssim) + 0.30*mae + 0.15*rmse))
    return {
        'before': str(before), 'after': str(after), 'resizedForComparison': resized,
        'mae': round(mae, 7), 'rmse': round(rmse, 7), 'ssim': round(ssim, 7),
        'visualDelta': round(visual_delta, 7),
        'identical': bool(mae == 0.0),
    }
