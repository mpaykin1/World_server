#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks');
const Core=require('../shared/ink-glyph-world-core.js');
const w=160,h=160,a=new Uint8Array(w*h);
for(let y=10;y<h-10;y++)for(let x=10;x<w-10;x++){const dx=x-w/2,dy=y-h/2;if(Math.abs(dx)<11||Math.abs(dy)<11||Math.abs(dx-dy)<7)a[y*w+x]=220+((x+y)%35)}
const strokeData={medians:[[[120,850],[500,500],[900,150]],[[120,150],[500,500],[900,850]]]};
const t0=performance.now();const mask=Core.cleanMask(a,w,h,{threshold:.2,minNeighbors:1});const world=Core.tournamentMaskToWorld(mask,w,h,{seed:'benchmark',preset:'city',maxCells:9000,maxHeight:10,scatter:.03,strokeData,candidateCount:3,maxNavNodes:2600});const ms=performance.now()-t0;
const report={schemaVersion:2,generatorVersion:Core.GENERATOR_VERSION,generatedAt:new Date().toISOString(),milliseconds:Number(ms.toFixed(2)),instances:world.instanceCount,renderMedium:world.lod.mediumCount,renderLow:world.lod.lowCount,navNodes:world.navigation.nodeCount,navCoverage:world.navigation.componentCoverage,qualityScore:world.quality.score,roles:world.roles,bounded:world.quality.bounded};
if(!process.argv.includes('--no-report'))fs.writeFileSync(path.join(process.cwd(),'INK_GLYPH_BENCHMARK.json'),JSON.stringify(report,null,2)+'\n');console.log(`INK_GLYPH_BENCH PASS ${report.milliseconds}ms instances=${report.instances} nav=${report.navNodes} quality=${report.qualityScore}`);if(!report.bounded||report.instances<=0||report.qualityScore<=0)process.exit(1);
