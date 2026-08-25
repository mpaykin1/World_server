#!/usr/bin/env python3
from __future__ import annotations
import datetime as dt, hashlib, json, os, re, sys
from pathlib import Path
from quality_common import QUALITY, read_json, write_json, append_jsonl
INC=QUALITY/'knowledge/incidents.json';PAT=QUALITY/'knowledge/patterns.json';GENOME=QUALITY/'knowledge/quality-genome.json';HIST=QUALITY/'knowledge/quality-history.jsonl';REPORTS=QUALITY/'reports';EVID=QUALITY/'knowledge/pattern-evidence.json';QUAR=QUALITY/'knowledge/quarantine.json'
MAP={
 'spawn-not-on-floor':['spawn','grounded','capsule clearance'],'jump-moves-forward-instead-of-up':['jump','horizontal velocity','jump displaced'],
 'camera-cannot-look-straight-up':['pitch','look straight up'],'camera-rolls-when-looking-left-right':['roll','horizontal look'],
 'world-became-blurry':['source hash','visual regression','geometry regress','texture','blurry'],'splat-has-no-collision':['splat','collision proxy','collider'],
 'controls-inverted-or-world-rotates':['forward basis','movement not camera','reversed','left-right'],
 'gpu-occlusion-culls-near-field':['near field','occlusion','hidden near','gpu visibility'],
 'asset-cache-source-hash-mismatch':['asset cache','sha mismatch','immutable asset sha mismatch'],
 'meshlet-face-conservation-broken':['meshlet','triangle conservation','face conservation'],
 'material-dedup-visual-regression':['material dedup','material visual','dedup regression'],
 'bvh-cache-stale-collision':['bvh cache','stale collision','cached collision']}
def now():return dt.datetime.now(dt.timezone.utc).isoformat()
def norm(s):return re.sub(r'\s+',' ',s.strip().lower())[:800]
def unknown_fp(s):return 'auto-'+hashlib.sha256(norm(s).encode()).hexdigest()[:12]
def load_reports():
 out=[]
 for p in sorted(REPORTS.glob('*.json')):
  try:
   j=read_json(p,{})
   if isinstance(j,dict) and 'pass' in j:out.append((p,j))
  except Exception:pass
 return out
def classify(msg):
 n=norm(msg);best=None;score=0
 for fp,keys in MAP.items():
  s=sum(1 for k in keys if k in n)
  if s>score:best,score=fp,s
 return best if score else None
def collect_failures(reports):
 out=[]
 for _,r in reports:
  if r.get('pass') is False:
   out.extend(str(e) for e in (r.get('errors',[]) or []))
   for w in r.get('worlds',[]) or []:
    if isinstance(w,dict) and w.get('pass') is False:
     if w.get('fatal'):out.append(str(w['fatal']))
     if w.get('error'):out.append(str(w['error']))
     for t in w.get('tests',[]) or []:
      if isinstance(t,dict) and t.get('pass') is False:out.append(f"{t.get('id')}: {t.get('error')}")
 return sorted(set(out))
def collect_candidates(reports):
 out={}
 for _,r in reports:
  for p in r.get('promotablePatterns',[]) or []:
   if isinstance(p,dict) and p.get('id'):
    out[p['id']]={'id':p['id'],'name':p.get('name',p['id']),'evidence':p.get('evidence','automated successful evidence'),'category':p.get('category','quality'),'performanceDeltaFps':float(p.get('performanceDeltaFps',0) or 0)}
 return list(out.values())

def zero_quality_regression(reports):
 # Promotion evidence is accepted only when all executed gates pass and source/visual regression reports are clean.
 required={'static-validation.json','regression.json'};seen=set();ok=True
 for path,r in reports:
  if path.name in required:seen.add(path.name)
  if r.get('pass') is False:ok=False
 return ok and required.issubset(seen)
