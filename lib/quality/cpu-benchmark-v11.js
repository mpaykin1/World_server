'use strict';
const crypto=require('node:crypto');
function scoreCpuBenchmark(metrics){const hash=Math.max(1,Number(metrics.hashMBps||0)),json=Math.max(1,Number(metrics.jsonOpsPerSec||0));return Math.round(Math.sqrt(hash*json)*100)/100;}
function runCpuBenchmark(options={}){const rounds=Math.max(64,Math.min(4096,Number(options.rounds||512))),buf=Buffer.alloc(256*1024,7);let t=process.hrtime.bigint();for(let i=0;i<rounds;i++)crypto.createHash('sha256').update(buf).digest();let sec=Number(process.hrtime.bigint()-t)/1e9;const hashMBps=(rounds*buf.length/1048576)/Math.max(.0001,sec);const obj=JSON.stringify({a:Array.from({length:250},(_,i)=>({i,s:`x${i}`,v:i*i}))});t=process.hrtime.bigint();for(let i=0;i<rounds;i++)JSON.parse(obj);sec=Number(process.hrtime.bigint()-t)/1e9;const jsonOpsPerSec=rounds/Math.max(.0001,sec);return {hashMBps,jsonOpsPerSec,score:scoreCpuBenchmark({hashMBps,jsonOpsPerSec}),rounds};}
module.exports={runCpuBenchmark,scoreCpuBenchmark};
