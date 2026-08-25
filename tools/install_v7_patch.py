#!/usr/bin/env python3
from __future__ import annotations
import argparse, datetime as dt, json, shutil, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PRESERVE_TOP={'worlds','.quality-cache','node_modules','__pycache__'}
PRESERVE_KNOW={'incidents.json','pattern-evidence.json','quality-history.jsonl','quarantine.json','rollout-ledger.json','last-known-good.json'}

def merge_json_list(dst:Path,old:Path,key:str,idkey:str):
    if not old.exists() or not dst.exists():return
    try:a=json.loads(dst.read_text(encoding='utf-8'));b=json.loads(old.read_text(encoding='utf-8'))
    except Exception:return
    cur=a.setdefault(key,[]);seen={x.get(idkey) for x in cur if isinstance(x,dict)}
    for x in b.get(key,[]):
        if isinstance(x,dict) and x.get(idkey) not in seen:cur.append(x);seen.add(x.get(idkey))
    dst.write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def main():
    ap=argparse.ArgumentParser(description='Safely install V7 shared quality core into World_server with backup, world preservation and full verification.')
    ap.add_argument('--target',type=Path,required=True,help='World_server repository root');a=ap.parse_args();target=a.target.resolve();dest=target/'shared'/'world-quality-core';stamp=dt.datetime.now().strftime('%Y%m%d-%H%M%S');backup=target/'.quality-backups'/f'world-quality-core-{stamp}'
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
    # Restore/merge persistent learned knowledge from previous core instead of forgetting project history.
    if backup.exists():
        oldk=backup/'quality'/'knowledge';newk=dest/'quality'/'knowledge'
        merge_json_list(newk/'incidents.json',oldk/'incidents.json','incidents','fingerprint')
        merge_json_list(newk/'patterns.json',oldk/'patterns.json','patterns','id')
        merge_json_list(newk/'quality-genome.json',oldk/'quality-genome.json','traits','id')
        merge_json_list(newk/'quarantine.json',oldk/'quarantine.json','items','fingerprint')
        merge_json_list(newk/'rollout-ledger.json',oldk/'rollout-ledger.json','rollouts','at')
        oe=oldk/'pattern-evidence.json';ne=newk/'pattern-evidence.json'
        if oe.exists() and ne.exists():
            try:
                a=json.loads(ne.read_text(encoding='utf-8'));b=json.loads(oe.read_text(encoding='utf-8'));a.setdefault('patterns',{}).update(b.get('patterns',{}));ne.write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            except Exception:pass

        # A new patch may raise floors but must never erase or lower previously proven quality floors.
        orat=oldk/'quality-ratchet.json';nrat=newk/'quality-ratchet.json'
        if orat.exists() and nrat.exists():
            try:
                nr=json.loads(nrat.read_text(encoding='utf-8'));orr=json.loads(orat.read_text(encoding='utf-8'))
                nf=nr.setdefault('floors',{});of=orr.get('floors',{})
                for k,v in of.items(): nf[k]=max(float(nf.get(k,v)),float(v))
                nr.setdefault('history',[])[0:0]=orr.get('history',[])[-100:]
                nr['history']=nr['history'][-200:]
                nrat.write_text(json.dumps(nr,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            except Exception: pass
        oldhist=oldk/'quality-history.jsonl';newhist=newk/'quality-history.jsonl'
        if oldhist.exists():newhist.write_text(oldhist.read_text(encoding='utf-8')+(newhist.read_text(encoding='utf-8') if newhist.exists() else ''),encoding='utf-8')
    cmds=[[sys.executable,'tools/migrate_worlds_to_v7.py'],[sys.executable,'tools/prepare_world_v7.py','--quality','production'],[sys.executable,'tools/auto_repair.py','--apply'],[sys.executable,'tools/self_heal_protected_errors.py','--apply'],[sys.executable,'tools/error_immunity.py','compile'],[sys.executable,'tools/compile_protection_pack.py'],['node','tools/verify_wasm_simd.mjs'],['node','tools/verify_wasm_threads.mjs'],[sys.executable,'tools/quality_graph.py','--repo',str(target)],[sys.executable,'tools/quality_ratchet.py'],[sys.executable,'tools/bake_farm.py','--dry-run'],[sys.executable,'tools/quality_pipeline.py'],[sys.executable,'tools/quality_rollout.py','--repo',str(target),'--mode','promote'],[sys.executable,'tools/verify_consumers.py','--repo',str(target),'--scope','all'],[sys.executable,'tools/consumer_drift_audit.py','--repo',str(target)],[sys.executable,'tools/readiness.py']]
    results=[]
    for cmd in cmds:
        p=subprocess.run(cmd,cwd=dest,text=True,capture_output=True);results.append({'cmd':' '.join(cmd),'pass':p.returncode==0,'stdout':p.stdout[-5000:],'stderr':p.stderr[-5000:]})
        if p.returncode!=0:
            if backup.exists():
                shutil.rmtree(dest,ignore_errors=True);shutil.copytree(backup,dest)
            print(json.dumps({'pass':False,'failed':' '.join(cmd),'backup':str(backup),'rolledBack':backup.exists(),'results':results},ensure_ascii=False,indent=2));return 2
    print(json.dumps({'pass':True,'installed':str(dest),'backup':str(backup) if backup.exists() else None,'sourceWorldsPreserved':True,'results':results},ensure_ascii=False,indent=2));return 0
if __name__=='__main__':raise SystemExit(main())
