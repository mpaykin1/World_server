#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=path.resolve(__dirname,'..');
const service=process.env.WORLD_GOOGLE_CLOUD_RUN_SERVICE||'<navigator-cloud-run-service>',project=process.env.GOOGLE_CLOUD_PROJECT||'<google-project>',region=process.env.GOOGLE_CLOUD_REGION||'<region>';
const plan={schemaVersion:'5.0.0',system:'WORLD_GOOGLE_CANARY_PLAN',generatedAt:new Date().toISOString(),automaticApply:false,principle:'Never create a third AI Studio app. A new function is a new immutable revision of an existing slot/service.',steps:[
  {phase:'source',action:'commit reviewed function/GDD change to GitHub; pull into Google AI Studio two-way sync'},
  {phase:'sandbox',action:'deploy/update existing sandbox slot; run world:v5:gate and cross-runtime/browser/multiplayer tests'},
  {phase:'navigator-revision',action:'deploy a new immutable Navigator Cloud Run revision with zero/low traffic or a revision tag'},
  {phase:'canary-1',trafficPercent:1,verify:['5xx','p95 latency','feedback regression','multiplayer divergence','translation failures','runtime budget']},
  {phase:'canary-5',trafficPercent:5,verify:['same gates']},{phase:'canary-25',trafficPercent:25,verify:['same gates']},{phase:'canary-50',trafficPercent:50,verify:['same gates']},{phase:'stable',trafficPercent:100,verify:['last-green evidence written']},
  {phase:'rollback',action:'on any red gate route traffic back to last-green revision'}
],exampleCommands:[`gcloud run services describe ${service} --project ${project} --region ${region}`,`gcloud run services update-traffic ${service} --to-revisions <new>=1,<last-green>=99 --project ${project} --region ${region}`],note:'Cloud Run revisions are immutable and support gradual traffic splitting/rollback. If Starter Tier credentials do not expose gcloud control, perform equivalent revision deployment in AI Studio/Cloud Run UI and keep evidence in the same report.'};
fs.writeFileSync(path.join(ROOT,'WORLD_GOOGLE_CANARY_PLAN.json'),JSON.stringify(plan,null,2)+'\n');console.log(JSON.stringify(plan,null,2));
