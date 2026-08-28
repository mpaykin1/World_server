#!/usr/bin/env node
import {spawnSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';
const ROOT=process.cwd(),steps=[
 ['verify',[process.execPath,['scripts/game-motion-verify.mjs']]],
 ['benchmark',[process.execPath,['scripts/game-motion-benchmark.mjs']]],
 ['audit',[process.execPath,['scripts/game-motion-audit.mjs']]],
 ['plan',[process.execPath,['scripts/game-motion-plan.mjs']]]
];
const results=[];
for(const [name,[cmd,args]] of steps){const r=spawnSync(cmd,args,{cwd:ROOT,stdio:'inherit'});results.push({name,pass:r.status===0});if(r.status!==0)break}
const report={schemaVersion:'1.0.0',system:'GAME_MOTION_QUALITY_GATE',generatedAt:new Date().toISOString(),results,pass:results.length===steps.length&&results.every(x=>x.pass)};
fs.writeFileSync(path.join(ROOT,'GAME_MOTION_GATE_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[GAME_MOTION_GATE] pass=${report.pass}`);
if(!report.pass)process.exitCode=1;
