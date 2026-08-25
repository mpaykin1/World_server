#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path

def compatible(pattern,consumer):
 scope=pattern.get('appliesTo','all')
 if scope=='all':return True
 caps=set(consumer.get('capabilities',[]));tags=set(consumer.get('tags',[]))
 req=set(pattern.get('requiresCapabilities',[]));any_tags=set(pattern.get('appliesToTags',[]))
 return req<=caps and (not any_tags or bool(tags&any_tags))
def gate(pattern,evidence,consumers):
 min_projects=int(pattern.get('minimumEvidenceProjects',2));eligible=[c for c in consumers if compatible(pattern,c)]
 passed_projects={str(e.get('project')) for e in evidence if e.get('pass') and float(e.get('visualScore',100))>=99.5 and float(e.get('sourceFidelity',100))>=100}
 eligible_pass=[c for c in eligible if str(c.get('name')) in passed_projects]
 can=pattern.get('state')=='mandatory' or len(eligible_pass)>=min_projects
 return {'pass':can,'eligibleConsumers':[c.get('name') for c in eligible],'evidenceProjects':sorted(passed_projects),'eligibleEvidence':len(eligible_pass),'minimumEvidenceProjects':min_projects,'propagationScope':'all' if pattern.get('appliesTo')=='all' else 'compatible-only','blindGlobalPropagationForbidden':True}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('pattern');ap.add_argument('evidence');ap.add_argument('consumers');a=ap.parse_args();r=gate(json.loads(Path(a.pattern).read_text()),json.loads(Path(a.evidence).read_text()),json.loads(Path(a.consumers).read_text()));print(json.dumps(r,separators=(',',':')));raise SystemExit(0 if r['pass'] else 1)
if __name__=='__main__':main()
