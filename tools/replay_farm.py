#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, random
from pathlib import Path

def simulate(seed:int, steps=240):
    r=random.Random(seed); x=y=z=0.0; vx=vy=vz=0.0; packets=[]
    for tick in range(steps):
        # deterministic synthetic player + packet jitter/loss schedule.
        ax=(r.randint(-1000,1000))/100000.0; az=(r.randint(-1000,1000))/100000.0
        vx=(vx+ax)*0.98; vz=(vz+az)*0.98; vy=max(-28.0,vy-16.5/60.0)
        if tick%71==0 and abs(y)<1e-9: vy=5.6
        x+=vx; y=max(0.0,y+vy/60.0); z+=vz
        if y==0.0 and vy<0: vy=0
        delay=r.randrange(0,5); drop=(r.randrange(1000)<12)
        packets.append((tick,delay,drop,round(x,8),round(y,8),round(z,8)))
    payload=json.dumps({'seed':seed,'state':[x,y,z,vx,vy,vz],'packets':packets},sort_keys=True,separators=(',',':')).encode()
    return hashlib.sha256(payload).hexdigest()

def run_farm(seeds):
    rows=[]; ok=True
    for s in seeds:
        a=simulate(s); b=simulate(s); same=a==b; ok &= same; rows.append({'seed':s,'hash':a,'repeatHash':b,'deterministic':same})
    return {'schemaVersion':1,'mode':'deterministic-network-physics-replay-farm-v1','pass':ok,'runs':rows,'seedCount':len(rows),'serverGpuRequired':False}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--seeds',default='7,11,23,47,97'); ap.add_argument('--out'); ap.add_argument('--self-test',action='store_true'); a=ap.parse_args(); seeds=[int(x) for x in a.seeds.split(',') if x.strip()]; out=run_farm(seeds)
    if a.out: Path(a.out).write_text(json.dumps(out,indent=2)+'\n')
    print(json.dumps(out,indent=2)); return 0 if out['pass'] else 2
if __name__=='__main__': raise SystemExit(main())
