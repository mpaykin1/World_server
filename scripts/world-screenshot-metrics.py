import json, sys
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

def metrics(path):
    img = Image.open(path).convert('RGB').resize((96, 96))
    stat = ImageStat.Stat(img)
    std = sum(stat.stddev) / 3.0
    colors = img.getcolors(maxcolors=96 * 96) or []
    return {
        'stddev': round(std, 3),
        'uniqueColors': len(colors),
        'nonBlank': bool(std >= 3.0 and len(colors) >= 12),
    }

def diff(a, b):
    ia = Image.open(a).convert('RGB').resize((96, 96))
    ib = Image.open(b).convert('RGB').resize((96, 96))
    d = ImageChops.difference(ia, ib)
    stat = ImageStat.Stat(d)
    mean = sum(stat.mean) / 3.0
    changed = sum(1 for p in d.getdata() if max(p) >= 8) / (96 * 96)
    return {'meanAbsDiff': round(mean, 3), 'changedRatio': round(changed, 4),
            'changed': bool(mean >= 0.45 and changed >= 0.002)}

if len(sys.argv) == 2:
    print(json.dumps(metrics(Path(sys.argv[1]))))
elif len(sys.argv) == 3:
    print(json.dumps(diff(Path(sys.argv[1]), Path(sys.argv[2]))))
else:
    raise SystemExit('usage: world-screenshot-metrics.py image [image2]')
