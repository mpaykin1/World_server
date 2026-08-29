from __future__ import annotations
import argparse, json
from pathlib import Path
from ai3d.texture_runtime_v7 import build_cdn_region_package_plan

p = argparse.ArgumentParser()
p.add_argument('network_plan_json')
p.add_argument('runtime_plan_json')
p.add_argument('--regions', default='global')
p.add_argument('--chunk-kb', type=int, default=1024)
p.add_argument('--out', default='texture-cdn-region-package-plan.json')
a = p.parse_args()
network = json.loads(Path(a.network_plan_json).read_text(encoding='utf-8'))
runtime = json.loads(Path(a.runtime_plan_json).read_text(encoding='utf-8'))
report = build_cdn_region_package_plan(network, runtime, [x.strip() for x in a.regions.split(',') if x.strip()], a.chunk_kb)
Path(a.out).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'ok': True, 'chunkCount': report['chunkCount'], 'out': a.out}))
