from __future__ import annotations
import argparse,json,os
from pathlib import Path
from ai3d.texture_runtime_v10 import VerifiedObjectPublisher
p=argparse.ArgumentParser(); p.add_argument('file'); p.add_argument('--root',default=os.environ.get('TEXTURE_REMOTE_CDN_ROOT','')); p.add_argument('--bucket',default=os.environ.get('TEXTURE_REMOTE_CDN_BUCKET','')); p.add_argument('--endpoint',default=os.environ.get('TEXTURE_REMOTE_CDN_ENDPOINT','')); p.add_argument('--channel',default='candidate'); p.add_argument('--secret',default=os.environ.get('TEXTURE_CDN_SIGNING_SECRET','')); a=p.parse_args()
pub=VerifiedObjectPublisher(a.root,bucket=a.bucket,endpoint_url=a.endpoint); data=Path(a.file).read_bytes(); obj=pub.put_bytes(data,Path(a.file).suffix.lstrip('.') or 'bin'); out={'object':obj}
if obj.get('ok'): out['pointer']=pub.publish_pointer(a.channel,{'objects':[obj]},a.secret)
print(json.dumps(out,indent=2))
