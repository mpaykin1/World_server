#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {ROOT,readJSON,writeJSON,commandExists,nowIso}=require('./integration-utils.cjs');
const catalog=readJSON(path.join(ROOT,'data','technology-candidate-catalog.json'),{candidates:[],policy:{}}),scout=readJSON(path.join(ROOT,'WORLD_GRAPHICS_TECHNOLOGY_REPORT.json'),{}),audit=readJSON(path.join(ROOT,'TECHNOLOGY_AUDIT.json'),{}),health=readJSON(path.join(ROOT,'TECHNOLOGY_RUNTIME_HEALTH.json'),{}),orchestrator=readJSON(path.join(ROOT,'TECHNOLOGY_ORCHESTRATOR_REPORT.json'),{});
const haystack=JSON.stringify({scout,audit,health,orchestrator}).toLowerCase();
function packageAvailable(name){if(!name)return false;try{require.resolve(name,{paths:[ROOT]});return true}catch{return false}}
const decisions=[];
for(const c of catalog.candidates||[]){
 let votes=0;const evidence=[];
 if(c.freeOpen){votes++;evidence.push('free/open')}
 if(c.cpuSafe){votes++;evidence.push('cpu-safe')}
 if(c.offlineFallback){votes++;evidence.push('offline-fallback')}
 if(c.embeddedAdapter&&fs.existsSync(path.join(ROOT,c.embeddedAdapter))){votes+=2;evidence.push('embedded-adapter-present')}
 const extBin=Boolean(c.externalBinary&&commandExists(c.externalBinary)),extPkg=Boolean(c.externalPackage&&packageAvailable(c.externalPackage));
 if(extBin){votes+=2;evidence.push(`${c.externalBinary}-available`)}
 if(extPkg){votes+=2;evidence.push(`${c.externalPackage}-available`)}
 if(haystack.includes(String(c.id).toLowerCase())||haystack.includes(String(c.name).toLowerCase())){votes++;evidence.push('project-evidence')}
 const threshold=Number(catalog.policy?.minimumVotesForAutomaticAdoption||5),autoEligible=votes>=threshold&&c.freeOpen&&c.cpuSafe&&Boolean(c.embeddedAdapter),status=autoEligible?'ADOPTED_EMBEDDED':(extBin||extPkg)?'AVAILABLE_FOR_SANDBOX':'STAGED';
 decisions.push({...c,votes,threshold,evidence,status,automaticImplementation:autoEligible});
}
const external=Object.entries(orchestrator.engines||{}).map(([id,x])=>({id,available:Boolean(x?.available),reason:x?.reason||null})),report={schemaVersion:'7.2.0',generatedAt:nowIso(),policy:catalog.policy,consensusModel:'quality + dependency + CPU + security + offline survivability',decisions,embeddedAdopted:decisions.filter(x=>x.status==='ADOPTED_EMBEDDED').length,externalRuntimeCoverage:{runnable:external.filter(x=>x.available).length,total:external.length,percent:external.length?Math.round(external.filter(x=>x.available).length/external.length*100):null,engines:external},rule:'A newly discovered technology is never installed because one subsystem likes it. It must be free/open or explicitly approved, CPU-safe or optional-GPU, dependency-compatible, policy-safe, sandbox-testable and regression-gated before promotion.'};
writeJSON(path.join(ROOT,'TECHNOLOGY_CONSENSUS_REPORT.json'),report);console.log(`[TECH_CONSENSUS_V4] embedded=${report.embeddedAdopted}/${decisions.length} external=${report.externalRuntimeCoverage.runnable}/${report.externalRuntimeCoverage.total}`);
