#!/usr/bin/env python3
from __future__ import annotations
import argparse, datetime as dt, hashlib, json
from pathlib import Path
from quality_common import QUALITY, read_json, write_json, append_jsonl

INC=QUALITY/'knowledge/incidents.json'; PAT=QUALITY/'knowledge/patterns.json'; HIST=QUALITY/'knowledge/quality-history.jsonl'

def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def fingerprint(text): return hashlib.sha256(text.strip().lower().encode()).hexdigest()[:16]

def record_incident(args):
    data=read_json(INC,{'schemaVersion':2,'incidents':[]}); incidents=data.setdefault('incidents',[])
    fp=args.fingerprint or fingerprint(args.root_cause+'|'+args.symptom)
    found=next((x for x in incidents if x.get('fingerprint')==fp),None)
    if not found:
        found={'fingerprint':fp,'symptoms':[args.symptom],'rootCause':args.root_cause,'preventionRules':[], 'mandatoryTests':[], 'status':'unprotected','firstSeen':now(),'occurrences':0,'projects':[]}
        incidents.append(found)
    found['lastSeen']=now(); found['occurrences']=int(found.get('occurrences',0))+1
    if args.project and args.project not in found.setdefault('projects',[]): found['projects'].append(args.project)
    if args.rule and args.rule not in found.setdefault('preventionRules',[]): found['preventionRules'].append(args.rule)
    if args.test and args.test not in found.setdefault('mandatoryTests',[]): found['mandatoryTests'].append(args.test)
    if found.get('preventionRules') and found.get('mandatoryTests'): found['status']='protected'
    write_json(INC,data); print(json.dumps(found,ensure_ascii=False,indent=2))

def record_run(args):
    obj=json.loads(Path(args.report).read_text(encoding='utf-8')); obj['recordedAt']=now(); obj['project']=args.project
    append_jsonl(HIST,obj); print('Recorded quality run')

def promote():
    policy=read_json(PAT,{}).get('promotionPolicy',{}); min_score=float(policy.get('minimumScore',95)); min_passes=int(policy.get('minimumConsecutivePasses',3)); min_worlds=int(policy.get('minimumWorlds',2))
    if not HIST.exists(): print('No history yet'); return
    runs=[json.loads(x) for x in HIST.read_text(encoding='utf-8').splitlines() if x.strip()]
    recent=[r for r in runs[-20:] if r.get('pass') and float(r.get('score',0))>=min_score]
    projects={r.get('project') for r in recent if r.get('project')}
    data=read_json(PAT,{}); changed=0
    # Candidates may be inserted by future tools. Promote only with cross-project evidence.
    if len(recent)>=min_passes and len(projects)>=min_worlds:
        for p in data.get('patterns',[]):
            if p.get('state')=='candidate' and int(p.get('successfulRuns',0))>=min_passes:
                p['state']='mandatory'; p['appliesTo']='all'; p['promotedAt']=now(); changed+=1
    write_json(PAT,data); print(f'Promoted {changed} pattern(s); qualifying runs={len(recent)}, projects={len(projects)}')

def main():
    ap=argparse.ArgumentParser(description='Cross-project quality memory: failures become permanent regression rules; proven patterns become global standards.')
    sub=ap.add_subparsers(dest='cmd',required=True)
    a=sub.add_parser('incident'); a.add_argument('--fingerprint'); a.add_argument('--symptom',required=True); a.add_argument('--root-cause',required=True); a.add_argument('--project'); a.add_argument('--rule'); a.add_argument('--test')
    r=sub.add_parser('run'); r.add_argument('report'); r.add_argument('--project',required=True)
    sub.add_parser('promote')
    args=ap.parse_args(); {'incident':record_incident,'run':record_run,'promote':lambda _:promote()}[args.cmd](args)
if __name__=='__main__':main()
