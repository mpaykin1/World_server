#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');const ROOT=process.cwd();
const reports=['QUALITY_REGRESSION_REPORT.json','PROJECT_QUALITY_REVIEW.json','DUPLICATE_SYSTEM_REPORT.json','SYSTEM_CONTRACT_REPORT.json','PRODUCTION_QUALITY_REPORT.json'];
const impact=fs.existsSync(path.join(ROOT,'QUALITY_IMPACT_GRAPH.json'))?JSON.parse(fs.readFileSync(path.join(ROOT,'QUALITY_IMPACT_GRAPH.json'),'utf8')):{reverse:{}};
const nodes=[],edges=[],causes=[];let i=0;
const last=file=>{const r=cp.spawnSync('git',['log','-1','--format=%H|%aI','--',file],{cwd:ROOT,encoding:'utf8'});if(r.status!==0||!r.stdout.trim())return null;const [sha,at]=r.stdout.trim().split('|');return {sha,at}};
for(const report of reports){const fp=path.join(ROOT,report);if(!fs.existsSync(fp))continue;const j=JSON.parse(fs.readFileSync(fp,'utf8'));for(const item of [...(j.violations||[]),...(j.findings||[])]){const issue=`issue:${++i}`,file=item.file||item.path||item.sourceFile||null;nodes.push({id:issue,type:'issue',source:report,item});if(file){nodes.push({id:`file:${file}`,type:'file',file});edges.push({from:issue,to:`file:${file}`,kind:'observed-in'});const c=last(file);if(c){nodes.push({id:`commit:${c.sha}`,type:'commit',...c});edges.push({from:`file:${file}`,to:`commit:${c.sha}`,kind:'last-changed-by'})}for(const a of impact.reverse?.[file]||[])if(a.startsWith('app:'))edges.push({from:`file:${file}`,to:a,kind:'impacts'});causes.push({issue,file,commit:c})}}}
const out={generatedAt:new Date().toISOString(),nodes,edges,causes};fs.writeFileSync(path.join(ROOT,'QUALITY_ROOT_CAUSE_GRAPH.json'),JSON.stringify(out,null,2)+'\n');console.log(`[ROOT_CAUSE] issues=${causes.length}`);
