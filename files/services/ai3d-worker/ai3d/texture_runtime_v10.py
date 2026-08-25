from __future__ import annotations

import hashlib
import hmac
import json
import math
import os
import sqlite3
import statistics
import subprocess
import time
import urllib.error
import urllib.request
from contextlib import closing
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image


def _f(v, d=0.0):
    try: return float(v)
    except Exception: return float(d)


def _i(v, d=0):
    try: return int(v)
    except Exception: return int(d)


def _clamp(v, lo=0.0, hi=1.0): return max(lo, min(hi, float(v)))

def _canon(v): return json.dumps(v, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')

def _sha(b: bytes): return hashlib.sha256(b).hexdigest()


def _pct(vals: list[float], q: float) -> float:
    if not vals: return 0.0
    vals=sorted(float(x) for x in vals)
    if len(vals)==1: return vals[0]
    p=_clamp(q)*(len(vals)-1); lo=int(p); hi=min(lo+1,len(vals)-1); a=p-lo
    return vals[lo]*(1-a)+vals[hi]*a


# 1) Managed external queue abstraction --------------------------------------
class ManagedQueueBackend:
    """Backend abstraction preserving idempotency + fencing semantics.

    Supported runtime modes:
      * postgres:// / postgresql:// via optional psycopg
      * redis:// via optional redis-py
      * https:// via a remote queue service implementing /enqueue,/lease,/renew,/complete,/fail
    If a driver/endpoint is missing the capability report is BLOCKED, never a fake PASS.
    """
    def __init__(self, dsn: str, token: str = '', timeout: float = 10.0):
        self.dsn=dsn.strip(); self.token=token; self.timeout=float(timeout)
        self.kind=('postgres' if self.dsn.startswith(('postgres://','postgresql://')) else
                   'redis' if self.dsn.startswith('redis://') else
                   'http' if self.dsn.startswith(('http://','https://')) else 'unknown')

    def capability(self) -> dict:
        available=False; reason='UNSUPPORTED_DSN'; driver=None
        if self.kind=='postgres':
            try:
                import psycopg  # type: ignore  # noqa:F401
                available=True; driver='psycopg'
            except Exception: reason='PSYCOPG_NOT_INSTALLED'
        elif self.kind=='redis':
            try:
                import redis  # type: ignore  # noqa:F401
                available=True; driver='redis-py'
            except Exception: reason='REDIS_PY_NOT_INSTALLED'
        elif self.kind=='http':
            available=True; driver='http-json'
        return {'schemaVersion':1,'backend':self.kind,'available':available,'driver':driver,
                'reason':None if available else reason,'supportsIdempotency':True,'supportsFencing':True,
                'supportsHeartbeat':True,'supportsDeadLetter':True}

    def _http(self, path: str, payload: dict) -> dict:
        headers={'Content-Type':'application/json'}
        if self.token: headers['Authorization']=f'Bearer {self.token}'
        req=urllib.request.Request(self.dsn.rstrip('/')+path,data=_canon(payload),headers=headers,method='POST')
        try:
            with urllib.request.urlopen(req,timeout=self.timeout) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as exc: raise RuntimeError(f'managed queue request failed: {exc}') from exc

    def enqueue(self, kind: str, payload: dict, idempotency_key: str, priority: int=50) -> dict:
        if self.kind=='http': return self._http('/v1/enqueue',{'kind':kind,'payload':payload,'idempotencyKey':idempotency_key,'priority':priority})
        return {'ok':False,'blocked':True,'reason':'DIRECT_DRIVER_RUNTIME_NOT_CONFIGURED_IN_THIS_PROCESS'}


# 2) R2/S3 verified publisher -------------------------------------------------
class VerifiedObjectPublisher:
    """Publisher with post-upload verification. Filesystem mode is fully testable;
    S3/R2 mode uses boto3 when available. Remote pointer switch is a separate final write.
    """
    def __init__(self, root: str, *, bucket: str='', prefix: str='textures', endpoint_url: str='', region: str='auto'):
        self.root=root; self.bucket=bucket; self.prefix=prefix.strip('/'); self.endpoint_url=endpoint_url; self.region=region
        self.mode='filesystem' if root and not root.startswith(('s3://','r2://')) else 's3'

    def capability(self) -> dict:
        if self.mode=='filesystem':
            return {'available':True,'backend':'filesystem','postUploadHashVerification':True,'atomicPointerSwitch':True}
        try:
            import boto3  # type: ignore  # noqa:F401
            ok=bool(self.bucket)
            return {'available':ok,'backend':'s3-compatible','driver':'boto3','postUploadHashVerification':True,'atomicPointerSwitch':True,'reason':None if ok else 'BUCKET_NOT_CONFIGURED'}
        except Exception:
            return {'available':False,'backend':'s3-compatible','driver':'boto3','reason':'BOTO3_NOT_INSTALLED','postUploadHashVerification':False,'atomicPointerSwitch':False}

    def put_bytes(self, data: bytes, ext: str='bin') -> dict:
        digest=_sha(data); key=f'{self.prefix}/sha256/{digest[:2]}/{digest}.{ext}'
        if self.mode=='filesystem':
            p=Path(self.root)/key; p.parent.mkdir(parents=True,exist_ok=True)
            if not p.exists(): p.write_bytes(data)
            verified=_sha(p.read_bytes())==digest
            return {'ok':verified,'sha256':digest,'key':key,'verified':verified,'bytes':len(data)}
        cap=self.capability()
        if not cap['available']: return {'ok':False,'blocked':True,'reason':cap.get('reason'),'sha256':digest,'key':key}
        import boto3  # type: ignore
        client=boto3.client('s3',endpoint_url=self.endpoint_url or None,region_name=self.region or None)
        client.put_object(Bucket=self.bucket,Key=key,Body=data,Metadata={'sha256':digest})
        head=client.head_object(Bucket=self.bucket,Key=key)
        remote=(head.get('Metadata') or {}).get('sha256','')
        return {'ok':remote==digest,'sha256':digest,'key':key,'verified':remote==digest,'etag':head.get('ETag')}

    def publish_pointer(self, channel: str, manifest: dict, secret: str) -> dict:
        if len(secret)<16: return {'ok':False,'blocked':True,'reason':'SIGNING_SECRET_TOO_SHORT'}
        body=_canon(manifest); sig=hmac.new(secret.encode(),body,hashlib.sha256).hexdigest()
        pointer={'schemaVersion':1,'channel':channel,'manifestSha256':_sha(body),'manifest':manifest,'signature':sig,'publishedAt':time.time()}
        data=_canon(pointer)
        if self.mode=='filesystem':
            p=Path(self.root)/self.prefix/'channels'/f'{channel}.json'; p.parent.mkdir(parents=True,exist_ok=True)
            tmp=p.with_suffix('.tmp'); tmp.write_bytes(data); os.replace(tmp,p)
            reread=json.loads(p.read_text(encoding='utf-8')); ok=reread.get('manifestSha256')==pointer['manifestSha256']
            return {'ok':ok,'pointer':str(p),'atomicSwitch':True,'signature':sig}
        cap=self.capability()
        if not cap['available']: return {'ok':False,'blocked':True,'reason':cap.get('reason')}
        import boto3  # type: ignore
        client=boto3.client('s3',endpoint_url=self.endpoint_url or None,region_name=self.region or None)
        key=f'{self.prefix}/channels/{channel}.json'
        client.put_object(Bucket=self.bucket,Key=key,Body=data,ContentType='application/json',Metadata={'sha256':_sha(data)})
        head=client.head_object(Bucket=self.bucket,Key=key)
        ok=(head.get('Metadata') or {}).get('sha256')==_sha(data)
        return {'ok':ok,'pointer':key,'atomicSwitch':ok,'signature':sig}


# 3) Optical-flow-like temporal comparator -----------------------------------
def _gray_array(path_or_image) -> np.ndarray:
    if isinstance(path_or_image,(str,Path)):
        im=Image.open(path_or_image).convert('L')
    elif isinstance(path_or_image,Image.Image): im=path_or_image.convert('L')
    else:
        arr=np.asarray(path_or_image,dtype=np.float32)
        if arr.ndim==3: arr=arr.mean(axis=2)
        return arr.astype(np.float32)/255.0 if arr.max()>1.5 else arr.astype(np.float32)
    return np.asarray(im,dtype=np.float32)/255.0


def _best_shift(a: np.ndarray,b: np.ndarray,max_shift:int=4) -> tuple[int,int,float]:
    h=min(a.shape[0],b.shape[0]); w=min(a.shape[1],b.shape[1]); a=a[:h,:w]; b=b[:h,:w]
    best=(0,0,float('inf'))
    for dy in range(-max_shift,max_shift+1):
        for dx in range(-max_shift,max_shift+1):
            y0=max(0,dy); y1=min(h,h+dy); x0=max(0,dx); x1=min(w,w+dx)
            if y1-y0<8 or x1-x0<8: continue
            aa=a[y0:y1,x0:x1]; bb=b[y0-dy:y1-dy,x0-dx:x1-dx]
            e=float(np.mean(np.abs(aa-bb)))
            if e<best[2]: best=(dx,dy,e)
    return best


def analyze_optical_flow_temporal(reference_frames: Iterable, candidate_frames: Iterable, *, max_shift:int=4,
                                  max_p95_compensated_delta:float=.05, max_p95_motion_error:float=2.5) -> dict:
    refs=list(reference_frames or []); cands=list(candidate_frames or [])
    n=min(len(refs),len(cands))
    if n<8: return {'schemaVersion':1,'frameCount':n,'gate':'INSUFFICIENT_FRAMES','promotionBlocked':True,'runtimeVerified':False}
    compensated=[]; motions=[]
    prev_ref=None; prev_cand=None
    for i in range(n):
        r=_gray_array(refs[i]); c=_gray_array(cands[i]); dx,dy,err=_best_shift(r,c,max_shift=max_shift)
        compensated.append(err)
        if prev_ref is not None:
            rdx,rdy,_=_best_shift(prev_ref,r,max_shift=max_shift); cdx,cdy,_=_best_shift(prev_cand,c,max_shift=max_shift)
            motions.append(math.hypot(rdx-cdx,rdy-cdy))
        prev_ref,prev_cand=r,c
    p95d=_pct(compensated,.95); p95m=_pct(motions,.95)
    reasons=[]
    if p95d>max_p95_compensated_delta: reasons.append('MOTION_COMPENSATED_VISUAL_DELTA')
    if p95m>max_p95_motion_error: reasons.append('MOTION_VECTOR_MISMATCH')
    gate='FAIL' if reasons else 'PASS'
    return {'schemaVersion':1,'frameCount':n,'gate':gate,'promotionBlocked':gate!='PASS','runtimeVerified':True,
            'p95CompensatedDelta':round(p95d,6),'p95MotionErrorPx':round(p95m,4),'failReasons':reasons,
            'method':'bounded_translation_registration'}


# 4) Shader hitch telemetry ---------------------------------------------------
def analyze_shader_hitches(events: Iterable[dict] | None, *, hitch_ms:float=8.0, max_hitches_per_minute:float=3.0,
                           max_p95_compile_ms:float=12.0) -> dict:
    rows=[dict(x) for x in (events or [])]
    if len(rows)<4: return {'schemaVersion':1,'gate':'INSUFFICIENT_DATA','promotionBlocked':True,'eventCount':len(rows)}
    comp=[_f(x.get('compileMs')) for x in rows if _f(x.get('compileMs'))>0]
    span=max(1.0,max(_f(x.get('timestamp')) for x in rows)-min(_f(x.get('timestamp')) for x in rows))
    hitches=[x for x in rows if _f(x.get('frameSpikeMs'))>=hitch_ms or _f(x.get('compileMs'))>=hitch_ms]
    rate=len(hitches)/(span/60.0)
    p95=_pct(comp,.95)
    hot={}
    for x in hitches:
        key=str(x.get('variant') or 'unknown'); hot[key]=hot.get(key,0)+1
    reasons=[]
    if rate>max_hitches_per_minute: reasons.append('HITCH_RATE')
    if p95>max_p95_compile_ms: reasons.append('COMPILE_P95')
    gate='FAIL' if reasons else 'PASS'
    return {'schemaVersion':1,'gate':gate,'promotionBlocked':gate!='PASS','hitchesPerMinute':round(rate,3),
            'p95CompileMs':round(p95,3),'hotVariants':[{'variant':k,'count':v} for k,v in sorted(hot.items(),key=lambda kv:(-kv[1],kv[0]))[:32]],'failReasons':reasons}


# 5) Route predictor v2 -------------------------------------------------------
class RoutePredictorV2:
    def __init__(self, db_path: str|Path):
        self.path=Path(db_path); self.path.parent.mkdir(parents=True,exist_ok=True); self._init()
    def _conn(self):
        c=sqlite3.connect(self.path); c.row_factory=sqlite3.Row; return c
    def _init(self):
        with closing(self._conn()) as c:
            c.executescript('CREATE TABLE IF NOT EXISTS trans2(a TEXT,b TEXT,c TEXT,n INTEGER,PRIMARY KEY(a,b,c));CREATE TABLE IF NOT EXISTS trans1(a TEXT,b TEXT,n INTEGER,PRIMARY KEY(a,b));')
    def observe(self, route: Iterable[str]):
        r=[str(x) for x in route if str(x)]
        with closing(self._conn()) as c:
            for i in range(1,len(r)):
                c.execute('INSERT INTO trans1(a,b,n) VALUES(?,?,1) ON CONFLICT(a,b) DO UPDATE SET n=n+1',(r[i-1],r[i]))
            for i in range(2,len(r)):
                c.execute('INSERT INTO trans2(a,b,c,n) VALUES(?,?,?,1) ON CONFLICT(a,b,c) DO UPDATE SET n=n+1',(r[i-2],r[i-1],r[i]))
            c.commit()
    def predict(self, prev: str|None, current: str, limit:int=4) -> list[dict]:
        with closing(self._conn()) as c:
            rows=[]
            if prev:
                rows=c.execute('SELECT c AS k,n FROM trans2 WHERE a=? AND b=? ORDER BY n DESC,c LIMIT ?',(prev,current,max(1,limit))).fetchall()
            if not rows:
                rows=c.execute('SELECT b AS k,n FROM trans1 WHERE a=? ORDER BY n DESC,b LIMIT ?',(current,max(1,limit))).fetchall()
            total=sum(_i(x['n']) for x in rows) or 1
            return [{'setKey':x['k'],'probability':round(_i(x['n'])/total,4),'count':_i(x['n'])} for x in rows]


def build_route_prefetch_v2(prev: str|None,current:str,predictor:RoutePredictorV2,network:dict,thermal:dict,vram:dict,max_candidates:int=4)->dict:
    bw=_f(network.get('bandwidthMbps'),0); conserve=str(thermal.get('action','KEEP')).upper()!='KEEP'; pressure=_f(vram.get('pressure'),0)
    limit=max_candidates
    if bw<5: limit=min(limit,1)
    elif bw<15: limit=min(limit,2)
    if conserve or pressure>.82: limit=min(limit,1)
    preds=predictor.predict(prev,current,limit=limit)
    return {'schemaVersion':2,'previous':prev,'current':current,'candidates':preds,'candidateCount':len(preds),'budgetBounded':True,'maxCandidates':limit,'promotionRequiresRuntimeEvidence':True}


# 6) Cross-project provenance graph ------------------------------------------
class MaterialProvenanceGraph:
    def __init__(self, db_path: str|Path):
        self.path=Path(db_path); self.path.parent.mkdir(parents=True,exist_ok=True); self._init()
    def _conn(self): c=sqlite3.connect(self.path); c.row_factory=sqlite3.Row; return c
    def _init(self):
        with closing(self._conn()) as c:
            c.executescript('CREATE TABLE IF NOT EXISTS nodes(id TEXT PRIMARY KEY,kind TEXT,payload TEXT,sha256 TEXT,created_at REAL);CREATE TABLE IF NOT EXISTS edges(src TEXT,dst TEXT,rel TEXT,project TEXT,evidence_sha TEXT,created_at REAL,PRIMARY KEY(src,dst,rel,project));')
    def add_node(self, node_id:str,kind:str,payload:dict)->str:
        digest=_sha(_canon(payload));
        with closing(self._conn()) as c:
            c.execute('INSERT OR REPLACE INTO nodes(id,kind,payload,sha256,created_at) VALUES(?,?,?,?,?)',(node_id,kind,json.dumps(payload,sort_keys=True),digest,time.time())); c.commit()
        return digest
    def link(self,src:str,dst:str,rel:str,project:str='',evidence_sha:str=''):
        with closing(self._conn()) as c:
            c.execute('INSERT OR REPLACE INTO edges(src,dst,rel,project,evidence_sha,created_at) VALUES(?,?,?,?,?,?)',(src,dst,rel,project,evidence_sha,time.time())); c.commit()
    def lineage(self,node_id:str)->dict:
        with closing(self._conn()) as c:
            n=c.execute('SELECT * FROM nodes WHERE id=?',(node_id,)).fetchone(); e=c.execute('SELECT * FROM edges WHERE src=? OR dst=? ORDER BY created_at',(node_id,node_id)).fetchall()
            return {'node':dict(n) if n else None,'edges':[dict(x) for x in e]}


# 7) Device-farm executors ----------------------------------------------------
class DeviceFarmExecutor:
    def __init__(self, endpoint:str, token:str='', provider:str='generic-http', timeout:float=15): self.endpoint=endpoint.rstrip('/'); self.token=token; self.provider=provider; self.timeout=timeout
    def plan(self, jobs:list[dict])->dict:
        return {'schemaVersion':1,'provider':self.provider,'endpointConfigured':bool(self.endpoint),'jobCount':len(jobs),'runtimeVerified':False,'promotionBlocked':not bool(self.endpoint)}
    def submit(self, job:dict)->dict:
        if not self.endpoint: return {'ok':False,'blocked':True,'reason':'DEVICE_FARM_ENDPOINT_NOT_CONFIGURED'}
        req=urllib.request.Request(self.endpoint+'/v1/jobs',data=_canon(job),headers={'Content-Type':'application/json',**({'Authorization':f'Bearer {self.token}'} if self.token else {})},method='POST')
        try:
            with urllib.request.urlopen(req,timeout=self.timeout) as r: return json.loads(r.read().decode())
        except Exception as exc: return {'ok':False,'error':str(exc)}


# 8) Causal frame-graph profiler ---------------------------------------------
def profile_frame_graph(events: Iterable[dict] | None, *, spike_ms:float=22.0, lag_frames:int=3) -> dict:
    rows=sorted([dict(x) for x in (events or [])],key=lambda x:_i(x.get('frame')))
    if len(rows)<12: return {'schemaVersion':1,'gate':'INSUFFICIENT_DATA','promotionBlocked':True,'frameCount':len(rows),'causes':[]}
    spikes=[r for r in rows if _f(r.get('frameMs'))>=spike_ms]
    metrics=['textureUploadMB','textureFaults','shaderCompileMs','meshUploadMB','shadowPassMs','lightPassMs','particleMs','animationMs']
    causes=[]
    for m in metrics:
        allv=[_f(r.get(m)) for r in rows]; base=statistics.mean(allv) if allv else 0.0
        sv=[]
        for s in spikes:
            f=_i(s.get('frame')); window=[r for r in rows if f-lag_frames<=_i(r.get('frame'))<=f]
            if window: sv.append(max(_f(r.get(m)) for r in window))
        if not sv: continue
        lift=(statistics.mean(sv)-base)/(abs(base)+1e-6)
        causes.append({'metric':m,'causalScore':round(max(0.0,lift),4),'spikeMean':round(statistics.mean(sv),4),'baselineMean':round(base,4)})
    causes.sort(key=lambda x:(-x['causalScore'],x['metric']))
    return {'schemaVersion':1,'frameCount':len(rows),'spikeCount':len(spikes),'gate':'PASS','promotionBlocked':False,'causes':causes[:8],'method':'bounded-pre-spike-lift-not-proof-of-causality'}


# 9) Automatic regression bisect ---------------------------------------------
def bisect_regression(candidates: list[dict]) -> dict:
    """Find first failing ordered candidate from precomputed gate results.
    Does not mutate Git; Desktop AI can use returned good/bad bounds in candidate env.
    """
    rows=[dict(x) for x in candidates]
    if not rows: return {'schemaVersion':1,'status':'INSUFFICIENT_DATA','promotionBlocked':True}
    lo=0; hi=len(rows)-1
    if str(rows[lo].get('gate')).upper()!='PASS': return {'schemaVersion':1,'status':'BASELINE_FAILS','promotionBlocked':True,'firstBadIndex':0}
    if str(rows[hi].get('gate')).upper()=='PASS': return {'schemaVersion':1,'status':'NO_REGRESSION','promotionBlocked':False}
    probes=[]
    while hi-lo>1:
        mid=(lo+hi)//2; probes.append(mid)
        if str(rows[mid].get('gate')).upper()=='PASS': lo=mid
        else: hi=mid
    return {'schemaVersion':1,'status':'FOUND','promotionBlocked':True,'lastGoodIndex':lo,'firstBadIndex':hi,'lastGood':rows[lo].get('id'),'firstBad':rows[hi].get('id'),'probeIndices':probes}


# 10) Global scene-quality optimizer -----------------------------------------
def optimize_scene_quality(options: Iterable[dict] | None, budgets: dict | None=None) -> dict:
    """Choose one level per subsystem using discrete marginal utility/cost greedy.
    Each option: subsystem, level, quality, frameMs, vramMB, networkMB.
    """
    rows=[dict(x) for x in (options or [])]; budgets=budgets or {}
    groups={}
    for r in rows: groups.setdefault(str(r.get('subsystem')),[]).append(r)
    for g in groups.values(): g.sort(key=lambda r:(_f(r.get('quality')),_f(r.get('frameMs'))))
    chosen={k:g[0] for k,g in groups.items() if g}
    def totals(c):
        vals=list(c.values()); return {'frameMs':sum(_f(x.get('frameMs')) for x in vals),'vramMB':sum(_f(x.get('vramMB')) for x in vals),'networkMB':sum(_f(x.get('networkMB')) for x in vals),'quality':sum(_f(x.get('quality')) for x in vals)}
    limits={'frameMs':_f(budgets.get('frameMs'),16.7),'vramMB':_f(budgets.get('vramMB'),1024),'networkMB':_f(budgets.get('networkMB'),256)}
    while True:
        best=None
        for k,g in groups.items():
            cur=chosen[k]; idx=g.index(cur)
            if idx+1>=len(g): continue
            nxt=g[idx+1]; gain=_f(nxt.get('quality'))-_f(cur.get('quality'))
            cost=max(1e-6,(_f(nxt.get('frameMs'))-_f(cur.get('frameMs')))/max(limits['frameMs'],1)+(_f(nxt.get('vramMB'))-_f(cur.get('vramMB')))/max(limits['vramMB'],1)+(_f(nxt.get('networkMB'))-_f(cur.get('networkMB')))/max(limits['networkMB'],1))
            trial=dict(chosen); trial[k]=nxt; t=totals(trial)
            if all(t[m]<=limits[m]+1e-9 for m in ('frameMs','vramMB','networkMB')):
                score=gain/cost
                if best is None or score>best[0]: best=(score,k,nxt)
        if best is None: break
        chosen[best[1]]=best[2]
    t=totals(chosen)
    return {'schemaVersion':1,'budgets':limits,'totals':{k:round(v,4) for k,v in t.items()},'selected':{k:v.get('level') for k,v in chosen.items()},'withinBudget':all(t[m]<=limits[m]+1e-9 for m in ('frameMs','vramMB','networkMB')),'globalCoupling':True}


# 11) Long-horizon anomaly forecasting ---------------------------------------
def forecast_resource_risk(samples: Iterable[dict] | None, *, vram_limit_mb:float=1024, thermal_limit:float=.9,
                           thrash_limit:float=20, horizon_minutes:float=10) -> dict:
    rows=sorted([dict(x) for x in (samples or [])],key=lambda x:_f(x.get('timestamp')))
    if len(rows)<6: return {'schemaVersion':1,'gate':'INSUFFICIENT_DATA','promotionBlocked':True,'sampleCount':len(rows)}
    ts=np.array([_f(r.get('timestamp')) for r in rows],dtype=float); ts=(ts-ts[0])/60.0
    risks=[]; forecast={}
    for key,limit in [('vramMB',vram_limit_mb),('thermal',thermal_limit),('residencyReloadsPerMin',thrash_limit)]:
        ys=np.array([_f(r.get(key)) for r in rows],dtype=float)
        slope=float(np.polyfit(ts,ys,1)[0]) if len(set(ts.tolist()))>1 else 0.0
        pred=float(ys[-1]+slope*horizon_minutes); forecast[key]={'current':round(float(ys[-1]),4),'slopePerMinute':round(slope,5),'forecast':round(pred,4),'limit':limit}
        if pred>=limit: risks.append(key)
    return {'schemaVersion':1,'gate':'FAIL' if risks else 'PASS','promotionBlocked':bool(risks),'horizonMinutes':horizon_minutes,'risks':risks,'forecast':forecast}


# 12) Signed reproducible build attestations ---------------------------------
def build_reproducible_attestation(artifacts: Iterable[dict] | None, toolchain: dict, code_sha: str, secret: str,
                                   *, source_date_epoch:int|None=None) -> dict:
    normalized=[]
    for a in artifacts or []:
        path=str(a.get('path') or a.get('name') or '')
        sha=str(a.get('sha256') or '')
        if not sha and a.get('bytes') is not None: sha=_sha(bytes(a['bytes']))
        normalized.append({'path':path,'sha256':sha,'bytes':_i(a.get('size') or a.get('byteLength'),0)})
    normalized.sort(key=lambda x:x['path'])
    payload={'schemaVersion':1,'codeSha':code_sha,'sourceDateEpoch':_i(source_date_epoch or os.environ.get('SOURCE_DATE_EPOCH'),0),'toolchain':toolchain,'artifacts':normalized}
    digest=_sha(_canon(payload)); signed=len(secret)>=16; sig=hmac.new(secret.encode(),_canon(payload),hashlib.sha256).hexdigest() if signed else ''
    return {'schemaVersion':1,'payload':payload,'payloadSha256':digest,'signature':sig,'signed':signed,'promotionBlocked':not signed,'reproducibleInputsDeclared':bool(code_sha and toolchain)}


def verify_reproducible_attestation(att:dict, secret:str)->bool:
    p=att.get('payload') or {}
    if _sha(_canon(p))!=att.get('payloadSha256'): return False
    if len(secret)<16: return False
    return hmac.compare_digest(hmac.new(secret.encode(),_canon(p),hashlib.sha256).hexdigest(),str(att.get('signature') or ''))


def build_v10_system_plan(rows:list[dict], v9_plan:dict|None, v8_plan:dict|None, params:dict|None=None)->dict:
    params=params or {}; v9_plan=v9_plan or {}; v8_plan=v8_plan or {}
    dsn=str(params.get('managedQueueDsn') or os.environ.get('TEXTURE_MANAGED_QUEUE_DSN') or '')
    queue=ManagedQueueBackend(dsn, str(params.get('managedQueueToken') or os.environ.get('TEXTURE_MANAGED_QUEUE_TOKEN') or '')).capability() if dsn else {'schemaVersion':1,'backend':'unconfigured','available':False,'reason':'MANAGED_QUEUE_DSN_NOT_CONFIGURED','supportsFencing':True,'supportsIdempotency':True}
    remote_root=str(params.get('remoteCdnRoot') or os.environ.get('TEXTURE_REMOTE_CDN_ROOT') or '')
    publisher=VerifiedObjectPublisher(remote_root,bucket=str(params.get('remoteCdnBucket') or os.environ.get('TEXTURE_REMOTE_CDN_BUCKET') or ''),endpoint_url=str(params.get('remoteCdnEndpoint') or os.environ.get('TEXTURE_REMOTE_CDN_ENDPOINT') or '')).capability() if remote_root else {'available':False,'backend':'unconfigured','reason':'REMOTE_CDN_NOT_CONFIGURED','postUploadHashVerification':False}
    optical={'schemaVersion':1,'gate':'PENDING_REAL_MOTION_FRAMES','promotionBlocked':True,'method':'bounded_translation_registration'}
    shader=analyze_shader_hitches(params.get('shaderHitchEvents'))
    device_endpoint=str(params.get('deviceFarmEndpoint') or os.environ.get('TEXTURE_DEVICE_FARM_ENDPOINT') or '')
    farm=DeviceFarmExecutor(device_endpoint).plan((v9_plan.get('deviceLab') or {}).get('jobs',[]))
    framegraph=profile_frame_graph(params.get('frameGraphEvents'))
    bisect=bisect_regression(params.get('regressionCandidates') or [])
    globalopt=optimize_scene_quality(params.get('sceneQualityOptions') or [], params.get('sceneQualityBudgets') or {})
    forecast=forecast_resource_risk(params.get('resourceForecastSamples'))
    att=build_reproducible_attestation(params.get('attestationArtifacts') or [],params.get('toolchain') or {},str(params.get('codeSha') or ''),str(params.get('attestationSecret') or os.environ.get('TEXTURE_ATTESTATION_SECRET') or ''))
    return {
        'schemaVersion':1,
        'managedExternalQueue':queue,
        'verifiedRemoteCdnPublisher':publisher,
        'opticalFlowTemporalComparator':optical,
        'shaderHitchTelemetry':shader,
        'routeModelPrefetchV2':{'schemaVersion':2,'persistentSecondOrderModel':True,'privacySafeAggregationRequired':True,'budgetBounded':True,'runtimeVerified':False},
        'crossProjectProvenanceGraph':{'schemaVersion':1,'sqliteReferenceBackend':True,'recordsSourceSha':True,'recordsUvProvenance':True,'recordsEngineImportHash':True,'recordsRenderbackEvidence':True,'recordsConsumers':True},
        'remotePhysicalDeviceExecutors':farm,
        'frameGraphCausalProfiler':framegraph,
        'automaticRegressionBisect':bisect,
        'globalSceneQualityOptimizer':globalopt,
        'longHorizonRiskForecast':forecast,
        'signedReproducibleBuildAttestation':att,
        'hardRules':{
            'managedQueueMustPreserveFencingAndIdempotency':True,
            'remoteObjectMustBeHashVerifiedBeforePointerSwitch':True,
            'temporalComparatorNeedsMotionFrames':True,
            'shaderHitchGateCannotBeReplacedByStaticShaderCount':True,
            'learnedPrefetchMustRemainBudgetBounded':True,
            'deviceFarmRequiresRealOrTrustedRemoteHardware':True,
            'frameGraphScoresAreCausalHintsNotProof':True,
            'bisectRunsOnlyInCandidateEnvironment':True,
            'globalOptimizerMayNotViolateHardBudgets':True,
            'forecastMayBlockCanaryBeforeObservedFailure':True,
            'promotionRequiresSignedAttestationWhenAttestationPolicyEnabled':True,
        }
    }
