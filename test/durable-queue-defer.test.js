'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
test('resource deferral preserves retry budget and rejects a foreign lease owner',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'queue-defer-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const env={...process.env,WORLD_SERVER_QUEUE_DB:path.join(root,'queue.sqlite')};
 const call=(...args)=>JSON.parse(cp.execFileSync(process.execPath,[path.join(__dirname,'../scripts/durable-job-queue.cjs'),...args],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 const job=call('enqueue','fixture','{}','0','1');for(let i=0;i<4;i++){const claim=call('claim','owner');assert.equal(claim.attempts,1);assert.throws(()=>call('defer',job.id,'foreign','resource pressure','0'));assert.equal(call('defer',job.id,'owner','resource pressure','0').status,'queued');}
 assert.equal(call('claim','owner').attempts,1);assert.equal(call('fail',job.id,'owner','real execution failed','0').status,'dead');
});
