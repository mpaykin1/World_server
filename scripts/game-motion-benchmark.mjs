#!/usr/bin/env node
import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';import {performance} from 'node:perf_hooks';
const require=createRequire(import.meta.url),G=require('../shared/game-motion-engine.js');
const n=200000;let sink=0,t0=performance.now();
for(let i=0;i<n;i++){const x=(i%1000)/999;sink+=G.EASING.smoothstep(x)+G.progressToFrame(x,120)}
const easingMs=performance.now()-t0;
const s=new G.Spring({value:0});t0=performance.now();for(let i=0;i<n;i++){s.setTarget((i%200)<100?1:0);sink+=s.step(1/60)}const springMs=performance.now()-t0;
const lc=new G.LocomotionClock({strideLength:1.2});t0=performance.now();for(let i=0;i<n;i++)sink+=lc.stepSpeed(3.2,1/60);const locomotionMs=performance.now()-t0;
const report={schemaVersion:'1.0.0',generatedAt:new Date().toISOString(),iterations:n,easingMs:+easingMs.toFixed(2),springMs:+springMs.toFixed(2),locomotionMs:+locomotionMs.toFixed(2),sink:+sink.toFixed(3),
 pass:easingMs<2500&&springMs<3000&&locomotionMs<2500};
fs.writeFileSync(path.join(process.cwd(),'GAME_MOTION_BENCHMARK_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[GAME_MOTION_BENCHMARK] pass=${report.pass} easing=${report.easingMs}ms spring=${report.springMs}ms locomotion=${report.locomotionMs}ms`);
if(!report.pass)process.exitCode=1;
