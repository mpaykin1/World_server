#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, datetime as dt
from pathlib import Path
from quality_common import ROOT, QUALITY, read_json, write_json
from propagate_to_consumers import discover, sync_marker, restore_latest, pack_hash, runtime_hash
from verify_consumers import verify
from select_canaries import select as select_canaries
LEDGER=QUALITY/'knowledge/rollout-ledger.json'
def now():return dt.datetime.now(dt.timezone.utc).isoformat()
def record(obj):
 ledger=read_json(LEDGER,{'schemaVersion':2,'rollouts':[]});ledger['schemaVersion']=2;ledger.setdefault('rollouts',[]).append(obj);write_json(LEDGER,ledger)
def transactional_promote(repo:Path):
 markers=discover(repo);canary=select_canaries(repo,min(3,len(markers))) if markers else [];touched=[]
 try:
  for m in canary:sync_marker(m,backup=True);touched.append(m)
  errors=verify(canary)
  if errors:raise RuntimeError('canary verification failed: '+'; '.join(errors))
  for m in markers:
   if m not in canary:sync_marker(m,backup=True);touched.append(m)
  errors=verify(markers)
  if errors:raise RuntimeError('full rollout verification failed: '+'; '.join(errors))
  obj={'at':now(),'pack':'WORLD_FACTORY_QUALITY_CORE_V10','mode':'promote','status':'committed','consumers':[str(m.parent) for m in markers],'canary':[str(m.parent) for m in canary],'packHash':pack_hash(),'runtimeHash':runtime_hash()};record(obj);return {'pass':True,**obj}
 except Exception as exc:
  restored=[restore_latest(m) for m in reversed(touched)];obj={'at':now(),'pack':'WORLD_FACTORY_QUALITY_CORE_V10','mode':'promote','status':'rolled-back','error':str(exc),'restored':restored,'packHash':pack_hash(),'runtimeHash':runtime_hash()};record(obj);return {'pass':False,**obj}
def main():
 ap=argparse.ArgumentParser(description='Transactional canary-first quality propagation with automatic rollback.')
 ap.add_argument('--repo',type=Path,default=ROOT.parent);ap.add_argument('--mode',choices=['canary','all','promote','rollback'],default='promote');a=ap.parse_args();repo=a.repo.resolve();markers=discover(repo)
 if a.mode=='promote':r=transactional_promote(repo)
 elif a.mode=='rollback':r={'pass':True,'mode':'rollback','results':[restore_latest(m) for m in markers]}
 else:
  selected=select_canaries(repo,min(3,len(markers))) if a.mode=='canary' and markers else markers
  results=[sync_marker(m,backup=True) for m in selected];errors=verify(selected);r={'pass':not errors,'mode':a.mode,'results':results,'errors':errors,'packHash':pack_hash(),'runtimeHash':runtime_hash()};record({'at':now(),**r})
 print(json.dumps(r,ensure_ascii=False,indent=2));raise SystemExit(0 if r.get('pass') else 1)
if __name__=='__main__':main()
