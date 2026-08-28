from __future__ import annotations
import argparse, json
from pathlib import Path
from ai3d.texture_runtime_v7 import build_multi_world_resource_plan

p = argparse.ArgumentParser()
p.add_argument('worlds_json')
p.add_argument('--vram-mb', type=float, default=1024)
p.add_argument('--network-mbps', type=float, default=50)
p.add_argument('--out', default='texture-multi-world-resource-plan.json')
a = p.parse_args()
raw = json.loads(Path(a.worlds_json).read_text(encoding='utf-8'))
worlds = raw.get('worlds', raw) if isinstance(raw, dict) else raw
report = build_multi_world_resource_plan(worlds, a.vram_mb, a.network_mbps)
Path(a.out).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'ok': True, 'worldCount': report['worldCount'], 'out': a.out}))
