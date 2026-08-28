from __future__ import annotations
import argparse,json,os
from ai3d.texture_runtime_v10 import ManagedQueueBackend
p=argparse.ArgumentParser(); p.add_argument('--dsn',default=os.environ.get('TEXTURE_MANAGED_QUEUE_DSN','')); p.add_argument('--token',default=os.environ.get('TEXTURE_MANAGED_QUEUE_TOKEN','')); a=p.parse_args()
print(json.dumps(ManagedQueueBackend(a.dsn,a.token).capability(),indent=2))
