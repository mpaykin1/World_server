#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd(),policy=JSON.parse(fs.readFileSync(path.join(ROOT,'data/desktop-ai-error-closure-policy.json'),'utf8')),issues=[],external=[];
const externalPath=path.join(ROOT,'DESKTOP_AI_EXTERNAL_BLOCKERS.json'),ext=fs.existsSync(externalPath)?JSON.parse(fs.readFileSync(externalPath,'utf8')):{blockers:[]};
for(const b of ext.blockers||[])if(b.evidence&&b.nextAction)external.push(b);
for(const f of policy.reports||[]){const fp=path.join(ROOT,f);if(!fs.existsSync(fp))continue;const j=JSON.parse(fs.readFileSync(fp,'utf8'));if(j.pass===false)issues.push({source:f,type:'report-failed'});for(const x of [...(j.violations||[]),...(j.findings||[]),...(j.errors||[])]){const sev=String(x?.severity||x?.level||'error').toLowerCase();if(policy.fixableSeverities.includes(sev))issues.push({source:f,item:x})}}
const unresolved=issues.filter(i=>!external.some(b=>b.source===i.source&&b.fingerprint&&JSON.stringify(i).includes(b.fingerprint)));
if(process.env.DESKTOP_AI_REQUIRE_COMPLETE==='1'){
 const loopPath=path.join(ROOT,'DESKTOP_AI_FIX_LOOP_REPORT.json');
 if(!fs.existsSync(loopPath))unresolved.push({source:'DESKTOP_AI_FIX_LOOP_REPORT.json',type:'required-fix-loop-report-missing'});
 else{try{const loop=JSON.parse(fs.readFileSync(loopPath,'utf8'));if(loop.pass!==true)unresolved.push({source:'DESKTOP_AI_FIX_LOOP_REPORT.json',type:'fix-loop-not-clean'})}catch{unresolved.push({source:'DESKTOP_AI_FIX_LOOP_REPORT.json',type:'invalid-fix-loop-report'})}}
 const wipPath=path.join(ROOT,'WORK_IN_PROGRESS.md');
 if(!fs.existsSync(wipPath))unresolved.push({source:'WORK_IN_PROGRESS.md',type:'missing-final-evidence'});
 else{const wip=fs.readFileSync(wipPath,'utf8'),final=/## Final evidence\s*\n([\s\S]*)$/i.exec(wip)?.[1]||'';if(!final.trim()||/Not complete|Not completed|UNSET/i.test(final))unresolved.push({source:'WORK_IN_PROGRESS.md',type:'final-evidence-incomplete'})}
}
const out={generatedAt:new Date().toISOString(),pass:unresolved.length===0,unresolved,documentedExternalBlockers:external};
fs.writeFileSync(path.join(ROOT,'DESKTOP_AI_ERROR_CLOSURE_REPORT.json'),JSON.stringify(out,null,2)+'\n');
if(process.env.DESKTOP_AI_REQUIRE_COMPLETE==='1'&&unresolved.length){for(const i of unresolved)console.error('[DESKTOP_AI_CLOSURE]',JSON.stringify(i));process.exit(81)}
console.log(`[DESKTOP_AI_CLOSURE] unresolved=${unresolved.length} external=${external.length}`);
