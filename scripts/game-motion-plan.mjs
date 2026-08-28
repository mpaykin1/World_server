#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const ROOT=process.cwd(),auditPath=path.join(ROOT,'GAME_MOTION_OPPORTUNITIES.json');
if(!fs.existsSync(auditPath)){console.error('Run npm run animation:audit first');process.exit(1)}
const a=JSON.parse(fs.readFileSync(auditPath,'utf8')),priorities={character:0,mechanical:1,destruction:1,camera:2,effects:2,environment:3};
const plans=(a.opportunities||[]).map(o=>({
 file:o.file,
 tasks:o.hits.map(h=>({
   priority:`P${priorities[h.category]??3}`,
   category:h.category,signals:h.signals,
   rule:h.category==='character'?'Synchronize locomotion to real velocity/distance; preserve collision root; validate foot slide.'
       :h.category==='mechanical'?'Use state/timeline driven by gameplay; keep collision synchronized when physical.'
       :h.category==='destruction'?'Use reversible exploded/frame timeline when appropriate; do not replace authoritative physics.'
       :h.category==='camera'?'Use spring/trauma camera motion with mobile/reduced-motion budget.'
       :'Use procedural secondary motion with visibility/distance LOD and quality budget.'
 })).sort((x,y)=>x.priority.localeCompare(y.priority))
}));
const report={schemaVersion:'1.0.0',system:'GAME_MOTION_PLAN',generatedAt:new Date().toISOString(),files:plans.length,plans};
fs.writeFileSync(path.join(ROOT,'GAME_MOTION_IMPLEMENTATION_PLAN.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[GAME_MOTION_PLAN] files=${plans.length}`);
