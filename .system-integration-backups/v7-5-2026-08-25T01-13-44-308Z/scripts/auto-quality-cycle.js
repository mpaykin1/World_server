#!/usr/bin/env node
'use strict';
const cp=require('child_process'),path=require('path');
const ROOT=process.cwd();
const steps=[
 'evidence-quality-score.js',
 'quality-growth-engine.js',
 'quality-improvement-planner.js',
 'test-gap-synthesizer.js',
 'app-quality-matrix.js',
 'quality-trend-monitor.js',
 'technology-runtime-health.js',
 'duplicate-system-review.js',
 'system-contract-review.js',
 'project-quality-reviewer.js',
 'quality-regression-gate.js',
 'quality-promotion-candidate.js',
 'quality-master-report.js'
];
for(const s of steps){
  console.log(`\n[AUTO_QUALITY_CYCLE] ${s}`);
  cp.execFileSync(process.execPath,[path.join(ROOT,'scripts',s)],{stdio:'inherit'});
}
console.log('\n[AUTO_QUALITY_CYCLE] COMPLETE');
