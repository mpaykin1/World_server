'use strict';
const crypto=require('crypto');
const ROUTE_TOKEN=/\b[0-9a-f]{8,}|\b\d{4,}\b/ig;
function bounded(n,min,max,fallback=0){n=Number(n);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback}
function routeClass(pathname){
  let p=String(pathname||'/').split('?')[0].slice(0,300);
  p=p.replace(ROUTE_TOKEN,':id').replace(/\/{2,}/g,'/');
  return p||'/';
}
function validTrace(v){return /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/i.test(String(v||''))}
function normalizeRuntimeSignal(x={}){
  const status=Math.trunc(bounded(x.status,0,599,0));
  return {
    ts:String(x.ts||new Date().toISOString()).slice(0,40),
    slot:['navigator','sandbox'].includes(String(x.slot))?String(x.slot):'unknown',
    service:String(x.service||'unknown').slice(0,120),
    revision:String(x.revision||'unknown').slice(0,160),
    buildSha:String(x.buildSha||'unknown').slice(0,80),
    route:routeClass(x.route),
    method:String(x.method||'GET').toUpperCase().slice(0,12),
    status,
    latencyMs:bounded(x.latencyMs,0,300000,0),
    rssMb:bounded(x.rssMb,0,65536,0),
    heapMb:bounded(x.heapMb,0,65536,0),
    coldStart:Boolean(x.coldStart),
    correlationId:String(x.correlationId||'').slice(0,128),
    traceparent:validTrace(x.traceparent)?String(x.traceparent).toLowerCase():'',
    source:String(x.source||'cloud-run-structured-log').slice(0,80)
  };
}
function percentile(values,p){
  const a=values.map(Number).filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return 0;
  const i=Math.min(a.length-1,Math.max(0,Math.ceil((p/100)*a.length)-1));return a[i];
}
function aggregateRuntimeSignals(items=[]){
  const signals=items.map(normalizeRuntimeSignal);
  const byRoute=new Map(),byRevision=new Map();
  for(const s of signals){
    for(const [map,key] of [[byRoute,s.route],[byRevision,s.revision]]){
      const a=map.get(key)||[];a.push(s);map.set(key,a);
    }
  }
  const summarize=(key,a)=>({key,requests:a.length,errorRate:a.length?a.filter(x=>x.status>=500).length/a.length:0,p95LatencyMs:percentile(a.map(x=>x.latencyMs),95),p99LatencyMs:percentile(a.map(x=>x.latencyMs),99),coldStarts:a.filter(x=>x.coldStart).length,maxRssMb:Math.max(0,...a.map(x=>x.rssMb))});
  return {
    schemaVersion:'5.0.0',
    samples:signals.length,
    errorRate:signals.length?signals.filter(x=>x.status>=500).length/signals.length:0,
    p95LatencyMs:percentile(signals.map(x=>x.latencyMs),95),
    p99LatencyMs:percentile(signals.map(x=>x.latencyMs),99),
    coldStarts:signals.filter(x=>x.coldStart).length,
    routes:[...byRoute].map(([k,a])=>summarize(k,a)).sort((a,b)=>(b.errorRate-a.errorRate)||(b.p95LatencyMs-a.p95LatencyMs)).slice(0,100),
    revisions:[...byRevision].map(([k,a])=>summarize(k,a)).sort((a,b)=>b.requests-a.requests).slice(0,100)
  };
}
function developmentCandidates(summary,{slowMs=1500,errorRate=0.02}={}){
  const out=[];
  for(const r of summary.routes||[]){
    if(r.errorRate>=errorRate)out.push({kind:'google-runtime-error',route:r.key,priority:'P0',evidence:r,automaticMutation:false});
    else if(r.p95LatencyMs>=slowMs)out.push({kind:'google-runtime-latency',route:r.key,priority:'P1',evidence:r,automaticMutation:false});
    if(r.coldStarts>=3)out.push({kind:'google-cold-start-pressure',route:r.key,priority:'P1',evidence:r,automaticMutation:false});
  }
  return out.slice(0,100);
}
function evidenceId(signal){const s=normalizeRuntimeSignal(signal);return crypto.createHash('sha256').update(JSON.stringify([s.revision,s.route,s.status,s.latencyMs,s.correlationId])).digest('hex').slice(0,24)}
module.exports={normalizeRuntimeSignal,aggregateRuntimeSignals,developmentCandidates,routeClass,percentile,evidenceId};
