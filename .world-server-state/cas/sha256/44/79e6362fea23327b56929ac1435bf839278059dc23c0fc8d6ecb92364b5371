from __future__ import annotations
import argparse, json
from pixel3dgs.model_manager import scan_models, auto_install_from_manifest, install_from_url

p=argparse.ArgumentParser()
p.add_argument('command',choices=['status','auto-install','install'])
p.add_argument('--alias',choices=['depth','matcher','flow','segmentation'])
p.add_argument('--url')
p.add_argument('--filename')
p.add_argument('--sha256')
a=p.parse_args()
if a.command=='status': r=scan_models()
elif a.command=='auto-install': r=auto_install_from_manifest()
else:
    if not a.alias or not a.url: p.error('install requires --alias and --url')
    r=install_from_url(a.alias,a.url,a.filename,a.sha256)
print(json.dumps(r,ensure_ascii=False,indent=2))
