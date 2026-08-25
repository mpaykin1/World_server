from __future__ import annotations
import argparse,json,os
from ai3d.texture_runtime_v10 import verify_reproducible_attestation
p=argparse.ArgumentParser(); p.add_argument('json'); p.add_argument('--secret',default=os.environ.get('TEXTURE_ATTESTATION_SECRET','')); a=p.parse_args(); att=json.load(open(a.json,encoding='utf-8')); ok=verify_reproducible_attestation(att,a.secret); print(json.dumps({'ok':ok},indent=2)); raise SystemExit(0 if ok else 2)
