#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,statistics
from pathlib import Path

def metrics(frame_ms):
 a=sorted(float(x) for x in frame_ms);n=len(a)
 def pct(p):return a[min(n-1,max(0,int(round((n-1)*p))))]
 return {'frames':n,'medianMs':round(statistics.median(a),3),'p95Ms':round(pct(.95),3),'p99Ms':round(pct(.99),3),'hitches50ms':sum(x>50 for x in a),'hitches100ms':sum(x>100 for x in a)}
def compare(base,cand):
 b,c=metrics(base),metrics(cand);pass_=c['p99Ms']<=max(b['p99Ms']*1.05,b['p99Ms']+0.75) and c['hitches50ms']<=b['hitches50ms']
 return {'pass':pass_,'baseline':b,'candidate':c,'policy':'p99 <= baseline + max(5%,0.75ms); 50ms hitch count must not increase'}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('baseline');ap.add_argument('candidate');a=ap.parse_args();b=json.loads(Path(a.baseline).read_text());c=json.loads(Path(a.candidate).read_text());r=compare(b['frameMs'],c['frameMs']);print(json.dumps(r,separators=(',',':')));raise SystemExit(0 if r['pass'] else 1)
if __name__=='__main__':main()
