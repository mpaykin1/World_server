#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {fetchJson}=require('../lib/quality-resilient-fetch');
const ROOT=process.cwd(),cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data','quiet-quality-autopilot.json'),'utf8')),tc=cfg.rendererTuner||{},base=(process.env.QUALITY_BASE_URL||cfg.productionBaseUrl||'').replace(/\/$/,'');
(async()=>{
  const {response,json}=await fetchJson(`${base}/api/quality-summary?hours=24`,{cache:'no-store',timeoutMs:15000,retries:2});if(!response.ok||json.ok!==true)throw new Error(json.error||`HTTP ${response.status}`);
  const t=json.totals||{},sessions=Number(t.sessions||0),tiers=t.rendererTiers||{},backends=t.rendererBackends||{},known=sessions-Number(tiers.unknown||0),coverage=sessions?known/sessions:0;
  const status=sessions<10?'GATHERING_RENDERER_TUNER_EVIDENCE':(coverage>=.5?'RENDERER_TUNER_ACTIVE':'RENDERER_TUNER_LOW_COVERAGE');
  const report={generatedAt:new Date().toISOString(),status,pass:true,sessions,knownTuningSessions:known,coveragePercent:Math.round(coverage*10000)/100,rendererTiers:tiers,rendererBackends:backends,webgpuSessions:Number(t.webgpuSessions||0),policy:{advisoryByDefault:tc.advisoryByDefault!==false,forbidGeometryReduction:tc.forbidGeometryReduction!==false,forbidMaterialRemoval:tc.forbidMaterialRemoval!==false,forbidShadowRemoval:tc.forbidShadowRemoval!==false,forbidEffectRemoval:tc.forbidEffectRemoval!==false}};
  fs.writeFileSync(path.join(ROOT,'QUALITY_RENDERER_TUNER_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log(`[QUALITY_RENDERER_TUNER] ${status} coverage=${report.coveragePercent}%`);
})().catch(e=>{fs.writeFileSync(path.join(ROOT,'QUALITY_RENDERER_TUNER_REPORT.json'),JSON.stringify({generatedAt:new Date().toISOString(),status:'RENDERER_TUNER_CHECK_FAILED',pass:false,error:String(e.message||e)},null,2)+'\n');console.error(e);process.exit(124)});
