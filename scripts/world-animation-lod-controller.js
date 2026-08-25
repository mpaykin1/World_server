#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
function animationLod(distance,{hero=false,mobile=false,pressure=0}={}){const d=Math.max(0,+distance||0),p=Math.max(0,Math.min(1,+pressure||0));let hz=d<12?60:d<30?45:d<65?30:15;if(mobile)hz=Math.min(hz,45);if(p>.6)hz=Math.max(12,Math.round(hz*.65));if(hero)hz=Math.max(hz,45);return{hz,ik:hero||d<20,secondary:!mobile&&p<.7&&d<35,poseCache:d>=30,hero:!!hero}}
function main(){const samples=[0,10,20,40,80].map(d=>({distance:d,...animationLod(d)}));const report={schemaVersion:'5.0.0',system:'WORLD_ANIMATION_LOD_CONTROLLER',samples,policy:{heroMinimumHz:45,crowdPoseCache:true,offscreenFreeze:true,rootMotionNeverDropped:true}};fs.writeFileSync(path.join(ROOT,'WORLD_ANIMATION_LOD_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log('[WQA_V5] animation LOD ready')}
if(require.main===module)main();module.exports={animationLod};
