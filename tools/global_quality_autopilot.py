#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, subprocess, sys, time
from pathlib import Path
from quality_common import ROOT, QUALITY, write_json

def run(name,cmd):
    p=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True)
    return {'name':name,'pass':p.returncode==0,'returncode':p.returncode,'stdout':p.stdout[-10000:],'stderr':p.stderr[-10000:]}

def main():
    ap=argparse.ArgumentParser(description='V8 one-command quality autopilot: import production evidence, transactional known-error self-heal, validate, learn, compile protection, queue unknown fixes, canary, global rollout and rollback.')
    ap.add_argument('--repo',type=Path,default=ROOT.parent)
    ap.add_argument('--telemetry-json',type=Path,default=None,help='Optional exported production telemetry JSON. Any unknown/protected recurrence blocks rollout.')
    ap.add_argument('--prepare-worlds',action='store_true',help='Run production-quality V8 derived-data preparation before gates.')
    ap.add_argument('--autonomous-fix',action='store_true',help='Run sandboxed unknown-error Fix->Code->Test->Rule proof agent before rollout. Requires QUALITY_CODE_EXECUTOR only when unknown incidents are queued.')
    ap.add_argument('--device-farm',action='store_true',help='Run representative Playwright/WebGPU device matrix before rollout.')
    a=ap.parse_args();steps=[];start=time.time()
    if a.telemetry_json:
        r=run('import-production-telemetry',[sys.executable,'tools/import_production_telemetry.py',str(a.telemetry_json.resolve())]);steps.append(r);print(f'[import-production-telemetry] {"PASS" if r["pass"] else "BLOCK"}')
        if not r['pass']:
            run('fix-rule-queue',[sys.executable,'tools/fix_rule_agent.py'])
            report={'pass':False,'stoppedAt':'production-telemetry-protection','steps':steps,'durationSec':round(time.time()-start,2),'releasePropagated':False,'reason':'unknown incident or protected recurrence requires root-cause/rule/test/shared-fix'};write_json(QUALITY/'reports/global-autopilot.json',report);return 1
    if a.prepare_worlds:
        r=run('prepare-v8-worlds',[sys.executable,'tools/prepare_world_v8.py','--quality','production']);steps.append(r);print(f'[prepare-v8-worlds] {"PASS" if r["pass"] else "FAIL"}')
        if not r['pass']:
            report={'pass':False,'stoppedAt':'prepare-v8-worlds','steps':steps,'durationSec':round(time.time()-start,2),'releasePropagated':False};write_json(QUALITY/'reports/global-autopilot.json',report);return 1
    plan=[
      ('transactional-known-error-self-heal',[sys.executable,'tools/self_heal_protected_errors.py','--apply']),
      ('quality-pipeline',[sys.executable,'tools/quality_pipeline.py']),
      ('learn',[sys.executable,'tools/learn_from_reports.py']),
      ('fix-rule-queue',[sys.executable,'tools/fix_rule_agent.py']),
      ('compile-protection',[sys.executable,'tools/compile_protection_pack.py']),
      ('immunity',[sys.executable,'tools/error_immunity.py','check']),
      ('wasm-simd',["node",'tools/verify_wasm_simd.mjs']),
      ('wasm-simd-threads',["node",'tools/verify_wasm_threads.mjs']),
      ('quality-graph',[sys.executable,'tools/quality_graph.py','--repo',str(a.repo.resolve())]),
      ('quality-ratchet',[sys.executable,'tools/quality_ratchet.py']),
      ('bake-farm-plan',[sys.executable,'tools/bake_farm.py','--dry-run']),
      ('consumer-drift-precheck',[sys.executable,'tools/consumer_drift_audit.py','--repo',str(a.repo.resolve())]),
    ]
    for name,cmd in plan:
        r=run(name,cmd);steps.append(r);print(f'[{name}] {"PASS" if r["pass"] else "FAIL"}')
        if not r['pass']:
            report={'pass':False,'stoppedAt':name,'steps':steps,'durationSec':round(time.time()-start,2),'releasePropagated':False};write_json(QUALITY/'reports/global-autopilot.json',report);return 1
    if a.autonomous_fix:
        ar=run('sandboxed-autonomous-fix',[sys.executable,'tools/autonomous_fix_rollout_agent.py']);steps.append(ar);print(f'[sandboxed-autonomous-fix] {"PASS" if ar["pass"] else "BLOCK"}')
        if not ar['pass']:
            report={'pass':False,'stoppedAt':'sandboxed-autonomous-fix','steps':steps,'durationSec':round(time.time()-start,2),'releasePropagated':False};write_json(QUALITY/'reports/global-autopilot.json',report);return 1
    if a.device_farm:
        df=run('representative-device-farm',['node','tools/device_farm_runner.mjs']);steps.append(df);print(f'[representative-device-farm] {"PASS" if df["pass"] else "BLOCK"}')
        if not df['pass']:
            report={'pass':False,'stoppedAt':'representative-device-farm','steps':steps,'durationSec':round(time.time()-start,2),'releasePropagated':False};write_json(QUALITY/'reports/global-autopilot.json',report);return 1
    rollout=run('transactional-rollout',[sys.executable,'tools/quality_rollout.py','--repo',str(a.repo.resolve()),'--mode','promote']);steps.append(rollout);print(f'[transactional-rollout] {"PASS" if rollout["pass"] else "FAIL"}')
    if not rollout['pass']:
        report={'pass':False,'stoppedAt':'transactional-rollout','steps':steps,'durationSec':round(time.time()-start,2),'releasePropagated':False,'automaticRollback':'handled-by-quality_rollout'};write_json(QUALITY/'reports/global-autopilot.json',report);return 1
    verify=run('verify-consumers',[sys.executable,'tools/verify_consumers.py','--repo',str(a.repo.resolve()),'--scope','all']);steps.append(verify);print(f'[verify-consumers] {"PASS" if verify["pass"] else "FAIL"}')
    if not verify['pass']:
        rb=run('rollback-consumers',[sys.executable,'tools/quality_rollout.py','--repo',str(a.repo.resolve()),'--mode','rollback']);steps.append(rb)
        report={'pass':False,'stoppedAt':'verify-consumers','steps':steps,'durationSec':round(time.time()-start,2),'releasePropagated':False,'automaticRollback':rb['pass']};write_json(QUALITY/'reports/global-autopilot.json',report);return 1
    ready=run('readiness',[sys.executable,'tools/readiness.py']);steps.append(ready)
    report={'pass':ready['pass'],'steps':steps,'durationSec':round(time.time()-start,2),'releasePropagated':ready['pass'],'errorImmunity':'compiled-protection-pack+global-fingerprint+transactional-self-heal','successfulPatternPropagation':'quality-genome+cross-project-evidence+canary+rollback'};write_json(QUALITY/'reports/global-autopilot.json',report);print(json.dumps(report,ensure_ascii=False,indent=2));return 0 if ready['pass'] else 1
if __name__=='__main__':raise SystemExit(main())
