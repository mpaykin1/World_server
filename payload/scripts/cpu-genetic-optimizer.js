#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=process.cwd(),P=JSON.parse(fs.readFileSync(path.join(ROOT,'data/cpu-genetic-optimizer-policy.json'),'utf8'));
let seed=Number(process.env.QUALITY_GENETIC_SEED||1337)>>>0;
function rnd(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296}
const bounds=P.parameterBounds,keys=Object.keys(bounds),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function randomGene(){return Object.fromEntries(keys.map(k=>{const [a,b]=bounds[k];return [k,a+rnd()*(b-a)]}))}
function mutate(g){const n={...g};for(const k of keys)if(rnd()<P.mutationRate){const [a,b]=bounds[k];n[k]=clamp(n[k]+(rnd()*2-1)*(b-a)*.18,a,b)}return n}
function cross(a,b){const n={};for(const k of keys)n[k]=rnd()<.5?a[k]:b[k];return mutate(n)}
function analytic(g){
 const visual=(g.renderScale*.28+g.textureScale*.28+(1/Math.max(.75,g.lodBias))*.16+Math.min(g.shadowDistance/50,1)*.14+Math.min(g.farDistance/220,1)*.14)*100;
 const cost=g.renderScale*g.renderScale*.35+g.textureScale*.2+g.shadowDistance/70*.18+g.farDistance/300*.12+(1/Math.max(.75,g.lodBias))*.15;
 const fps=clamp(75-cost*45,18,90),load=clamp(1800+cost*4200,900,9000),memory=clamp(180+cost*520,100,1100);
 return {fps,visualQuality:visual,loadMs:load,memoryMb:memory,mode:'analytic-proxy'};
}
function external(g){
 const cmd=process.env.QUALITY_BENCHMARK_CMD;if(!cmd)return null;
 const r=cp.spawnSync(cmd,{cwd:ROOT,encoding:'utf8',shell:true,input:JSON.stringify(g),env:{...process.env,QUALITY_PROFILE_JSON:JSON.stringify(g)}});
 if(r.status!==0)return null;
 try{return {...JSON.parse(r.stdout.trim()),mode:'external-benchmark'}}catch{return null}
}
function normHigher(x,min,max){return clamp((x-min)/(max-min),0,1)}
function normLower(x,min,max){return 1-normHigher(x,min,max)}
function evaluate(g){const m=external(g)||analytic(g),o=P.objective;const score=100*(o.fpsWeight*normHigher(Number(m.fps),20,75)+o.visualQualityWeight*normHigher(Number(m.visualQuality),50,100)+o.loadWeight*normLower(Number(m.loadMs),1000,9000)+o.memoryWeight*normLower(Number(m.memoryMb),100,1100));return {gene:g,metrics:m,score}}
const checkpointPath=path.join(ROOT,'.quality-checkpoints','cpu-genetic.json');let pop,history=[],startGen=0;
if(fs.existsSync(checkpointPath)&&process.env.QUALITY_GENETIC_RESUME!=='0'){try{const cp0=JSON.parse(fs.readFileSync(checkpointPath,'utf8'));if(Array.isArray(cp0.population)&&Array.isArray(cp0.history)){pop=cp0.population;history=cp0.history;startGen=Number(cp0.nextGeneration||0);seed=Number(cp0.seed||seed)>>>0;console.log(`[CPU_GENETIC] resume generation ${startGen}`)}}catch{}}
if(!pop)pop=Array.from({length:P.population},randomGene);
fs.mkdirSync(path.dirname(checkpointPath),{recursive:true});
for(let gen=startGen;gen<P.generations;gen++){let ranked=pop.map(evaluate).sort((a,b)=>b.score-a.score);history.push({generation:gen,best:ranked[0]});const elite=ranked.slice(0,P.elite).map(x=>x.gene),next=[...elite];while(next.length<P.population)next.push(cross(elite[Math.floor(rnd()*elite.length)],elite[Math.floor(rnd()*elite.length)]));pop=next;fs.writeFileSync(checkpointPath,JSON.stringify({updatedAt:new Date().toISOString(),nextGeneration:gen+1,seed,population:pop,history},null,2)+'\n')}
const ranked=pop.map(evaluate).sort((a,b)=>b.score-a.score),best=ranked[0];
const out={generatedAt:new Date().toISOString(),cpuOnly:true,gpu:false,paidCost:0,evidenceMode:best.metrics.mode,best,history};
fs.writeFileSync(path.join(ROOT,'CPU_GENETIC_OPTIMIZER_REPORT.json'),JSON.stringify(out,null,2)+'\n');
fs.writeFileSync(path.join(ROOT,'RUNTIME_QUALITY_PROFILE_CANDIDATE.json'),JSON.stringify(best.gene,null,2)+'\n');
if(fs.existsSync(checkpointPath))fs.unlinkSync(checkpointPath);
console.log(`[CPU_GENETIC] ${best.metrics.mode} score=${best.score.toFixed(2)} candidate written`);
