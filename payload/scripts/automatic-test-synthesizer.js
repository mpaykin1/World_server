#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),os=require('os'),crypto=require('crypto');const ROOT=process.cwd();
const errors=JSON.parse(fs.readFileSync(path.join(ROOT,'data/error-prevention-registry.json'),'utf8')),templates=JSON.parse(fs.readFileSync(path.join(ROOT,'data/regression-test-templates.json'),'utf8'));
const candidates=[],missing=[];
for(const e of errors.knownErrors||[]){if(e.status!=='protected')continue;if(templates[e.id])continue;missing.push(e)}
const model=process.env.QUALITY_CPU_MODEL,bin=process.env.QUALITY_LLAMA_CLI||'llama-cli';
for(const e of missing){
 if(!model||!fs.existsSync(model)){candidates.push({errorId:e.id,status:'NEEDS_TEMPLATE_OR_LOCAL_MODEL'});continue}
 const prompt=`Write ONE Node.js node:test regression test for the protected error below. Output JavaScript only, no markdown. Do not modify production. The test must fail if the error returns and pass otherwise.\n${JSON.stringify(e,null,2)}`;
 const r=cp.spawnSync(bin,['-m',model,'-ngl','0','-t',String(Math.max(1,os.cpus().length-1)),'-c','4096','-n','1200','--temp','.1','-p',prompt],{cwd:ROOT,encoding:'utf8',timeout:1200000,maxBuffer:10*1024*1024});
 let src=String(r.stdout||'').replace(/^```(?:javascript|js)?\s*/,'').replace(/```\s*$/,'').trim();
 const id=String(e.id).replace(/[^a-z0-9_-]/gi,'-'),dest=path.join(ROOT,'test/generated-candidates',`${id}.test.js`);
 if(r.status===0&&src.includes("require('node:test')")&&!/child_process.*rm|process\.exit\(/s.test(src)){fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,src+'\n');const chk=cp.spawnSync(process.execPath,['--check',dest],{cwd:ROOT,encoding:'utf8'});candidates.push({errorId:e.id,status:chk.status===0?'CANDIDATE_SYNTAX_PASS':'CANDIDATE_INVALID',path:path.relative(ROOT,dest).replaceAll('\\','/')})}else candidates.push({errorId:e.id,status:'MODEL_FAILED'})
}
const out={generatedAt:new Date().toISOString(),protectedWithoutDeterministicTemplate:missing.length,candidates};fs.writeFileSync(path.join(ROOT,'AUTOMATIC_TEST_SYNTHESIS_REPORT.json'),JSON.stringify(out,null,2)+'\n');console.log(`[AUTO_TEST_SYNTH] missing=${missing.length} candidates=${candidates.length}`);
