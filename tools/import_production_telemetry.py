#!/usr/bin/env python3
from __future__ import annotations
import argparse, datetime as dt, json
from pathlib import Path
from quality_common import QUALITY, read_json, write_json

INC=QUALITY/'knowledge/incidents.json';QUAR=QUALITY/'knowledge/quarantine.json';OUT=QUALITY/'reports/production-telemetry-import.json'
def now():return dt.datetime.now(dt.timezone.utc).isoformat()

def import_data(path:Path):
    data=json.loads(Path(path).read_text(encoding='utf-8'));rows=data.get('incidents',[]) if isinstance(data,dict) else []
    incdata=read_json(INC,{'schemaVersion':2,'incidents':[]});incs=incdata.setdefault('incidents',[]);quar=read_json(QUAR,{'schemaVersion':1,'items':[]});actions=[];protected_recurrences=[]
    for r in rows:
        fp=str(r.get('fingerprint') or '').strip();
        if not fp:continue
        current=next((x for x in incs if x.get('fingerprint')==fp),None)
        if current and current.get('status')=='protected':
            protected_recurrences.append(fp);current['lastSeenProduction']=str(r.get('last_seen') or now());current['productionOccurrences']=int(r.get('occurrences') or 1)
            actions.append({'action':'BLOCK_RELEASE_PROTECTED_PRODUCTION_RECURRENCE','fingerprint':fp,'project':r.get('project_id'),'world':r.get('world_id')});continue
        if current is None:
            current={'fingerprint':fp,'symptoms':[str(r.get('detail') or r.get('error_id') or 'production incident')],'rootCause':'Production telemetry incident awaiting root-cause analysis','preventionRules':[],'mandatoryTests':[],'status':'needs-protection','firstSeen':str(r.get('first_seen') or now()),'occurrences':0,'projects':[]};incs.append(current)
        current['lastSeenProduction']=str(r.get('last_seen') or now());current['occurrences']=max(int(current.get('occurrences',0)),int(r.get('occurrences') or 1));pr=str(r.get('project_id') or 'production')
        if pr not in current.setdefault('projects',[]):current['projects'].append(pr)
        if not any(x.get('fingerprint')==fp for x in quar['items']):quar['items'].append({'fingerprint':fp,'message':str(r.get('detail') or ''),'project':pr,'createdAt':now(),'source':'production-telemetry','releaseBlockedUntil':'root-cause+rule+regression-test+shared-fix'})
        actions.append({'action':'QUARANTINE_PRODUCTION_INCIDENT','fingerprint':fp,'project':pr})
    write_json(INC,incdata);write_json(QUAR,quar);report={'pass':not protected_recurrences and not [x for x in actions if x['action']=='QUARANTINE_PRODUCTION_INCIDENT'],'rows':len(rows),'actions':actions,'protectedRecurrences':sorted(set(protected_recurrences)),'quarantineCount':len(quar['items'])};write_json(OUT,report);return report

def main():
    ap=argparse.ArgumentParser();ap.add_argument('json_file',type=Path);a=ap.parse_args();r=import_data(a.json_file);print(json.dumps(r,ensure_ascii=False,indent=2));raise SystemExit(0 if r['pass'] else 1)
if __name__=='__main__':main()
