#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path

def build(data:dict):
 rooms=[{'id':str(r['id']),'bounds':r.get('bounds')} for r in data.get('rooms',[]) if r.get('id') is not None]
 ids={r['id'] for r in rooms};portals=[]
 for p in data.get('portals',[]):
  a,b=str(p.get('a')),str(p.get('b'))
  if a in ids and b in ids:portals.append({'id':str(p.get('id',f'{a}-{b}')),'a':a,'b':b,'open':p.get('open',True),'bounds':p.get('bounds')})
 return {'schemaVersion':1,'mode':'conservative-portal-room-visibility-v1','rooms':rooms,'portals':portals,'unknownRoomFailVisible':True,'nearBypassRadius':42,'sourceGeometryModified':False}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('input');ap.add_argument('output');a=ap.parse_args();d=build(json.loads(Path(a.input).read_text()));Path(a.output).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'pass':True,'rooms':len(d['rooms']),'portals':len(d['portals'])}))
if __name__=='__main__':main()
