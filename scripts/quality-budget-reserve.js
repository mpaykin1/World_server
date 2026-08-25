#!/usr/bin/env node
'use strict';
const path=require('node:path');const {reserve}=require('../lib/quality/compute-budget-manager');
function arg(n,d){const i=process.argv.indexOf(n);return i>=0&&process.argv[i+1]?Number(process.argv[i+1]):d;}const limits={maxCpuSecondsPerDay:arg('--max-cpu',21600),maxGpuSecondsPerDay:arg('--max-gpu',7200),maxCostUsdPerDay:arg('--max-cost',5),maxJobsPerDay:arg('--max-jobs',200)};const request={cpuSeconds:arg('--cpu',0),gpuSeconds:arg('--gpu',0),costUsd:arg('--cost',0)};const r=reserve(path.join('data','quality-autopilot','compute-budget.json'),request,limits);console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=3;
