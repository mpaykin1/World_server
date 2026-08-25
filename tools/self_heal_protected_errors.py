#!/usr/bin/env python3
from __future__ import annotations
import argparse, datetime as dt, json, re, shutil, subprocess, sys
from pathlib import Path
from quality_common import ROOT, QUALITY, read_json, write_json

REC=QUALITY/'knowledge/repair-recipes.json';REPORT=QUALITY/'reports/self-heal.json'
def stamp():return dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
def run_tests():
    cmds=[[sys.executable,'tools/regression_gate.py'],[sys.executable,'-m','unittest','discover','-s','tests','-p','test_*.py']]
    out=[]
    for cmd in cmds:
        p=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True);out.append({'cmd':' '.join(cmd),'pass':p.returncode==0,'stdout':p.stdout[-5000:],'stderr':p.stderr[-5000:]})
        if p.returncode:return False,out
    return True,out

def heal(apply=False):
    cfg=read_json(REC,{'recipes':[]});changes=[];backups=[]
    for r in cfg.get('recipes',[]):
        p=ROOT/r['file'];text=p.read_text(encoding='utf-8');new=text;matched=[]
        for x in r.get('replacements',[]):
            if x['old'] in new:new=new.replace(x['old'],x['new']);matched.append(x['old'])
        for x in r.get('regexReplacements',[]):
            new2,n=re.subn(x['pattern'],x['replacement'],new);new=new2
            if n:matched.append(x['pattern'])
        if any(x not in new for x in r.get('mustContainAfter',[])):
            changes.append({'fingerprint':r['fingerprint'],'file':r['file'],'state':'blocked-postcondition-missing'});continue
        if new!=text:changes.append({'fingerprint':r['fingerprint'],'file':r['file'],'state':'would-repair' if not apply else 'repaired','matched':matched})
        if apply and new!=text:
            b=QUALITY/'repair-backups'/stamp()/r['file'];b.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,b);backups.append((p,b));p.write_text(new,encoding='utf-8')
    tests=[];ok=True
    if apply and backups:
        ok,tests=run_tests()
        if not ok:
            for p,b in backups:shutil.copy2(b,p)
            for c in changes:
                if c['state']=='repaired':c['state']='rolled-back-tests-failed'
    report={'pass':ok,'apply':apply,'changes':changes,'transactional':True,'tests':tests,'rollbackOnFailure':True};write_json(REPORT,report);return report

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--apply',action='store_true');a=ap.parse_args();r=heal(a.apply);print(json.dumps(r,ensure_ascii=False,indent=2));raise SystemExit(0 if r['pass'] else 1)
if __name__=='__main__':main()
