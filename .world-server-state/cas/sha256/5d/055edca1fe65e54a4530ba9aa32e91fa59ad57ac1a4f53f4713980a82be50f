from __future__ import annotations
import argparse,json,os
from ai3d.texture_runtime_v10 import DeviceFarmExecutor
p=argparse.ArgumentParser(); p.add_argument('jobs_json'); p.add_argument('--endpoint',default=os.environ.get('TEXTURE_DEVICE_FARM_ENDPOINT','')); p.add_argument('--token',default=os.environ.get('TEXTURE_DEVICE_FARM_TOKEN','')); p.add_argument('--submit',action='store_true'); a=p.parse_args(); jobs=json.load(open(a.jobs_json,encoding='utf-8')); ex=DeviceFarmExecutor(a.endpoint,a.token); out={'plan':ex.plan(jobs)}
if a.submit and a.endpoint: out['results']=[ex.submit(j) for j in jobs]
print(json.dumps(out,indent=2))
