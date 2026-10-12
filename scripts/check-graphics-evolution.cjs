#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const CATEGORIES=['terrain','assetsAndStyle','depthAndLight','composition','animation','traversal'];
const HASH=/^[a-f0-9]{64}$/i;
function validatePolicy(p){
  if(!p||p.schemaVersion!==1||p.taskId!=='GRAPHICS-DEMO-001')throw Error('Wrong graphics task contract');
  const a=p.workAllocation||{};
  if(a.cleanServerPercent!==50||a.graphicsPercent!==50||a.rollingHours!==4||a.requiresActualProductiveMinutes!==true||a.missingDataIsUnknown!==true)throw Error('Owner 50/50 allocation drift');
  if(JSON.stringify(p.roles)!==JSON.stringify(['Builder','Architect','Fleet','Ocean','SRE Observer']))throw Error('Role drift or sixth automation');
  if(!p.reference||p.reference.existingGameEntrypoint!=='demo.html'||p.reference.sceneRoute?.join('>')!=='village>road>bridge>forest>mine')throw Error('Original game/route changed');
  const weights=Object.values(p.visualRubric||{});
  if(CATEGORIES.some(k=>!Number.isInteger(p.visualRubric[k])||p.visualRubric[k]<=0)||weights.length!==6||weights.reduce((x,y)=>x+y,0)!==100||p.minimumOverall!==85||p.minimumAxisFraction!==.75)throw Error('Visual acceptance threshold drift');
  if(!p.review?.ownerVerdictRequired||!p.review?.independentFleetRequired||!p.review?.holdoutSceneRequired||!p.review?.desktopAndMobileRequired||!p.review?.regressionsForbidden)throw Error('Acceptance safety gate disabled');
  if(p.status==='PASS'&&p.ownerAcceptance?.verdict!=='PASS')throw Error('User PASS missing');
  if(!['OPEN','AWAITING_OWNER_VERDICT','PASS'].includes(p.status))throw Error('Invalid task state');
  if(p.lastOwnerVerdict==='PASS'&&p.ownerAcceptance?.verdict!=='PASS')throw Error('Owner proof required');
  return true;
}
function evaluateEvidence(p,evidence){
  validatePolicy(p);
  if(!evidence)return {state:'UNKNOWN',reason:'NO_RUNTIME_SCREENSHOT_AND_GAMEPLAY_EVIDENCE',next:'CAPTURE_BASELINE'};
  if(evidence.sourceTask!=='GRAPHICS-DEMO-001'||!HASH.test(evidence.sourceSha||'')||!HASH.test(evidence.candidateSha||'')||!HASH.test(evidence.referenceSha256||''))return {state:'UNKNOWN',reason:'SOURCE_PROVENANCE_MISSING',next:'CAPTURE_BASELINE'};
  if(evidence.sceneMatches!==true||!Array.isArray(evidence.captures)||evidence.captures.length<2||!evidence.captures.some(c=>c.kind==='control')||!evidence.captures.some(c=>c.kind==='holdout')||evidence.captures.some(c=>!HASH.test(c.sha256||'')||!['desktop','mobile'].includes(c.device)))return {state:'UNKNOWN',reason:'CAPTURES_MISSING_OR_UNMATCHED',next:'RENDER_CONTROL_AND_HOLDOUT'};
  if(!evidence.captures.some(c=>c.device==='desktop')||!evidence.captures.some(c=>c.device==='mobile')||!evidence.playable||!evidence.controls?.keyboard||!evidence.controls?.touch||!evidence.controls?.collision||!evidence.animationsObserved)return {state:'BLOCKED',reason:'GAMEPLAY_OR_ANIMATION_UNVERIFIED',next:'FIX_AND_RETEST'};
  if(evidence.criticalRegressions!==0||evidence.performanceRegressed===true)return {state:'BLOCKED',reason:'RUNTIME_OR_PERFORMANCE_REGRESSION',next:'ROLLBACK_AND_REPLAN'};
  if(!evidence.independentFleet||evidence.independentFleet.reviewer==='Builder'||!evidence.independentFleet.scores)return {state:'UNKNOWN',reason:'INDEPENDENT_VISUAL_SCORES_MISSING',next:'REQUEST_FLEET_QA'};
  let scores=evidence.independentFleet.scores,total=0;
  for(const axis of CATEGORIES){const v=scores[axis],max=p.visualRubric[axis];if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max)return {state:'UNKNOWN',reason:'INVALID_FLEET_SCORE',next:'REQUEST_FLEET_QA'};total+=v;}
  const weakest=CATEGORIES.map(axis=>({axis,gap:p.visualRubric[axis]-scores[axis],fraction:scores[axis]/p.visualRubric[axis]})).sort((a,b)=>a.fraction-b.fraction);
  const thresholdMet=total>=p.minimumOverall&&weakest[0].fraction>=p.minimumAxisFraction;
  if(!thresholdMet)return {state:'NEEDS_MORE_ITERATION',total,weakest:weakest.slice(0,3),next:'IMPROVE_LOWEST_AXIS'};
  if(p.ownerAcceptance?.verdict!=='PASS')return {state:'AWAITING_OWNER_VERDICT',total,weakest:weakest.slice(0,3),next:'DELIVER_PLAYABLE_AND_REQUEST_OWNER_VERDICT'};
  return {state:'NEXT_VISUAL_EVOLUTION',total,next:'PROPOSE_POST_TARGET_ANIMATION_AND_LIGHTING_SLICE'};
}
function main(){
  const policy=JSON.parse(fs.readFileSync(path.resolve(process.argv[2]||'data/graphics-evolution-policy.json'),'utf8'));
  const evidence=process.argv[3]?JSON.parse(fs.readFileSync(path.resolve(process.argv[3]),'utf8')):policy.latestEvidence;
  const result=evaluateEvidence(policy,evidence);
  console.log(JSON.stringify(result,null,2));
  if(['BLOCKED'].includes(result.state))process.exitCode=1;
  if(policy.status==='PASS'&&result.state!=='NEXT_VISUAL_EVOLUTION')process.exitCode=1;
}
module.exports={validatePolicy,evaluateEvidence};
if(require.main===module){try{main();}catch(e){console.error('GRAPHICS_EVOLUTION_FAIL_CLOSED',e.message);process.exitCode=1;}}
