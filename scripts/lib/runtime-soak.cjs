'use strict';
const cp=require('child_process'),http=require('http'),os=require('os'),fs=require('fs'),path=require('path');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function runRuntime({root=path.resolve(__dirname,'../..'),durationMs=300000,restartEveryMs=60000,intervalMs=1000,minFreeRatio=.2}={}){
 const start=Date.now(),samples=[],failures=[];let child,requests=0,restarts=0,logBytes=0;
 async function port(){const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
 async function stop(){if(!child)return;const p=child;if(p.exitCode!==null){child=null;return;}if(process.platform==='win32'){await new Promise((resolve,reject)=>{const k=cp.spawn('taskkill',['/PID',String(p.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});k.on('error',reject);k.on('exit',c=>c===0?resolve():reject(Error('process-tree cleanup failed')));});}else{p.kill('SIGTERM');await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('shutdown deadline exceeded')),12000);p.once('exit',()=>{clearTimeout(timer);resolve();});});}child=null;}
 async function probe(base,url,status){const t=Date.now(),r=await fetch(base+url,{signal:AbortSignal.timeout(5000),redirect:'manual'});await r.arrayBuffer();requests++;if(r.status!==status)throw Error(`${url}: expected ${status}, got ${r.status}`);return Date.now()-t;}
 try{while(Date.now()-start<durationMs){
  if(os.freemem()/os.totalmem()<minFreeRatio)throw Error('resource-gated: free RAM below safety floor');
  const external=await port();let internal=await port();while(internal===external)internal=await port();
  child=cp.spawn(process.execPath,['google-ai-studio/cloudrun-entry.cjs'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:String(external),WORLD_INTERNAL_PORT:String(internal),WORLD_SLOT:'sandbox',WORLD_SLOT_ENTRYPOINT:'/apps/dark-void-scene/',WORLD_SLOT_UPSTREAM:'',WORLD_ENABLE_SANDBOX_FAULTS:'0',NODE_ENV:'production'}});
  child.on('error',e=>failures.push(e.message));for(const s of [child.stdout,child.stderr])s.on('data',b=>{logBytes+=b.length;});
  const launched=Date.now(),base=`http://127.0.0.1:${external}`;let ready=false;
  while(Date.now()-launched<20000){try{await probe(base,'/readyz',200);ready=true;break;}catch{if(child.exitCode!==null)throw Error('startup process exited');await wait(100);}}
  if(!ready)throw Error('readiness deadline exceeded');const coldStartMs=Date.now()-launched;
  while(Date.now()-launched<restartEveryMs&&Date.now()-start<durationMs){
   if(os.freemem()/os.totalmem()<minFreeRatio)throw Error('resource-gated: RAM pressure');if(logBytes>16*1024*1024)throw Error('log budget exceeded');
   const latencyMs=await probe(base,'/healthz',200);await probe(base,'/',302);await probe(base,'/apps/dark-void-scene/client.js',200);await probe(base,'/.env',404);
   const r=await fetch(base+'/api/runtime-budget',{signal:AbortSignal.timeout(5000)}),budget=await r.json();if(budget.measurementComplete&&budget.ok!==true)throw Error('measured memory budget exceeded');
   samples.push({at:new Date().toISOString(),coldStartMs,latencyMs,freeRatio:os.freemem()/os.totalmem(),rssMb:budget.rssMb,measurementComplete:budget.measurementComplete});if(samples.length>1000)samples.shift();await wait(intervalMs);
  }
  await stop();restarts++;
  let alive=false;try{await fetch(base+'/healthz',{signal:AbortSignal.timeout(500)});alive=true;}catch{}if(alive)throw Error('endpoint survived cleanup');
 }}catch(e){failures.push(e.message);}finally{try{await stop();}catch(e){failures.push(e.message);}}
 const report={generatedAt:new Date().toISOString(),evidenceKind:'real-local-http',pass:!failures.length&&requests>0,durationMs:Date.now()-start,requests,restarts,logBytes,samples,failures,longSoakCertified:false,limitations:['Bounded local HTTP evidence, not eight-hour certification','Windows child RSS unavailable; Windows process-tree termination does not prove Linux SIGTERM','No live Cloud Run, native-device or browser FPS evidence']};
 fs.writeFileSync(path.join(root,'RUNTIME_SOAK_STATUS.json'),JSON.stringify(report,null,2)+'\n');return report;
}
module.exports={runRuntime};
