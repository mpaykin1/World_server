#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math
from pathlib import Path
import numpy as np
from PIL import Image


def load_rgb(path: Path) -> np.ndarray:
    with Image.open(path) as im:
        return np.asarray(im.convert('RGB'), dtype=np.float32) / 255.0


def edge_energy(gray: np.ndarray) -> float:
    gx=np.diff(gray,axis=1); gy=np.diff(gray,axis=0)
    return float(np.mean(np.abs(gx))+np.mean(np.abs(gy)))


def pair_score(base: np.ndarray, syn: np.ndarray) -> dict:
    if base.shape != syn.shape:
        return {'pass':False,'score':0,'reason':'shape_mismatch'}
    mae=float(np.mean(np.abs(base-syn)))
    bgray=0.2126*base[...,0]+0.7152*base[...,1]+0.0722*base[...,2]
    sgray=0.2126*syn[...,0]+0.7152*syn[...,1]+0.0722*syn[...,2]
    eb=edge_energy(bgray); es=edge_energy(sgray)
    edge_ratio=min(1.0, min(eb,es)/max(max(eb,es),1e-8))
    color_shift=float(np.mean(np.abs(np.mean(base,axis=(0,1))-np.mean(syn,axis=(0,1)))))
    # Synthetic views have a deliberately small baseline. Large appearance changes
    # are a warning that depth warping is unstable. This is a stability metric,
    # not a claim of metric geometric accuracy.
    mae_score=max(0.0,1.0-mae/0.16)
    color_score=max(0.0,1.0-color_shift/0.10)
    score=int(round(100*(0.65*mae_score+0.25*edge_ratio+0.10*color_score)))
    return {'pass':score>=55,'score':max(0,min(100,score)),'mae':round(mae,5),'edge_ratio':round(edge_ratio,4),'color_shift':round(color_shift,5)}


def analyze(out: Path) -> dict:
    tp=out/'dataset'/'transforms.json'
    if not tp.is_file():
        return {'schema':'world-server.gs360-synthetic-consistency/v1','pass':False,'status':'MISSING_TRANSFORMS','score':0,'pairs':[]}
    t=json.loads(tp.read_text(encoding='utf-8'))
    frames=t.get('frames',[]) or []
    bases={}
    syns=[]
    for f in frames:
        rel=f.get('file_path','')
        if not rel: continue
        stem=Path(rel).stem
        if f.get('synthetic'):
            syns.append((f,stem))
        else:
            bases[stem]=f
    rows=[]
    for f,stem in syns:
        base_stem=stem.split('_s',1)[0]
        bf=bases.get(base_stem)
        if not bf: continue
        bp=out/'dataset'/bf['file_path']; sp=out/'dataset'/f['file_path']
        if not bp.is_file() or not sp.is_file(): continue
        try:
            r=pair_score(load_rgb(bp),load_rgb(sp)); r.update({'base':bf['file_path'],'synthetic':f['file_path']}); rows.append(r)
        except Exception as e:
            rows.append({'base':bf['file_path'],'synthetic':f['file_path'],'pass':False,'score':0,'error':f'{type(e).__name__}: {e}'})
    if not rows:
        rep={'schema':'world-server.gs360-synthetic-consistency/v1','pass':True,'status':'NOT_APPLICABLE','score':None,'pair_count':0,'pairs':[],'note':'No synthetic views were present.'}
    else:
        avg=round(sum(float(r.get('score',0)) for r in rows)/len(rows))
        bad=sum(1 for r in rows if not r.get('pass'))
        rep={'schema':'world-server.gs360-synthetic-consistency/v1','pass':avg>=55 and bad<=max(1,len(rows)//4),'status':'PASS' if avg>=75 and bad==0 else ('WARN' if avg>=55 else 'FAIL'),'score':avg,'pair_count':len(rows),'bad_pairs':bad,'pairs':rows[:200], 'truth_note':'Measures small-baseline synthetic-view stability only; it does not prove metric geometry.'}
    return rep


def main()->int:
    ap=argparse.ArgumentParser(); ap.add_argument('--output',required=True); a=ap.parse_args(); out=Path(a.output).expanduser().resolve()
    rep=analyze(out); (out/'GS360_SYNTHETIC_CONSISTENCY.json').write_text(json.dumps(rep,indent=2,ensure_ascii=False)+'\n',encoding='utf-8'); print(json.dumps(rep,ensure_ascii=False)); return 0 if rep.get('status')!='FAIL' else 2
if __name__=='__main__': raise SystemExit(main())
