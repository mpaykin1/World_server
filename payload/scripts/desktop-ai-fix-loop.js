#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto');const ROOT=process.cwd(),policy=JSON.parse(fs.readFileSync(path.join(ROOT,'data/desktop-ai-fix-loop-policy.json'),'utf8'));
const run=(cmd,args)=>cp.spawnSync(cmd,args,{cwd:ROOT,encoding:'utf8',stdio:'inherit',shell:process.platform==='win32',env:process.env});
const snapshot=()=>{const r=cp.spawnSync('git',['diff','--'],{cwd:ROOT,encoding:'utf8'});return crypto.createHash('sha256').update(r.stdout||'').digest('hex')};
const diagnostics=[
 ['node',['scripts/quality-regression-gate.js']],
 ['node',['scripts/project-quality-reviewer.js']],
 ['node',['scripts/duplicate-system-review.js']],
 ['node',['scripts/system-contract-review.js']],
 ['node',['scripts/check-cpu-only-autopilot.js']]
];
const history=[];
for(let i=1;i<=policy.maxAutomaticIterations;i++){
 console.log(`[DESKTOP_AI_FIX_LOOP] iteration ${i}`);
 let failed=[];
 for(const [c,a] of diagnostics){const r=run(c,a);if(r.status!==0)failed.push(`${c} ${a.join(' ')}`)}
 let closure=run('node',['scripts/desktop-ai-error-closure.js']);
 if(!failed.length&&closure.status===0){const out={generatedAt:new Date().toISOString(),pass:true,iterations:i,history};fs.writeFileSync(path.join(ROOT,'DESKTOP_AI_FIX_LOOP_REPORT.json'),JSON.stringify(out,null,2)+'\n');console.log('[DESKTOP_AI_FIX_LOOP] CLEAN');process.exit(0)}
 const before=snapshot(),fix=run('node',['scripts/quality-autofix.js','--apply']),after=snapshot(),changed=before!==after;
 history.push({iteration:i,failed,autofixStatus:fix.status,changed});
 if(!changed){const out={generatedAt:new Date().toISOString(),pass:false,iterations:i,reason:'fixable/unresolved issues remain but deterministic AutoFix made no further change',history,nextAction:'Desktop AI must inspect reports/root cause, fix remaining errors manually, then rerun this loop.'};fs.writeFileSync(path.join(ROOT,'DESKTOP_AI_FIX_LOOP_REPORT.json'),JSON.stringify(out,null,2)+'\n');console.error('[DESKTOP_AI_FIX_LOOP] unresolved manual work required');process.exit(82)}
}
const out={generatedAt:new Date().toISOString(),pass:false,iterations:policy.maxAutomaticIterations,reason:'automatic iteration limit reached with unresolved issues',history,nextAction:'Continue manual diagnose/fix; do not declare completion.'};fs.writeFileSync(path.join(ROOT,'DESKTOP_AI_FIX_LOOP_REPORT.json'),JSON.stringify(out,null,2)+'\n');process.exit(83);
