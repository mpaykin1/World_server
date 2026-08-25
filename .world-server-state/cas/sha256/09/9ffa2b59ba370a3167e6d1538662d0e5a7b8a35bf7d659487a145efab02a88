#!/usr/bin/env python3
"""Sandboxed Fix -> Code -> Test -> Rule -> Rollout orchestrator.

It never invents arbitrary code itself. A connected desktop/code executor may edit only a temporary
sandbox. The orchestrator then proves source hashes, historical tests, protection rules and quality
ratchet before a candidate can be applied. This is the safe automation boundary for unknown bugs.
"""
from __future__ import annotations
import argparse, json, os, shlex, shutil, subprocess, sys, tempfile
from pathlib import Path
from quality_common import ROOT, QUALITY, read_json, write_json, sha256

def source_hashes(root:Path):
 out={};reg=read_json(root/'worlds/registry.json',{})
 for w in reg.get('worlds',[]):
  mf=root/w['manifest'];m=read_json(mf,{});p=(mf.parent/m.get('visual',{}).get('url','')).resolve()
  if p.is_file():out[str(p.relative_to(root))]=sha256(p)
 return out

def run(cwd:Path,cmd):
 p=subprocess.run(cmd,cwd=cwd,text=True,capture_output=True);return {'cmd':cmd,'pass':p.returncode==0,'returncode':p.returncode,'stdout':p.stdout[-8000:],'stderr':p.stderr[-8000:]}
def executor_cmd(template,sandbox,task):
 text=template.replace('{sandbox}',str(sandbox)).replace('{task}',str(task));return shlex.split(text)
def proof(sandbox:Path):
 steps=[]
 for cmd in ([sys.executable,'tools/fix_rule_agent.py'],[sys.executable,'tools/compile_protection_pack.py'],[sys.executable,'tools/quality_graph.py','--repo',str(sandbox.parent)],[sys.executable,'tools/quality_pipeline.py'],[sys.executable,'tools/quality_ratchet.py']):
  r=run(sandbox,cmd);steps.append(r)
  if not r['pass']:return False,steps
 return True,steps

def changed_files(a:Path,b:Path):
 out=[]
 for p in b.rglob('*'):
  if not p.is_file() or '.quality-cache' in p.parts or '__pycache__' in p.parts:continue
  rel=p.relative_to(b);q=a/rel
  if not q.exists() or q.read_bytes()!=p.read_bytes():out.append(str(rel))
 return out

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--executor',default=os.environ.get('QUALITY_CODE_EXECUTOR',''));ap.add_argument('--apply',action='store_true');ap.add_argument('--max-incidents',type=int,default=1);a=ap.parse_args()
 queue=read_json(QUALITY/'knowledge/fix-queue.json',{}).get('queue',[])[:a.max_incidents]
 if not queue:
  r={'pass':True,'mode':'sandboxed-fix-code-test-rule-rollout-v1','state':'no-unprotected-incidents','applied':False};write_json(QUALITY/'reports/autonomous-fix-agent.json',r);print(json.dumps(r,indent=2));return 0
 if not a.executor:
  r={'pass':False,'mode':'sandboxed-fix-code-test-rule-rollout-v1','state':'executor-required','queue':queue,'reason':'Set QUALITY_CODE_EXECUTOR or --executor. Unknown code is never guessed or applied directly.'};write_json(QUALITY/'reports/autonomous-fix-agent.json',r);print(json.dumps(r,ensure_ascii=False,indent=2));return 2
 before=source_hashes(ROOT)
 with tempfile.TemporaryDirectory(prefix='world-quality-agent-') as td:
  sb=Path(td)/'sandbox';shutil.copytree(ROOT,sb,ignore=shutil.ignore_patterns('node_modules','.quality-cache','__pycache__','.git'))
  task=sb/'DESKTOP_AI_FIX_TASK.md';ex=run(sb,executor_cmd(a.executor,sb,task))
  if not ex['pass']:
   r={'pass':False,'state':'executor-failed','executor':ex,'applied':False};write_json(QUALITY/'reports/autonomous-fix-agent.json',r);print(json.dumps(r,ensure_ascii=False,indent=2));return 1
  ok,steps=proof(sb);after=source_hashes(sb);hash_ok=before==after;changes=changed_files(ROOT,sb);forbidden=[x for x in changes if x.startswith('worlds/') and '/assets/' in x]
  ok=ok and hash_ok and not forbidden
  applied=[]
  if ok and a.apply:
   for rel in changes:
    if rel.startswith('quality/reports/') or rel.startswith('.quality-cache/'):continue
    src=sb/rel;dst=ROOT/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst);applied.append(rel)
  r={'pass':ok,'mode':'sandboxed-fix-code-test-rule-rollout-v1','state':'candidate-proven' if ok else 'candidate-rejected','executor':ex,'proofSteps':steps,'sourceHashesUnchanged':hash_ok,'forbiddenSourceChanges':forbidden,'changedFiles':changes,'applied':bool(applied),'appliedFiles':applied,'next':'run canary rollout only after apply + final local proof'}
  write_json(QUALITY/'reports/autonomous-fix-agent.json',r);print(json.dumps(r,ensure_ascii=False,indent=2));return 0 if ok else 1
if __name__=='__main__':raise SystemExit(main())
