'use strict';
const crypto=require('node:crypto');

function environmentFingerprint(metrics){
  const stable=metrics.map(m=>({project:m.project,userAgent:m.userAgent||'',deviceMemory:m.deviceMemory??null,cores:m.cores??null,viewport:m.viewport||null,devicePixelRatio:m.devicePixelRatio??null})).sort((a,b)=>a.project.localeCompare(b.project));
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0,20);
}
function byProject(metrics){return Object.fromEntries(metrics.map(m=>[m.project,m]));}
function evaluateCandidate(policy,baseline,metrics){
  const reasons=[],healthWarnings=[];
  const profiles=policy.profiles||[];
  const current=byProject(metrics);
  for(const project of profiles){
    const m=current[project];
    if(!m){reasons.push(`missing-runtime-evidence:${project}`);continue;}
    if(!(Number(m.fps)>=Number(policy.sampling?.minimumFps||1)))reasons.push(`invalid-fps:${project}`);
    if(policy.sampling?.requireFrameP95&&!(Number(m.frameP95Ms)>0))reasons.push(`missing-frame-p95:${project}`);
    if(policy.sampling?.requireVisibleDetailScore&&!(Number(m.visibleDetailScore)>0))reasons.push(`missing-visible-detail:${project}`);
    if(policy.promotion?.rejectThermalPressure&&m.thermalProxy===true)healthWarnings.push(`thermal-pressure:${project}`);
    if(Number(m.longTaskRatio||0)>Number(policy.promotion?.rejectLongTaskRatioAbove??1))healthWarnings.push(`long-task-pressure:${project}`);
  }
  const fingerprint=environmentFingerprint(metrics);
  if(!baseline||baseline.environmentFingerprint!==fingerprint){
    return {accepted:false,initializeBaseline:reasons.length===0,reasons:reasons.length?reasons:['baseline-required'],healthWarnings,environmentFingerprint:fingerprint};
  }
  if(healthWarnings.length)reasons.push(...healthWarnings);
  const previous=byProject(baseline.metrics||[]);
  let detailGainTotal=0,detailPairs=0,visibleGainTotal=0,visiblePairs=0;
  for(const project of profiles){
    const m=current[project],b=previous[project];
    if(!m||!b){reasons.push(`baseline-profile-missing:${project}`);continue;}
    const fpsTol=Number(policy.promotion?.fpsRegressionTolerance||0);
    if(Number(m.fps)<Number(b.fps)-fpsTol)reasons.push(`fps-regression:${project}:${b.fps}->${m.fps}`);
    const p95Tol=Number(policy.promotion?.frameP95RegressionToleranceMs||0);
    if(Number(m.frameP95Ms)>Number(b.frameP95Ms)+p95Tol)reasons.push(`frame-p95-regression:${project}:${b.frameP95Ms}->${m.frameP95Ms}`);
    if(Number.isFinite(Number(m.detailBudgetScore))&&Number.isFinite(Number(b.detailBudgetScore))){const dg=Number(m.detailBudgetScore)-Number(b.detailBudgetScore);if(dg < -Number(policy.promotion?.detailRegressionTolerancePoints||0))reasons.push(`detail-regression:${project}:${b.detailBudgetScore}->${m.detailBudgetScore}`);detailGainTotal+=dg;detailPairs++;}
    if(Number.isFinite(Number(m.visibleDetailScore))&&Number.isFinite(Number(b.visibleDetailScore))){const vg=Number(m.visibleDetailScore)-Number(b.visibleDetailScore);if(vg < -Number(policy.promotion?.visibleDetailRegressionTolerancePoints||0))reasons.push(`visible-detail-regression:${project}:${b.visibleDetailScore}->${m.visibleDetailScore}`);visibleGainTotal+=vg;visiblePairs++;}
  }
  const detailGain=detailPairs?detailGainTotal/detailPairs:0,visibleDetailGain=visiblePairs?visibleGainTotal/visiblePairs:0;
  if(policy.promotion?.requireDetailGain&&detailGain<Number(policy.promotion?.minimumDetailGainPoints||0))reasons.push(`insufficient-detail-gain:${detailGain.toFixed(3)}`);
  if(policy.promotion?.requireDetailGain&&visibleDetailGain<Number(policy.promotion?.minimumVisibleDetailGainPoints||0))reasons.push(`insufficient-visible-detail-gain:${visibleDetailGain.toFixed(3)}`);
  return {accepted:reasons.length===0,initializeBaseline:false,reasons,healthWarnings,detailGain:+detailGain.toFixed(3),visibleDetailGain:+visibleDetailGain.toFixed(3),environmentFingerprint:fingerprint};
}
function makeBaseline(metrics,fingerprint=environmentFingerprint(metrics)){return{schemaVersion:'1.0.0',updatedAt:new Date().toISOString(),environmentFingerprint:fingerprint,metrics:metrics.map(m=>({...m}))};}
module.exports={environmentFingerprint,evaluateCandidate,makeBaseline};
