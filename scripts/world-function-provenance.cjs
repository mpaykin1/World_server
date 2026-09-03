#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=path.resolve(__dirname,'..'),reg=require('../lib/world-function-registry'),prov=require('../lib/world-function-provenance');
const packages=reg.discover(ROOT).filter(x=>x.ok),outDir=path.join(ROOT,'.world/google-ai-studio/function-provenance');fs.mkdirSync(outDir,{recursive:true});
function pkg(){try{return JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'))}catch{return{scripts:{}}}}
function runNpm(script){const r=cp.spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run',script],{cwd:ROOT,encoding:'utf8'});return{script,ok:r.status===0,status:r.status,stdout:String(r.stdout||'').slice(-1200),stderr:String(r.stderr||'').slice(-1200)}}
const preRecords=packages.map(p=>{const e=prov.envelope(ROOT,p);return{...e,envelopeSha256:prov.digestEnvelope(e),gitCommit:process.env.GITHUB_SHA||process.env.WORLD_BUILD_SHA||null,sandboxRevision:process.env.WORLD_SANDBOX_REVISION||null,productionRevision:process.env.WORLD_NAVIGATOR_REVISION||process.env.K_REVISION||null,immutableRevisionRequired:true}});
const bundle={schemaVersion:'6.0.0',generatedAt:new Date().toISOString(),records:preRecords,rule:'Each function is bound to code+manifest+GDD+acceptance+git/revision evidence. Bundle is signed by the existing World_server supply-chain signer when available.'};
fs.writeFileSync(path.join(ROOT,'WORLD_FUNCTION_PROVENANCE_BUNDLE.json'),JSON.stringify(bundle,null,2)+'\n');
const reuse=[],scripts=pkg().scripts||{};for(const s of ['integration:sbom','integration:supply-chain'])if(scripts[s])reuse.push(runNpm(s));
function R(f){try{return JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8'))}catch{return{}}}
const sbom=R('SBOM_STATUS.json'),sign=R('SUPPLY_CHAIN_SIGNATURE_STATUS.json'),policy=R('data/supply-chain-signing-policy.json');const policyIncludes=Array.isArray(policy.artifacts)&&policy.artifacts.includes('WORLD_FUNCTION_PROVENANCE_BUNDLE.json');
const records=preRecords.map(record=>({...record,sbomPass:sbom.pass===true,supplyChainPass:sign.pass===true,policyIncludesBundle:policyIncludes,transparencyLogHead:sign.logHead||null}));for(const record of records)fs.writeFileSync(path.join(outDir,`${record.functionId}-${record.version}.json`),JSON.stringify(record,null,2)+'\n');
const integrationAvailable=Boolean(scripts['integration:sbom']&&scripts['integration:supply-chain']);const pass=records.length>0&&(!integrationAvailable||records.every(x=>x.sbomPass&&x.supplyChainPass&&x.policyIncludesBundle));
const report={schemaVersion:'6.0.0',generatedAt:new Date().toISOString(),pass,records,reusedExistingSystems:reuse,integrationAvailable,policyIncludesBundle:policyIncludes,rule:'No second signing implementation. Real World_server must sign WORLD_FUNCTION_PROVENANCE_BUNDLE.json through its existing SBOM/supply-chain transparency system.'};fs.writeFileSync(path.join(ROOT,'WORLD_FUNCTION_PROVENANCE_STATUS.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!pass)process.exitCode=2;
