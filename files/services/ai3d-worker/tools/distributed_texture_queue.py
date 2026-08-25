from __future__ import annotations
import argparse, json
from ai3d.texture_runtime_v8 import DistributedTextureQueue

def main():
    p=argparse.ArgumentParser(); p.add_argument('--db',required=True); sub=p.add_subparsers(dest='cmd',required=True)
    e=sub.add_parser('enqueue'); e.add_argument('--kind',required=True); e.add_argument('--payload',default='{}'); e.add_argument('--priority',type=int,default=50)
    l=sub.add_parser('lease'); l.add_argument('--worker',required=True); l.add_argument('--lease-seconds',type=int,default=180); l.add_argument('--kind',action='append')
    c=sub.add_parser('complete'); c.add_argument('--worker',required=True); c.add_argument('--id',required=True); c.add_argument('--result',default='{}')
    f=sub.add_parser('fail'); f.add_argument('--worker',required=True); f.add_argument('--id',required=True); f.add_argument('--error',required=True); f.add_argument('--no-retry',action='store_true')
    sub.add_parser('stats')
    a=p.parse_args(); q=DistributedTextureQueue(a.db)
    if a.cmd=='enqueue': out={'id':q.enqueue(a.kind,json.loads(a.payload),a.priority)}
    elif a.cmd=='lease': out=q.lease(a.worker,a.lease_seconds,a.kind) or {'job':None}
    elif a.cmd=='complete': out={'ok':q.complete(a.id,a.worker,json.loads(a.result))}
    elif a.cmd=='fail': out={'ok':q.fail(a.id,a.worker,a.error,not a.no_retry)}
    else: out=q.stats()
    print(json.dumps(out,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
