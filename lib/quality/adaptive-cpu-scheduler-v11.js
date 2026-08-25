'use strict';
const os=require('node:os');
function cpuSnapshot(overrides={}){
  const cores=Number(overrides.logicalCores||os.availableParallelism?.()||os.cpus().length||1);
  const totalMemory=Number(overrides.totalMemory||os.totalmem());
  const freeMemory=Number(overrides.freeMemory||os.freemem());
  const load1=Number(overrides.load1??(os.loadavg?.()[0]||0));
  return {logicalCores:Math.max(1,cores),totalMemory,freeMemory,load1};
}
function deriveConcurrency(snapshot=cpuSnapshot(),options={}){
  const reserve=Math.max(0,Number(options.reserveCores??1));
  const maxWorkers=Math.max(1,Number(options.maxWorkers??8));
  const memoryPerWorker=Math.max(64*1024*1024,Number(options.memoryPerWorkerBytes??512*1024*1024));
  const loadTarget=Math.max(.2,Math.min(.98,Number(options.loadTarget??.85)));
  const byCore=Math.max(1,snapshot.logicalCores-reserve);
  const byMemory=Math.max(1,Math.floor(snapshot.freeMemory/memoryPerWorker));
  const normalizedLoad=snapshot.load1/Math.max(1,snapshot.logicalCores);
  let scale=1;
  if(normalizedLoad>loadTarget)scale=.5;
  if(normalizedLoad>1.15)scale=.25;
  const concurrency=Math.max(1,Math.min(maxWorkers,byCore,byMemory,Math.max(1,Math.floor(byCore*scale))));
  return {concurrency,normalizedLoad,byCore,byMemory,reason:normalizedLoad>loadTarget?'load-pressure':'normal'};
}
const PRIORITY={protected:100,verification:90,build:70,optimization:50,background:20};
function scheduleCpuTasks(tasks=[],snapshot=cpuSnapshot(),options={}){
  const capacity=deriveConcurrency(snapshot,options);
  const sorted=[...tasks].sort((a,b)=>(PRIORITY[b.priority]||Number(b.priority)||0)-(PRIORITY[a.priority]||Number(a.priority)||0)||(a.cost||1)-(b.cost||1));
  const running=sorted.slice(0,capacity.concurrency),queued=sorted.slice(capacity.concurrency);
  return {...capacity,running,queued,protectedFirst:running.every((x,i,a)=>i===0||((PRIORITY[a[i-1].priority]||0)>=(PRIORITY[x.priority]||0)))};
}
module.exports={cpuSnapshot,deriveConcurrency,scheduleCpuTasks,PRIORITY};
