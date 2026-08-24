#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
const j=JSON.parse(fs.readFileSync(process.env.QUALITY_PROJECTS_FILE||path.join(ROOT,'data/autopilot-projects.json'),'utf8'));
const nextGoal=q=>[60,70,80,90,95,98,100].find(x=>q<x)||100;
const projects=(j.projects||[]).map(p=>{const q=Number(p.currentQuality||0),goal=Number(p.targetQuality||nextGoal(q)),gap=Math.max(0,goal-q),block=Number(p.releaseBlockers||0),activity=Number(p.activityScore||0),user=Number(p.userPriority??50),stale=Math.max(0,Number(p.daysSinceImprovement||0));return {...p,targetQuality:goal,priority:Math.round((user*.35+gap*1.8+block*15+activity*.4+Math.min(stale,30)*.5)*100)/100}}).sort((a,b)=>b.priority-a.priority);
fs.writeFileSync(path.join(ROOT,'AUTOPILOT_PROJECT_PRIORITY.json'),JSON.stringify({generatedAt:new Date().toISOString(),projects},null,2)+'\n');console.log(`[AUTOPILOT_PRIORITY] projects=${projects.length} top=${projects[0]?.projectKey||'none'}`);
