#!/usr/bin/env python3
from __future__ import annotations
import argparse, sys
from pathlib import Path
from quality_common import ROOT, sha256, read_json
from propagate_to_consumers import discover, PACK_FILES, runtime_hash, pack_hash
from select_canaries import select as select_canaries

def verify(markers):
 errors=[];expected={Path(f).name:sha256(ROOT/f) for f in PACK_FILES};ph=pack_hash();rh=runtime_hash()
 for m in markers:
  lock=m.parent/'.world-quality/quality-pack.lock.json';d=read_json(lock,{})
  if d.get('pack')!='WORLD_FACTORY_QUALITY_CORE_V10':errors.append(f'{m.parent}: missing/stale pack id');continue
  if d.get('files')!=expected:errors.append(f'{m.parent}: quality pack hashes are stale')
  if d.get('packHash')!=ph:errors.append(f'{m.parent}: aggregate quality pack hash is stale')
  if d.get('runtimeHash')!=rh:errors.append(f'{m.parent}: shared runtime hash is stale')
  cfg=read_json(m,{})
  if cfg.get('mode')!='shared-runtime':errors.append(f'{m.parent}: consumer must use shared-runtime mode')
  if cfg.get('inheritQualityGenome') is not True:errors.append(f'{m.parent}: quality genome inheritance disabled')
 return errors

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--repo',type=Path,default=ROOT.parent);ap.add_argument('--scope',choices=['all','canary'],default='all');a=ap.parse_args();markers=discover(a.repo.resolve())
 if a.scope=='canary':markers=select_canaries(a.repo.resolve(),min(3,len(markers))) if markers else []
 errors=verify(markers);print(f'CONSUMER PROPAGATION GATE: {"PASS" if not errors else "FAIL"} — scope={a.scope} consumers={len(markers)}')
 for e in errors:print(' -',e)
 return 0 if not errors else 1
if __name__=='__main__':sys.exit(main())
