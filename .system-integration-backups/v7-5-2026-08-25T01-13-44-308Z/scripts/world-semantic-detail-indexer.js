#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {semanticDetailIndex}=require('../lib/world-quality-semantic-detail');
const ROOT=process.cwd();
const candidates=['apps/ai3d-voxel-city/default-city.json','default-city.json','WORLD_QUALITY_SAMPLE_WORLD.json'];
let source=null,world=null;
for(const rel of candidates){const f=path.join(ROOT,rel);if(!fs.existsSync(f))continue;try{world=JSON.parse(fs.readFileSync(f,'utf8'));source=rel;break}catch{}}
let report={schemaVersion:'5.0.0',system:'WORLD_SEMANTIC_DETAIL_INDEX',generatedAt:new Date().toISOString(),source,available:false,stats:null};
if(world?.voxels&&world?.palette){const idx=semanticDetailIndex(world.voxels,world.palette);report.available=true;report.stats=idx.stats;report.semanticCoveragePercent=idx.stats.cells?Math.round(100*(idx.stats.highSaliency+idx.stats.roof+idx.stats.windowLike)/(idx.stats.cells*2.2)):0;}
fs.writeFileSync(path.join(ROOT,'WORLD_SEMANTIC_DETAIL_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[WORLD_SEMANTIC_DETAIL_V5] ${report.available?'indexed':'no world artifact'}${report.stats?` · ${report.stats.cells} facade cells`:''}`);
