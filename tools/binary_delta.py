#!/usr/bin/env python3
from __future__ import annotations
import argparse, base64, hashlib, json, tempfile
from pathlib import Path

def make_delta(old: bytes, new: bytes):
    spans=[]; i=0; common=min(len(old),len(new))
    while i<common:
        if old[i]==new[i]: i+=1; continue
        s=i
        while i<common and old[i]!=new[i]: i+=1
        spans.append({'start':s,'data':base64.b64encode(new[s:i]).decode()})
    if len(new)>common: spans.append({'start':common,'data':base64.b64encode(new[common:]).decode()})
    return {'schemaVersion':1,'mode':'exact-derived-binary-delta-v1','baseSha256':hashlib.sha256(old).hexdigest(),'targetSha256':hashlib.sha256(new).hexdigest(),'targetSize':len(new),'spans':spans,'lossy':False}

def apply_delta(old: bytes, d):
    out=bytearray(old[:d['targetSize']]);
    if len(out)<d['targetSize']: out.extend(b'\0'*(d['targetSize']-len(out)))
    for s in d['spans']:
        b=base64.b64decode(s['data']); out[s['start']:s['start']+len(b)]=b
    return bytes(out)

def self_test():
    old=(b'A'*10000)+b'HELLO'+(b'B'*9000); new=old[:7777]+b'WORLD-QUALITY'+old[7784:]+b'TAIL'
    d=make_delta(old,new); rebuilt=apply_delta(old,d)
    return {'schemaVersion':1,'pass':rebuilt==new and hashlib.sha256(rebuilt).hexdigest()==d['targetSha256'],'mode':d['mode'],'spans':len(d['spans']),'baseBytes':len(old),'targetBytes':len(new),'exactReconstruction':rebuilt==new}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--self-test',action='store_true'); a=ap.parse_args(); out=self_test(); print(json.dumps(out,indent=2)); return 0 if out['pass'] else 2
if __name__=='__main__': raise SystemExit(main())
