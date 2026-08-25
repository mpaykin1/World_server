#!/usr/bin/env python3
from __future__ import annotations
import json, sys
from pathlib import Path
from quality_common import ROOT, QUALITY, iter_world_manifests, read_json, write_json, sha256, inspect_asset

BASE=QUALITY/'baselines/worlds'


def snapshot(mpath:Path,m:dict)->dict:
    v=m['visual']; asset=(mpath.parent/v['url'].replace('./','',1)).resolve()
    sem=(mpath.parent/m['semantic']['url'].replace('./','',1)).resolve()
    s=read_json(sem,{})
    stats=inspect_asset(asset)
    return {
        'worldId':m['id'],'runtime':m.get('quality',{}).get('profile'),'visualSha256':sha256(asset),
        'sourceStats':{k:stats.get(k) for k in ('type','vertices','faces','triangles','materials','textures')},
        'semantic':{k:s.get(k) for k in ('walkableArea','walkableRatio','wallArea','wallRatio')},
        'contracts':{
            'cameraRoll':m.get('controls',{}).get('cameraRoll'),
            'maxPitchDeg':m.get('controls',{}).get('maxPitchDeg'),
            'jumpImpulse':m.get('controls',{}).get('jumpImpulse'),
            'feetFollowTravel':m.get('controls',{}).get('feetFollowTravel'),
            'attackFollowsFeet':m.get('controls',{}).get('attackFollowsFeet'),
        }
    }


def create_missing():
    count=0
    for _,mpath,m in iter_world_manifests():
        p=BASE/f'{m["id"]}.json'
        if not p.exists(): write_json(p,snapshot(mpath,m)); count+=1
    return count


def main(update=False):
    errors=[]; warnings=[]
    for _,mpath,m in iter_world_manifests():
        wid=m['id']; cur=snapshot(mpath,m); bp=BASE/f'{wid}.json'
        if update or not bp.exists():
            if update: write_json(bp,cur); continue
            errors.append(f'{wid}: approved baseline missing; run tools/regression_gate.py --update only after review')
            continue
        base=read_json(bp,{})
        if cur['visualSha256']!=base.get('visualSha256'): errors.append(f'{wid}: GFX-001 source hash changed')
        for k,bv in (base.get('sourceStats') or {}).items():
            cv=cur['sourceStats'].get(k)
            if bv is None or cv is None: continue
            if k in ('vertices','faces','triangles','materials','textures') and cv < bv:
                errors.append(f'{wid}: GFX-001 {k} regressed {bv} -> {cv}')
            elif k=='type' and cv!=bv: errors.append(f'{wid}: source type changed {bv} -> {cv}')
        bc=base.get('contracts') or {}; cc=cur['contracts']
        for key in ('cameraRoll','jumpImpulse','feetFollowTravel','attackFollowsFeet'):
            if cc.get(key)!=bc.get(key): errors.append(f'{wid}: controller contract {key} drifted {bc.get(key)} -> {cc.get(key)}')
        if float(cc.get('maxPitchDeg') or 0) < float(bc.get('maxPitchDeg') or 0): errors.append(f'{wid}: pitch range regressed')
        bsem=base.get('semantic') or {}; csem=cur['semantic']
        if bsem.get('walkableArea') and csem.get('walkableArea') is not None:
            if csem['walkableArea'] < bsem['walkableArea']*0.92: errors.append(f'{wid}: walkable area regressed >8%')
    report={'pass':not errors,'errors':errors,'warnings':warnings}
    write_json(QUALITY/'reports/regression.json',report)
    print('REGRESSION GATE:', 'PASS' if not errors else 'FAIL')
    for e in errors: print(' -',e)
    return 0 if not errors else 1

if __name__=='__main__':
    if '--create-missing' in sys.argv:
        print(f'Created {create_missing()} missing baseline(s)'); sys.exit(0)
    sys.exit(main(update='--update' in sys.argv))
