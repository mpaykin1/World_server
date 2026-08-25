#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, sys
from quality_common import ROOT, QUALITY, read_json, write_json

OUT=QUALITY/'knowledge/protection-pack.json'

def canonical_hash(data:dict)->str:
    raw=json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()

def compile_pack()->dict:
    incidents=read_json(QUALITY/'knowledge/incidents.json',{}).get('incidents',[])
    rules=read_json(QUALITY/'rules.json',{}).get('rules',[])
    tests=read_json(ROOT/'tests/catalog.json',{}).get('tests',[])
    genome=read_json(QUALITY/'knowledge/quality-genome.json',{})
    standards=read_json(QUALITY/'standards.json',{})
    rule_ids={r.get('id') for r in rules};test_ids={t.get('id') for t in tests}
    errors=[];protected=[]
    for x in incidents:
        if x.get('status')!='protected':
            errors.append(f"incident {x.get('fingerprint')} is not protected")
            continue
        missing_r=sorted(set(x.get('preventionRules',[]))-rule_ids);missing_t=sorted(set(x.get('mandatoryTests',[]))-test_ids)
        if missing_r:errors.append(f"{x.get('fingerprint')}: missing rules {missing_r}")
        if missing_t:errors.append(f"{x.get('fingerprint')}: missing tests {missing_t}")
        protected.append({'fingerprint':x.get('fingerprint'),'rules':sorted(x.get('preventionRules',[])),'tests':sorted(x.get('mandatoryTests',[])),'mustNeverRecur':True})
    mandatory=[{'id':t.get('id'),'state':t.get('state')} for t in genome.get('traits',[]) if str(t.get('state','')).startswith('mandatory')]
    payload={
      'schemaVersion':1,'runtime':standards.get('id'),'policy':'compile-once-propagate-everywhere-fail-closed',
      'protectedIncidents':sorted(protected,key=lambda x:x['fingerprint'] or ''),
      'mandatoryGenome':sorted(mandatory,key=lambda x:x['id'] or ''),
      'qualityRulesHash':canonical_hash({'rules':rules}),
      'testCatalogHash':canonical_hash({'tests':tests}),
      'errors':errors,
    }
    payload['protectionHash']=canonical_hash({k:v for k,v in payload.items() if k not in ('protectionHash','errors')})
    write_json(OUT,payload)
    return payload

def main():
    p=compile_pack();print(json.dumps(p,ensure_ascii=False,indent=2));return 0 if not p['errors'] else 1
if __name__=='__main__':sys.exit(main())
