#!/usr/bin/env node
'use strict';
const cp=require('child_process'),path=require('path'),fs=require('fs');
const ROOT=process.cwd(),STRICT=process.env.QUALITY_EVOLVE_STRICT==='1';
const steps=[
 ['evidence','evidence-quality-score.js',false],
 ['impact graph','quality-impact-graph.js',false],
 ['changed impact','quality-changed-impact.js',false],
 ['growth backlog','quality-growth-engine.js',false],
 ['plan','quality-improvement-planner.js',false],
 ['test gaps','test-gap-synthesizer.js',false],
 ['autofix plan','quality-autofix.js',false],
 ['gpu/tech routing','technology-orchestrator.js',false],
 ['perceptual registry','perceptual-visual-gate.js',false],
 ['patch synthesis','quality-patch-synthesizer.js',true],
 ['master report','quality-master-report.js',false],
];
const result=[];
for(const [name,file,optional] of steps){
 const r=cp.spawnSync(process.execPath,[path.join(ROOT,'scripts',file)],{cwd:ROOT,stdio:'inherit',env:process.env});
 result.push({name,file,status:r.status,optional});
 if(r.status!==0&&!optional){console.error(`[QUALITY_EVOLVE] stop at ${name}`);process.exit(r.status||1)}
 if(r.status!==0&&optional&&STRICT){process.exit(r.status||1)}
}
fs.writeFileSync(path.join(ROOT,'QUALITY_EVOLUTION_CYCLE.json'),JSON.stringify({generatedAt:new Date().toISOString(),result},null,2)+'\n');
console.log('[QUALITY_EVOLVE] cycle complete');
