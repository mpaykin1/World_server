'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=path.resolve(__dirname,'..');
const cmds=[['v3','node',['scripts/world-v3-readiness.cjs']],['community','node',['scripts/world-global-community-gate.cjs']],['semantic','node',['scripts/world-feedback-semantic-gate.cjs']],['moderation','node',['scripts/world-community-moderation-gate.cjs']],['multiplayer-scale','node',['scripts/world-multiplayer-scale-gate.cjs']]];
const results=[];let v3Live=0;
for(const [name,cmd,args] of cmds){const r=cp.spawnSync(cmd,args,{cwd:ROOT,encoding:'utf8',shell:process.platform==='win32'});const stdout=String(r.stdout||'');if(name==='v3'){try{const parsed=JSON.parse(stdout.trim());v3Live=Number(parsed.liveDeploymentPercent||0)}catch{}}
results.push({name,pass:r.status===0,exitCode:r.status,stdout:stdout.slice(-1400),stderr:String(r.stderr||'').slice(-800)})}
const staticPercent=Math.round(results.filter(x=>x.pass).length/results.length*100);
const flag=n=>String(process.env[n]||'')==='1';
const v4LiveChecks={
  inheritedV3Live:v3Live>=100,
  communitySchemaRls:flag('WORLD_COMMUNITY_V4_SCHEMA_READY'),
  multiplayerCrossClient:flag('WORLD_MULTIPLAYER_V4_LIVE_VERIFIED'),
  feedbackWriteReadTriage:flag('WORLD_FEEDBACK_LIVE_VERIFIED'),
  translationGlossary:flag('WORLD_TRANSLATION_LIVE_VERIFIED'),
  voiceTurnTranslate:flag('WORLD_VOICE_LIVE_VERIFIED')
};
const v4LivePercent=Math.round(Object.values(v4LiveChecks).filter(Boolean).length/Object.keys(v4LiveChecks).length*100);
const overallReadinessPercent=Math.round(staticPercent*0.55+v4LivePercent*0.45);
const blockers=Object.entries(v4LiveChecks).filter(([,ok])=>!ok).map(([k])=>k);
const out={schemaVersion:'4.1.0',generatedAt:new Date().toISOString(),staticPatchReadinessPercent:staticPercent,liveDeploymentReadinessPercent:v4LivePercent,overallReadinessPercent,v4LiveChecks,blockers,results,rule:'Static implementation never counts as live proof. 100% overall requires 100% static plus inherited V3 live-green and explicit V4 evidence for schema/RLS, cross-client multiplayer, feedback, translation/glossary and voice/TURN/translation.'};
fs.writeFileSync(path.join(ROOT,'WORLD_V4_READINESS.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));if(staticPercent<100)process.exitCode=2;
