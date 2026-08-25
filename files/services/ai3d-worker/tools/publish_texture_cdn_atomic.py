#!/usr/bin/env python3
import argparse,json,os
from ai3d.texture_runtime_v9 import AtomicCdnPublisher
p=argparse.ArgumentParser(); p.add_argument('root'); p.add_argument('manifest'); p.add_argument('--channel',default='candidate'); p.add_argument('--secret',default=os.environ.get('TEXTURE_CDN_SIGNING_SECRET','')); a=p.parse_args()
if len(a.secret)<16: raise SystemExit('signing secret must be >=16 chars')
pub=AtomicCdnPublisher(a.root,a.secret); m=json.load(open(a.manifest,encoding='utf-8')); print(json.dumps(pub.publish_manifest(m,a.channel),indent=2))
