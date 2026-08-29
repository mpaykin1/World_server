from __future__ import annotations
import argparse,json
from ai3d.texture_runtime_v10 import forecast_resource_risk
p=argparse.ArgumentParser(); p.add_argument('json'); a=p.parse_args(); rows=json.load(open(a.json,encoding='utf-8')); r=forecast_resource_risk(rows); print(json.dumps(r,indent=2)); raise SystemExit(0 if r.get('gate')=='PASS' else 2)
