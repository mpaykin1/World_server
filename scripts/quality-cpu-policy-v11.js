#!/usr/bin/env node
'use strict';const {planCpuFirst}=require('../lib/quality/cpu-first-policy-v11');const kind=process.argv[2]||'quality-analysis';const r=planCpuFirst({kind},{cpuVerified:true,serverGpuVerified:false});console.log(JSON.stringify(r,null,2));if(!r.ok&&kind!=='3dgs-train')process.exitCode=2;
