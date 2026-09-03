#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=path.resolve(__dirname,'..');
const req=['lib/world-google-learning.js','scripts/world-google-deployment-learning-loop.cjs','google-ai-studio/google-learning-contract.json','google-ai-studio/cloudrun-entry.cjs'];
const missing=req.filter(x=>!fs.existsSync(path.join(ROOT,x)));let problems=[];
const cloud=fs.existsSync(path.join(ROOT,'google-ai-studio/cloudrun-entry.cjs'))?fs.readFileSync(path.join(ROOT,'google-ai-studio/cloudrun-entry.cjs'),'utf8'):'';
for(const token of ['world_runtime_signal','K_REVISION','K_SERVICE','x-world-revision','/api/google-learning-meta'])if(!cloud.includes(token))problems.push('cloudrun missing '+token);
const learn=fs.readFileSync(path.join(ROOT,'scripts/world-google-deployment-learning-loop.cjs'),'utf8');
for(const token of ['quality:root-cause','quality:generate-tests','integration:record-replay','release:gate','automaticMutation:false'])if(!learn.includes(token))problems.push('learning loop missing '+token);
const out={schemaVersion:'5.0.0',system:'WORLD_GOOGLE_LEARNING_GATE',generatedAt:new Date().toISOString(),pass:!missing.length&&!problems.length,missing,problems};fs.writeFileSync(path.join(ROOT,'WORLD_GOOGLE_LEARNING_GATE.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));if(!out.pass)process.exit(2);
