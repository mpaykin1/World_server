'use strict';
const fs=require('node:fs');const path=require('node:path');
function day(){return new Date().toISOString().slice(0,10);}
function load(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return{day:day(),cpuSeconds:0,gpuSeconds:0,costUsd:0,jobs:0};}}
function reserve(file,request,limits={}){let s=load(file);if(s.day!==day())s={day:day(),cpuSeconds:0,gpuSeconds:0,costUsd:0,jobs:0};const next={...s,cpuSeconds:s.cpuSeconds+Number(request.cpuSeconds||0),gpuSeconds:s.gpuSeconds+Number(request.gpuSeconds||0),costUsd:s.costUsd+Number(request.costUsd||0),jobs:s.jobs+1};const violations=[];for(const[k,max]of Object.entries({cpuSeconds:limits.maxCpuSecondsPerDay,gpuSeconds:limits.maxGpuSecondsPerDay,costUsd:limits.maxCostUsdPerDay,jobs:limits.maxJobsPerDay}))if(Number.isFinite(max)&&next[k]>max)violations.push(k);if(violations.length)return{ok:false,violations,state:s};fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(next,null,2)+'\n');return{ok:true,state:next};}
module.exports={reserve};
