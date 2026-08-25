#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, shutil, datetime as dt, hashlib
from pathlib import Path
from quality_common import ROOT, read_json, sha256, write_json

PACK_FILES=['quality/standards.json','quality/rules.json','quality/knowledge/incidents.json','quality/knowledge/patterns.json','quality/knowledge/quality-genome.json','quality/knowledge/protection-pack.json','quality/knowledge/quality-ratchet.json','quality/device-matrix.json']

def runtime_hash():
 files=sorted((ROOT/'src').glob('*.js'));payload=''.join(f.name+':'+sha256(f) for f in files).encode();return hashlib.sha256(payload).hexdigest()
def pack_hash():
 payload=''.join(Path(f).name+':'+sha256(ROOT/f) for f in PACK_FILES).encode();return hashlib.sha256(payload).hexdigest()
def discover(repo:Path):
 out=[]
 for p in repo.rglob('.world-quality-consumer.json'):
  if any(x in p.parts for x in ('.git','node_modules','.venv','templates')):continue
  out.append(p)
 return sorted(out,key=lambda p:str(p))
def _backup(dest:Path):
 if not dest.exists():return None
 stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');bak=dest/'rollback'/stamp;bak.mkdir(parents=True,exist_ok=True)
 for f in [*dest.glob('*.json')]:
  if f.parent==dest:shutil.copy2(f,bak/f.name)
 return bak
def sync_marker(marker:Path,backup=True):
 cfg=read_json(marker,{});dest=marker.parent/'.world-quality';dest.mkdir(parents=True,exist_ok=True)
 bak=_backup(dest) if backup else None
 for rel in PACK_FILES:shutil.copy2(ROOT/rel,dest/Path(rel).name)
 lock={'pack':'WORLD_FACTORY_QUALITY_CORE_V10','version':'9.0.0','mode':cfg.get('mode','shared-runtime'),'runtimeHash':runtime_hash(),'packHash':pack_hash(),'runtimeContract':'central-shared-runtime-no-forks','files':{Path(f).name:sha256(ROOT/f) for f in PACK_FILES},'consumer':cfg.get('project',marker.parent.name)}
 write_json(dest/'quality-pack.lock.json',lock);return {'consumer':str(marker.parent),'backup':str(bak) if bak else None,'packHash':lock['packHash']}
def restore_latest(marker:Path):
 dest=marker.parent/'.world-quality';root=dest/'rollback'
 if not root.exists():return {'consumer':str(marker.parent),'restored':False,'reason':'no-backup'}
 backups=sorted([p for p in root.iterdir() if p.is_dir()])
 if not backups:return {'consumer':str(marker.parent),'restored':False,'reason':'no-backup'}
 bak=backups[-1]
 for f in bak.glob('*.json'):shutil.copy2(f,dest/f.name)
 return {'consumer':str(marker.parent),'restored':True,'backup':str(bak)}
def main():
 ap=argparse.ArgumentParser(description='Propagate current quality pack to registered consumers with rollback snapshots.')
 ap.add_argument('--repo',type=Path,default=ROOT.parent);ap.add_argument('--rollback',action='store_true');a=ap.parse_args();markers=discover(a.repo.resolve())
 result=[restore_latest(m) for m in markers] if a.rollback else [sync_marker(m) for m in markers]
 print(json.dumps({'consumers':len(result),'results':result},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
