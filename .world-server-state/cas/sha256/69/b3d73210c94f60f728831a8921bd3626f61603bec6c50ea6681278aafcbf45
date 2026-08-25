#!/usr/bin/env python3
from __future__ import annotations
import argparse, datetime as dt, os, json
from quality_common import QUALITY, read_json, write_json
from propagate_to_consumers import pack_hash, runtime_hash
STATE=QUALITY/'knowledge/release-state.json'
def now():return dt.datetime.now(dt.timezone.utc).isoformat()
def approve():
 old=read_json(STATE,{});cur={'schemaVersion':1,'pack':'WORLD_FACTORY_QUALITY_CORE_V10','version':'9.0.0','approvedAt':now(),'project':os.environ.get('QUALITY_PROJECT','world-factory-core'),'packHash':pack_hash(),'runtimeHash':runtime_hash(),'previous':{'packHash':old.get('packHash'),'runtimeHash':old.get('runtimeHash'),'approvedAt':old.get('approvedAt')} if old else None}
 write_json(STATE,cur);return cur
def check():
 s=read_json(STATE,{});ok=bool(s.get('packHash') and s.get('runtimeHash'));return {'pass':ok,'state':s}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('command',choices=['approve','check']);a=ap.parse_args();r=approve() if a.command=='approve' else check();print(json.dumps(r,ensure_ascii=False,indent=2));raise SystemExit(0 if r.get('pass',True) else 1)
if __name__=='__main__':main()
