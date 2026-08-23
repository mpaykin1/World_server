#!/usr/bin/env node
'use strict';
const base=(process.env.QUALITY_BASE_URL||'').replace(/\/$/,'');
if(!base)throw new Error('QUALITY_BASE_URL required');
const paths=['/api/apps','/apps/catalog/','/apps/voxel-world/','/apps/ai3d-voxel-city/'];
const failures=[];
(async () => {
  for(const path of paths){
    const started=Date.now();
    try{
      const r=await fetch(base+path,{redirect:'follow',signal:AbortSignal.timeout(15000)});
      const text=await r.text();
      const ms=Date.now()-started;
      if(!r.ok)failures.push({path,status:r.status,ms});
      else if(/Internal Server Error/i.test(text))failures.push({path,status:r.status,ms,reason:'Internal Server Error body'});
      else console.log(`[POST_DEPLOY_SMOKE] ${path} ${r.status} ${ms}ms`);
    }catch(e){failures.push({path,error:String(e.message||e)})}
  }
  // Sentry static check (production-runtime)
  try {
    const r = await fetch(base+'/shared/sentry-runtime.js', { signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    if (!r.ok || !t.includes('WorldServerSentry') || !t.includes('ingest.de.sentry.io')) {
      failures.push({ path: '/shared/sentry-runtime.js', reason: 'sentry bundle missing or invalid', status: r.status });
    } else {
      console.log(`[POST_DEPLOY_SMOKE] /shared/sentry-runtime.js ${r.status} ${t.length} bytes OK`);
    }
    // also verify at least one app contains marker
    const appResp = await fetch(base+'/apps/catalog/', { signal: AbortSignal.timeout(15000) });
    const appHtml = await appResp.text();
    if (!appHtml.includes('/shared/sentry-runtime.js')) {
      failures.push({ path: '/apps/catalog/ marker', reason: 'sentry script tag missing in production html' });
    } else {
      console.log('[POST_DEPLOY_SMOKE] Sentry marker OK in /apps/catalog/');
    }
  } catch(e) {
    failures.push({ path: '/shared/sentry-runtime.js', error: String(e.message||e) });
  }
  if(failures.length){console.error(JSON.stringify(failures,null,2));process.exit(20)}
  console.log('[POST_DEPLOY_SMOKE] PASS');
})();
