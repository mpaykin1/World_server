#!/usr/bin/env python3
import argparse,json
from ai3d.texture_runtime_v9 import DeviceLabStore
p=argparse.ArgumentParser(); p.add_argument('db'); p.add_argument('run_id'); p.add_argument('--ingest'); p.add_argument('--device'); p.add_argument('--profile',default='balanced'); a=p.parse_args(); s=DeviceLabStore(a.db)
if a.ingest:
    if not a.device: raise SystemExit('--device required with --ingest')
    s.ingest(a.run_id,a.device,a.profile,json.load(open(a.ingest,encoding='utf-8')))
print(json.dumps(s.summarize(a.run_id),indent=2))
