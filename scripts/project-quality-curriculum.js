#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
const src=fs.existsSync(path.join(ROOT,'AUTOPILOT_PROJECT_PRIORITY.json'))?JSON.parse(fs.readFileSync(path.join(ROOT,'AUTOPILOT_PROJECT_PRIORITY.json'),'utf8')):JSON.parse(fs.readFileSync(path.join(ROOT,'data/autopilot-projects.json'),'utf8'));
const projects=src.projects||[],bands=[60,70,80,90,95,98,100],curriculum=[];
for(const p of projects){const q=Number(p.currentQuality||p.current_quality||0),phases=bands.filter(x=>x>q).map((target,i)=>({phase:i+1,target,focus:target<=80?['correctness','controls','collisions','mobile']:target<=95?['performance','ux','connectivity','regression coverage']:['visual baselines','long-tail errors','cross-project Golden adoption']}));curriculum.push({projectKey:p.projectKey||p.project_key,currentQuality:q,priority:p.priority||p.userPriority||50,phases,status:phases.length?'ACTIVE':'AT_TARGET'})}
curriculum.sort((a,b)=>b.priority-a.priority);const out={generatedAt:new Date().toISOString(),curriculum};fs.writeFileSync(path.join(ROOT,'PROJECT_QUALITY_CURRICULUM.json'),JSON.stringify(out,null,2)+'\n');console.log(`[CURRICULUM] projects=${curriculum.length} active=${curriculum.filter(x=>x.status==='ACTIVE').length}`);
