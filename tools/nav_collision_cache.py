#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path

def key_for(source_sha, params):
    payload=json.dumps({'sourceSha256':source_sha,'params':params},sort_keys=True,separators=(',',':')).encode();return hashlib.sha256(payload).hexdigest()
def cache_descriptor(source_sha, kind, params):
    return {'schemaVersion':1,'kind':kind,'key':key_for(source_sha,params),'sourceSha256':source_sha,'params':params,'immutableSource':True,'reusableAcrossUnchangedProjects':True}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source-sha',default='0'*64);ap.add_argument('--kind',choices=['nav','collision'],default='nav');ap.add_argument('--params',default='{}');a=ap.parse_args();d=cache_descriptor(a.source_sha,a.kind,json.loads(a.params));print(json.dumps(d,indent=2));return 0
if __name__=='__main__':raise SystemExit(main())
