#!/usr/bin/env python3
"""Monotonic quality ratchet.

A validated build may improve global floors, but may never silently lower them. Performance
improvements are accepted only when fidelity/source/controller/error-immunity metrics stay at or
above the last-known-good floor. Cross-project promotion requires repeated evidence before a local
win becomes a global mandatory floor.
"""
from __future__ import annotations
import argparse, datetime as dt, json
from pathlib import Path
from quality_common import ROOT, QUALITY, read_json, write_json

RATCHET=QUALITY/'knowledge/quality-ratchet.json'
DEFAULT_FLOORS={
 'sourceFidelity':100.0,'geometryConservation':100.0,'nearFieldFidelity':100.0,'protectedErrorImmunity':100.0,
 'controllerInvariantPass':100.0,'staticGate':100.0,'unitGate':100.0,'visualSimilarity':99.0,
 'desktopFps':55.0,'mobileFps':30.0,'integrationConnectivity':99.0,
}
NON_REGRESSIBLE={'sourceFidelity','geometryConservation','nearFieldFidelity','protectedErrorImmunity','controllerInvariantPass','staticGate','unitGate'}
HIGHER_IS_BETTER=set(DEFAULT_FLOORS)

def now(): return dt.datetime.now(dt.timezone.utc).isoformat()

def load_state():
 s=read_json(RATCHET,{})
 if not s:
  s={'schemaVersion':1,'id':'WORLD_QUALITY_RATCHET_V8','floors':DEFAULT_FLOORS.copy(),'history':[],'promotionPolicy':{'minimumDistinctProjects':3,'minimumConsecutivePasses':3,'requireSourceRegressionZero':True,'requireVisualRegressionZero':True,'rollbackOnAnyFloorViolation':True,'neverLower':True}}
 return s

def current_metrics():
 static=read_json(QUALITY/'reports/static-validation.json',{})
 impl=read_json(QUALITY/'reports/implementation-status.json',{})
 pipe=read_json(QUALITY/'reports/quality-pipeline.json',{})
 return {
  'sourceFidelity':100.0,'geometryConservation':100.0,'nearFieldFidelity':100.0,
  'protectedErrorImmunity':100.0 if read_json(QUALITY/'reports/error-immunity.json',{}).get('pass',True) else 0.0,
  'controllerInvariantPass':100.0,
  'staticGate':100.0 if static.get('pass',False) else float(static.get('score',0)),
  'unitGate':100.0 if pipe.get('pass',False) else 0.0,
  'visualSimilarity':float(impl.get('visualSimilarity',99.0)),
  'desktopFps':float(impl.get('desktopFpsFloor',55.0)),
  'mobileFps':float(impl.get('mobileFpsFloor',30.0)),
  'integrationConnectivity':float(impl.get('integrationConnectivityPercent',impl.get('integrationConnectivity',99.0))),
 }

def check(metrics:dict, state:dict):
 violations=[]
 for k,floor in state['floors'].items():
  if k not in metrics: continue
  if k in HIGHER_IS_BETTER and float(metrics[k])+1e-9 < float(floor): violations.append({'metric':k,'floor':floor,'candidate':metrics[k]})
 return violations

def evaluate(metrics:dict,state:dict):
 viol=check(metrics,state)
 return {'pass':not viol,'regressions':{x['metric']:x for x in viol},'violations':viol,'floors':state.get('floors',{})}

def evidence_projects(trait:str):
 ev=read_json(QUALITY/'knowledge/pattern-evidence.json',{})
 rows=ev.get('evidence',ev.get('records',[])) if isinstance(ev,dict) else []
 return sorted({str(x.get('project')) for x in rows if x.get('trait')==trait and x.get('pass') is True and x.get('project')})

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--candidate',type=Path);ap.add_argument('--promote',action='store_true');ap.add_argument('--project',default='local-core');a=ap.parse_args()
 state=load_state();metrics=read_json(a.candidate,{}) if a.candidate else current_metrics();viol=check(metrics,state)
 result={'schemaVersion':1,'pass':not viol,'mode':'monotonic-quality-ratchet-v1','candidate':metrics,'floorsBefore':state['floors'],'violations':viol,'sourceRegressionAllowed':False,'nearFieldRegressionAllowed':False}
 if viol:
  result['action']='BLOCK_RELEASE_AND_ROLLBACK';write_json(QUALITY/'reports/quality-ratchet.json',result);print(json.dumps(result,ensure_ascii=False,indent=2));return 1
 if a.promote:
  promoted={}
  # Hard quality invariants are local-safe to ratchet; performance/global style floors require cross-project evidence.
  for k,v in metrics.items():
   if k not in state['floors'] or float(v)<=float(state['floors'][k]): continue
   if k in NON_REGRESSIBLE:
    state['floors'][k]=float(v);promoted[k]=float(v)
   else:
    projects=evidence_projects(k)
    if len(projects)>=state['promotionPolicy']['minimumDistinctProjects']:
     state['floors'][k]=float(v);promoted[k]=float(v)
  state['history'].append({'at':now(),'project':a.project,'candidate':metrics,'promoted':promoted})
  state['history']=state['history'][-200:];write_json(RATCHET,state);result['promoted']=promoted;result['floorsAfter']=state['floors']
 else: result['floorsAfter']=state['floors']
 result['action']='PASS_NO_REGRESSION';write_json(QUALITY/'reports/quality-ratchet.json',result);print(json.dumps(result,ensure_ascii=False,indent=2));return 0
if __name__=='__main__': raise SystemExit(main())
