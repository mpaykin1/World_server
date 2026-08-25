#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const ROOT=process.cwd(),cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data/local-cpu-code-model.json'),'utf8'));
const bin=process.env.QUALITY_LLAMA_CLI||'llama-cli',model=process.env.QUALITY_CPU_MODEL||'',promptFile=process.argv[2],outFile=process.argv[3]||'LOCAL_CPU_MODEL_OUTPUT.txt';
const report={generatedAt:new Date().toISOString(),configured:false,cpuOnly:true,gpuLayers:0,paid:false,output:null};
if(!model||!fs.existsSync(model)){report.reason='QUALITY_CPU_MODEL not configured';fs.writeFileSync(path.join(ROOT,'LOCAL_CPU_MODEL_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log('[LOCAL_CPU_MODEL] NOT_CONFIGURED');process.exit(0)}
if(!promptFile||!fs.existsSync(promptFile))throw new Error('prompt file required');
const prompt=fs.readFileSync(promptFile,'utf8'),threads=Math.max(1,Number(process.env.QUALITY_CPU_THREADS||Math.max(1,os.cpus().length-1)));
const args=['-m',model,'-ngl','0','-t',String(threads),'-c',String(cfg.defaultContext||8192),'-n',String(Number(process.env.QUALITY_CPU_MODEL_TOKENS||2048)),'--temp','0.15','-p',prompt];
const r=cp.spawnSync(bin,args,{cwd:ROOT,encoding:'utf8',timeout:Number(process.env.QUALITY_CPU_MODEL_TIMEOUT_MS||1800000),maxBuffer:20*1024*1024});
if(r.error||r.status!==0){report.reason=String(r.error?.message||r.stderr||`exit ${r.status}`).slice(0,2000);fs.writeFileSync(path.join(ROOT,'LOCAL_CPU_MODEL_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log('[LOCAL_CPU_MODEL] unavailable/failure');process.exit(0)}
fs.writeFileSync(path.join(ROOT,outFile),r.stdout);report.configured=true;report.output=outFile;report.threads=threads;fs.writeFileSync(path.join(ROOT,'LOCAL_CPU_MODEL_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log(`[LOCAL_CPU_MODEL] PASS threads=${threads} GPU layers=0`);
