#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd();
const load=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const exists=r=>fs.existsSync(path.join(ROOT,r));
const model=load('data/quality-model.json');
const score=exists('EVIDENCE_QUALITY_REPORT.json')?load('EVIDENCE_QUALITY_REPORT.json'):null;
const state=load('data/quality-evidence-state.json');
const tech=load('data/technology-registry.json');
const golden=load('data/golden-components.json');
const caps=load('data/app-capabilities.json');

const backlog=[];
function effortFor(c){
  if(c.kind==='external')return 8;
  if(c.kind==='test')return 3;
  if(c.kind==='review')return 2;
  if(c.kind==='project')return 2;
  if(c.kind==='source')return 3;
  if(c.kind==='file')return 2;
  return 4;
}
function reuseFor(metric,id){
  if(['controls','collisions','menu','functionConnectivity','goldenSolutionPropagation'].includes(metric))return 1.5;
  if(['codeReviewer','reports','errorRecurrenceProtection'].includes(metric))return 1.35;
  return 1.0;
}
function confidenceFor(c){
  if(c.kind==='file'||c.kind==='source')return .95;
  if(c.kind==='test'||c.kind==='project')return .9;
  if(c.kind==='external')return .55;
  return .8;
}
function controlPass(c){
  if(c.kind==='file')return exists(c.path);
  if(c.kind==='source'){
    const dirs=['shared','scripts','apps','e2e','test'];let all='';
    const walk=d=>{if(!fs.existsSync(d))return;for(const e of fs.readdirSync(d,{withFileTypes:true})){const a=path.join(d,e.name);if(e.isDirectory())walk(a);else if(/\.(js|html|css|json)$/.test(e.name))try{all+=fs.readFileSync(a,'utf8')+'\n'}catch{}}};
    for(const d of dirs)walk(path.join(ROOT,d));return all.includes(c.pattern);
  }
  if(c.kind==='project')return state.projectTags?.[c.project]===true;
  if(c.kind==='test'||c.kind==='review')return !!state.testTags?.[c.tag];
  if(c.kind==='command')return true;
  if(c.kind==='external')return c.status==='pass';
  return false;
}

for(const [metric,m] of Object.entries(model.metrics||{})){
  for(const c of m.controls||[]){
    if(controlPass(c))continue;
    const impact=Number(c.weight||0);
    const effort=effortFor(c),confidence=confidenceFor(c),reuse=reuseFor(metric,c.id);
    const priority=Math.round((impact*confidence*reuse/Math.max(1,effort))*100)/100;
    backlog.push({
      type:'quality-control-gap',metric,controlId:c.id,impactPoints:impact,effort,confidence,reuse,priority,
      recommendedAction:
        c.kind==='external' ? `Obtain verified external/runtime evidence for ${c.id}` :
        c.kind==='test' ? `Implement and pass behavioral test tagged ${c.tag}` :
        c.kind==='project' ? `Add and run device/browser project ${c.project}` :
        c.kind==='source' ? `Implement canonical source behavior containing ${c.pattern}` :
        c.kind==='file' ? `Add required canonical file ${c.path}` :
        `Close missing evidence for ${c.id}`
    });
  }
}

for(const [name,t] of Object.entries(tech.technologies||{})){
  if(Number(t.percent||0)>=100)continue;
  if(['not-production-integrated','adapter','branch-candidate','concept-partial'].includes(t.status)){
    const gap=100-Number(t.percent||0);
    backlog.push({
      type:'technology-growth',technology:name,impactPoints:gap,
      effort:t.status==='adapter'?7:t.status==='branch-candidate'?5:9,
      confidence:t.status==='branch-candidate'?.75:.55,reuse:1.1,
      priority:Math.round((gap*(t.status==='branch-candidate'?.75:.55)*1.1/(t.status==='adapter'?7:t.status==='branch-candidate'?5:9))*100)/100,
      recommendedAction:`Move ${name} from ${t.status} to verified runnable integration with health check + smoke test`
    });
  }
}

for(const [id,c] of Object.entries(golden.components||{})){
  if(c.status==='golden')continue;
  if(c.status==='awaiting-source-promotion'){
    backlog.push({
      type:'golden-promotion-gap',component:id,impactPoints:10,effort:4,confidence:.7,reuse:1.6,
      priority:2.8,
      recommendedAction:`Obtain exact approved source/asset for ${id}, freeze it, then propagate to all compatible apps`
    });
  }
}

backlog.sort((a,b)=>b.priority-a.priority);
const report={
  generatedAt:new Date().toISOString(),
  backlogCount:backlog.length,
  top10:backlog.slice(0,10),
  backlog,
  nextBestAction:backlog[0]||null
};
fs.writeFileSync(path.join(ROOT,'QUALITY_GROWTH_BACKLOG.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[QUALITY_GROWTH] backlog=${backlog.length}`);
if(report.nextBestAction)console.log(`[QUALITY_GROWTH] next=${report.nextBestAction.type} priority=${report.nextBestAction.priority}`);