def main():
 project=os.environ.get('QUALITY_PROJECT','world-factory-core');reports=load_reports();failures=collect_failures(reports);scores=[float(r['score']) for _,r in reports if isinstance(r.get('score'),(int,float))]
 nonreg=zero_quality_regression(reports);run_pass=not failures and all(r.get('pass') is not False for _,r in reports);run={'recordedAt':now(),'project':project,'pass':run_pass,'score':min(scores) if scores else (100 if run_pass else 0),'zeroQualityRegression':nonreg,'reports':[p.name for p,_ in reports]};append_jsonl(HIST,run)
 data=read_json(INC,{'schemaVersion':2,'incidents':[]});incidents=data.setdefault('incidents',[]);quar=read_json(QUAR,{'schemaVersion':1,'items':[]});actions=[]
 for msg in failures:
  fp=classify(msg) or unknown_fp(msg);inc=next((x for x in incidents if x.get('fingerprint')==fp),None)
  if inc is None:
   inc={'fingerprint':fp,'symptoms':[msg],'rootCause':'Unclassified regression discovered automatically by quality pipeline','preventionRules':[],'mandatoryTests':[],'status':'needs-protection','firstSeen':now(),'occurrences':0,'projects':[]};incidents.append(inc)
   if not any(x.get('fingerprint')==fp for x in quar['items']):quar['items'].append({'fingerprint':fp,'message':msg,'project':project,'createdAt':now(),'releaseBlockedUntil':'rule+regression-test+shared-fix'})
   actions.append({'action':'NEW_INCIDENT_QUARANTINED_REQUIRES_RULE_TEST_SHARED_FIX','fingerprint':fp,'message':msg})
  elif inc.get('status')=='protected':actions.append({'action':'PROTECTED_ERROR_RECURRED_BLOCK_RELEASE_AND_PROPAGATION','fingerprint':fp,'message':msg})
  inc['lastSeen']=now();inc['occurrences']=int(inc.get('occurrences',0))+1
  if project not in inc.setdefault('projects',[]):inc['projects'].append(project)
 write_json(INC,data);write_json(QUAR,quar)
 patterns=read_json(PAT,{});evidence=read_json(EVID,{'schemaVersion':1,'patterns':{}});policy=patterns.get('promotionPolicy',{});minp=int(policy.get('minimumConsecutivePasses',3));minscore=float(policy.get('minimumScore',95));minworlds=int(policy.get('minimumWorlds',2))
 for c in collect_candidates(reports):
  if not any(p.get('id')==c['id'] for p in patterns.get('patterns',[])):patterns.setdefault('patterns',[]).append({**c,'state':'candidate','appliesTo':'candidate','successfulRuns':0,'optimization':c.get('category')=='optimization'})
 if run_pass and run['score']>=minscore and nonreg:
  for p in patterns.get('patterns',[]):
   if p.get('state')!='candidate':continue
   if p.get('optimization') and float(p.get('performanceDeltaFps',0) or 0)<=0:continue
   e=evidence['patterns'].setdefault(p['id'],{'successfulRuns':0,'projects':[],'lastSuccess':None,'zeroQualityRegressionRuns':0,'performanceWins':0});e['successfulRuns']+=1;e['zeroQualityRegressionRuns']+=1;e['lastSuccess']=now();
   if p.get('optimization'):e['performanceWins']+=1
   if project not in e['projects']:e['projects'].append(project)
   p['successfulRuns']=e['successfulRuns'];p['evidenceProjects']=len(e['projects'])
 genome_path=QUALITY/'knowledge/quality-genome.json';genome=read_json(genome_path,{'schemaVersion':1,'id':'WORLD_QUALITY_GENOME_V10','traits':[]});trait_ids={t.get('id') for t in genome.get('traits',[])}
 for p in patterns.get('patterns',[]):
  if p.get('state')!='candidate':continue
  e=evidence['patterns'].get(p['id'],{});projects=set(e.get('projects',[]));runs=int(e.get('successfulRuns',0));zero=int(e.get('zeroQualityRegressionRuns',0));wins=int(e.get('performanceWins',0))
  perf_ok=(not p.get('optimization')) or wins>=minp
  if runs>=minp and zero>=minp and len(projects)>=minworlds and perf_ok:
   p['state']='mandatory';p['appliesTo']='all';p['promotedAt']=now();actions.append({'action':'PROMOTE_PATTERN_TO_QUALITY_GENOME_AND_ALL_PROJECTS','pattern':p.get('id'),'projects':len(projects),'successfulRuns':runs})
   tid=f"promoted:{p.get('id')}"
   if tid not in trait_ids:
    genome.setdefault('traits',[]).append({'id':tid,'state':'mandatory','source':'auto-promoted-proven-pattern','pattern':p.get('id'),'promotedAt':now()});trait_ids.add(tid)
 write_json(PAT,patterns);write_json(EVID,evidence);write_json(genome_path,genome)
 write_json(REPORTS/'learning-actions.json',{'pass':run_pass,'run':run,'actions':actions,'failures':failures,'quarantineCount':len(quar['items'])})
 print(f'QUALITY LEARNING: {"PASS" if run_pass else "FAIL"}; failures={len(failures)} actions={len(actions)} quarantine={len(quar["items"])}')
 return 0 if run_pass else 1
if __name__=='__main__':sys.exit(main())
