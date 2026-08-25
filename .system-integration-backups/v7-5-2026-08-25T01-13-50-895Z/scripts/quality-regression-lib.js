'use strict';

function avgMetric(obj){
  const vals=Object.values(obj||{}).map(Number).filter(Number.isFinite);
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
}
function findGoldenMigration(migrations,id,from,to){
  return (migrations?.goldenMigrations||[]).some(m =>
    m.componentId===id && m.from===from && m.to===to && m.verified===true
  );
}
function evaluateQualityRegression({baseline,scorecard,errors,golden,releaseRegistry,migrations,existingFiles=[]}){
  const violations=[], improvements=[], deltas={metrics:{},technologyUsage:{}};
  const currentMetrics={};
  for(const [id,m] of Object.entries(scorecard?.metrics||{})) currentMetrics[id]=Number(m?.percent);
  const baseMetrics=baseline?.metrics||{};

  for(const [id,baseRaw] of Object.entries(baseMetrics)){
    const base=Number(baseRaw), cur=Number(currentMetrics[id]);
    if(!Number.isFinite(cur)){
      violations.push({type:'metric-missing',id,baseline:base});
      continue;
    }
    const delta=cur-base; deltas.metrics[id]=delta;
    if(delta<0) violations.push({type:'metric-regression',id,baseline:base,current:cur,delta});
    if(delta>0) improvements.push({type:'metric-improvement',id,baseline:base,current:cur,delta});
  }

  const baseOverall=avgMetric(baseMetrics), currentOverall=avgMetric(
    Object.fromEntries(Object.keys(baseMetrics).map(k=>[k,currentMetrics[k]]))
  );
  deltas.overall=currentOverall-baseOverall;
  if(currentOverall+1e-9<baseOverall){
    violations.push({type:'overall-regression',baseline:baseOverall,current:currentOverall,delta:currentOverall-baseOverall});
  }

  for(const [id,baseRaw] of Object.entries(baseline?.technologyUsage||{})){
    const base=Number(baseRaw),cur=Number(scorecard?.technologyUsage?.[id]);
    if(!Number.isFinite(cur)){
      violations.push({type:'technology-missing',id,baseline:base});
      continue;
    }
    const delta=cur-base; deltas.technologyUsage[id]=delta;
    if(delta<0) violations.push({type:'technology-regression',id,baseline:base,current:cur,delta});
    if(delta>0) improvements.push({type:'technology-improvement',id,baseline:base,current:cur,delta});
  }

  const currentErrors=new Map((errors?.knownErrors||[]).map(e=>[e.id,e]));
  for(const id of baseline?.protectedErrorIds||[]){
    const e=currentErrors.get(id);
    if(!e) violations.push({type:'protected-error-removed',id});
    else if(e.status!=='protected') violations.push({type:'protected-error-unprotected',id,status:e.status});
  }
  const currentReleaseBlockers=(errors?.knownErrors||[]).filter(
    e=>e.severity==='release-blocker' && e.status!=='protected'
  ).length;
  deltas.releaseBlockers=currentReleaseBlockers-Number(baseline?.releaseBlockerCount||0);
  if(currentReleaseBlockers>Number(baseline?.releaseBlockerCount||0)){
    violations.push({
      type:'release-blockers-increased',
      baseline:Number(baseline?.releaseBlockerCount||0),
      current:currentReleaseBlockers,
      delta:deltas.releaseBlockers
    });
  }

  const currentGolden=golden?.components||{};
  for(const [id,lock] of Object.entries(baseline?.goldenLocks||{})){
    const c=currentGolden[id];
    if(!c){violations.push({type:'golden-component-removed',id});continue;}
    if(c.status!=='golden') violations.push({type:'golden-status-regression',id,baseline:'golden',current:c.status});
    if(c.canonical!==lock.canonical && !findGoldenMigration(migrations,id,lock.canonical,c.canonical)){
      violations.push({type:'golden-canonical-changed-without-verified-migration',id,from:lock.canonical,to:c.canonical});
    }
  }

  const apps=releaseRegistry?.apps||{};
  for(const [id,baseApp] of Object.entries(baseline?.certifiedApps||{})){
    const app=apps[id];
    if(!app){violations.push({type:'certified-app-removed',id});continue;}
    if(app.status!=='certified'||app.visible!==true){
      violations.push({type:'certified-app-demoted',id,status:app.status,visible:app.visible});
    }
    const req=new Set(app.required||[]);
    for(const feature of baseApp.required||[]){
      if(!req.has(feature)) violations.push({type:'certified-capability-removed',id,feature});
    }
  }

  const fileSet=new Set(existingFiles||[]);
  for(const f of baseline?.criticalTests||[]){
    if(!fileSet.has(f)) violations.push({type:'critical-test-removed',path:f});
  }

  return {
    pass:violations.length===0,
    baselineId:baseline?.baselineId||null,
    baselineOverall:baseOverall,
    currentOverall,
    violations,
    improvements,
    deltas
  };
}

module.exports={evaluateQualityRegression,avgMetric};
