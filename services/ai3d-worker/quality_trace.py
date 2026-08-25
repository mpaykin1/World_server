from __future__ import annotations
import contextlib, json, os, secrets, threading, time, urllib.request

TRACE_ENDPOINT=os.environ.get('QUALITY_TRACE_ENDPOINT','https://world-server.vercel.app/api/quality-trace').rstrip('/')
TRACE_TOKEN=os.environ.get('QUALITY_TRACE_TOKEN','')

def _hex(n:int)->str:return secrets.token_hex(n)
def _parse(tp:str|None):
    if not tp:return None
    p=tp.strip().split('-')
    if len(p)==4 and p[0]=='00' and len(p[1])==32 and len(p[2])==16:return p[1].lower(),p[2].lower()
    return None

def _post(payload:dict):
    if not TRACE_TOKEN:return
    try:
        data=json.dumps(payload,separators=(',',':')).encode()
        req=urllib.request.Request(TRACE_ENDPOINT,data=data,headers={'content-type':'application/json','authorization':f'Bearer {TRACE_TOKEN}'},method='POST')
        urllib.request.urlopen(req,timeout=2.5).read(128)
    except Exception:pass

def emit_span(name:str,duration_ms:float,status:str='OK',attributes:dict|None=None,traceparent:str|None=None,service_name:str='ai3d-worker'):
    parsed=_parse(traceparent);trace_id=parsed[0] if parsed else _hex(16);parent=parsed[1] if parsed else None;span_id=_hex(8)
    payload={'serviceName':service_name,'name':name,'durationMs':max(0.0,float(duration_ms)),'status':'ERROR' if status=='ERROR' else 'OK','attributes':attributes or {},'traceparent':f'00-{trace_id}-{parent or span_id}-01','spanId':span_id,'parentSpanId':parent}
    threading.Thread(target=_post,args=(payload,),daemon=True).start()
    return f'00-{trace_id}-{span_id}-01'

@contextlib.contextmanager
def trace_job(name:str,attributes:dict|None=None,traceparent:str|None=None):
    started=time.perf_counter();status='OK'
    try:yield
    except Exception:
        status='ERROR';raise
    finally:emit_span(name,(time.perf_counter()-started)*1000,status,attributes,traceparent)

class QualityTraceMiddleware:
    def __init__(self,app):self.app=app
    async def __call__(self,scope,receive,send):
        if scope.get('type')!='http':return await self.app(scope,receive,send)
        headers={k.decode().lower():v.decode() for k,v in scope.get('headers',[])};incoming=headers.get('traceparent');started=time.perf_counter();status_code=500
        async def traced_send(message):
            nonlocal status_code
            if message.get('type')=='http.response.start':status_code=int(message.get('status',500))
            await send(message)
        try:await self.app(scope,receive,traced_send)
        finally:emit_span(f"{scope.get('method','')} {scope.get('path','')}",(time.perf_counter()-started)*1000,'ERROR' if status_code>=500 else 'OK',{'http.status_code':status_code},incoming)
