from __future__ import annotations
import argparse,json
from ai3d.texture_runtime_v10 import analyze_shader_hitches
p=argparse.ArgumentParser(); p.add_argument('json'); a=p.parse_args(); data=json.load(open(a.json,encoding='utf-8')); r=analyze_shader_hitches(data if isinstance(data,list) else data.get('events',[])); print(json.dumps(r,indent=2)); raise SystemExit(0 if r.get('gate')=='PASS' else 2)
