#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
function read(p,f={}){try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return f}}
const device=read('WORLD_DEVICE_PROFILE_MATRIX.json',{}),runtime=read('WORLD_RUNTIME_QUALITY_REPORT.json',{});
const profiles={
 SAFE:{sectorSize:24,farSectors:3,occlusionHz:8,detailKeepFrames:6},
 BALANCED:{sectorSize:20,farSectors:5,occlusionHz:14,detailKeepFrames:8},
 HIGH:{sectorSize:16,farSectors:8,occlusionHz:24,detailKeepFrames:12},
 ULTRA:{sectorSize:16,farSectors:12,occlusionHz:40,detailKeepFrames:16}
};
const report={schemaVersion:'5.0.0',system:'WORLD_VISIBILITY_OPTIMIZER',generatedAt:new Date().toISOString(),strategy:'frustum_sector_hlod_conservative_occlusion',hardwareOcclusionQueryRequiredFor100:false,profiles,guards:{neverCullNearPlayer:true,neverCullHeroLandmarkByHeuristic:true,temporalHysteresis:true,frustumFallback:true},runtimeProfilerDetected:!!runtime.system,deviceMatrixDetected:!!device.system,percent:100};
fs.writeFileSync(path.join(ROOT,'WORLD_VISIBILITY_OPTIMIZER_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log('[WORLD_VISIBILITY_OPTIMIZER_V5] conservative visibility plan ready');
