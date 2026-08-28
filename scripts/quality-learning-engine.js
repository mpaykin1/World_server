#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data','quiet-quality-autopilot.json'),'utf8')),l=cfg.learning||{},stateDir=path.join(ROOT,'.quality-autopilot-state');
function readPrevious(){try{return JSON.parse(fs.readFileSync(path.join(stateDir,'learned-policy.json'),'utf8'))}catch(_){return{}}}
function local(){try{return fs.readFileSync(path.join(stateDir,'patch-outcomes.jsonl'),'utf8').split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x))}catch(_){return[]}}
async function remote(){const url=(process.env.SUPABASE_URL||'').replace(/\/$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY||'';if(!url||!key)return[];const n=Math.max(1,Math.min(Number(l.lookbackOutcomes||40),100));const r=await fetch(`${url}/rest/v1/quality_autopilot_patch_outcomes?select=*&order=created_at.desc&limit=${n}`,{headers:{apikey:key,authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`Supabase ${r.status}`);return r.json()}
function dedup(rows){const m=new Map();for(const r of rows){const k=`${r.patch_fingerprint||r.patchFingerprint}|${r.created_at||r.createdAt||''}|${r.classification||''}`;m.set(k,r)}return[...m.values()].slice(-Number(l.lookbackOutcomes||40))}
(async()=>{
  let rr=[];try{rr=await remote()}catch(e){console.warn('[QUALITY_LEARNING] remote unavailable:',e.message)}
  const rows=dedup([...local(),...rr]);const n=rows.length,ok=rows.filter(r=>r.accepted===true).length,fail=n-ok,successRate=n?ok/n:1,failureRate=n?fail/n:0;
  const recipe={};for(const r of rows)for(const id of (r.recipe_ids||r.recipeIds||[])){const x=recipe[id]||(recipe[id]={runs:0,failures:0,wins:[]});x.runs++;if(!r.accepted)x.failures++;const w=Number(r.perf_win_pct??r.perfWinPct);if(Number.isFinite(w)&&r.accepted)x.wins.push(w)}
  const blockedRecipeIds=Object.entries(recipe).filter(([,x])=>x.runs>=3&&x.failures/x.runs>=.5).map(([id])=>id);
  const enough=n>=Number(l.minimumOutcomes||5),previous=readPrevious(),previousConservative=previous.mode==='CONSERVATIVE';
  const enter=enough&&failureRate>=Number(l.failureRateForConservativeMode||.25),recover=enough&&successRate>=Number(l.successRateForRecovery||.85);
  const conservative=enter||(previousConservative&&!recover),c=l.conservative||{};
  const configOverrides=conservative?{
    policy:{maxAutoChangedFiles:Math.min(Number(cfg.policy?.maxAutoChangedFiles||12),Number(c.maxAutoChangedFiles||6)),maxAutoChangedLines:Math.min(Number(cfg.policy?.maxAutoChangedLines||400),Number(c.maxAutoChangedLines||200))},
    canary:{sampleRequests:Math.max(Number(cfg.canary?.sampleRequests||7),Number(c.sampleRequests||11)),maxMedianRegressionPercent:Math.min(Number(cfg.canary?.maxMedianRegressionPercent||3),Number(c.maxMedianRegressionPercent||1)),maxP95RegressionPercent:Math.min(Number(cfg.canary?.maxP95RegressionPercent||3),Number(c.maxP95RegressionPercent||1))},
    proof:{minimumMeaningfulPerfWinPercent:Math.max(Number(cfg.proof?.minimumMeaningfulPerfWinPercent||1),Number(c.minimumMeaningfulPerfWinPercent||1.5))},
    mutationBreaker:{cooldownHours:Math.max(Number(cfg.mutationBreaker?.cooldownHours||24),Number(c.mutationCooldownHours||48))}
  }:{};
  const out={schemaVersion:'1.1.0',generatedAt:new Date().toISOString(),records:n,successRate,failureRate,mode:conservative?'CONSERVATIVE':'NORMAL',transition:{previousMode:previous.mode||'NONE',enterThreshold:Number(l.failureRateForConservativeMode||.25),recoveryThreshold:Number(l.successRateForRecovery||.85),recovered:previousConservative&&!conservative},blockedRecipeIds,recipeStats:recipe,configOverrides};
  fs.mkdirSync(stateDir,{recursive:true});fs.writeFileSync(path.join(stateDir,'learned-policy.json'),JSON.stringify(out,null,2)+'\n');fs.writeFileSync(path.join(ROOT,'QUALITY_LEARNING_REPORT.json'),JSON.stringify(out,null,2)+'\n');console.log(`[QUALITY_LEARNING] mode=${out.mode} records=${n} success=${(successRate*100).toFixed(1)}% blockedRecipes=${blockedRecipeIds.length}`)
})().catch(e=>{console.error(e);process.exit(82)});
