'use strict';
function percentile(values,q){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;return a[Math.min(a.length-1,Math.max(0,Math.ceil(q*a.length)-1))]}
function ownBase(req){
  if(process.env.VERCEL_URL)return `https://${process.env.VERCEL_URL}`;
  const host=String(req.headers?.['x-forwarded-host']||req.headers?.host||'').split(',')[0].trim();
  if(host==='world-server.vercel.app'||/^[a-z0-9.-]+\.vercel\.app$/i.test(host))return `https://${host}`;
  return 'https://world-server.vercel.app';
}
module.exports=function createRegionalProbe(configuredRegion){
  return async function handler(req,res){
    if(req.method!=='GET'){res.statusCode=405;res.end('Method Not Allowed');return;}
    const base=ownBase(req);
    const paths=['/api/apps','/apps/catalog/','/apps/ai3d-voxel-city/'];
    const samples=Math.max(1,Math.min(Number(req.query?.samples||3),5));
    const rows=[];
    for(const route of paths){
      const timings=[];let errors=0;
      for(let i=0;i<samples;i++){
        const start=performance.now();
        try{
          const r=await fetch(base+route,{redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(15000)});
          const text=await r.text();
          const ms=performance.now()-start;timings.push(ms);
          if(!r.ok||/Internal Server Error/i.test(text))errors++;
        }catch(_){timings.push(performance.now()-start);errors++}
      }
      rows.push({route,samples,errors,errorRatePercent:errors*100/samples,medianMs:percentile(timings,.5),p95Ms:percentile(timings,.95)});
    }
    const all=rows.flatMap(r=>[r.medianMs]).filter(Number.isFinite);
    const p95=rows.map(r=>r.p95Ms).filter(Number.isFinite);
    const report={ok:rows.every(r=>r.errors===0),configuredRegion,runtimeRegion:process.env.VERCEL_REGION||null,base,rows,overallMedianMs:percentile(all,.5),overallP95Ms:percentile(p95,.95),generatedAt:new Date().toISOString()};
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.statusCode=200;res.end(JSON.stringify(report));
  }
}
