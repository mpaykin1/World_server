#!/usr/bin/env python3
from __future__ import annotations
import argparse, datetime as dt, json, shutil, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PRESERVE_TOP={'worlds','.quality-cache','node_modules','__pycache__'}
def merge_list(dst,old,key,idkey):
    if not old.exists() or not dst.exists():return
    try:a=json.loads(dst.read_text());b=json.loads(old.read_text())
    except:return
    cur=a.setdefault(key,[]);seen={x.get(idkey) for x in cur if isinstance(x,dict)}
    for x in b.get(key,[]):
        if isinstance(x,dict) and x.get(idkey) not in seen:cur.append(x);seen.add(x.get(idkey))
    dst.write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n')
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--target',type=Path,required=True);a=ap.parse_args();target=a.target.resolve();dest=target/'shared'/'world-quality-core';backup=target/'.quality-backups'/f"world-quality-core-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}"
    if dest.exists():backup.parent.mkdir(parents=True,exist_ok=True);shutil.copytree(dest,backup)
    dest.mkdir(parents=True,exist_ok=True)
    for item in ROOT.iterdir():
        if item.name in PRESERVE_TOP or item.name=='.git':continue
        out=dest/item.name
        if item.is_dir():
            if out.exists():shutil.rmtree(out)
            shutil.copytree(item,out)
        else:shutil.copy2(item,out)
    if not (dest/'worlds').exists():shutil.copytree(ROOT/'worlds',dest/'worlds')
    if backup.exists():
        ok=backup/'quality/knowledge';nk=dest/'quality/knowledge'
        for fn,key,idkey in [('incidents.json','incidents','fingerprint'),('patterns.json','patterns','id'),('quality-genome.json','traits','id'),('quarantine.json','items','fingerprint'),('rollout-ledger.json','rollouts','at')]:merge_list(nk/fn,ok/fn,key,idkey)
        # ratchet floors are monotonic
        try:
            old=json.loads((ok/'quality-ratchet.json').read_text());new=json.loads((nk/'quality-ratchet.json').read_text());nf=new.setdefault('floors',{})
            for k,v in old.get('floors',{}).items():nf[k]=max(float(nf.get(k,v)),float(v))
            new['history']=(old.get('history',[])+new.get('history',[]))[-250:];(nk/'quality-ratchet.json').write_text(json.dumps(new,indent=2)+'\n')
        except:pass
    cmds=[[sys.executable,'tools/migrate_worlds_to_v9.py'],[sys.executable,'tools/prepare_world_v9.py'],[sys.executable,'tools/auto_repair.py','--apply'],[sys.executable,'tools/self_heal_protected_errors.py','--apply'],[sys.executable,'tools/error_immunity.py','compile'],[sys.executable,'tools/compile_protection_pack.py'],['node','tools/verify_wasm_threads.mjs'],[sys.executable,'tools/v9_cpu_first_gate.py'],[sys.executable,'tools/quality_graph.py','--repo',str(target)],[sys.executable,'tools/quality_ratchet.py'],[sys.executable,'tools/quality_pipeline.py'],[sys.executable,'tools/quality_rollout.py','--repo',str(target),'--mode','promote'],[sys.executable,'tools/verify_consumers.py','--repo',str(target),'--scope','all'],[sys.executable,'tools/consumer_drift_audit.py','--repo',str(target)],[sys.executable,'tools/readiness.py']]
    results=[]
    for cmd in cmds:
        p=subprocess.run(cmd,cwd=dest,text=True,capture_output=True);results.append({'cmd':' '.join(cmd),'pass':p.returncode==0,'stdout':p.stdout[-4000:],'stderr':p.stderr[-4000:]})
        if p.returncode:
            if backup.exists():shutil.rmtree(dest,ignore_errors=True);shutil.copytree(backup,dest)
            print(json.dumps({'pass':False,'failed':' '.join(cmd),'rolledBack':backup.exists(),'backup':str(backup),'results':results},ensure_ascii=False,indent=2));return 2
    print(json.dumps({'pass':True,'runtime':'WORLD_FACTORY_QUALITY_CORE_V10','installed':str(dest),'backup':str(backup) if backup.exists() else None,'serverGpuRequired':False,'results':results},ensure_ascii=False,indent=2));return 0
if __name__=='__main__':raise SystemExit(main())
