#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data','quiet-quality-autopilot.json'),'utf8')),m=cfg.multiRegion||{};
const baseline=(process.env.BASELINE_URL||process.env.QUALITY_BASE_URL||cfg.productionBaseUrl||'').replace(/\/$/,'');
const candidate=(process.env.CANDIDATE_URL||'').replace(/\/$/,'');
function pct(c,b){return Number.isFinite(c)&&Number.isFinite(b)&&b!==0?(c-b)*100/b:null}
async function get(base,ep){try{const r=await fetch(base+ep.path+`?samples=${Number(m.samplesPerPath||3)}`,{cache:'no-store',signal:AbortSignal.timeout(Number(m.requestTimeoutMs||15000)*4)});if(!r.ok)return {available:false,status:r.status};const j=await r.json();return {available:true,...j}}catch(e){return {available:false,error:String(e.message||e)}}}
(async()=>{
  if(!baseline){console.error('[MULTI_REGION] baseline required');process.exit(2)}
  const rows=[];
  for(const ep of m.probeEndpoints||[]){
    const b=await get(baseline,ep),c=candidate?await get(candidate,ep):null;
    if(!b.available||candidate&&(!c||!c.available)){rows.push({id:ep.id,region:ep.region,baseline:b,candidate:c,available:false,pass:false});continue}
    const bErr=(b.rows||[]).reduce((n,r)=>n+Number(r.errors||0),0),cErr=c?(c.rows||[]).reduce((n,r)=>n+Number(r.errors||0),0):0;
    const medDelta=c?pct(Number(c.overallMedianMs),Number(b.overallMedianMs)):null;
    const p95=Number(c?c.overallP95Ms:b.overallP95Ms);
    const baselineRegionMatch=String(b.runtimeRegion||'')===String(ep.region||'');
    const candidateRegionMatch=c?String(c.runtimeRegion||'')===String(ep.region||''):true;
    const regionMatch=baselineRegionMatch&&candidateRegionMatch;
    const pass=regionMatch&&(c?cErr<=bErr:true)&&(!Number.isFinite(medDelta)||medDelta<=Number(m.maxMedianRegressionPercent||5))&&(!Number.isFinite(p95)||p95<=Number(m.maxAbsoluteP95Ms||5000));
    rows.push({id:ep.id,region:ep.region,available:true,regionMatch,baselineRegionMatch,candidateRegionMatch,baseline:b,candidate:c,medianRegressionPercent:medDelta,pass});
  }
  const available=rows.length>0&&rows.every(r=>r.available);
  const pass=available&&rows.every(r=>r.pass);
  const report={generatedAt:new Date().toISOString(),baseline,candidate:candidate||null,available,pass,status:!available?'REGIONAL_PROBES_UNAVAILABLE':(pass?'REGIONAL_PROBES_HEALTHY':'REGIONAL_REGRESSION'),rows};
  fs.writeFileSync(path.join(ROOT,'QUALITY_MULTI_REGION_REPORT.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`[MULTI_REGION] status=${report.status} regions=${rows.length}`);
  if(available&&!pass)process.exit(71);
})().catch(e=>{console.error(e);process.exit(72)});
