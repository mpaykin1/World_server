#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const learning=require('../lib/world-google-learning');
const ROOT=path.resolve(__dirname,'..'),STATE=path.join(ROOT,'.world','google-ai-studio');
fs.mkdirSync(STATE,{recursive:true});
const jsonl=path.join(STATE,'google-runtime-signals.jsonl');
function parseLines(raw){const out=[];for(const line of String(raw||'').split(/\r?\n/)){if(!line.trim())continue;try{const v=JSON.parse(line);const p=v.world_runtime_signal||v.jsonPayload?.world_runtime_signal||v.jsonPayload||v; if(p&&p.route)out.push(p)}catch{}}return out}
function readFileMaybe(file){try{return parseLines(fs.readFileSync(file,'utf8'))}catch{return[]}}
let signals=readFileMaybe(jsonl);
const exportPath=String(process.env.WORLD_GOOGLE_LOG_EXPORT||'').trim();if(exportPath)signals=signals.concat(readFileMaybe(path.resolve(exportPath)));
let gcloud={attempted:false,ok:false};
if(process.env.WORLD_GOOGLE_GCLOUD_AUTO_READ==='1'){
  gcloud.attempted=true;
  const service=String(process.env.WORLD_GOOGLE_CLOUD_RUN_SERVICE||'').trim(),project=String(process.env.GOOGLE_CLOUD_PROJECT||'').trim();
  if(service&&project){
    const filter=`resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${service.replace(/\"/g,'')}\" AND jsonPayload.world_runtime_signal.route:*`;
    const r=cp.spawnSync('gcloud',['logging','read',filter,'--project',project,'--limit','2000','--freshness','24h','--format=json'],{cwd:ROOT,encoding:'utf8',shell:process.platform==='win32'});
    gcloud={attempted:true,ok:r.status===0,status:r.status,stderr:String(r.stderr||'').slice(-1000)};
    if(r.status===0){try{const rows=JSON.parse(r.stdout||'[]');for(const row of rows){const p=row.jsonPayload?.world_runtime_signal;if(p?.route)signals.push(p)}}catch{}}
  }
}
const normalized=signals.map(learning.normalizeRuntimeSignal),summary=learning.aggregateRuntimeSignals(normalized),candidates=learning.developmentCandidates(summary);
const report={schemaVersion:'5.0.0',system:'WORLD_GOOGLE_DEPLOYMENT_LEARNING_LOOP',generatedAt:new Date().toISOString(),summary,candidates,gcloud,inputs:{localJsonl:fs.existsSync(jsonl),exportPath:Boolean(exportPath)},reuse:['quality:root-cause','quality:generate-tests','quality:tournament','integration:record-replay','world:feedback:full','release:gate'],automaticMutation:false,guard:'Google production evidence may create candidates, never direct production mutations. Candidates must pass Game Design Spec, function capability, sandbox, replay/regression, security, multiplayer and release gates.'};
fs.writeFileSync(path.join(ROOT,'WORLD_GOOGLE_DEPLOYMENT_LEARNING_REPORT.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(STATE,'google-development-candidates.json'),JSON.stringify({schemaVersion:'5.0.0',generatedAt:report.generatedAt,candidates},null,2)+'\n');
console.log(JSON.stringify({ok:true,samples:summary.samples,errorRate:summary.errorRate,p95LatencyMs:summary.p95LatencyMs,candidates:candidates.length,gcloud},null,2));
