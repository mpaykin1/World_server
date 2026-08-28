from __future__ import annotations
import argparse,json
from ai3d.texture_runtime_v10 import bisect_regression
p=argparse.ArgumentParser(); p.add_argument('json'); a=p.parse_args(); rows=json.load(open(a.json,encoding='utf-8')); r=bisect_regression(rows); print(json.dumps(r,indent=2)); raise SystemExit(2 if r.get('status') in {'FOUND','BASELINE_FAILS','INSUFFICIENT_DATA'} else 0)
