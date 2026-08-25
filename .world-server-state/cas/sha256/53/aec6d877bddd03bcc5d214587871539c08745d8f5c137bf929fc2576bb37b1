#!/usr/bin/env python3
from __future__ import annotations
import argparse, datetime as dt, json, shutil
from pathlib import Path
from quality_common import ROOT, QUALITY, read_json, sha256, write_json

FILES=['quality/standards.json','quality/rules.json','quality/knowledge/incidents.json','quality/knowledge/patterns.json','quality/knowledge/quality-genome.json','quality/knowledge/protection-pack.json']

def build_lock():
    return {'pack':'WORLD_FACTORY_QUALITY_CORE_V10','version':'9.0.0','generatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'files':{f:sha256(ROOT/f) for f in FILES}}

def sync(consumer:Path):
    target=consumer/'.world-quality'; target.mkdir(parents=True,exist_ok=True)
    for rel in FILES:
        dst=target/rel.replace('quality/','',1); dst.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(ROOT/rel,dst)
    write_json(target/'quality-pack.lock.json',build_lock())
    print(f'Synced mandatory quality pack -> {target}')

def main():
    ap=argparse.ArgumentParser(description='Propagate the same proven quality rules to every project without copying/forking runtime logic manually.')
    ap.add_argument('consumers',type=Path,nargs='+'); a=ap.parse_args()
    for c in a.consumers: sync(c.resolve())
if __name__=='__main__':main()
