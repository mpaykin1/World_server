#!/usr/bin/env python3
"""Compile a machine-readable graph from incident -> rule -> test -> pattern -> genome -> consumer."""
from __future__ import annotations
import argparse, json
from pathlib import Path
from quality_common import ROOT, QUALITY, read_json, write_json

def add_node(nodes,id,kind,**meta): nodes.setdefault(id,{'id':id,'kind':kind,**meta})
def add_edge(edges,a,b,kind): edges.append({'from':a,'to':b,'kind':kind})
def consumers(repo:Path):
 if not repo.exists(): return []
 return [p for p in repo.rglob('.world-quality-consumer.json') if 'consumer-template' not in p.parts and read_json(p,{}).get('project')!='CHANGE_ME']

def compile_graph(repo:Path):
 inc=read_json(QUALITY/'knowledge/incidents.json',{}).get('incidents',[]);rules=read_json(QUALITY/'rules.json',{});gen=read_json(QUALITY/'knowledge/quality-genome.json',{});pat=read_json(QUALITY/'knowledge/patterns.json',{});prot=read_json(QUALITY/'knowledge/protection-pack.json',{})
 nodes={};edges=[];protected=set(x.get('fingerprint') for x in prot.get('protectedIncidents',[]));problems=[]
 rule_ids=set()
 raw_rules=rules.get('rules',rules if isinstance(rules,list) else [])
 if isinstance(raw_rules,dict): raw_rules=list(raw_rules.values())
 for r in raw_rules:
  rid=str(r.get('id',''));rule_ids.add(rid);add_node(nodes,f'rule:{rid}','rule',title=r.get('title') or r.get('name'))
 for x in inc:
  fp=x.get('fingerprint');iid=f'incident:{fp}';add_node(nodes,iid,'incident',status=x.get('status'),rootCause=x.get('rootCause'))
  if x.get('status')=='protected' and fp not in protected: problems.append(f'protected incident missing from compiled pack: {fp}')
  if x.get('status')=='protected' and (not x.get('preventionRules') or not x.get('mandatoryTests')): problems.append(f'protected incident missing proof links: {fp}')
  for r in x.get('preventionRules',[]): add_node(nodes,f'rule:{r}','rule');add_edge(edges,iid,f'rule:{r}','prevented-by')
  for t in x.get('mandatoryTests',[]): add_node(nodes,f'test:{t}','test');add_edge(edges,iid,f'test:{t}','guarded-by')
 for p in pat.get('patterns',[]):
  pid=f'pattern:{p.get("id")}';add_node(nodes,pid,'pattern',state=p.get('state'),name=p.get('name'))
 for t in gen.get('traits',[]):
  tid=f'trait:{t.get("id")}';add_node(nodes,tid,'quality-trait',state=t.get('state'),source=t.get('source'))
 for m in consumers(repo):
  try:d=json.loads(m.read_text(encoding='utf-8'))
  except:continue
  cid=f'consumer:{d.get("project") or str(m.parent)}';add_node(nodes,cid,'consumer',path=str(m.parent),runtime=d.get('runtime'),inherit=d.get('inheritQualityGenome'))
  add_edge(edges,'genome:global',cid,'inherits')
 add_node(nodes,'genome:global','quality-genome',idValue=gen.get('id'))
 out={'schemaVersion':1,'id':'WORLD_QUALITY_KNOWLEDGE_GRAPH_V8','nodes':list(nodes.values()),'edges':edges,'protectedIncidents':len(protected),'consumerCount':len([n for n in nodes.values() if n['kind']=='consumer']),'stats':{'protectedIncidents':len(protected),'unprotectedIncidents':len([x for x in inc if x.get('status')!='protected']),'rules':len(rule_ids),'tests':len([n for n in nodes.values() if n['kind']=='test']),'patterns':len([n for n in nodes.values() if n['kind']=='pattern']),'traits':len([n for n in nodes.values() if n['kind']=='quality-trait']),'consumers':len([n for n in nodes.values() if n['kind']=='consumer'])},'problems':problems,'pass':not problems}
 write_json(QUALITY/'knowledge/quality-graph.json',out);write_json(QUALITY/'reports/quality-graph.json',{'pass':out['pass'],'problems':problems,'nodes':len(nodes),'edges':len(edges)})
 return out

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--repo',type=Path,default=ROOT.parent);a=ap.parse_args();o=compile_graph(a.repo.resolve());print(json.dumps(o,ensure_ascii=False,indent=2));return 0 if o['pass'] else 1
if __name__=='__main__':raise SystemExit(main())
