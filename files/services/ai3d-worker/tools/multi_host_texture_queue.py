#!/usr/bin/env python3
import argparse,json,sys
from ai3d.texture_runtime_v9 import MultiHostTextureQueue
p=argparse.ArgumentParser(); p.add_argument('db'); p.add_argument('action',choices=['enqueue','lease','stats']); p.add_argument('--host',default='desktop-ai'); p.add_argument('--kind',default='transcode'); p.add_argument('--payload',default='{}'); p.add_argument('--capability',action='append',default=[]); a=p.parse_args()
q=MultiHostTextureQueue(a.db)
if a.action=='enqueue': print(q.enqueue(a.kind,json.loads(a.payload)))
elif a.action=='lease': print(json.dumps(q.lease(a.host,capabilities=a.capability),indent=2))
else: print(json.dumps(q.stats(),indent=2))
