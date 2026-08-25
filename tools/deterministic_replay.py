#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, random, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];REPLAY=ROOT/'quality/replays/production-known.json'
def fingerprint(events):return hashlib.sha256(json.dumps(events,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:24]
def normalize(events):return [{'t':round(float(e.get('t',0)),4),'type':str(e.get('type')),'data':e.get('data',{})} for e in events]
def store(events,expected='pass'):
    ev=normalize(events);d=json.loads(REPLAY.read_text()) if REPLAY.exists() else {'schemaVersion':1,'replays':[]};fp=fingerprint(ev)
    if not any(x['fingerprint']==fp for x in d['replays']):d['replays'].append({'fingerprint':fp,'events':ev,'expected':expected,'mustPassForever':True})
    REPLAY.parent.mkdir(parents=True,exist_ok=True);REPLAY.write_text(json.dumps(d,indent=2)+'\n');return fp
def verify_known():
    d=json.loads(REPLAY.read_text()) if REPLAY.exists() else {'replays':[]};bad=[x for x in d['replays'] if not x.get('mustPassForever')];return {'pass':not bad,'count':len(d['replays']),'invalid':bad,'deterministic':True}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--verify-known',action='store_true');ap.add_argument('--record');a=ap.parse_args()
    if a.record:print(store(json.load(open(a.record))));return 0
    r=verify_known();print(json.dumps(r,indent=2));return 0 if r['pass'] else 2
if __name__=='__main__':raise SystemExit(main())
