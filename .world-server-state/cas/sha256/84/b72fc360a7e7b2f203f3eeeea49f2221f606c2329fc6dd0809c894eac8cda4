#!/usr/bin/env python3
from __future__ import annotations
import argparse, datetime as dt, json, re
from pathlib import Path
from quality_common import QUALITY, read_json, write_json

INC=QUALITY/'knowledge/incidents.json'; REPORTS=QUALITY/'reports'; CONTRACTS=QUALITY/'knowledge/incident-contracts.json'

def now():return dt.datetime.now(dt.timezone.utc).isoformat()

def compile_contracts():
    data=read_json(INC,{'incidents':[]});contracts=[]
    for x in data.get('incidents',[]):
        contracts.append({
          'fingerprint':x.get('fingerprint'),'status':x.get('status'),'rootCause':x.get('rootCause'),
          'mustNeverRecur':x.get('status')=='protected','rules':x.get('preventionRules',[]),'tests':x.get('mandatoryTests',[]),
          'projects':x.get('projects',[]),'compiledAt':now()
        })
    write_json(CONTRACTS,{'schemaVersion':1,'contracts':contracts});return contracts

def scan_protected_recurrence():
    contracts=compile_contracts(); protected={c['fingerprint']:c for c in contracts if c['mustNeverRecur']}
    actions=[];fail=[]
    learning=read_json(REPORTS/'learning-actions.json',{})
    for a in learning.get('actions',[]):
        fp=a.get('fingerprint')
        if fp in protected:
            fail.append(fp);actions.append({'action':'BLOCK_RELEASE_PROTECTED_ERROR_RECURRED','fingerprint':fp})
    out={'pass':not fail,'protectedContracts':len(protected),'recurrences':fail,'actions':actions}
    write_json(REPORTS/'error-immunity.json',out);return out

def main():
    ap=argparse.ArgumentParser();ap.add_argument('command',choices=['compile','check']);a=ap.parse_args()
    if a.command=='compile':print(json.dumps({'pass':True,'contracts':len(compile_contracts())},indent=2));return
    r=scan_protected_recurrence();print(json.dumps(r,indent=2));raise SystemExit(0 if r['pass'] else 1)
if __name__=='__main__':main()
