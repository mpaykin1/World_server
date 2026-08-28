from __future__ import annotations
import argparse,json
from ai3d.texture_runtime_v10 import profile_frame_graph
p=argparse.ArgumentParser(); p.add_argument('json'); a=p.parse_args(); data=json.load(open(a.json,encoding='utf-8')); print(json.dumps(profile_frame_graph(data if isinstance(data,list) else data.get('events',[])),indent=2))
