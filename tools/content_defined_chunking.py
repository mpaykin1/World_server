#!/usr/bin/env python3
from __future__ import annotations
import argparse, base64, hashlib, json, tempfile
from pathlib import Path

# Deterministic gear hash: content boundaries survive insertions better than fixed offsets.
GEAR=[int(hashlib.sha256(f'world-factory-v10-{i}'.encode()).hexdigest()[:16],16) for i in range(256)]

def chunks(data: bytes, min_size=64*1024, avg_size=256*1024, max_size=1024*1024):
    mask=(1 << max(10,(avg_size.bit_length()-1))) - 1
    start=0; h=0
    for i,b in enumerate(data):
        h=((h<<1)+GEAR[b]) & ((1<<64)-1)
        n=i-start+1
        if n>=min_size and ((h & mask)==0 or n>=max_size):
            yield start, i+1, data[start:i+1]; start=i+1; h=0
    if start<len(data): yield start,len(data),data[start:]

def build(path: Path, out: Path|None=None):
    raw=path.read_bytes(); entries=[]
    for i,(s,e,c) in enumerate(chunks(raw)):
        entries.append({'index':i,'start':s,'end':e,'size':len(c),'sha256':hashlib.sha256(c).hexdigest()})
    rebuilt=b''.join(raw[x['start']:x['end']] for x in entries)
    manifest={'schemaVersion':1,'mode':'content-defined-lossless-chunking-v1','source':str(path),'sourceSha256':hashlib.sha256(raw).hexdigest(),'sourceBytes':len(raw),'chunks':entries,'chunkCount':len(entries),'reconstructionSha256':hashlib.sha256(rebuilt).hexdigest(),'byteExact':rebuilt==raw,'sourceAssetModified':False}
    if out: out.write_text(json.dumps(manifest,indent=2)+'\n')
    return manifest

def self_test():
    with tempfile.TemporaryDirectory() as td:
        p=Path(td)/'x.bin'; p.write_bytes(bytes((i*73+19)&255 for i in range(2_600_003)))
        return build(p)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('path',nargs='?'); ap.add_argument('--out'); ap.add_argument('--self-test',action='store_true'); a=ap.parse_args()
    m=self_test() if a.self_test or not a.path else build(Path(a.path),Path(a.out) if a.out else None); print(json.dumps(m,indent=2)); return 0 if m['byteExact'] else 2
if __name__=='__main__': raise SystemExit(main())
