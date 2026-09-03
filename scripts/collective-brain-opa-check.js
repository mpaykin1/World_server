#!/usr/bin/env node
'use strict';
const cp=require('child_process'),path=require('path');
const ROOT=process.cwd(),policy=path.join(ROOT,'policy','collective-brain.rego');
function has(cmd){const r=cp.spawnSync(process.platform==='win32'?'where':'which',[cmd],{encoding:'utf8',windowsHide:true});return r.status===0}
if(!has('opa')){console.log('[COLLECTIVE_BRAIN_OPA] SKIP opa-not-installed; native policy gate remains active');process.exit(0)}
const cases=[
 {input:{operation:'read',human_approved:false},expect:true},
 {input:{operation:'production-deploy',human_approved:false},expect:false},
 {input:{operation:'production-deploy',human_approved:true},expect:true},
 {input:{operation:'memory-ingest-env-file',human_approved:true},expect:false}
];
for(const c of cases){const r=cp.spawnSync('opa',['eval','--format','json','--data',policy,'--stdin-input','data.worldserver.collectivebrain.allow'],{cwd:ROOT,input:JSON.stringify(c.input),encoding:'utf8',windowsHide:true});if(r.status!==0){console.error(r.stderr||r.stdout);process.exit(2)}const j=JSON.parse(r.stdout),value=j.result?.[0]?.expressions?.[0]?.value===true;if(value!==c.expect){console.error(`[COLLECTIVE_BRAIN_OPA] mismatch ${JSON.stringify(c.input)} got=${value} expected=${c.expect}`);process.exit(3)}}
console.log('[COLLECTIVE_BRAIN_OPA] PASS native-policy parity smoke');
