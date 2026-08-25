'use strict';
const path=require('node:path');const {Worker}=require('node:worker_threads');const {cpuSnapshot,deriveConcurrency}=require('./adaptive-cpu-scheduler-v11');
async function runCpuTasks(tasks=[],options={}){
  if(!tasks.length)return {ok:true,results:[],concurrency:0};
  const concurrency=Math.min(tasks.length,deriveConcurrency(options.snapshot||cpuSnapshot(),options).concurrency);
  const runner=path.join(__dirname,'cpu-worker-runner-v11.js');let next=0;const results=new Array(tasks.length);
  async function lane(){while(true){const index=next++;if(index>=tasks.length)return;results[index]=await new Promise(resolve=>{const w=new Worker(runner);const id=`${process.pid}-${index}-${Date.now()}`;let done=false;const finish=r=>{if(done)return;done=true;w.terminate().catch(()=>{});resolve(r);};w.on('message',m=>m.id===id&&finish(m));w.on('error',e=>finish({id,ok:false,error:e.message}));w.postMessage({id,task:tasks[index]});});}}
  await Promise.all(Array.from({length:concurrency},lane));return {ok:results.every(x=>x&&x.ok),results,concurrency};
}
module.exports={runCpuTasks};
