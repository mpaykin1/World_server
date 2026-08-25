#!/usr/bin/env node
'use strict';
const cp=require('child_process');
const runs=Math.max(2,Math.min(Number(process.env.QUALITY_STABILITY_RUNS||3),10));
const tests=['test/quality-regression.test.js','test/golden-physics.test.js','test/quality-growth.test.js','test/quality-mutation.test.js'];
for(let i=1;i<=runs;i++){
 console.log(`[STABILITY] run ${i}/${runs}`);
 const r=cp.spawnSync(process.execPath,['--test',...tests],{stdio:'inherit'});
 if(r.status!==0)process.exit(r.status||1);
}
console.log(`[STABILITY] PASS x${runs}`);
