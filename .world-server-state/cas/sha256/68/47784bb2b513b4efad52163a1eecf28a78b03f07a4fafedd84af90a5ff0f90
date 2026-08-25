from __future__ import annotations
import argparse, json, os, sys
from pathlib import Path
from ai3d.texture_runtime_v8 import verify_signed_cdn_manifest

def main():
    p=argparse.ArgumentParser(); p.add_argument('manifest'); p.add_argument('--secret-env',default='TEXTURE_CDN_SIGNING_SECRET'); a=p.parse_args()
    secret=os.environ.get(a.secret_env,'')
    if not secret: print(json.dumps({'ok':False,'error':'SIGNING_SECRET_MISSING'})); return 2
    manifest=json.loads(Path(a.manifest).read_text(encoding='utf-8')); ok=verify_signed_cdn_manifest(manifest,secret)
    print(json.dumps({'ok':ok,'algorithm':'HMAC-SHA256'},indent=2)); return 0 if ok else 3
if __name__=='__main__': raise SystemExit(main())
