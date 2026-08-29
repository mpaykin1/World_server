from __future__ import annotations
import argparse, json
from pathlib import Path
from ai3d.texture_runtime_v7 import detect_residency_thrash

p = argparse.ArgumentParser()
p.add_argument('events_json')
p.add_argument('--out', default='texture-residency-thrash-report.json')
p.add_argument('--window-seconds', type=float, default=12.0)
p.add_argument('--reload-threshold', type=int, default=3)
a = p.parse_args()
raw = json.loads(Path(a.events_json).read_text(encoding='utf-8'))
events = raw.get('events', raw) if isinstance(raw, dict) else raw
report = detect_residency_thrash(events, a.window_seconds, a.reload_threshold)
Path(a.out).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'ok': True, 'thrashingSetCount': report['thrashingSetCount'], 'out': a.out}))
