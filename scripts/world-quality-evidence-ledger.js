#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');const ROOT=process.cwd();
const names=['WORLD_QUALITY_AUTOPILOT_REPORT.json','WORLD_QUALITY_AUTOPILOT_PLAN.json','WORLD_ANIMATION_SEMANTIC_REPORT.json','WORLD_RUNTIME_QUALITY_REPORT.json','WORLD_VISUAL_BASELINE_CANDIDATES.json','WORLD_SEMANTIC_DETAIL_REPORT.json','WORLD_DEVICE_PROFILE_MATRIX.json','WORLD_MATERIAL_SYNTHESIS_REPORT.json','WORLD_VISIBILITY_OPTIMIZER_REPORT.json','WORLD_RETARGET_CONTRACT_REPORT.json','WORLD_QUALITY_SCHEDULER_REPORT.json','WORLD_FEEDBACK_LEARNER_REPORT.json','WORLD_CANDIDATE_LAB_REPORT.json'];
const entries=[];for(const name of names){const f=path.join(ROOT,name);if(!fs.existsSync(f))continue;const b=fs.readFileSync(f);entries.push({file:name,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')})}
const body=JSON.stringify(entries);const ledger={schemaVersion:'4.0.0',system:'WORLD_QUALITY_EVIDENCE_LEDGER',generatedAt:new Date().toISOString(),entries,ledgerSha256:crypto.createHash('sha256').update(body).digest('hex'),tamperEvident:true};
fs.writeFileSync(path.join(ROOT,'WORLD_QUALITY_EVIDENCE_LEDGER.json'),JSON.stringify(ledger,null,2)+'\n');console.log(`[WORLD_EVIDENCE_LEDGER_V4] ${entries.length} evidence files`);
