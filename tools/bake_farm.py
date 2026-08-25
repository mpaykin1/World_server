#!/usr/bin/env python3
"""Content-addressed bake farm with deterministic sharding.

The same source SHA + tool SHA + parameters produce the same artifact key. CI machines can run
separate shards, upload `.quality-cache/bakes/<key>`, and merge without rebaking. Source files are
hash-checked before/after each job. No bake task is allowed to rewrite source assets.
"""
from __future__ import annotations
import argparse, hashlib, json, os, shutil, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from pathlib import Path
from quality_common import ROOT, QUALITY, read_json, write_json, sha256
CACHE=ROOT/'.quality-cache/bakes'
@dataclass(frozen=True)
class BakeTask:
 world:str;kind:str;source:str;source_sha:str;tool:str;params:tuple;output:str

def file_sha(p): return sha256(Path(p))
def cache_key(source_sha:str,tool_sha:str,params:dict,schema='bake-farm-v1'):
 payload={'sourceSha':source_sha,'toolSha':tool_sha,'params':params,'schema':schema}
 return hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def key(t:BakeTask):
 tool=ROOT/t.tool;payload={'kind':t.kind,'sourceSha':t.source_sha,'toolSha':file_sha(tool),'params':dict(t.params),'schema':'bake-farm-v1'}
 return hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def discover():
 reg=read_json(ROOT/'worlds/registry.json',{});tasks=[]
 for w in reg.get('worlds',[]):
  mf=(ROOT/w['manifest']).resolve();m=read_json(mf,{});src=(mf.parent/m['visual']['url']).resolve();v=m['visual']['type'];wid=m['id'];ss=m['visual']['sha256']
  if not src.exists():continue
  if v=='ply-mesh':
   tasks.append(BakeTask(wid,'gi',str(src),ss,'tools/bake_offline_gi.py',(('grid','48'),('rays','12'),('max-steps','64'),('bounces','1')),str(mf.parent/'generated/gi-v8')))
   tasks.append(BakeTask(wid,'reflection',str(src),ss,'tools/bake_reflection_probes.py',(('resolution','32'),('grid','48')),str(mf.parent/'generated/reflection-v8')))
   tasks.append(BakeTask(wid,'meshlets',str(src),ss,'tools/build_meshlets.py',(('max-tris','128'),),str(mf.parent/'generated/meshlets-v8.json')))
 return tasks

def command(t:BakeTask,out:Path):
 p=dict(t.params)
 if t.kind=='gi': return [sys.executable,str(ROOT/t.tool),t.source,str(out),'--grid',p['grid'],'--rays',p['rays'],'--max-steps',p['max-steps'],'--bounces',p['bounces']]
 if t.kind=='reflection': return [sys.executable,str(ROOT/t.tool),t.source,str(out),'--resolution',p['resolution'],'--grid',p['grid']]
 if t.kind=='meshlets': return [sys.executable,str(ROOT/t.tool),t.source,str(out),'--max-tris',p['max-tris']]
 raise ValueError(t.kind)
def materialize_cached(t:BakeTask,cache_dir:Path):
    """Atomically install derived cache artifact into the world generated path. Never touches source."""
    src=cache_dir/'artifact';
    if not src.exists(): src=cache_dir/'artifact.json.out'
    if not src.exists(): return False
    dst=Path(t.output);dst.parent.mkdir(parents=True,exist_ok=True)
    tmp=dst.with_name(dst.name+'.quality-tmp')
    if tmp.exists(): shutil.rmtree(tmp,ignore_errors=True) if tmp.is_dir() else tmp.unlink()
    if src.is_dir():
        shutil.copytree(src,tmp)
        if dst.exists(): shutil.rmtree(dst,ignore_errors=True) if dst.is_dir() else dst.unlink()
        os.replace(tmp,dst)
    else:
        shutil.copy2(src,tmp)
        if dst.exists(): dst.unlink() if dst.is_file() else shutil.rmtree(dst,ignore_errors=True)
        os.replace(tmp,dst)
    return True

def execute(t:BakeTask,dry=False):
 k=key(t);c=CACHE/k;manifest=c/'artifact.json';src=Path(t.source);sourceShaBefore=sha256(src);before=sourceShaBefore
 if before!=t.source_sha:return {'pass':False,'task':asdict(t),'key':k,'error':'source-sha-mismatch'}
 if manifest.exists():
  installed=True if dry else materialize_cached(t,c)
  return {'pass':bool(installed),'task':asdict(t),'key':k,'cacheHit':True,'artifactInstalled':installed,'sourceUnchanged':sha256(src)==before,'sourceShaBefore':before,'sourceShaAfter':sha256(src)}
 if dry:return {'pass':True,'task':asdict(t),'key':k,'cacheHit':False,'dryRun':True}
 tmp=CACHE/(k+'.tmp');shutil.rmtree(tmp,ignore_errors=True);tmp.mkdir(parents=True,exist_ok=True);out=tmp/('artifact.json.out' if t.kind=='meshlets' else 'artifact')
 p=subprocess.run(command(t,out),cwd=ROOT,text=True,capture_output=True)
 sourceShaAfter=sha256(src);after=sourceShaAfter;ok=p.returncode==0 and after==before
 if not ok:shutil.rmtree(tmp,ignore_errors=True);return {'pass':False,'task':asdict(t),'key':k,'returncode':p.returncode,'sourceUnchanged':after==before,'sourceShaBefore':before,'sourceShaAfter':after,'stdout':p.stdout[-2000:],'stderr':p.stderr[-2000:]}
 write_json(tmp/'artifact.json',{'schemaVersion':1,'key':k,'task':asdict(t),'sourceSha256':before,'sourceAssetModified':False,'createdBy':'content-addressed-bake-farm-v1'})
 c.parent.mkdir(parents=True,exist_ok=True);os.replace(tmp,c)
 installed=materialize_cached(t,c)
 return {'pass':bool(installed),'task':asdict(t),'key':k,'cacheHit':False,'artifactInstalled':installed,'sourceUnchanged':True,'sourceShaBefore':before,'sourceShaAfter':sha256(src)}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--shard-index',type=int,default=0);ap.add_argument('--shard-count',type=int,default=1);ap.add_argument('--workers',type=int,default=max(1,min(4,os.cpu_count() or 2)));ap.add_argument('--dry-run',action='store_true');a=ap.parse_args()
 all_tasks=discover();tasks=[t for i,t in enumerate(sorted(all_tasks,key=lambda x:(x.world,x.kind))) if i%a.shard_count==a.shard_index];start=time.time();results=[]
 with ThreadPoolExecutor(max_workers=a.workers) as ex:
  futs=[ex.submit(execute,t,a.dry_run) for t in tasks]
  for f in as_completed(futs):results.append(f.result())
 report={'schemaVersion':1,'pass':all(r['pass'] for r in results),'mode':'content-addressed-distributed-bake-farm-v1','shardIndex':a.shard_index,'shardCount':a.shard_count,'workers':a.workers,'totalDiscovered':len(all_tasks),'tasksInShard':len(tasks),'results':results,'durationSec':round(time.time()-start,3),'sourceAssetsMutable':False}
 write_json(QUALITY/'reports/bake-farm.json',report);print(json.dumps(report,ensure_ascii=False,indent=2));return 0 if report['pass'] else 1
if __name__=='__main__':raise SystemExit(main())
