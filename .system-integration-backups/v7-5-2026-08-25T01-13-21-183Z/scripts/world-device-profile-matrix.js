#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
const read=(p,f={})=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return f}},has=(p,s)=>{try{return fs.readFileSync(path.join(ROOT,p),'utf8').includes(s)}catch{return false}};
const provider=read('data/real-device-provider.json',{}),runtime=read('REAL_DEVICE_RUNTIME_EVIDENCE.json',{}),age=runtime.generatedAt?(Date.now()-Date.parse(runtime.generatedAt))/3600000:Infinity;
const physical=runtime.status==='PASS'&&age<=24,configured=!!process.env.REAL_DEVICE_PROVIDER_URL||String(provider.status||'').toUpperCase()==='CONFIGURED';
const profiles=[{id:'ios-low',coarse:true,targetFps:30,maxDpr:.88,memoryMb:320,physical},{id:'android-low',coarse:true,targetFps:30,maxDpr:.82,memoryMb:320,physical},{id:'mobile-balanced',coarse:true,targetFps:40,maxDpr:1.08,memoryMb:420,physical},{id:'desktop-integrated',coarse:false,targetFps:50,maxDpr:1.15,memoryMb:512,physical:false},{id:'desktop-high',coarse:false,targetFps:58,maxDpr:1.70,memoryMb:768,physical:false}];
const evidence={adaptiveRuntime:has('shared/world-quality-autopilot.js','PerformanceObserver')&&has('shared/world-quality-autopilot.js','deviceMemory'),mobileTouch:has('apps/voxel-world/index.html','mobileControls')||has('apps/voxel-world/index.html','lookZone'),physicalProviderConfigured:configured,physicalProviderRuntimeVerified:physical};
const percent=Math.round((evidence.adaptiveRuntime?45:0)+(evidence.mobileTouch?42:0)+(evidence.physicalProviderRuntimeVerified?13:0));
const out={schemaVersion:'5.0.0',system:'WORLD_DEVICE_PROFILE_MATRIX',generatedAt:new Date().toISOString(),percent,evidence,profiles,providerRuntimeAgeHours:Number.isFinite(age)?Math.round(age*10)/10:null};fs.writeFileSync(path.join(ROOT,'WORLD_DEVICE_PROFILE_MATRIX.json'),JSON.stringify(out,null,2)+'\n');console.log(`[WORLD_DEVICE_MATRIX_V5] ${percent}%`);
